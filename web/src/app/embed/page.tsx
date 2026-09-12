import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { embedDestination, parseEmbedQuery, type EmbedQuery } from "@/lib/embed";

export const metadata = { title: "Raise host integration prototype", robots: { index: false, follow: false } };

export default async function EmbedPage({ searchParams }: { searchParams: Promise<EmbedQuery> }) {
  let destination: string;
  try {
    destination = embedDestination(parseEmbedQuery(await searchParams));
  } catch {
    return <Alert variant="warning"><AlertTitle>Invalid integration link</AlertTitle><AlertDescription>Use an explicit network=4001 and, optionally, a 64-character vault ID. This full-page prototype accepts no wallet information, callback URL or other parameters.</AlertDescription></Alert>;
  }
  // Next redirect throws its navigation signal, so keep it outside the validation catch.
  redirect(destination);
}
