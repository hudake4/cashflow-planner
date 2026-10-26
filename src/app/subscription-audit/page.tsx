import type { Metadata } from "next";
import { SubscriptionAuditView } from "@/components/subscriptions/subscription-audit";

export const metadata: Metadata = { title: "Subscription Audit" };

export default function SubscriptionAuditPage() {
  return <SubscriptionAuditView />;
}
