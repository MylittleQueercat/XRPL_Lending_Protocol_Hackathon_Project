import { Activity, ArrowUpFromLine, Landmark, Wallet } from "lucide-react";
import { Panel } from "@/components/terminal";

// The disconnected terminal: the layout is drawn, the numbers are dashes, and one panel says what
// will fill them. The wallet button lives in the header; this panel points there.
export function NotConnected() {
  const items = [
    { icon: Landmark, text: "Vault shares you hold and what they are worth on the vault's books" },
    { icon: Activity, text: "Cash actually available in the vault against capital deployed in loans" },
    { icon: ArrowUpFromLine, text: "Deposit and withdrawal, with the ledger's own verdict on each" },
    { icon: Wallet, text: "The route to sell your position when the vault cannot pay you out" },
  ];
  return (
    <Panel title="Portfolio terminal" bodyClassName="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold">Connect a wallet to open your portfolio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the wallet button in the header: create a faucet-funded test wallet or import a test seed. The terminal then shows, from the validated ledger of the Track 1 network:
        </p>
        <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          {items.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 rounded-md border border-border bg-background/60 px-3 py-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted-foreground">
          Market watch, live NAV chart, order ticket and history fill in once a wallet is connected. Nothing here is simulated; an empty wallet shows an empty terminal.
        </p>
      </div>
    </Panel>
  );
}
