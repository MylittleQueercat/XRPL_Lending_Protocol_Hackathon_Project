import { PageHeader } from "@/components/page-header";

// TODO(#19): screen not yet built. Owned by the #19 ticket.
export const metadata = { title: "My position" };

export default function Page() {
  return (
    <>
      <PageHeader title="My position" description="Holdings, accounting value against available liquidity, deposit and withdraw." />
      <p className="text-sm text-muted-foreground">Coming with #19.</p>
    </>
  );
}
