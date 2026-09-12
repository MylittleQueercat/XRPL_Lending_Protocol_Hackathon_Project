# Raise — Design System

Source of truth: `web/src/app/globals.css`, `web/src/components/ui/*`, `web/src/components/logo.tsx`, `web/src/app/page.tsx`. This document describes the UI as it is implemented today — it does not propose new styling. If the code and this doc disagree, the code wins; update this doc instead of trusting it blindly.

## 1. Brand

- **Name:** Raise (always lowercase in the wordmark: `raise.`, with the period in the success/green color)
- **One-line positioning** (from footer): "A secondary market for XRPL vault shares. Exit a lending position when the vault cannot pay you out."
- **Tone:** editorial, calm, confident. Short declarative sentences ("Capital at work. Freedom to move on."). Lowercase `eyebrow` labels in small caps for section kickers. No exclamation marks, no hype language.
- **Logo mark (`RaiseMark`):** a 40×40 rounded-square glyph — forest-ink "R"-like arrow shape on a sage-green (`#c5e6a4`) background. Always paired with the wordmark except in tight spaces (footer icon, favicon-scale use).

## 2. Color

Defined as CSS variables in `globals.css`, remapped through Tailwind's `@theme inline`. Every token has a light and a `.dark` value — never hardcode a hex that isn't one of these unless matching an existing one-off (see §6).

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#f7f5ec` (warm paper) | `#19271f` | Page background |
| `surface` | `#efeee3` | `#213127` | Sunken panels, table stripes, card footers |
| `foreground` | `#233d32` (forest ink) | `#f1f2e6` | Body text |
| `card` | `#fffef8` | `#24362b` | Card/panel background |
| `primary` | `#397044` | `#c5e6a4` | Primary actions (dark-mode primary flips to sage) |
| `primary-hover` | `#2d5936` | `#d4eebc` | |
| `secondary` | `#e8ebdf` | `#334639` | Secondary buttons, chips |
| `muted-foreground` | `#647166` | `#b3bfae` | Captions, helper text |
| `accent` | `#e0eccf` | `#344c33` | Highlighted sections, active nav state |
| `success` | `#397044` | `#b8dda0` | Confirmations, positive deltas, the wordmark's period |
| `warning` | `#986022` | `#e4bf83` | Pending/attention states |
| `destructive` | `#ad4141` | `#f29187` | Errors, negative deltas |
| `border` | `#dcded0` | `#3b4d3f` | Hairlines |
| `ring` | `#719558` | `#c5e6a4` | Focus rings (`raise-focus`) |

Two accent hex values are used directly (not tokenized) for a few brand-heavy spots: `#c5e6a4` (sage — default button fill, logo mark) and `#233d32` (forest ink — footer background, dark chips). Treat these as brand constants, not one-offs to redesign.

**Dark mode** is a real color inversion, not just a filter — `primary` and `foreground` swap roles (light-mode primary is deep forest green; dark-mode primary is the pale sage). Toggled via `next-themes`, switch in `AppShell` header (`Sun`/`Moon` icons).

## 3. Typography

Two font families, both loaded as system/local stacks (no webfont network dependency):

- `--font-sans` — Avenir Next / Avenir / Segoe UI. Default UI and body text.
- `--font-display` — Iowan Old Style / Palatino / Georgia. Serif, used **only** for editorial headlines via the `.editorial-title` utility class (`font-weight: 400; letter-spacing: -.055em; line-height: 1.04`). This is what gives the marketing page its "magazine" feel — never use it for UI chrome (buttons, labels, table headers).
- `--font-mono` — SFMono-Regular / Consolas. Reserved for addresses, hashes, tabular figures where used.

Utility type scale (defined once in `globals.css`, used via Tailwind utility classes — don't hand-roll `font-size`/`line-height` combos):

| Class | Size / line-height | Weight | Typical use |
|---|---|---|---|
| `headline1`–`headline5` | 64px→30px | 500 | Page-level display headings (`headline5 md:headline4` pattern seen in `PageHeader`) |
| `heading1`–`heading3` | 22px→16px | 500 | Card titles, stat values |
| `body1`–`body4` | 22px→14px | 400 | Paragraph text down to fine print |
| `button1` | 16px/24px | 500 | Button label text |
| `.eyebrow` (custom) | 0.7rem, 600, `.16em` tracking, uppercase | — | Section kickers ("A new perspective on liquidity") |

Rule of thumb: `.editorial-title` for hero/section headlines on marketing-flavored surfaces; the plain `headline*`/`heading*` scale for product screens (dashboards, tables, forms).

## 4. Layout

- Max-width containers: `--container-layout: 1200px` (`max-w-layout`, default product pages), `--container-layout-lg: 960px` (narrow flows), `--container-layout-wide: 1360px` (header/footer).
- Product pages wrap children in `max-w-layout px-4 py-10 md:px-6 lg:px-8 lg:py-16`; the homepage manages its own section-by-section width instead (see `AppShell`, which special-cases `pathname === routes.home`).
- Sticky header, 80px tall (`h-20`), blurred background (`backdrop-blur` + translucent `bg-background/95`).
- Footer is a full-bleed dark band (`bg-[#233d32]`) — the one place light-mode UI intentionally goes dark-on-dark regardless of theme.

## 5. Radius & elevation

Radius scale is named, not ad hoc: `--radius-sm 0.375rem`, `-md 0.625rem`, `-lg 0.875rem`, `-xl 1.25rem`, `-2xl 1.75rem`, `-4xl 2rem`. Cards use `rounded-xl`; hero panels and CTA bands go up to `rounded-[24px]`–`rounded-[28px]` for a softer, editorial feel.

Elevation is a single soft shadow, not a layered system: `shadow-[0_3px_18px_-12px_#233d3226]` on cards. No drop shadows on buttons at rest; active buttons translate 1px down (`active:translate-y-px`) instead of gaining/losing shadow.

## 6. Components (shadcn-style, in `web/src/components/ui/`)

- **Button** (`button.tsx`) — variants: `default` (sage fill, the primary CTA), `secondary`, `outline`, `ghost`, `destructive`, `success`, `light`, `link`. Sizes: `sm` `default` `lg` `icon`. All icons inside buttons auto-size to `size-4` unless overridden. A custom `HoverArrow` SVG exists for link-style CTAs that need a sliding arrow on hover (see `.hover-arrow` in globals.css).
- **Card** (`card.tsx`) — `Card / CardHeader / CardTitle / CardDescription / CardAction / CardContent / CardFooter`. `CardFooter` is visually distinct: it sits on `bg-surface` with a top border, `-mb-6` so it bleeds flush to the card's rounded corners.
- **Badge** (`badge.tsx`) — pill, `h-6`, variants `default / secondary / accent / destructive / success / warning / outline`. Used for network/status indicators (`NetworkBadge`, `status-badge.tsx`).
- Other primitives present: `Alert`, `Input`, `Label`, `Separator`, `Skeleton`, `Table` — all follow the same token-driven, no-hardcoded-color convention.

## 7. Iconography

**Library: [`lucide-react`](https://lucide.dev) exclusively** (`^0.560.0`). Do not mix in another icon set. Default stroke width is the lucide default (2), except decorative step icons on the homepage which use `strokeWidth={1.5}` for a lighter touch at large size.

Icons currently in use across the app (import from `lucide-react` by exact name):

`Activity`, `AlertTriangle`, `ArrowDown`, `ArrowDownToLine`, `ArrowLeft`, `ArrowRight`, `ArrowUpFromLine`, `ArrowUpRight`, `Check`, `CheckCircle2`, `Copy`, `ExternalLink`, `Info`, `KeyRound`, `Landmark`, `Layers3`, `LogOut`, `Moon`, `MoveUpRight`, `Plus`, `RefreshCw`, `Search`, `ShieldCheck`, `Sparkles`, `Sun`, `Wallet`, `WifiOff`, `XCircle`.

Conventions:
- Directional affordance: `ArrowUpRight` for "go do this" CTA links (market, position, sell); `ArrowDown` only for the illustrative flow diagram on the homepage.
- Trust/verification: `ShieldCheck`, `CheckCircle2`, `Check` for atomic-settlement and ledger-verified messaging — this is core to Raise's pitch ("Atomic settlement", "Ledger verified") and shows up repeatedly.
- State icons: `XCircle` / `AlertTriangle` for failure, `RefreshCw` for loading/retry, `WifiOff` for disconnected wallet/network.
- Wallet & identity: `WalletIcon` (imported `as WalletIcon`), `KeyRound`, `LogOut`.
- Product concepts: `Layers3` (a position / stacked shares), `MoveUpRight` (setting your own terms / listing), `Landmark` (vault/institution), `Sparkles` (new/highlight).

## 8. Decorative motifs

- **`.flow-art`** — the sage-tinted panel background (`#e2ebd6`) with a faint dot-grid (`radial-gradient` of 1px dots, 20px grid, masked to fade downward). Used once, on the homepage hero, to hold an illustrative "how it works" mini-mockup — never used for real data screens.
- **`.flow-orbit`** — two concentric thin circles (`border: 1px solid #96ad83`), absolutely positioned, decorative only, `aria-hidden`.
- Small solid dot before eyebrow text (`<span className="size-2 rounded-full bg-success" />`) signals "live/status" ahead of a kicker line.

## 9. Motion & accessibility

- Global custom focus ring: `.raise-focus:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }` — apply to any custom interactive element that isn't already a styled `Button`/`Link` from the design system.
- `prefers-reduced-motion: reduce` collapses all transition/animation durations to ~0 — don't add animations that skip this media query.
- `::selection` is styled explicitly (`#c5e6a4` bg / `#233d32` text) — keep it on-brand rather than letting it fall back to browser default blue.

## 10. What this doc is not

This is a description of the implemented system, not a component library reference or a Figma file — there is no Figma source; the code in `web/src/` is canonical. When adding a new screen, reuse an existing token/utility/component before introducing a new color, radius, or font size.
