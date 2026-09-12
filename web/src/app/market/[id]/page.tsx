import { OfferDetail } from "@/components/market/offer-detail";

export const metadata = { title: "Offer" };

export default async function OfferPage(props: PageProps<"/market/[id]">) {
  const { id } = await props.params;
  return <OfferDetail id={id} />;
}
