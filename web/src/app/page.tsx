import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Layers3, MoveUpRight, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/network";
import { cn } from "@/lib/utils";

const STEPS = [
  { number: "01", icon: Layers3, title: "Portfolio.", body: "One terminal for what you hold: balance, equity, what the vault can pay you today, the live NAV chart, deposit and withdraw tickets, and your sale orders.", href: routes.portfolio, action: "Open the portfolio" },
  { number: "02", icon: MoveUpRight, title: "Market.", body: "Positions other investors are selling, quoted against their accounting value. Blue is a discount, red is a premium. One page per offer, with the sale ticket on it.", href: routes.market, action: "Watch the market" },
  { number: "03", icon: ShieldCheck, title: "Operator.", body: "Run the lending side: vaults, brokers, loans, cover, repayments. Real asset and cash history, payment schedules and a live activity feed.", href: routes.operator, action: "Open the desk" },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-layout gap-12 px-5 pb-16 pt-12 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-20 lg:pt-20">
        <div className="flex flex-col items-start justify-center">
          <p className="eyebrow flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-success" /> A new perspective on liquidity</p>
          <h1 className="editorial-title mt-7 text-[clamp(3.4rem,6.4vw,5.6rem)]">Capital at work.<br />Freedom to<br /><span className="italic text-success">move on.</span></h1>
          <p className="mt-7 max-w-md text-base leading-7 text-muted-foreground">Deposit XRP into a lending vault. Follow your shares and available cash. When you need an exit, offer your shares to another investor at a price you choose.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={routes.portfolio} className={cn(buttonVariants({ size: "lg" }))}>Open the portfolio <ArrowUpRight /></Link>
            <Link href={routes.market} className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>Buy existing shares</Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Built on XRP Ledger <span className="mx-2">/</span> Hackathon Devnet</p>
        </div>

        <div className="flow-art flex min-h-[450px] flex-col overflow-hidden rounded-[28px] p-6 sm:p-9 lg:mt-3">
          <div className="flow-orbit" aria-hidden="true" />
          <div className="flex items-center justify-between"><span className="eyebrow">A position. New possibilities.</span><ArrowUpRight className="size-5" /></div>
          <div className="mt-12 rounded-2xl border border-white/80 bg-[#fffef8] p-6 shadow-[0_12px_35px_-20px_#233d3250]">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eef0e5]"><Layers3 className="size-5" /></span><div><p className="text-sm font-semibold">Your vault position</p><p className="mt-1 text-xs text-[#647166]">Shares in a lending vault</p></div></div>
            <ol className="mt-6 space-y-3 text-sm">
              {[["01", "You deposit XRP", "The vault issues your shares."], ["02", "The broker manages loans", "Available cash can change."], ["03", "You choose your next move", "Withdraw available cash or list shares."]].map(([number, title, description]) => (
                <li key={number} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#eef0e5] text-[10px] font-semibold">{number}</span>
                  <div><p className="font-medium">{title}</p><p className="mt-0.5 text-xs text-[#647166]">{description}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex justify-between border-t border-[#dcded0] pt-4 text-xs"><span>Transferable shares</span><span className="flex items-center gap-1 text-[#397044]"><Check className="size-3.5" /> Yours to list</span></div>
          </div>
          <div className="flex items-center justify-center gap-3 py-4 text-xs text-[#53664f]"><ArrowDown className="size-4" /> Your price. A new owner.</div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#233d32] p-5 text-[#f7f5ec]"><div><p className="font-medium">An agreed sale. One exchange.</p><p className="mt-1 text-xs text-[#c1ceb8]">Buyer signs. Seller approves. Settlement is verified.</p></div><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#c5e6a4] text-[#233d32]"><ArrowUpRight className="size-5" /></span></div>
          <p className="mt-6 text-center text-[10px] uppercase tracking-[.13em] text-[#647166]">How it works · illustrative view, not live data</p>
        </div>
      </section>

      <section className="border-y bg-surface/70">
        <div className="mx-auto grid max-w-layout gap-6 px-5 py-7 sm:grid-cols-3 md:px-8">
          {[["Your price", "A market for transferable vault shares"], ["Atomic settlement", "Payment and ownership move together"], ["Ledger verified", "Balances checked after every transaction"]].map(([title, body]) => <div key={title} className="flex items-start gap-3"><Check className="mt-1 size-4 shrink-0 text-success" /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{body}</p></div></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-layout px-5 py-20 md:px-8 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-muted-foreground">Three screens, one ledger</p><h2 className="editorial-title mt-4 text-4xl md:text-5xl">A terminal, not a brochure.</h2></div><p className="max-w-xs text-sm leading-6 text-muted-foreground">Every figure is read back from the validated ledger. A sale needs an interested buyer; listing alone does not release cash.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">{STEPS.map((step) => <Link href={step.href} key={step.number} className="group flex flex-col rounded-2xl border bg-card p-7 transition-colors hover:border-success/50 hover:bg-accent/30"><div className="flex items-center justify-between"><span className="eyebrow text-muted-foreground">{step.number}</span><step.icon className="size-6 text-success" strokeWidth={1.5} /></div><h3 className="mt-10 text-xl font-semibold tracking-tight">{step.title}</h3><p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{step.body}</p><span className="mt-8 flex items-center justify-between border-t pt-5 text-xs font-semibold">{step.action}<ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>)}</div>
      </section>

      <section className="mx-auto mb-16 max-w-layout px-5 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-[24px] bg-accent px-7 py-10 md:p-12">
          <div><p className="eyebrow text-muted-foreground">Make room for what comes next</p><h2 className="editorial-title mt-4 text-4xl md:text-5xl">Your next move starts here.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Explore available offers or connect a test wallet to manage your shares.</p></div>
          <Link href={routes.market} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>Find your opportunity <ArrowUpRight /></Link>
        </div>
      </section>
    </div>
  );
}
