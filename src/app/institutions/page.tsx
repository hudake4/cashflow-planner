import type { Metadata } from "next";
import { InstitutionsView } from "@/components/institutions/institutions-view";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Institutions" };

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const { account } = await searchParams;
  return <InstitutionsView accountId={firstParam(account)} />;
}
