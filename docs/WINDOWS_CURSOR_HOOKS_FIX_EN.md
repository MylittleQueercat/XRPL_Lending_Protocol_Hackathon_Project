# Windows + Cursor XRPL DevEx Hooks Fix Report

> For PR descriptions / team documentation  
> Project: `XRPL_Lending_Protocol_Hackathon_Project`  
> Event: `btf-paris-2026-09` · Team: **Raise** · Participant: `sunny-koala-48`

---

## 1. Background and Goals

Install and enable [XRPL DevEx Capture](https://github.com/RippleDevRel/xrpl-devex-hook) for **Cursor IDE** on **Windows**, to collect developer experience (DevEx) data for the hackathon.

**Completed baseline installation:**

| Step | Action | Result |
|------|--------|--------|
| 1 | Clone `xrpl-devex-hook` into the project subdirectory | ✅ |
| 2 | User consent + team name + invite code | ✅ |
| 3 | `setup.mjs --non-interactive --agent cursor` to register hooks | ✅ |
| 4 | `install.ps1` to install 4 skills | ✅ |
| 5 | Node.js v22.13.1 (meets ≥18 requirement) | ✅ |

**Installed skills:**

- `/xrpl-status`
- `/xrpl-feedback`
- `/xrpl-session-analysis`
- `/xrpl-setup`

---

## 2. Issues Encountered (Windows / Cursor Specific)

### Issue A: Skills install script fails on Windows

`setup.mjs` calls `bash skills/install.sh` by default, which fails under Windows PowerShell due to path resolution.

**Fix:** Run manually:

```powershell
powershell -ExecutionPolicy Bypass -File xrpl-devex-hook\skills\install.ps1 --project "C:\Users\User\Downloads\XRPL_Lending_Protocol_Hackathon_Project"
```

---

### Issue B: `/xrpl-status` does not work in the terminal

`/xrpl-*` commands are **Cursor Agent chat slash commands**, not shell commands. Running them in bash/PowerShell returns `No such file or directory`.

**Fix:** Use the terminal command:

```powershell
node xrpl-devex-hook/hook/status.mjs
```

---

### Issue C: Hooks registered but buffer not growing

**Symptom:** `/xrpl-status` shows hooks registered, but `Buffered` count does not increase; Hooks log shows hook **exit code: 0**.

#### Root cause 1: Cursor path format

Cursor passes `workspace_roots` in this format:

```
/c:/Users/User/Downloads/XRPL_Lending_Protocol_Hackathon_Project
```

`capture.mjs` uses that path as the `projectDir()` hint. On Windows it cannot find `.xrpl-devex/identity.json`, so capture is silently skipped (exit 0, no write).

#### Root cause 2: PowerShell command syntax

Cursor runs hooks via **PowerShell** on Windows. These patterns all fail:

| Attempted syntax | Error |
|------------------|-------|
| `set VAR=...&& node ...` | `&&` is invalid in PowerShell |
| `$env:VAR="..."; node ...` | Cursor wraps commands in a pipeline; assignment fails |

#### Root cause 3: `.cmd` wrapper loses stdin

`.cursor/hooks/xrpl-capture.cmd` exits 0, but when Cursor invokes it **stdin is not forwarded** to the capture script, so events are never buffered.

#### Root cause 4: Path typo in `hooks.json` (one-time)

The first `afterShellExecution` command contained a full-width character `Downloads｛` (should be `/`), making that hook path invalid (fixed).

---

## 3. Final Fix

### 3.1 Node wrappers (final approach)

Cursor correctly pipes stdin to **node** processes. Wrappers set `XRPL_DEVEX_PROJECT_DIR` and spawn capture:

**`.cursor/hooks/xrpl-capture.mjs`**

- Sets `XRPL_DEVEX_PROJECT_DIR` to the project absolute path
- Uses `spawnSync` to call `xrpl-devex-hook/hook/capture.mjs`
- `stdio: "inherit"` preserves the stdin pipe

**`.cursor/hooks/xrpl-stop.mjs`**

- Same pattern, calls `hook/agents/cursor/stop-hook.mjs`

### 3.2 Updated `.cursor/hooks.json`

All hook commands use relative paths to the wrappers:

```json
"command": "node .cursor/hooks/xrpl-capture.mjs --event UserPromptSubmit"
```

**11 hook entries** total, covering:

- `sessionStart`
- `beforeSubmitPrompt`
- `afterShellExecution` (×2, including package-install)
- `afterMCPExecution`
- `afterFileEdit`
- `postToolUseFailure`
- `preCompact`
- `sessionEnd`
- `stop` (×2, including reflection stop-hook)

### 3.3 Intermediate artifacts (recommended to remove in PR)

| File | Status | Recommendation |
|------|--------|----------------|
| `.cursor/hooks/xrpl-capture.cmd` | Superseded by `.mjs` | Delete |
| `.cursor/hooks/xrpl-stop.cmd` | Superseded by `.mjs` | Delete |

---

## 4. Changed Files

```
XRPL_Lending_Protocol_Hackathon_Project/
├── .gitignore                          # Added .xrpl-devex/
├── .cursor/
│   ├── hooks.json                      # Cursor hooks config (final)
│   └── hooks/
│       ├── xrpl-capture.mjs            # ★ Core fix
│       ├── xrpl-stop.mjs               # ★ Core fix
│       ├── xrpl-capture.cmd            # Obsolete, recommend delete
│       └── xrpl-stop.cmd               # Obsolete, recommend delete
├── .cursor/skills/                     # 4 xrpl-* skills
├── .claude/skills/                     # Also read by Cursor
├── .codex/skills/                      # For Codex teammates
├── .grok/skills/
├── xrpl-devex-hook/                    # Vendored capture repo
└── .xrpl-devex/                        # ⚠ gitignored, do not commit
```

---

## 5. Verification Results

| Check | Result |
|-------|--------|
| Cursor Hooks log `beforeSubmitPrompt` | exit code: 0 ✅ |
| `VaultDeposit failed with tecNO_PERMISSION` captured | ✅ |
| `/xrpl-status` hooks registered | ✅ |
| Buffered events | 7 (session_start: 1, prompt: 6) |
| Sent | 0 (not flushed yet, expected) |
| Cursor version | IDE 3.9.16 / CLI 2.2.43 |

---

## 6. PR Template

### Suggested PR title

```
fix(cursor/windows): XRPL DevEx Capture hooks for Cursor on Windows
```

### Suggested PR description

```markdown
## Summary

- Install XRPL DevEx Capture for hackathon `btf-paris-2026-09` (team Raise)
- Fix Cursor hooks on Windows: Cursor passes `/c:/...` workspace_roots which breaks identity lookup
- Add Node wrapper scripts (`.cursor/hooks/xrpl-capture.mjs`, `xrpl-stop.mjs`) that set `XRPL_DEVEX_PROJECT_DIR` and forward stdin to capture.mjs
- Install skills via `install.ps1` on Windows (bash install.sh fails on PowerShell)
- Register 11 lifecycle hooks in `.cursor/hooks.json`

## Windows-specific issues fixed

1. **workspace_roots path**: Cursor sends `/c:/Users/...` — capture.mjs cannot find `.xrpl-devex/identity.json` without `XRPL_DEVEX_PROJECT_DIR`
2. **PowerShell hook runner**: inline `set ...&&` and `$env:...; node` fail when Cursor wraps commands in a pipeline
3. **`.cmd` wrappers**: exit 0 but stdin not forwarded; replaced with `.mjs` wrappers using `spawnSync` + `stdio: inherit`
4. **Typo in hooks.json**: full-width `｛` in one path (fixed)

## Test plan

- [x] `node xrpl-devex-hook/hook/status.mjs` shows hooks registered
- [x] Send XRPL prompt (`VaultDeposit failed with tecNO_PERMISSION`) → Buffered count increases
- [x] Cursor Hooks output channel shows `beforeSubmitPrompt` exit code 0
- [x] `/xrpl-status` in Agent chat works

## Do NOT commit

- `.xrpl-devex/` (identity, invite code, buffered events — already in .gitignore)
```

---

## 7. Commit Notes

1. **Do not commit** `.xrpl-devex/` (contains invite code and pseudonym)
2. **Absolute paths in wrappers** are currently hardcoded for this machine — teammates must update after clone, or switch to dynamic resolution
3. Recommend **deleting** obsolete `.cmd` files in the PR
4. `xrpl-devex-hook/` can be a submodule or vendored copy

---

## 8. Follow-up Improvements (upstream to xrpl-devex-hook)

Potential contributions to [RippleDevRel/xrpl-devex-hook](https://github.com/RippleDevRel/xrpl-devex-hook):

1. **`hook/lib/paths.mjs`**: Normalize Cursor `/c:/Users/...` to a valid Windows path
2. **`setup.mjs --agent cursor`**: On Windows, auto-generate `.mjs` wrappers instead of bare absolute `node` paths
3. **`setup.mjs`**: Default to `install.ps1` on Windows instead of bash
4. **Wrapper paths**: Use `process.cwd()` dynamically instead of hardcoding

---

## 9. Teammate Quick Start (Windows + Cursor)

```powershell
# 1. After cloning, if wrapper paths differ, edit XRPL_DEVEX_PROJECT_DIR in:
#    .cursor/hooks/xrpl-capture.mjs
#    .cursor/hooks/xrpl-stop.mjs

# 2. Install skills
powershell -ExecutionPolicy Bypass -File xrpl-devex-hook\skills\install.ps1 --project "$PWD"

# 3. Verify
node xrpl-devex-hook/hook/status.mjs

# 4. In Cursor Agent chat
/xrpl-status
```

---

## 10. Cursor vs Codex

| Feature | Cursor | Codex |
|---------|--------|-------|
| View hooks list | Customize → Hooks | `/hooks` |
| View capture status | `/xrpl-status` | `/xrpl-status` |
| Hooks config file | `.cursor/hooks.json` | `.codex/hooks.json` |
| Run `/xrpl-status` in terminal | ❌ Not supported | ❌ Not supported |
| Run status script in terminal | `node xrpl-devex-hook/hook/status.mjs` | Same |

---

## 11. Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Buffered count not increasing | Cursor Hooks output channel for exit code 1; confirm wrappers exist |
| `/xrpl-status` fails in terminal | Use `node xrpl-devex-hook/hook/status.mjs` instead |
| Hooks not loading | File → Open Folder on project root; Developer: Reload Window |
| No "Manage Workspace Trust" command | Cursor disables this by default; does not block hooks (folders auto-trusted) |

---

*Document generated: 2026-09-12*
