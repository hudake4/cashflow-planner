import type { Metadata } from "next";
import { TransactionHistory } from "@/components/institutions/transaction-history";

export const metadata: Metadata = { title: "Transactions" };

export default async function InstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionHistory institutionId={id} />;
}
