import type { Metadata } from "next";
import { ScheduleListPage } from "@/components/schedule/schedule-list-page";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Bills" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ edit?: string | string[]; new?: string | string[] }> }) {
  const params = await searchParams;
  return <ScheduleListPage kind="bill" editId={firstParam(params.edit)} openNew={firstParam(params.new) === "1"} />;
}
