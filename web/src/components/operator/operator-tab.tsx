"use client";

import * as React from "react";
import { Info, Landmark, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stat } from "@/components/stat";
import { TxResult } from "@/components/tx-result";
import { formatShares, formatXrp, xrpToDrops } from "@/lib/format";
import {
  wholeDrops, createdEntry, readLoan, readLoansFor, readOwnedBrokers, readOwnedVaults, rippleTimeToDate, signAndSubmit, signAndSubmitLoanSet,
  type BrokerState, type LoanState, type Submitted, type VaultState,
} from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import {
  buildLoanBrokerCoverDeposit, buildLoanBrokerSet, buildLoanSet, buildVaultCreate, buildVaultDeposit, ceilDrops, DEFAULTS, formatDuration,
  INTERVAL_OPTIONS, percentToTenthBps, requiredCoverDrops, tenthBpsToPercent, validateLoanTerms,
} from "./lending";
import { AddressLink, ConnectPrompt, EmptyState, Field, LoanFlags, Mono, Select, UtilisationBar, XrpInput } from "./shared";

const xrp = (value: string) => formatXrp(ceilDrops(value));

interface Outcome {
  key: string;
  result: Submitted;
  context?: "loanset" | "generic";
  title?: string;
}

export function OperatorTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;

  const [vaults, setVaults] = React.useState<VaultState[] | null>(null);
  const [brokers, setBrokers] = React.useState<BrokerState[] | null>(null);
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [selectedVault, setSelectedVault] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [outcomes, setOutcomes] = React.useState<Outcome[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!address) return;
    setLoadError(null);
    try {
      const [v, b, l] = await Promise.all([readOwnedVaults(address), readOwnedBrokers(address), readLoansFor(address)]);
      setVaults(v);
      setBrokers(b);
      setLoans(l);
      setSelectedVault((current) => current && v.some((x) => x.vaultId === current) ? current : v[0]?.vaultId ?? null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [address]);

  React.useEffect(() => {
    setVaults(null);
    setBrokers(null);
    setLoans(null);
    void load();
  }, [load]);

  const pushOutcome = (outcome: Outcome) => setOutcomes((current) => [outcome, ...current].slice(0, 6));

  // Every action follows the same shape: sign with the connected wallet, show the ledger's verdict,
  // then re-read state from the validated ledger rather than trusting the result.
  const run = async (key: string, action: () => Promise<Outcome>) => {
    setBusy(key);
    try {
      pushOutcome(await action());
    } catch (error) {
      pushOutcome({ key, result: { hash: "", ledgerIndex: 0, resultCode: "error", validated: false, meta: {} }, title: (error as Error).message });
    } finally {
      setBusy(null);
      await Promise.all([load(), wallet.refresh()]);
    }
  };

  if (!address) return <ConnectPrompt role="vault owner and loan broker" />;

  const vault = vaults?.find((v) => v.vaultId === selectedVault) ?? null;
  const vaultBrokers = brokers?.filter((b) => b.vaultId === selectedVault) ?? [];
  const ownedBrokerIds = new Set((brokers ?? []).map((b) => b.loanBrokerId));
  const brokerLoans = (loans ?? []).filter((l) => ownedBrokerIds.has(l.loanBrokerId));

  return (
    <div className="space-y-6">
      {loadError && (
        <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>
      )}

      {outcomes.length > 0 && (
        <div className="space-y-2">
          {outcomes.map((o, index) => (
            o.result.resultCode === "error"
              ? <Alert key={`${o.key}-${index}`} variant="destructive"><AlertTitle>{o.key} failed</AlertTitle><AlertDescription>{o.title}</AlertDescription></Alert>
              : <TxResult key={`${o.key}-${index}`} result={o.result} context={o.context} title={o.title} />
          ))}
        </div>
      )}

      <VaultsSection
        vaults={vaults} selected={selectedVault} onSelect={setSelectedVault} busy={busy}
        onCreate={() => run("VaultCreate", async () => {
          const signer = await wallet.requireSigner();
          const result = await signAndSubmit(buildVaultCreate(address), signer);
          return { key: "VaultCreate", result, title: result.resultCode === "tesSUCCESS" ? "Vault created" : "Vault not created" };
        })}
        onDeposit={(drops) => run("VaultDeposit", async () => {
          const signer = await wallet.requireSigner();
          const result = await signAndSubmit(buildVaultDeposit(address, selectedVault as string, drops), signer);
          return { key: "VaultDeposit", result, title: "Liquidity deposit" };
        })}
        onRefresh={load}
      />

      {vault && (
        <BrokersSection
          vault={vault} brokers={vaultBrokers} busy={busy}
          onCreate={(debtMaxDrops, coverMin, coverLiq) => run("LoanBrokerSet", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildLoanBrokerSet(address, vault.vaultId, debtMaxDrops, coverMin, coverLiq), signer);
            return { key: "LoanBrokerSet", result, title: "Loan broker" };
          })}
          onCover={(brokerId, drops) => run("LoanBrokerCoverDeposit", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildLoanBrokerCoverDeposit(address, brokerId, drops), signer);
            return { key: "LoanBrokerCoverDeposit", result, title: "First-loss cover" };
          })}
        />
      )}

      {vault && vaultBrokers.length > 0 && (
        <OriginateSection
          vault={vault} brokers={vaultBrokers} busy={busy}
          onOriginate={(input) => run("LoanSet", async () => {
            const brokerSigner = await wallet.requireSigner();
            const borrowerSigner = wallet.signerForSeed(input.borrowerSeed);
            if (borrowerSigner.classicAddress !== input.borrower) throw new Error("The borrower seed does not belong to the borrower address entered.");
            const result = await signAndSubmitLoanSet(buildLoanSet({ ...input, broker: address }), brokerSigner, borrowerSigner);
            let title = "Origination";
            if (result.resultCode === "tesSUCCESS") {
              const loanId = createdEntry(result.meta, "Loan");
              if (loanId) {
                const loan = await readLoan(loanId);
                title = `Loan ${loanId.slice(0, 8)}… originated · ${xrp(loan.principalOutstandingDrops)} disbursed to the borrower`;
              }
            }
            return { key: "LoanSet", result, context: "loanset", title };
          })}
        />
      )}

      <LoansSection loans={loans === null ? null : brokerLoans} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function VaultsSection({ vaults, selected, onSelect, onCreate, onDeposit, onRefresh, busy }: {
  vaults: VaultState[] | null; selected: string | null; onSelect: (id: string) => void;
  onCreate: () => void; onDeposit: (drops: string) => void; onRefresh: () => Promise<void>; busy: string | null;
}) {
  const [depositXrp, setDepositXrp] = React.useState("100");
  const depositDrops = xrpToDrops(depositXrp);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="size-4 text-primary" /> Your vaults</CardTitle>
        <CardDescription>Open-ended Single Asset Vaults you own. Each issues transferable shares against deposited XRP.</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void onRefresh()}><RefreshCw /></Button>
          <Button onClick={onCreate} disabled={busy !== null}><Plus /> {busy === "VaultCreate" ? "Creating…" : "Create vault"}</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Creating a vault consumes a 2 XRP owner reserve on this network, charged as the transaction fee. Shares are transferable by default, which is what a secondary market needs.</p>
        {vaults === null ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        ) : vaults.length === 0 ? (
          <EmptyState>No vault yet. Create one to start lending.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {vaults.map((v) => (
              <button
                key={v.vaultId} type="button" onClick={() => onSelect(v.vaultId)} aria-pressed={selected === v.vaultId}
                className={cn("rounded-lg border p-3 text-left transition-colors hover:bg-muted/40", selected === v.vaultId ? "border-primary ring-2 ring-primary/20" : "border-border")}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Mono value={v.vaultId} short={12} />
                  <Badge variant={v.transferable ? "success" : "warning"}>{v.transferable ? "Transferable" : "Non-transferable"}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Assets total" value={xrp(v.assetsTotalDrops)} />
                  <Stat label="Available" value={xrp(v.assetsAvailableDrops)} />
                </div>
                <div className="mt-2"><UtilisationBar totalDrops={v.assetsTotalDrops} availableDrops={v.assetsAvailableDrops} /></div>
                <p className="mt-2 text-xs text-muted-foreground">Shares outstanding <span className="font-mono tabular-nums">{formatShares(v.sharesOutstanding)}</span> · issuance <Mono value={v.shareMptId} short={10} /></p>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <form className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); if (depositDrops) onDeposit(depositDrops); }}>
            <Field id="seed-liquidity" label="Seed liquidity (optional)" hint="Deposit your own XRP so the selected vault has something to lend. In a product this is the lenders' capital." className="min-w-56 flex-1">
              <XrpInput id="seed-liquidity" value={depositXrp} onChange={setDepositXrp} />
            </Field>
            <Button type="submit" variant="outline" disabled={!depositDrops || busy !== null}>{busy === "VaultDeposit" ? "Depositing…" : "Deposit"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function BrokersSection({ vault, brokers, onCreate, onCover, busy }: {
  vault: VaultState; brokers: BrokerState[]; busy: string | null;
  onCreate: (debtMaxDrops: string, coverMin: number, coverLiq: number) => void; onCover: (brokerId: string, drops: string) => void;
}) {
  const [debtMax, setDebtMax] = React.useState(DEFAULTS.debtMaximumXrp);
  const [coverMin, setCoverMin] = React.useState(DEFAULTS.coverRateMinimumPercent);
  const [coverLiq, setCoverLiq] = React.useState(DEFAULTS.coverRateLiquidationPercent);
  const [coverXrp, setCoverXrp] = React.useState(DEFAULTS.coverXrp);
  const [showForm, setShowForm] = React.useState(brokers.length === 0);

  const debtMaxDrops = xrpToDrops(debtMax);
  const coverMinRate = percentToTenthBps(coverMin);
  const coverLiqRate = percentToTenthBps(coverLiq);
  const coverDrops = xrpToDrops(coverXrp);
  const formValid = debtMaxDrops && coverMinRate !== null && coverLiqRate !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Brokers on this vault</CardTitle>
        <CardDescription>A loan broker originates loans against the vault and posts first-loss cover. Cover must clear the minimum rate before any origination.</CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setShowForm((s) => !s)}><Plus /> Create broker</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {brokers.length === 0 && !showForm && <EmptyState>No broker on vault <Mono value={vault.vaultId} />.</EmptyState>}

        {brokers.map((b) => (
          <div key={b.loanBrokerId} className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Mono value={b.loanBrokerId} short={12} />
              <span className="text-xs text-muted-foreground">Cover minimum {tenthBpsToPercent(b.coverRateMinimum)} · liquidation {tenthBpsToPercent(b.coverRateLiquidation)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Cover available" value={xrp(b.coverAvailableDrops)} />
              <Stat label="Debt total" value={xrp(b.debtTotalDrops)} />
              <Stat label="Debt maximum" value={xrp(b.debtMaximumDrops)} />
            </div>
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (coverDrops) onCover(b.loanBrokerId, coverDrops); }}>
              <Field id={`cover-${b.loanBrokerId}`} label="Deposit cover" className="min-w-48 flex-1">
                <XrpInput id={`cover-${b.loanBrokerId}`} value={coverXrp} onChange={setCoverXrp} />
              </Field>
              <Button type="submit" variant="outline" disabled={!coverDrops || busy !== null}>{busy === "LoanBrokerCoverDeposit" ? "Depositing…" : "Deposit cover"}</Button>
            </form>
          </div>
        ))}

        {showForm && (
          <form className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (formValid) onCreate(debtMaxDrops as string, coverMinRate as number, coverLiqRate as number); }}>
            <Field id="debt-max" label="Debt maximum">
              <XrpInput id="debt-max" value={debtMax} onChange={setDebtMax} />
            </Field>
            <Field id="cover-min" label="Cover rate minimum" hint="Percent of outstanding debt the broker must hold as cover.">
              <div className="relative"><Input id="cover-min" inputMode="decimal" value={coverMin} onChange={(e) => setCoverMin(e.target.value)} className="pr-8 tabular-nums" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span></div>
            </Field>
            <Field id="cover-liq" label="Cover rate liquidation">
              <div className="relative"><Input id="cover-liq" inputMode="decimal" value={coverLiq} onChange={(e) => setCoverLiq(e.target.value)} className="pr-8 tabular-nums" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span></div>
            </Field>
            <div className="sm:col-span-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Rates are stored on the ledger in 1/10 basis points: {coverMin || "0"} % is {coverMinRate ?? "—"}.</p>
              <Button type="submit" disabled={!formValid || busy !== null}>{busy === "LoanBrokerSet" ? "Creating…" : "Create broker"}</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

interface OriginateInput {
  borrower: string; borrowerSeed: string; loanBrokerId: string; principalDrops: string; closePaymentFeeDrops: string;
  interestRate: number; paymentInterval: number; paymentTotal: number; gracePeriod: number;
}

function OriginateSection({ vault, brokers, onOriginate, busy }: { vault: VaultState; brokers: BrokerState[]; busy: string | null; onOriginate: (input: OriginateInput) => void }) {
  const [brokerId, setBrokerId] = React.useState(brokers[0].loanBrokerId);
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
    <Card>
      <CardHeader>
        <CardTitle>Originate a loan</CardTitle>
        <CardDescription>The broker proposes terms; the borrower accepts by counter-signing the same transaction. Principal is disbursed at origination — there is no separate drawdown on this protocol version.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          <Info />
          <AlertTitle>Borrower signing seed (demo only)</AlertTitle>
          <AlertDescription>
            This operator demo asks for the borrower&apos;s test seed to co-sign LoanSet in this browser. Used once and never stored. Separate borrower approval is not yet connected in this console; the marketplace sale uses separate buyer and seller wallets.
          </AlertDescription>
        </Alert>

        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || !principalDrops || interestRate === null) return;
            onOriginate({ borrower, borrowerSeed, loanBrokerId: brokerId, principalDrops, closePaymentFeeDrops: closeFeeDrops, interestRate, paymentInterval, paymentTotal, gracePeriod });
          }}
        >
          {brokers.length > 1 && (
            <Field id="broker" label="Broker" className="md:col-span-2">
              <Select id="broker" value={brokerId} onChange={setBrokerId} options={brokers.map((b) => ({ label: `${b.loanBrokerId.slice(0, 12)}… · cover ${xrp(b.coverAvailableDrops)}`, value: b.loanBrokerId }))} />
            </Field>
          )}
          <Field id="borrower" label="Borrower address">
            <Input id="borrower" value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="r…" className="font-mono" aria-invalid={borrower.length > 0 && !addressOk} />
          </Field>
          <Field id="borrower-seed" label="Borrower signing seed (demo only)">
            <Input id="borrower-seed" type="password" autoComplete="off" value={borrowerSeed} onChange={(e) => setBorrowerSeed(e.target.value)} placeholder="s…" className="font-mono" />
          </Field>
          <Field id="principal" label="Principal">
            <XrpInput id="principal" value={principal} onChange={setPrincipal} />
          </Field>
          <Field id="interest" label="Interest rate, annualised" hint={`Stored as ${interestRate ?? "—"} in 1/10 bps. Ledger maximum is 100 %.`}>
            <div className="relative"><Input id="interest" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} className="pr-8 tabular-nums" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span></div>
          </Field>
          <Field id="interval" label="Payment interval">
            <Select id="interval" value={interval} onChange={setIntervalSeconds} options={INTERVAL_OPTIONS.map((o) => ({ label: o.label, value: String(o.seconds) }))} />
          </Field>
          <Field id="total" label="Payments total">
            <Input id="total" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className="tabular-nums" />
          </Field>
          <Field id="grace" label="Grace period" hint="At least 60 seconds and never above the interval. The ledger enforces both; the SDK only checks the second, so a shorter value would fail with an unexplained temINVALID.">
            <Select id="grace" value={grace} onChange={setGrace} options={graceOptions} />
          </Field>
          <Field id="close-fee" label="Close payment fee" hint="Charged on early full repayment. It goes to the broker, not the vault.">
            <XrpInput id="close-fee" value={closeFee} onChange={setCloseFee} />
          </Field>

          <div className="md:col-span-2 grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
            <Stat label="Cover required" value={xrp(required)} hint={`${tenthBpsToPercent(broker.coverRateMinimum)} of principal`} />
            <Stat label="Cover available" value={xrp(broker.coverAvailableDrops)} hint={coverShort ? "Below the required cover" : "Clears the minimum"} className={coverShort ? "ring-1 ring-destructive/40" : undefined} />
            <Stat label="Vault available" value={xrp(vault.assetsAvailableDrops)} hint={liquidityShort ? "Less than the principal" : "Can fund the principal"} className={liquidityShort ? "ring-1 ring-destructive/40" : undefined} />
          </div>

          {(coverShort || liquidityShort) && principalDrops && (
            <Alert variant="warning" className="md:col-span-2">
              <Info />
              <AlertTitle>The ledger will most likely answer tecINSUFFICIENT_FUNDS</AlertTitle>
              <AlertDescription>
                That code means two different things. Here it would mean {coverShort && liquidityShort ? "both that the broker's cover is below its minimum and that the vault cannot fund the principal" : coverShort ? "the broker's first-loss cover is below its minimum, not that the vault lacks cash" : "the vault cannot fund the principal, not that the broker lacks cover"}. You can still submit; the ledger is the judge.
              </AlertDescription>
            </Alert>
          )}

          {termErrors.length > 0 && (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertTitle>Terms the ledger would reject</AlertTitle>
              <AlertDescription><ul className="list-disc pl-4">{termErrors.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
            </Alert>
          )}

          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Schedule: {total || "—"} payments every {formatDuration(paymentInterval)}, grace {formatDuration(gracePeriod)}.</p>
            <Button type="submit" disabled={!canSubmit}>{busy === "LoanSet" ? "Signing both parties…" : "Originate"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function LoansSection({ loans }: { loans: LoanState[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loans</CardTitle>
        <CardDescription>Loans originated by your brokers, read from the validated ledger. Interest is realised as payments deliver it, so scheduled interest is not yet in the vault&apos;s assets.</CardDescription>
      </CardHeader>
      <CardContent>
        {loans === null ? <Skeleton className="h-24" /> : loans.length === 0 ? <EmptyState>No loan yet.</EmptyState> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan</TableHead><TableHead>Borrower</TableHead><TableHead className="text-right">Principal outstanding</TableHead>
                <TableHead className="text-right">Scheduled interest</TableHead><TableHead className="text-right">Periodic payment</TableHead>
                <TableHead className="text-right">Remaining</TableHead><TableHead>Next due</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((l) => (
                <TableRow key={l.loanId}>
                  <TableCell><Mono value={l.loanId} /></TableCell>
                  <TableCell><AddressLink address={l.borrower} /></TableCell>
                  <TableCell className="text-right tabular-nums">{xrp(l.principalOutstandingDrops)}</TableCell>
                  <TableCell className="text-right tabular-nums">{xrp(l.scheduledInterestRemainingDrops)}</TableCell>
                  <TableCell className="text-right tabular-nums">{xrp(l.periodicPaymentDrops)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.paymentRemaining}</TableCell>
                  <TableCell className="text-xs">{l.nextPaymentDueDate ? rippleTimeToDate(l.nextPaymentDueDate).toLocaleString("en-GB") : "—"}</TableCell>
                  <TableCell><LoanFlags flags={l.flags} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
