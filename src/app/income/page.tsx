import type { Metadata } from "next";
import { ScheduleListPage } from "@/components/schedule/schedule-list-page";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage() {
  return <ScheduleListPage kind="income" />;
}
