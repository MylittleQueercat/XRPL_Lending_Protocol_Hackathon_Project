"use client";

import * as React from "react";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelEmpty } from "@/components/terminal";
import type { BrokerState, LoanState, VaultState } from "@/lib/ledger";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loanStatus } from "./lending";
import { Mono, Note, StatusDot, UtilisationBar, xrp } from "./shared";

export type Selection = { kind: "vault"; id: string } | { kind: "broker"; id: string } | { kind: "loan"; id: string } | null;

export const sameSelection = (a: Selection, b: Selection) => (a === null && b === null) || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

// Tree of what the wallet owns: vault → brokers → loans. Selecting a node drives the centre panels.
export function Navigator({ vaults, brokers, loans, selection, onSelect, onCreateVault, onRefresh, busy, lastRead }: {
  vaults: VaultState[] | null; brokers: BrokerState[]; loans: LoanState[]; selection: Selection; onSelect: (s: Selection) => void;
  onCreateVault: () => void; onRefresh: () => void; busy: string | null; lastRead: number | null;
}) {
  return (
    <Panel
      title="Navigator"
      className="lg:sticky lg:top-4"
      actions={
        <>
          <Button variant="ghost" size="sm" className="h-7 px-2" aria-label="Re-read the ledger" title={lastRead ? `Last read ${new Date(lastRead).toLocaleTimeString("en-GB")}` : "Read the ledger"} onClick={onRefresh}><RefreshCw className="size-3.5" /></Button>
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onCreateVault} disabled={busy !== null}><Plus className="size-3.5" /> {busy === "VaultCreate" ? "Creating…" : "Create vault"}</Button>
        </>
      }
    >
      {vaults === null ? (
        <div className="space-y-2 p-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : vaults.length === 0 ? (
        <PanelEmpty>
          <span>
            No vault yet. Create one to start lending.<br />
            <span className="text-muted-foreground/80">Creating a vault costs 2 test XRP on network 4001, consumed as a fee, not deposited.</span>
          </span>
        </PanelEmpty>
      ) : (
        <ul className="divide-y divide-border" role="tree" aria-label="Owned vaults, brokers and loans">
          {vaults.map((vault) => {
            const vaultBrokers = brokers.filter((b) => b.vaultId === vault.vaultId);
            const vaultSelected = selection?.kind === "vault" && selection.id === vault.vaultId;
            return (
              <li key={vault.vaultId} role="treeitem" aria-expanded aria-selected={vaultSelected}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "vault", id: vault.vaultId })}
                  className={cn("block w-full px-3 py-2 text-left transition-colors hover:bg-secondary/60", vaultSelected && "bg-accent")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">Vault <Mono value={vault.vaultId} short={8} /></span>
                    <span className="text-xs tabular-nums">{xrp(vault.assetsTotalDrops, 2)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1"><UtilisationBar totalDrops={vault.assetsTotalDrops} availableDrops={vault.assetsAvailableDrops} compact /></div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">cash {xrp(vault.assetsAvailableDrops, 2)}</span>
                  </div>
                </button>
                {vaultBrokers.length > 0 && (
                  <ul role="group" className="pb-1">
                    {vaultBrokers.map((broker) => {
                      const brokerLoans = loans.filter((l) => l.loanBrokerId === broker.loanBrokerId);
                      const brokerSelected = selection?.kind === "broker" && selection.id === broker.loanBrokerId;
                      return (
                        <li key={broker.loanBrokerId} role="treeitem" aria-expanded aria-selected={brokerSelected}>
                          <button
                            type="button"
                            onClick={() => onSelect({ kind: "broker", id: broker.loanBrokerId })}
                            className={cn("flex w-full items-center gap-1.5 py-1.5 pl-5 pr-3 text-left text-xs transition-colors hover:bg-secondary/60", brokerSelected && "bg-accent")}
                          >
                            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="flex-1 truncate">Broker <Mono value={broker.loanBrokerId} short={6} /></span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">cover <span className="text-foreground">{xrp(broker.coverAvailableDrops, 1)}</span> · debt <span className="text-foreground">{xrp(broker.debtTotalDrops, 1)}</span></span>
                          </button>
                          {brokerLoans.length > 0 && (
                            <ul role="group">
                              {brokerLoans.map((loan) => {
                                const loanSelected = selection?.kind === "loan" && selection.id === loan.loanId;
                                const status = loanStatus(loan.flags, loan);
                                return (
                                  <li key={loan.loanId} role="treeitem" aria-selected={loanSelected}>
                                    <button
                                      type="button"
                                      onClick={() => onSelect({ kind: "loan", id: loan.loanId })}
                                      className={cn("flex w-full items-center gap-1.5 py-1.5 pl-10 pr-3 text-left text-xs transition-colors hover:bg-secondary/60", loanSelected && "bg-accent")}
                                    >
                                      <StatusDot status={status} />
                                      <span className="flex-1 truncate font-mono text-[11px]" title={loan.borrower}>{shortAddress(loan.borrower)}</span>
                                      <span className="tabular-nums">{xrp(loan.principalOutstandingDrops, 2)}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {vaults !== null && vaults.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <Note><span className="inline-block size-1.5 rounded-full bg-up align-middle" /> performing · <span className="inline-block size-1.5 rounded-full bg-warning align-middle" /> impaired · <span className="inline-block size-1.5 rounded-full bg-down align-middle" /> defaulted</Note>
        </div>
      )}
    </Panel>
  );
}
