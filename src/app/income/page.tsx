import type { Metadata } from "next";
import { ScheduleListPage } from "@/components/schedule/schedule-list-page";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ edit?: string | string[]; new?: string | string[] }> }) {
  const params = await searchParams;
  return <ScheduleListPage kind="income" editId={firstParam(params.edit)} openNew={firstParam(params.new) === "1"} />;
}
