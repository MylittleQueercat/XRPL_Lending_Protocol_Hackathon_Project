import Link from "next/link";
import { ArrowUpRight, Check, Layers3, MoveUpRight, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { PhoneMockup } from "@/components/phone-mockup";

const STEPS = [
  { number: "01", icon: Layers3, title: "Portfolio.", body: "What you hold, what it is worth today and what you can take out. Deposit, withdraw or sell from one place.", href: routes.portfolio, action: "Open the portfolio" },
  { number: "02", icon: MoveUpRight, title: "Market.", body: "Positions other investors are selling, priced against what the shares are worth. Blue means cheaper than value, red means dearer.", href: routes.market, action: "Watch the market" },
  { number: "03", icon: ShieldCheck, title: "Operator.", body: "Run the lending side: create a vault, lend to a borrower, watch repayments come back.", href: routes.operator, action: "Open the desk" },
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

        <div className="flow-art relative flex items-center justify-center overflow-hidden rounded-[28px] px-6 py-10 sm:py-12 lg:mt-3">
          <div className="flow-orbit" aria-hidden="true" />
          <PhoneMockup className="lg:-rotate-[3deg]" />
          <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] uppercase tracking-[.13em] text-[#647166]">The app on your phone · a sale settled on the ledger</p>
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
