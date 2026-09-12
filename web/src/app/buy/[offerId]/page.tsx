import { redirect } from "next/navigation";
import { routes } from "@/lib/network";

// The buy flow lives on the offer page now (one page per offer, sale ticket included).
// Shared /buy/<id> links keep working through this redirect.
export default async function Page(props: PageProps<"/buy/[offerId]">) {
  const { offerId } = await props.params;
  redirect(routes.offer(offerId));
}
