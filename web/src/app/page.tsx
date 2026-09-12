import Link from "next/link";
import { ArrowRight, Landmark, Repeat, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/lib/network";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Landmark, title: "Deposit into a vault", body: "An open-ended Single Asset Vault pools lender capital and issues transferable shares. A loan broker originates term loans against it." },
  { icon: ShieldCheck, title: "Hit the liquidity wall", body: "Ask for your capital while it is out on loan and the ledger rejects the withdrawal. Your shares are intact; the cash is not there yet." },
  { icon: Repeat, title: "Sell the position instead", body: "List your shares at your price. A buyer pays you and takes over the exposure in one all-or-nothing settlement. The loans keep running." },
];

export default function HomePage() {
  return (
    <div className="space-y-14">
      <section className="space-y-5 pt-6">
        <Badge variant="secondary" className="font-mono">Track 1 · open-ended vault · Loaded</Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Exit a lending vault when the vault can&apos;t pay you out.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Your capital funds loans. When you want it back and the cash is deployed, the ledger refuses the withdrawal. Raise lets you sell the
          position to another investor instead — settled atomically, so payment and shares move together or not at all.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={routes.position} className={cn(buttonVariants({ size: "lg" }))}>View my position <ArrowRight /></Link>
          <Link href={routes.market} className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>Browse the market</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card key={step.title}>
            <CardHeader>
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <step.icon className="size-4 text-primary" />
                <span className="font-mono text-xs">0{index + 1}</span>
              </div>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription>{step.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Everything here is verified on the ledger</h2>
          <p className="text-sm text-muted-foreground">
            No figure on these screens is a submission result taken on faith. Balances, share supply, vault liquidity and loan state are read from the
            validated ledger after every transaction — because on this protocol an outer <code>tesSUCCESS</code> can sit over inner legs that never executed.
          </p>
          <p className="text-sm text-muted-foreground">
            Interest is recognised when a payment delivers it, not at origination. Accounting value therefore contains realised interest only, never scheduled interest.
          </p>
        </div>
        <CardContent className="space-y-2 px-0 text-sm">
          <Row k="Network" v="Hackathon Devnet · 4001" />
          <Row k="Vault" v="XLS-65 open-ended · transferable MPT shares" />
          <Row k="Lending" v="XLS-66 · V1.1 cash-basis accounting" />
          <Row k="Settlement" v="XLS-56 Batch · tfAllOrNothing" />
          <Row k="Wallet" v="Local dev wallet · browser-held keys" />
        </CardContent>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
