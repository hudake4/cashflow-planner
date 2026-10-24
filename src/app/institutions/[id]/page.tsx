import type { Metadata } from "next";
import { TransactionHistory } from "@/components/institutions/transaction-history";

export const metadata: Metadata = { title: "Transactions" };

export default async function InstitutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const { id } = await params;
  const { account } = await searchParams;
  return <TransactionHistory institutionId={id} initialAccountId={Array.isArray(account) ? account[0] : account} />;
}