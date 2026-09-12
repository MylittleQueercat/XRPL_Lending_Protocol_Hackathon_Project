"use client";
import * as React from "react";
import { ExternalLink, Info, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TxResult } from "@/components/tx-result";
import { browserJournal, SUBMISSION_EVENT, SUBMISSION_JOURNAL_KEY, type PendingSubmission } from "@/lib/submission-journal";
import { recoverSubmission, type Submitted } from "@/lib/ledger";
import { explorerTx } from "@/lib/network";
import { shortAddress, shortHash } from "@/lib/format";

export function SubmissionRecovery() {
  const [entries, setEntries] = React.useState<PendingSubmission[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Submitted | null>(null);
  React.useEffect(() => {
    const read = () => {
      try { setEntries(browserJournal().list()); }
      catch { setError("Transaction recovery storage is unavailable or invalid. Signing is blocked until it can be read safely."); }
    };
    const storage = (event: StorageEvent) => { if (event.key === SUBMISSION_JOURNAL_KEY) read(); };
    read(); window.addEventListener(SUBMISSION_EVENT, read); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(SUBMISSION_EVENT, read); window.removeEventListener("storage", storage); };
  }, []);
  async function check(entry: PendingSubmission) {
    setBusy(entry.hash); setError(null); setResult(null);
    try {
      const validated = await recoverSubmission(entry);
      if (validated) setResult(validated);
      else setError(`Transaction ${shortHash(entry.hash)} is not confirmed. It stays locked, including after its ledger limit. A missing result does not prove that nothing happened.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(null); }
  }
  if (!entries.length && !error && !result) return null;
  return <div className="mb-6 space-y-3">
    {(entries.length > 0 || error) && <Alert variant="warning"><Info /><AlertTitle>Recorded transactions need verification</AlertTitle><AlertDescription>
      <p>A saved transaction may already have executed. Further operations from the same account are blocked until its validated result is read. Reloading preserves this check.</p>
      {error && <p role="alert">{error}</p>}
      {entries.map((entry) => <div key={entry.hash} className="flex flex-wrap items-center gap-2 pt-2"><span className="text-xs">{entry.transactionType} · {shortAddress(entry.account)}</span><a href={explorerTx(entry.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline">{shortHash(entry.hash)} <ExternalLink className="size-3" /></a><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void check(entry)}><RefreshCw />{busy === entry.hash ? "Checking…" : "Check transaction"}</Button></div>)}
    </AlertDescription></Alert>}
    {result && <TxResult result={result} title="Recorded transaction verified" />}
  </div>;
}
