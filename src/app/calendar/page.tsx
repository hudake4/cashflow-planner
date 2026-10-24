import type { Metadata } from "next";
import { CalendarPage } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default function Calendar() {
  return <CalendarPage />;
}
