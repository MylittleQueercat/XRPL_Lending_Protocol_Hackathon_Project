"use client";

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Kpi, KpiStrip, PanelEmpty, Tick } from "@/components/terminal";
import { formatXrp } from "@/lib/format";
import {
  createdEntry, readLoan, readLoansForBrokers, readOwnedBrokers, readOwnedVaults, signAndSubmit, signAndSubmitLoanSet,
  type BrokerState, type LoanState, type VaultState,
} from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { buildLoanBrokerCoverDeposit, buildLoanBrokerSet, buildLoanSet, buildVaultCreate, buildVaultDeposit, sumCeilDrops } from "./lending";
import { ActionsColumn, type Outcome } from "./action-forms";
import { BrokerDetail } from "./broker-detail";
import { LoanPanel } from "./loan-detail";
import { LoansTable } from "./loans-table";
import { Navigator, type Selection } from "./navigator";
import { VaultDetail } from "./vault-detail";
import { ConnectPrompt, xrp } from "./shared";

const POLL_MS = 15_000;

// The operator desk: account strip, navigator, chart-driven centre, tickets on the right, loans
// blotter at the bottom. Every figure comes from the validated ledger, re-read every 15 seconds
// and after each transaction.
export function OperatorTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;

  const [vaults, setVaults] = React.useState<VaultState[] | null>(null);
  const [brokers, setBrokers] = React.useState<BrokerState[] | null>(null);
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [selection, setSelection] = React.useState<Selection>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [outcomes, setOutcomes] = React.useState<Outcome[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [lastRead, setLastRead] = React.useState<number | null>(null);
  const loading = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!address || loading.current) return;
    loading.current = true;
    setLoadError(null);
    try {
      const [v, b] = await Promise.all([readOwnedVaults(address), readOwnedBrokers(address)]);
      const l = await readLoansForBrokers(b);
      setVaults(v);
      setBrokers(b);
      setLoans(l);
      setLastRead(Date.now());
      setTick((t) => t + 1);
      setSelection((current) => {
        if (current?.kind === "vault" && v.some((x) => x.vaultId === current.id)) return current;
        if (current?.kind === "broker" && b.some((x) => x.loanBrokerId === current.id)) return current;
        if (current?.kind === "loan" && l.some((x) => x.loanId === current.id)) return current;
        return v[0] ? { kind: "vault", id: v[0].vaultId } : null;
      });
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      loading.current = false;
    }
  }, [address]);

  React.useEffect(() => {
    setVaults(null);
    setBrokers(null);
    setLoans(null);
    setSelection(null);
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!address) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, load]);

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

  const ownedBrokerIds = React.useMemo(() => new Set((brokers ?? []).map((b) => b.loanBrokerId)), [brokers]);
  const brokerLoans = React.useMemo(() => (loans ?? []).filter((l) => ownedBrokerIds.has(l.loanBrokerId)), [loans, ownedBrokerIds]);

  if (!address) return <DisconnectedDesk />;

  // The context vault and broker for the tickets follow the selection up the tree.
  const selectedLoan = selection?.kind === "loan" ? brokerLoans.find((l) => l.loanId === selection.id) ?? null : null;
  const selectedBroker = selection?.kind === "broker" ? (brokers ?? []).find((b) => b.loanBrokerId === selection.id) ?? null : selectedLoan ? (brokers ?? []).find((b) => b.loanBrokerId === selectedLoan.loanBrokerId) ?? null : null;
  const contextVaultId = selection?.kind === "vault" ? selection.id : selectedBroker?.vaultId ?? null;
  const vault = (vaults ?? []).find((v) => v.vaultId === contextVaultId) ?? null;
  const vaultBrokers = (brokers ?? []).filter((b) => b.vaultId === contextVaultId);

  const strip = {
    vaults: vaults?.length ?? null,
    assets: vaults ? sumCeilDrops(vaults.map((v) => v.assetsTotalDrops)) : null,
    cash: vaults ? sumCeilDrops(vaults.map((v) => v.assetsAvailableDrops)) : null,
    cover: brokers ? sumCeilDrops(brokers.map((b) => b.coverAvailableDrops)) : null,
    debt: brokers ? sumCeilDrops(brokers.map((b) => b.debtTotalDrops)) : null,
  };
  const deployed = strip.assets && strip.cash ? (BigInt(strip.assets) - BigInt(strip.cash)).toString() : null;
  const money = (drops: string | null, tone?: "up" | "down") => drops === null ? "—" : <Tick numeric={drops} className={tone === "up" ? "text-up" : tone === "down" ? "text-down" : undefined}>{formatXrp(drops, 2)}</Tick>;

  return (
    <div className="space-y-3">
      {loadError && (
        <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>
      )}

      <KpiStrip>
        <Kpi label="Vaults owned" value={strip.vaults ?? "—"} sub={lastRead ? `ledger read ${new Date(lastRead).toLocaleTimeString("en-GB")}` : "reading ledger…"} />
        <Kpi label="Assets managed" value={money(strip.assets)} sub="sum of vault assets total" />
        <Kpi label="Cash available" value={money(strip.cash)} sub="idle liquidity" />
        <Kpi label="Deployed in loans" value={money(deployed)} sub={strip.assets && BigInt(strip.assets) > 0n && deployed ? `${((Number(deployed) / Number(strip.assets)) * 100).toFixed(1)} % utilised` : "nothing lent"} />
        <Kpi label="Cover posted" value={money(strip.cover)} sub={`${brokers?.length ?? 0} broker${brokers?.length === 1 ? "" : "s"}`} />
        <Kpi label="Debt outstanding" value={money(strip.debt)} sub={`${brokerLoans.length} loan${brokerLoans.length === 1 ? "" : "s"}`} />
      </KpiStrip>

      <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <Navigator
          vaults={vaults} brokers={brokers ?? []} loans={brokerLoans} selection={selection} onSelect={setSelection} busy={busy} lastRead={lastRead}
          onRefresh={() => void load()}
          onCreateVault={() => run("VaultCreate", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildVaultCreate(address), signer);
            return { key: "VaultCreate", result, title: result.resultCode === "tesSUCCESS" ? "Vault created" : "Vault not created" };
          })}
        />

        <div className="min-w-0 space-y-3">
          {selectedLoan ? (
            <LoanPanel loan={selectedLoan} />
          ) : selectedBroker ? (
            <>
              <BrokerDetail broker={selectedBroker} vault={vault} />
              {vault && <VaultDetail vault={vault} tick={tick} compact />}
            </>
          ) : vault ? (
            <VaultDetail vault={vault} tick={tick} />
          ) : (
            <div className="terminal-panel"><PanelEmpty className="min-h-64">{vaults === null ? "Reading your vaults from the validated ledger…" : "Create a vault to open the desk."}</PanelEmpty></div>
          )}
        </div>

        <ActionsColumn
          vault={vault} brokers={vaultBrokers} contextBrokerId={selectedBroker?.loanBrokerId ?? null} busy={busy} outcomes={outcomes}
          onDeposit={(vaultId, drops) => run("VaultDeposit", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildVaultDeposit(address, vaultId, drops), signer);
            return { key: "VaultDeposit", result, title: "Liquidity deposit" };
          })}
          onCreateBroker={(vaultId, debtMaxDrops, coverMin, coverLiq) => run("LoanBrokerSet", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildLoanBrokerSet(address, vaultId, debtMaxDrops, coverMin, coverLiq), signer);
            return { key: "LoanBrokerSet", result, title: "Loan broker" };
          })}
          onCover={(brokerId, drops) => run("LoanBrokerCoverDeposit", async () => {
            const signer = await wallet.requireSigner();
            const result = await signAndSubmit(buildLoanBrokerCoverDeposit(address, brokerId, drops), signer);
            return { key: "LoanBrokerCoverDeposit", result, title: "First-loss cover" };
          })}
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
                setSelection({ kind: "loan", id: loanId });
              }
            }
            return { key: "LoanSet", result, context: "loanset", title };
          })}
        />
      </div>

      <LoansTable loans={loans === null ? null : brokerLoans} selectedId={selectedLoan?.loanId ?? null} onSelect={(loanId) => setSelection({ kind: "loan", id: loanId })} />
    </div>
  );
}

// The desk with nothing behind it: same frame, dashes for figures, one call to action.
function DisconnectedDesk() {
  const ghost = (title: string, height: string) => (
    <div className={`terminal-panel ${height}`}><div className="terminal-head">{title}</div><div className="grid h-[calc(100%-2.25rem)] place-items-center"><span className="text-[11px] text-muted-foreground/70">—</span></div></div>
  );
  return (
    <div className="space-y-3">
      <KpiStrip>
        {["Vaults owned", "Assets managed", "Cash available", "Deployed in loans", "Cover posted", "Debt outstanding"].map((label) => <Kpi key={label} label={label} value="—" sub="connect a wallet" />)}
      </KpiStrip>
      <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        {ghost("Navigator", "min-h-40 lg:min-h-72")}
        <div className="terminal-panel flex min-h-72 flex-col">
          <div className="terminal-head">Vault</div>
          <div className="grid flex-1 place-items-center p-6"><ConnectPrompt role="vault owner and loan broker" /></div>
        </div>
        {ghost("Actions", "min-h-40 lg:min-h-72")}
      </div>
    </div>
  );
}
