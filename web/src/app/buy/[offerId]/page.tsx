import { PageHeader } from "@/components/page-header";

// TODO(#22): purchase confirmation and post-trade ownership. Owned by the #22 ticket.
export default async function Page(props: PageProps<"/buy/[offerId]">) {
  const { offerId } = await props.params;
  return <PageHeader title="Buy" description={`Coming with #22 · ${offerId}`} />;
}
