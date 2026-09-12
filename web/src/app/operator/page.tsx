import { PageHeader } from "@/components/page-header";

// TODO(#23): screen not yet built. Owned by the #23 ticket.
export const metadata = { title: "Operator" };

export default function Page() {
  return (
    <>
      <PageHeader title="Operator" description="Vault, broker and loan lifecycle for the operator and borrower." />
      <p className="text-sm text-muted-foreground">Coming with #23.</p>
    </>
  );
}
