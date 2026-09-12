"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { OperatorTab } from "./operator-tab";
import { BorrowerTab } from "./borrower-tab";

const TABS = [
  { id: "operator", label: "Operator", hint: "Vault owner and loan broker" },
  { id: "borrower", label: "Borrower", hint: "Repay a loan" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function OperatorConsole() {
  const [tab, setTab] = React.useState<TabId>("operator");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Role" className="inline-flex rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "operator" ? <OperatorTab /> : <BorrowerTab />}</div>
    </div>
  );
}
