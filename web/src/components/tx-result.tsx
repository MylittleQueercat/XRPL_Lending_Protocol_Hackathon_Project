import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { explainResult, type Submitted } from "@/lib/ledger";
import { explorerTx } from "@/lib/network";
import { shortHash } from "@/lib/format";

// One consistent way to show a ledger outcome: code, plain-language reason, hash, explorer link.
// A validated tec* is still a rejection, and is shown as one.
export function TxResult({ result, context, title }: { result: Submitted; context?: Parameters<typeof explainResult>[1]; title?: string }) {
  const ok = result.resultCode === "tesSUCCESS";
  return (
    <Alert variant={ok ? "success" : "destructive"}>
      {ok ? <CheckCircle2 /> : <XCircle />}
      <AlertTitle>{title ?? (ok ? "Validated" : "Rejected")} · <code className="font-mono text-xs">{result.resultCode}</code></AlertTitle>
      <AlertDescription>
        <p>{explainResult(result.resultCode, context)}</p>
        {result.hash && result.ledgerIndex > 0 && (
          <a href={explorerTx(result.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
            {shortHash(result.hash)} · ledger {result.ledgerIndex.toLocaleString("en-US")} <ExternalLink className="size-3" />
          </a>
        )}
      </AlertDescription>
    </Alert>
  );
}
