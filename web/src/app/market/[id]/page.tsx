import { PageHeader } from "@/components/page-header";

// TODO(#20): offer detail page. Owned by the #20 ticket.
export default async function Page(props: PageProps<"/market/[id]">) {
  const { id } = await props.params;
  return <PageHeader title="Offer" description={`Coming with #20 · ${id}`} />;
}
