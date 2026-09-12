import { redirect } from "next/navigation";

// The position screen became the portfolio terminal. Old links and the embed prototype land here.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const vault = typeof params.vault === "string" ? params.vault : undefined;
  redirect(vault ? `/portfolio?vault=${encodeURIComponent(vault)}` : "/portfolio");
}
