"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { xrpToDrops } from "@/lib/format";
import { wholeDrops, type BrokerState, type Submitted, type VaultState } from "@/lib/ledger";
import { DEFAULTS, formatDuration, INTERVAL_OPTIONS, percentToTenthBps, requiredCoverDrops, tenthBpsToPercent, validateLoanTerms } from "./lending";
import { DENSE_INPUT, Field, Figure, Mono, Note, PercentInput, Select, XrpInput, xrp } from "./shared";

export interface Outcome {
  key: string;
  result: Submitted;
  context?: "loanset" | "generic";
  title?: string;
}

export interface OriginateInput {
  borrower: string; borrowerSeed: string; loanBrokerId: string; principalDrops: string; closePaymentFeeDrops: string;
  interestRate: number; paymentInterval: number; paymentTotal: number; gracePeriod: number;
}

// The transaction tickets. Each form keeps the exact shapes, defaults and checks of the proven flow;
// the parent signs, shows the ledger's verdict and re-reads the ledger.

// ---------------------------------------------------------------------------------------------

export function SeedForm({ vault, busy, onDeposit }: { vault: VaultState; busy: string | null; onDeposit: (drops: string) => void }) {
  const [depositXrp, setDepositXrp] = React.useState("100");
  const depositDrops = xrpToDrops(depositXrp);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (depositDrops) onDeposit(depositDrops); }}>
      <Field id="seed-liquidity" label="Seed liquidity (optional)" hint="Deposit your own XRP so the selected vault has something to lend. In a product this is the lenders' capital.">
        <XrpInput id="seed-liquidity" value={depositXrp} onChange={setDepositXrp} invalid={depositXrp.length > 0 && !depositDrops} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Vault cash now" value={xrp(vault.assetsAvailableDrops, 2)} />
        <Figure label="After deposit" value={depositDrops ? xrp((BigInt(wholeDrops(vault.assetsAvailableDrops)) + BigInt(depositDrops)).toString(), 2) : "—"} tone={depositDrops ? "up" : undefined} />
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={!depositDrops || busy !== null}>{busy === "VaultDeposit" ? "Depositing…" : "Deposit"}</Button>
      <Note>Creating a vault costs 2 test XRP on network 4001, consumed as a fee, not deposited. Shares are transferable by default.</Note>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

export function BrokerForm({ vault, brokers, busy, onCreate }: { vault: VaultState; brokers: BrokerState[]; busy: string | null; onCreate: (debtMaxDrops: string, coverMin: number, coverLiq: number) => void }) {
  const [debtMax, setDebtMax] = React.useState(DEFAULTS.debtMaximumXrp);
  const [coverMin, setCoverMin] = React.useState(DEFAULTS.coverRateMinimumPercent);
  const [coverLiq, setCoverLiq] = React.useState(DEFAULTS.coverRateLiquidationPercent);

  const debtMaxDrops = xrpToDrops(debtMax);
  const coverMinRate = percentToTenthBps(coverMin);
  const coverLiqRate = percentToTenthBps(coverLiq);
  const formValid = debtMaxDrops && coverMinRate !== null && coverLiqRate !== null;

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (formValid) onCreate(debtMaxDrops as string, coverMinRate as number, coverLiqRate as number); }}>
      <Note>A loan broker originates loans against vault <Mono value={vault.vaultId} short={8} /> and posts first-loss cover. Cover must clear the minimum rate before any origination.{brokers.length > 0 && <> This vault already has {brokers.length} broker{brokers.length > 1 ? "s" : ""}.</>}</Note>
      <Field id="debt-max" label="Debt maximum">
        <XrpInput id="debt-max" value={debtMax} onChange={setDebtMax} invalid={debtMax.length > 0 && !debtMaxDrops} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id="cover-min" label="Cover rate minimum" hint="Percent of outstanding debt the broker must hold as cover.">
          <PercentInput id="cover-min" value={coverMin} onChange={setCoverMin} invalid={coverMinRate === null} />
        </Field>
        <Field id="cover-liq" label="Cover rate liquidation">
          <PercentInput id="cover-liq" value={coverLiq} onChange={setCoverLiq} invalid={coverLiqRate === null} />
        </Field>
      </div>
      <Note>Rates are stored on the ledger in 1/10 basis points: {coverMin || "0"} % is {coverMinRate ?? "—"}.</Note>
      <Button type="submit" size="sm" className="w-full" disabled={!formValid || busy !== null}>{busy === "LoanBrokerSet" ? "Creating…" : "Create broker"}</Button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

export function CoverForm({ brokers, contextBrokerId, busy, onCover }: { brokers: BrokerState[]; contextBrokerId: string | null; busy: string | null; onCover: (brokerId: string, drops: string) => void }) {
  const [brokerId, setBrokerId] = React.useState(contextBrokerId ?? brokers[0].loanBrokerId);
  React.useEffect(() => { if (contextBrokerId) setBrokerId(contextBrokerId); }, [contextBrokerId]);
  const broker = brokers.find((b) => b.loanBrokerId === brokerId) ?? brokers[0];
  const [coverXrp, setCoverXrp] = React.useState(DEFAULTS.coverXrp);
  const coverDrops = xrpToDrops(coverXrp);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (coverDrops) onCover(broker.loanBrokerId, coverDrops); }}>
      {brokers.length > 1 && (
        <Field id="cover-broker" label="Broker">
          <Select id="cover-broker" value={broker.loanBrokerId} onChange={setBrokerId} options={brokers.map((b) => ({ label: `${b.loanBrokerId.slice(0, 12)}… · cover ${xrp(b.coverAvailableDrops)}`, value: b.loanBrokerId }))} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Cover available" value={xrp(broker.coverAvailableDrops)} />
        <Figure label="Debt outstanding" value={xrp(broker.debtTotalDrops)} sub={`min ${tenthBpsToPercent(broker.coverRateMinimum)} · liq ${tenthBpsToPercent(broker.coverRateLiquidation)}`} />
      </div>
      <Field id={`cover-${broker.loanBrokerId}`} label="Deposit cover" hint="First-loss cover posted by the broker; it absorbs losses before the vault does.">
        <XrpInput id={`cover-${broker.loanBrokerId}`} value={coverXrp} onChange={setCoverXrp} invalid={coverXrp.length > 0 && !coverDrops} />
      </Field>
      <Button type="submit" size="sm" className="w-full" disabled={!coverDrops || busy !== null}>{busy === "LoanBrokerCoverDeposit" ? "Depositing…" : "Deposit cover"}</Button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

export function OriginateForm({ vault, brokers, contextBrokerId, busy, onOriginate }: { vault: VaultState; brokers: BrokerState[]; contextBrokerId: string | null; busy: string | null; onOriginate: (input: OriginateInput) => void }) {
  const [brokerId, setBrokerId] = React.useState(contextBrokerId ?? brokers[0].loanBrokerId);
  React.useEffect(() => { if (contextBrokerId) setBrokerId(contextBrokerId); }, [contextBrokerId]);
  const [borrower, setBorrower] = React.useState("");
  const [borrowerSeed, setBorrowerSeed] = React.useState("");
  const [principal, setPrincipal] = React.useState(DEFAULTS.principalXrp);
  const [interest, setInterest] = React.useState(DEFAULTS.interestPercent);
  const [interval, setIntervalSeconds] = React.useState(String(DEFAULTS.paymentInterval));
  const [total, setTotal] = React.useState(DEFAULTS.paymentTotal);
  const [grace, setGrace] = React.useState(String(DEFAULTS.gracePeriod));
  const [closeFee, setCloseFee] = React.useState(DEFAULTS.closePaymentFeeXrp);

  const broker = brokers.find((b) => b.loanBrokerId === brokerId) ?? brokers[0];
  const principalDrops = xrpToDrops(principal);
  const closeFeeDrops = xrpToDrops(closeFee) ?? "0";
  const interestRate = percentToTenthBps(interest);
  const paymentInterval = Number(interval);
  const paymentTotal = Number(total);
  const gracePeriod = Number(grace);

  const graceOptions = INTERVAL_OPTIONS.filter((o) => o.seconds <= paymentInterval).map((o) => ({ label: o.label, value: String(o.seconds) }));
  React.useEffect(() => {
    if (gracePeriod > paymentInterval) setGrace(String(paymentInterval));
  }, [gracePeriod, paymentInterval]);

  const termErrors = interestRate === null ? ["Interest rate must be a percentage."] : validateLoanTerms({ interestRate, paymentInterval, paymentTotal, gracePeriod });
  const required = principalDrops ? requiredCoverDrops(principalDrops, broker.coverRateMinimum) : "0";
  const coverShort = BigInt(wholeDrops(broker.coverAvailableDrops)) < BigInt(required);
  const liquidityShort = principalDrops ? BigInt(wholeDrops(vault.assetsAvailableDrops)) < BigInt(principalDrops) : false;
  const addressOk = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(borrower);
  const canSubmit = addressOk && borrowerSeed.trim().length > 0 && principalDrops && interestRate !== null && termErrors.length === 0 && busy === null;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || !principalDrops || interestRate === null) return;
        onOriginate({ borrower, borrowerSeed, loanBrokerId: broker.loanBrokerId, principalDrops, closePaymentFeeDrops: closeFeeDrops, interestRate, paymentInterval, paymentTotal, gracePeriod });
      }}
    >
      <Note>The broker proposes terms; the borrower accepts by counter-signing the same transaction. Principal is disbursed at origination — there is no separate drawdown on this protocol version.</Note>
      <Alert variant="info" className="py-2.5 text-xs">
        <Info />
        <AlertTitle className="text-xs">Borrower signing seed (demo only)</AlertTitle>
        <AlertDescription className="text-xs">
          This operator demo asks for the borrower&apos;s test seed to co-sign LoanSet in this browser. Used once and never stored. Separate borrower approval is not yet connected in this console; the marketplace sale uses separate buyer and seller wallets.
        </AlertDescription>
      </Alert>

      {brokers.length > 1 && (
        <Field id="broker" label="Broker">
          <Select id="broker" value={broker.loanBrokerId} onChange={setBrokerId} options={brokers.map((b) => ({ label: `${b.loanBrokerId.slice(0, 12)}… · cover ${xrp(b.coverAvailableDrops)}`, value: b.loanBrokerId }))} />
        </Field>
      )}
      <Field id="borrower" label="Borrower address">
        <Input id="borrower" value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="r…" className={`${DENSE_INPUT} font-mono`} aria-invalid={borrower.length > 0 && !addressOk} />
      </Field>
      <Field id="borrower-seed" label="Borrower signing seed (demo only)">
        <Input id="borrower-seed" type="password" autoComplete="off" value={borrowerSeed} onChange={(e) => setBorrowerSeed(e.target.value)} placeholder="s…" className={`${DENSE_INPUT} font-mono`} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id="principal" label="Principal">
          <XrpInput id="principal" value={principal} onChange={setPrincipal} invalid={principal.length > 0 && !principalDrops} />
        </Field>
        <Field id="interest" label="Interest, annualised" hint={`${interestRate ?? "—"} in 1/10 bps. Max 100 %.`}>
          <PercentInput id="interest" value={interest} onChange={setInterest} invalid={interestRate === null} />
        </Field>
        <Field id="interval" label="Payment interval">
          <Select id="interval" value={interval} onChange={setIntervalSeconds} options={INTERVAL_OPTIONS.map((o) => ({ label: o.label, value: String(o.seconds) }))} />
        </Field>
        <Field id="total" label="Payments total">
          <Input id="total" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className={`${DENSE_INPUT} tabular-nums`} />
        </Field>
        <Field id="grace" label="Grace period" hint="At least 60 seconds and never above the interval. The ledger enforces both; the SDK only checks the second, so a shorter value would fail with an unexplained temINVALID.">
          <Select id="grace" value={grace} onChange={setGrace} options={graceOptions} />
        </Field>
        <Field id="close-fee" label="Close payment fee" hint="Charged on early full repayment. It goes to the broker, not the vault.">
          <XrpInput id="close-fee" value={closeFee} onChange={setCloseFee} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary/50 p-2.5">
        <Figure label="Cover required" value={xrp(required, 2)} sub={`${tenthBpsToPercent(broker.coverRateMinimum)} of principal`} />
        <Figure label="Cover available" value={xrp(broker.coverAvailableDrops, 2)} tone={coverShort ? "down" : "up"} sub={coverShort ? "Below the required cover" : "Clears the minimum"} />
        <Figure label="Vault available" value={xrp(vault.assetsAvailableDrops, 2)} tone={liquidityShort ? "down" : "up"} sub={liquidityShort ? "Less than the principal" : "Can fund the principal"} />
      </div>

      {(coverShort || liquidityShort) && principalDrops && (
        <Alert variant="warning" className="py-2.5">
          <Info />
          <AlertTitle className="text-xs">The ledger will most likely answer tecINSUFFICIENT_FUNDS</AlertTitle>
          <AlertDescription className="text-xs">
            That code means two different things. Here it would mean {coverShort && liquidityShort ? "both that the broker's cover is below its minimum and that the vault cannot fund the principal" : coverShort ? "the broker's first-loss cover is below its minimum, not that the vault lacks cash" : "the vault cannot fund the principal, not that the broker lacks cover"}. You can still submit; the ledger is the judge.
          </AlertDescription>
        </Alert>
      )}

      {termErrors.length > 0 && (
        <Alert variant="destructive" className="py-2.5">
          <AlertTitle className="text-xs">Terms the ledger would reject</AlertTitle>
          <AlertDescription className="text-xs"><ul className="list-disc pl-4">{termErrors.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <Note>Schedule: {total || "—"} payments every {formatDuration(paymentInterval)}, grace {formatDuration(gracePeriod)}.</Note>
      <Button type="submit" size="sm" className="w-full" disabled={!canSubmit}>{busy === "LoanSet" ? "Signing both parties…" : "Originate"}</Button>
    </form>
  );
}
