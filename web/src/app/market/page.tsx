import { PageHeader } from "@/components/page-header";

// TODO(#20): screen not yet built. Owned by the #20 ticket.
export const metadata = { title: "Market" };

export default function Page() {
  return (
    <>
      <PageHeader title="Market" description="Open offers on vault shares, with price against accounting value." />
      <p className="text-sm text-muted-foreground">Coming with #20.</p>
    </>
  );
}
