"use client";

import * as React from "react";
import { Panel, Tick } from "@/components/terminal";
import { DonutChart, chartColor, dropsToXrpNumber } from "@/components/charts";
import type { BrokerState, VaultState } from "@/lib/ledger";
import { xrpToDrops } from "@/lib/format";
import { wholeDrops } from "@/lib/ledger";
import { DEFAULTS, RATE_DENOMINATOR, requiredCoverDrops, tenthBpsToPercent } from "./lending";
import { Field, Figure, Mono, Note, ProgressBar, XrpInput, xrp } from "./shared";

const fmtXrp = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

// First-loss cover against debt, the debt ceiling, and what a hypothetical principal would require.
export function BrokerDetail({ broker, vault }: { broker: BrokerState; vault: VaultState | null }) {
  const [principal, setPrincipal] = React.useState(DEFAULTS.principalXrp);
  const principalDrops = xrpToDrops(principal);
  const required = principalDrops ? requiredCoverDrops(principalDrops, broker.coverRateMinimum) : "0";
  const coverAvailable = BigInt(wholeDrops(broker.coverAvailableDrops));
  const coverShort = coverAvailable < BigInt(required);
  const liquidityShort = vault && principalDrops ? BigInt(wholeDrops(vault.assetsAvailableDrops)) < BigInt(principalDrops) : false;

  const debt = BigInt(wholeDrops(broker.debtTotalDrops));
  const debtMax = BigInt(wholeDrops(broker.debtMaximumDrops));
  const debtRatio = debtMax > 0n ? Number(debt) / Number(debtMax) : 0;
  // Cover held against debt outstanding, compared with the two rates the ledger enforces.
  const coverRatio = debt > 0n ? Number(coverAvailable) / Number(debt) : null;
  const minRatio = broker.coverRateMinimum / RATE_DENOMINATOR;
  const liqRatio = broker.coverRateLiquidation / RATE_DENOMINATOR;
  const coverTone = coverRatio === null ? undefined : coverRatio < liqRatio ? "down" : coverRatio < minRatio ? "warning" : "up";

  return (
    <Panel title={<span>Broker <Mono value={broker.loanBrokerId} short={12} className="normal-case tracking-normal" /></span>}>
      <div className="grid gap-3 p-3 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          <DonutChart
            size={148}
            slices={[{ name: "Cover available", value: dropsToXrpNumber(broker.coverAvailableDrops), color: chartColor.c1 }, { name: "Debt outstanding", value: dropsToXrpNumber(broker.debtTotalDrops), color: chartColor.c4 }]}
            centerLabel="cover / debt"
            centerValue={coverRatio === null ? "—" : `${(coverRatio * 100).toFixed(1)} %`}
            format={fmtXrp}
          />
          <Note className="text-center"><span className="inline-block size-2 rounded-sm bg-[var(--chart-1)] align-middle" /> cover · <span className="inline-block size-2 rounded-sm bg-[var(--chart-4)] align-middle" /> debt</Note>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            <Figure label="Cover available" value={<Tick numeric={broker.coverAvailableDrops}>{xrp(broker.coverAvailableDrops)}</Tick>} />
            <Figure label="Debt outstanding" value={<Tick numeric={broker.debtTotalDrops}>{xrp(broker.debtTotalDrops)}</Tick>} />
            <Figure label="Debt maximum" value={xrp(broker.debtMaximumDrops)} />
            <Figure label="Cover rate minimum" value={tenthBpsToPercent(broker.coverRateMinimum)} sub="of debt, before originating" />
            <Figure label="Cover rate liquidation" value={tenthBpsToPercent(broker.coverRateLiquidation)} sub="below this, cover is at risk" />
            <Figure label="Cover held vs debt" value={coverRatio === null ? "no debt" : `${(coverRatio * 100).toFixed(1)} %`} tone={coverTone} sub={coverRatio === null ? "nothing outstanding" : coverTone === "up" ? "clears the minimum" : coverTone === "warning" ? "below the minimum" : "below liquidation"} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Debt used</span>
              <span className="tabular-nums">{xrp(broker.debtTotalDrops, 2)} / {xrp(broker.debtMaximumDrops, 2)} · {(debtRatio * 100).toFixed(1)} %</span>
            </div>
            <ProgressBar ratio={debtRatio} tone={debtRatio >= 1 ? "down" : debtRatio >= 0.8 ? "warning" : "up"} label="Debt used against maximum" />
          </div>
          <div className="grid gap-2 rounded-md bg-secondary/50 p-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Field id={`what-if-${broker.loanBrokerId}`} label="If I originate" hint="Hypothetical principal; nothing is submitted.">
              <XrpInput id={`what-if-${broker.loanBrokerId}`} value={principal} onChange={setPrincipal} invalid={principal.length > 0 && !principalDrops} />
            </Field>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              <Figure label="Cover required" value={xrp(required)} sub={`${tenthBpsToPercent(broker.coverRateMinimum)} of principal`} />
              <Figure label="Cover" value={coverShort ? "short" : "clears"} tone={coverShort ? "down" : "up"} sub={coverShort ? `add ${xrp((BigInt(required) - coverAvailable).toString())}` : "no top-up needed"} />
              <Figure label="Vault cash" value={vault ? (liquidityShort ? "short" : "funds it") : "—"} tone={vault ? (liquidityShort ? "down" : "up") : undefined} sub={vault ? xrp(vault.assetsAvailableDrops, 2) : "vault not loaded"} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
