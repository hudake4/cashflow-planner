import type { Metadata } from "next";
import { SavingsGoalsView } from "@/components/savings-goals/savings-goals-view";

export const metadata: Metadata = { title: "Savings Goals" };

export default function SavingsGoalsPage() {
  return <SavingsGoalsView />;
}
