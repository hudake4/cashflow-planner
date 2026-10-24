import type { Metadata } from "next";
import { SpendingView } from "@/components/spending/spending-view";

export const metadata: Metadata = { title: "Spend Analyzer" };

export default function SpendingPage() {
  return <SpendingView />;
}
