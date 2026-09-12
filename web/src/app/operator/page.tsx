import { PageHeader } from "@/components/page-header";
import { OperatorConsole } from "@/components/operator/operator-console";

export const metadata = { title: "Operator" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Operator"
        description="Run the lending side: create a vault, attach a broker with first-loss cover, originate a loan the borrower accepts, and watch repayments return to the vault. Every figure is read back from the validated ledger."
      />
      <OperatorConsole />
    </>
  );
}
