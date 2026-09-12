import { PageHeader } from "@/components/page-header";
import { OperatorConsole } from "@/components/operator/operator-console";

export const metadata = { title: "Operator" };

export default function Page() {
  return (
    <>
      <PageHeader
        className="mb-5 lg:mb-6"
        title="Operator"
        description="The lending desk: vaults, brokers with first-loss cover, two-party loan origination and repayments, with every figure read back from the validated ledger and re-read every 15 seconds."
      />
      <OperatorConsole />
    </>
  );
}
