import { BuyFlow } from "@/components/buy/buy-flow";

export const metadata = { title: "Buy" };

export default async function Page(props: PageProps<"/buy/[offerId]">) {
  const { offerId } = await props.params;
  return <BuyFlow offerId={offerId} />;
}
