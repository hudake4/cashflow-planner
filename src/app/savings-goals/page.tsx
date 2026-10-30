import type { Metadata } from "next";
import { SavingsGoalsView } from "@/components/savings-goals/savings-goals-view";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Savings Goals" };

export default async function SavingsGoalsPage({ searchParams }: { searchParams: Promise<{ goal?: string | string[] }> }) {
  const { goal } = await searchParams;
  return <SavingsGoalsView goalId={firstParam(goal)} />;
}
