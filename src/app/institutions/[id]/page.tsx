import type { Metadata } from "next";
import { TransactionHistory } from "@/components/institutions/transaction-history";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Transactions" };

export default async function InstitutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string | string[]; tx?: string | string[] }>;
}) {
  const { id } = await params;
  const { account, tx } = await searchParams;
  return <TransactionHistory institutionId={id} initialAccountId={firstParam(account)} transactionId={firstParam(tx)} />;
}
