"use client";

import * as React from "react";
import { ArrowDownToLine, Handshake, LineChart, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, KpiStrip, PanelEmpty, Tick } from "@/components/terminal";
import { useToast } from "@/components/ui/toast";
import { formatShares, formatXrp } from "@/lib/format";
import {
  createdEntry, readLoan, readLoansForBrokers, readOwnedBrokers, readOwnedVaults, signAndSubmit, signAndSubmitLoanSet,
  type BrokerState, type LoanState, type VaultState,
} from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { buildLoanBrokerCoverDeposit, buildLoanBrokerSet, buildLoanSet, buildVaultCreate, buildVaultDeposit, sumCeilDrops, tenthBpsToPercent } from "./lending";
import { BrokerForm, CoverForm, OriginateForm, SeedForm, type Outcome } from "./action-forms";
import { BrokerDetail } from "./broker-detail";
import { LoanPanel } from "./loan-detail";
import { LoansTable } from "./loans-table";
import { VaultDetail } from "./vault-detail";
import { ConnectPrompt, Mono, UtilisationBar, xrp } from "./shared";

const POLL_MS = 15_000;

type Open = { kind: "deposit" | "broker" | "originate" | "details"; vaultId: string } | { kind: "loan"; loanId: string } | null;

// The lending desk, light: three figures, one card per vault with its actions in dialogs, the loans.
export function OperatorTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;

  const [vaults, setVaults] = React.useState<VaultState[] | null>(null);
  const [brokers, setBrokers] = React.useState<BrokerState[] | null>(null);
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [lastRead, setLastRead] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState<Open>(null);
  const loading = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!address || loading.current) return;
    loading.current = true;
    setLoadError(null);
    try {
      const [v, b] = await Promise.all([readOwnedVaults(address), readOwnedBrokers(address)]);
      const l = await readLoansForBrokers(b);
      setVaults(v); setBrokers(b); setLoans(l);
      setLastRead(Date.now());
      setTick((t) => t + 1);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      loading.current = false;
    }
  }, [address]);

  React.useEffect(() => { setVaults(null); setBrokers(null); setLoans(null); void load(); }, [load]);
  React.useEffect(() => {
    if (!address) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, load]);

  // Every action: sign with the connected wallet, show the ledger's verdict, re-read the ledger.
  const run = async (key: string, action: () => Promise<Outcome>) => {
    setBusy(key);
    try {
      const outcome = await action();
      toast.pushResult(outcome.result, outcome.title ?? key, outcome.context);
    } catch (error) {
      toast.push({ tone: "error", title: `${key} failed`, description: (error as Error).message });
    } finally {
      setBusy(null);
      await Promise.all([load(), wallet.refresh()]);
    }
  };

  const createVault = () => run("VaultCreate", async () => {
    const signer = await wallet.requireSigner();
    const result = await signAndSubmit(buildVaultCreate(address as string), signer);
    return { key: "VaultCreate", result, title: result.resultCode === "tesSUCCESS" ? "Vault created" : "Vault not created" };
  });

  if (!address) {
    return (
      <div className="space-y-3">
        <KpiStrip className="sm:grid-cols-3 lg:grid-cols-3">{["Assets managed", "Cash available", "Deployed in loans"].map((label) => <Kpi key={label} label={label} value="—" sub="connect a wallet" />)}</KpiStrip>
        <div className="terminal-panel p-6"><ConnectPrompt role="vault owner and loan broker" /></div>
      </div>
    );
  }

  const assets = vaults ? sumCeilDrops(vaults.map((v) => v.assetsTotalDrops)) : null;
  const cash = vaults ? sumCeilDrops(vaults.map((v) => v.assetsAvailableDrops)) : null;
  const deployed = assets && cash ? (BigInt(assets) - BigInt(cash)).toString() : null;
  const money = (drops: string | null) => (drops === null ? "—" : <Tick numeric={drops}>{formatXrp(drops, 2)}</Tick>);
  const openVault = open && open.kind !== "loan" ? (vaults ?? []).find((v) => v.vaultId === open.vaultId) ?? null : null;
  const openVaultBrokers = openVault ? (brokers ?? []).filter((b) => b.vaultId === openVault.vaultId) : [];
  const openLoan = open?.kind === "loan" ? (loans ?? []).find((l) => l.loanId === open.loanId) ?? null : null;
  const close = () => setOpen(null);

  return (
    <div className="space-y-4">
      <KpiStrip className="sm:grid-cols-3 lg:grid-cols-3">
        <Kpi label="Assets managed" value={money(assets)} sub={`${vaults?.length ?? 0} vault${vaults?.length === 1 ? "" : "s"} · ${lastRead ? `read ${new Date(lastRead).toLocaleTimeString("en-GB")}` : "reading…"}`} />
        <Kpi label="Cash available" value={money(cash)} sub="idle liquidity" />
        <Kpi label="Deployed in loans" value={money(deployed)} sub={assets && BigInt(assets) > 0n && deployed ? `${((Number(deployed) / Number(assets)) * 100).toFixed(1)} % utilised · ${loans?.length ?? 0} loan${loans?.length === 1 ? "" : "s"}` : "nothing lent"} />
      </KpiStrip>

      {loadError && <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Your vaults</h2>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void load()} aria-label="Re-read the ledger"><RefreshCw className="size-3.5" /></Button>
        <Button size="sm" variant={vaults && vaults.length > 0 ? "outline" : "default"} className="ml-auto" disabled={busy !== null} onClick={() => void createVault()}><Plus /> {busy === "VaultCreate" ? "Creating…" : "Create vault"}</Button>
      </div>

      {vaults === null ? (
        <Skeleton className="h-32" />
      ) : vaults.length === 0 ? (
        <div className="terminal-panel"><PanelEmpty className="min-h-32">No vault yet. Creating one costs 2 test XRP on network 4001, consumed as a fee, not deposited. Shares are transferable by default.</PanelEmpty></div>
      ) : (
        <ul className="grid gap-3">
          {vaults.map((vault) => {
            const vaultBrokers = (brokers ?? []).filter((b) => b.vaultId === vault.vaultId);
            return (
              <li key={vault.vaultId} className="terminal-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">Vault <Mono value={vault.vaultId} short={8} className="text-sm" /></span>
                  <Badge variant={vault.transferable ? "outline" : "warning"} className="h-5 text-[10px]">{vault.transferable ? "transferable shares" : "non-transferable"}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{formatShares(vault.sharesOutstanding)} shares out</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Figure label="Assets total"><Tick numeric={vault.assetsTotalDrops.split(".")[0]}>{xrp(vault.assetsTotalDrops, 2)}</Tick></Figure>
                  <Figure label="Cash available"><Tick numeric={vault.assetsAvailableDrops.split(".")[0]}>{xrp(vault.assetsAvailableDrops, 2)}</Tick></Figure>
                  <div className="col-span-2 self-center"><UtilisationBar totalDrops={vault.assetsTotalDrops} availableDrops={vault.assetsAvailableDrops} /></div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {vaultBrokers.length === 0 ? "No broker yet: create one to originate loans." : vaultBrokers.map((b) => <span key={b.loanBrokerId} className="mr-3">Broker <Mono value={b.loanBrokerId} short={8} /> · cover {xrp(b.coverAvailableDrops, 2)} · debt {xrp(b.debtTotalDrops, 2)} · min {tenthBpsToPercent(b.coverRateMinimum)}</span>)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setOpen({ kind: "deposit", vaultId: vault.vaultId })}><ArrowDownToLine /> Deposit</Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "broker", vaultId: vault.vaultId })}><ShieldCheck /> Broker</Button>
                  <Button size="sm" variant="outline" disabled={vaultBrokers.length === 0} onClick={() => setOpen({ kind: "originate", vaultId: vault.vaultId })}><Handshake /> Originate</Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen({ kind: "details", vaultId: vault.vaultId })}><LineChart /> Details</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <LoansTable loans={loans} onOpen={(loanId) => setOpen({ kind: "loan", loanId })} />

      {openVault && (
        <>
          <Dialog open={open?.kind === "deposit"} onClose={close} title="Seed liquidity" description="Deposit your own XRP so the vault has something to lend. In a product this is the lenders' capital." size="sm">
            <SeedForm vault={openVault} busy={busy} onDeposit={(drops) => run("VaultDeposit", async () => {
              const signer = await wallet.requireSigner();
              const result = await signAndSubmit(buildVaultDeposit(address, openVault.vaultId, drops), signer);
              return { key: "VaultDeposit", result, title: "Liquidity deposit" };
            })} />
          </Dialog>
          <Dialog open={open?.kind === "broker"} onClose={close} title="Loan broker" description="A broker originates loans against the vault and posts first-loss cover. Cover must clear the minimum rate before any origination." size="md">
            <div className="space-y-5">
              {openVaultBrokers.map((b) => <BrokerDetail key={b.loanBrokerId} broker={b} vault={openVault} />)}
              {openVaultBrokers.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">Deposit cover</h3>
                  <CoverForm brokers={openVaultBrokers} contextBrokerId={null} busy={busy} onCover={(brokerId, drops) => run("LoanBrokerCoverDeposit", async () => {
                    const signer = await wallet.requireSigner();
                    const result = await signAndSubmit(buildLoanBrokerCoverDeposit(address, brokerId, drops), signer);
                    return { key: "LoanBrokerCoverDeposit", result, title: "First-loss cover" };
                  })} />
                </section>
              )}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">{openVaultBrokers.length > 0 ? "Create another broker" : "Create a broker"}</h3>
                <BrokerForm vault={openVault} brokers={openVaultBrokers} busy={busy} onCreate={(d, m, l) => run("LoanBrokerSet", async () => {
                  const signer = await wallet.requireSigner();
                  const result = await signAndSubmit(buildLoanBrokerSet(address, openVault.vaultId, d, m, l), signer);
                  return { key: "LoanBrokerSet", result, title: "Loan broker" };
                })} />
              </section>
            </div>
          </Dialog>
          <Dialog open={open?.kind === "originate"} onClose={close} title="Originate a loan" description="The broker proposes terms; the borrower accepts by counter-signing the same transaction." size="md">
            {openVaultBrokers.length === 0 ? <PanelEmpty>Create a broker on this vault first.</PanelEmpty> : (
              <OriginateForm vault={openVault} brokers={openVaultBrokers} contextBrokerId={null} busy={busy} onOriginate={(input) => run("LoanSet", async () => {
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
              })} />
            )}
          </Dialog>
          <Dialog open={open?.kind === "details"} onClose={close} title={<span>Vault <Mono value={openVault.vaultId} short={12} className="text-base" /></span>} description="Real vault state at past ledgers, cash versus deployed, and the vault account's activity." size="xl">
            <VaultDetail vault={openVault} tick={tick} />
          </Dialog>
        </>
      )}
      <Dialog open={!!openLoan} onClose={close} title={openLoan ? <span>Loan <Mono value={openLoan.loanId} short={12} className="text-base" /></span> : "Loan"} description="Figures from the validated ledger; the schedule is a projection of the contract, not realised interest." size="xl">
        {openLoan && <LoanPanel loan={openLoan} />}
      </Dialog>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums")}>{children}</p>
    </div>
  );
}
