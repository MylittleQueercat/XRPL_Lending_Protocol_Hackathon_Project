"use client";

import * as React from "react";
import { PanelTabs } from "@/components/terminal";
import { OperatorTab } from "./operator-tab";
import { BorrowerTab } from "./borrower-tab";

const TABS = [
  { id: "operator", label: "Operator desk" },
  { id: "borrower", label: "Borrower" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Role switch, workstation style. The operator desk is the vault owner and broker view; the
// borrower tab is the repayment side of the same loans.
export function OperatorConsole() {
  const [tab, setTab] = React.useState<TabId>("operator");
  return (
    <div className="space-y-3">
      <div className="terminal-panel">
        <PanelTabs ariaLabel="Role" tabs={TABS} value={tab} onChange={setTab} className="border-b-0" />
      </div>
      <div role="tabpanel">{tab === "operator" ? <OperatorTab /> : <BorrowerTab />}</div>
    </div>
  );
}
