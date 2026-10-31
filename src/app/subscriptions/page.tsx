import type { Metadata } from "next";
import { SubscriptionAuditView } from "@/components/subscriptions/subscription-audit";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return <SubscriptionAuditView />;
}
