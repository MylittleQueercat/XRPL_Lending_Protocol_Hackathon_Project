import { PageHeader } from "@/components/page-header";
import { OperatorConsole } from "@/components/operator/operator-console";

export const metadata = { title: "Operator" };

export default function Page() {
  return (
    <>
      <PageHeader
        className="mb-5 lg:mb-6"
        title="Operator"
        description="Vaults, brokers and loans, read from the validated ledger every 15 seconds."
      />
      <OperatorConsole />
    </>
  );
}
