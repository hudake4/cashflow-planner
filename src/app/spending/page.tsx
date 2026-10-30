import type { Metadata } from "next";
import { SpendingView } from "@/components/spending/spending-view";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Spend Analyzer" };

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ tx?: string | string[] }> }) {
  const { tx } = await searchParams;
  return <SpendingView transactionId={firstParam(tx)} />;
}
