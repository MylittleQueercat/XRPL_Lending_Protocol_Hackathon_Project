import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// A phone on the landing page, showing the mobile app at the moment a sale settles. Static markup,
// same palette and wording as the real screens, so what the visitor sees is what they will get.
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-[300px] select-none", className)} aria-label="Raise on a phone: a share sale settled on the ledger" role="img">
      {/* side buttons */}
      <span className="absolute -left-[3px] top-[118px] h-8 w-[3px] rounded-l bg-[#6b7168]" aria-hidden />
      <span className="absolute -left-[3px] top-[168px] h-14 w-[3px] rounded-l bg-[#6b7168]" aria-hidden />
      <span className="absolute -left-[3px] top-[236px] h-14 w-[3px] rounded-l bg-[#6b7168]" aria-hidden />
      <span className="absolute -right-[3px] top-[190px] h-20 w-[3px] rounded-r bg-[#6b7168]" aria-hidden />
      {/* frame */}
      <div className="rounded-[54px] bg-[linear-gradient(160deg,#c9cdc6,#8d928b_40%,#5f645d_60%,#b9bdb6)] p-[3px] shadow-[0_40px_80px_-30px_rgba(20,26,31,0.55),0_12px_30px_-12px_rgba(20,26,31,0.35)]">
        <div className="rounded-[51px] bg-[#0b0d0c] p-[9px]">
          <div className="relative h-[610px] overflow-hidden rounded-[42px] bg-[#f7f5ec] text-[#233d32]">
            {/* dynamic island */}
            <div className="absolute left-1/2 top-[11px] z-20 h-[30px] w-[100px] -translate-x-1/2 rounded-full bg-[#0b0d0c]" aria-hidden />
            {/* status bar */}
            <div className="flex items-center justify-between px-7 pt-[15px] text-[12px] font-semibold">
              <span>9:41</span>
              <span className="flex items-center gap-1" aria-hidden>
                <span className="flex items-end gap-[2px]"><i className="h-[5px] w-[3px] rounded-sm bg-current" /><i className="h-[7px] w-[3px] rounded-sm bg-current" /><i className="h-[9px] w-[3px] rounded-sm bg-current" /><i className="h-[11px] w-[3px] rounded-sm bg-current" /></span>
                <span className="ml-1 inline-block h-[11px] w-[22px] rounded-[3px] border border-current p-[1.5px]"><i className="block h-full w-[80%] rounded-[1px] bg-current" /></span>
              </span>
            </div>
            {/* app header */}
            <div className="mt-3 flex items-center justify-between px-5">
              <span className="flex items-center gap-1.5"><img src="/raise-mark.svg" alt="" className="size-6" /><span className="text-[15px] font-bold tracking-tight">raise.</span></span>
              <span className="rounded-full bg-[#e0eccf] px-2 py-0.5 font-mono text-[10px] text-[#35533d]">● test ledger</span>
            </div>
            {/* figures */}
            <div className="mx-4 mt-4 grid grid-cols-2 divide-x divide-[#dcded0] rounded-xl border border-[#dcded0] bg-[#fffef8]">
              <div className="px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#647166]">Balance</p><p className="mt-0.5 text-[15px] font-semibold tabular-nums">1,069 XRP</p></div>
              <div className="px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#647166]">Worth today</p><p className="mt-0.5 text-[15px] font-semibold tabular-nums">202 XRP</p></div>
            </div>
            {/* vault card */}
            <div className="mx-4 mt-3 rounded-xl border border-[#dcded0] bg-[#fffef8] p-3.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#1e7be6]" />
                <span className="font-mono text-[12px] font-semibold">Vault 69A5C989…</span>
                <span className="ml-auto rounded-full border border-[#dcded0] px-1.5 py-px text-[9px]">transferable</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {[["Shares", "202,000,000"], ["Value per share", "1.000016"], ["Cash you can take out", "202 XRP"], ["Out on loan", "0 %"]].map(([k, v]) => (
                  <div key={k}><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#647166]">{k}</p><p className="mt-0.5 text-[13px] font-semibold tabular-nums">{v}</p></div>
                ))}
              </div>
              <div className="mt-3.5 flex gap-1.5">
                <span className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#c5e6a4] text-[11px] font-medium text-[#233d32]"><ArrowDownToLine className="size-3" /> Deposit</span>
                <span className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-[#c8cebd] text-[11px] font-medium"><ArrowUpFromLine className="size-3" /> Withdraw</span>
                <span className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-[#c8cebd] bg-[#e8ebdf] text-[11px] font-medium">Sell</span>
              </div>
            </div>
            {/* the sale, verified */}
            <div className="mx-4 mt-3 rounded-xl border border-[#397044]/40 bg-[#fffef8] p-3.5">
              <div className="flex items-center gap-2 text-[12px] font-semibold"><ShieldCheck className="size-4 text-[#397044]" /> Sale verified on the ledger</div>
              <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-[#647166]">You sold</dt><dd className="text-right tabular-nums">300,000,000 shares</dd>
                <dt className="text-[#647166]">You received</dt><dd className="text-right text-[13px] font-semibold tabular-nums">285 XRP</dd>
                <dt className="text-[#647166]">vs value</dt><dd className="text-right font-semibold text-[#1e7be6]">−5.00 %</dd>
              </dl>
              <p className="mt-2 text-[10px] leading-4 text-[#647166]">Payment and shares moved in one transaction.</p>
            </div>
            {/* toast */}
            <div className="absolute inset-x-4 bottom-6 flex items-start gap-2.5 rounded-xl border border-[#397044]/40 bg-[#fffef8] px-3.5 py-3 shadow-[0_16px_40px_-16px_rgba(20,26,31,0.45)]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#397044]" />
              <div className="min-w-0 flex-1 text-[11px]">
                <p className="font-semibold">Sale settled · <span className="font-mono text-[10px]">tesSUCCESS</span></p>
                <p className="mt-0.5 font-semibold text-[#1e7be6]">+285 XRP</p>
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-[#397044]">F0CB5B69… · ledger 74,622 <ExternalLink className="size-2.5" /></p>
              </div>
            </div>
            {/* home indicator + glare */}
            <span className="absolute bottom-[7px] left-1/2 h-[4px] w-[110px] -translate-x-1/2 rounded-full bg-[#233d32]/70" aria-hidden />
            <span className="pointer-events-none absolute inset-0 rounded-[42px] bg-[linear-gradient(115deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.06)_28%,rgba(255,255,255,0)_45%)]" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
