import { PageHeader } from "@/components/page-header";

// TODO(#21): screen not yet built. Owned by the #21 ticket.
export const metadata = { title: "Sell shares" };

export default function Page() {
  return (
    <>
      <PageHeader title="Sell shares" description="Create, review and cancel an offer on your position." />
      <p className="text-sm text-muted-foreground">Coming with #21.</p>
    </>
  );
}
