import type { Metadata } from "next";
import { ScheduleListPage } from "@/components/schedule/schedule-list-page";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return <ScheduleListPage kind="bill" />;
}
