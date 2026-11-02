import type { Metadata } from "next";
import { DebtPayoffView } from "@/components/debt/debt-payoff-view";

export const metadata: Metadata = { title: "Debt payoff" };

export default function DebtPayoffPage() {
  return <DebtPayoffView />;
}