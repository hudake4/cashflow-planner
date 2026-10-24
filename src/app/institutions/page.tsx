import type { Metadata } from "next";
import { InstitutionsView } from "@/components/institutions/institutions-view";

export const metadata: Metadata = { title: "Institutions" };

export default function InstitutionsPage() {
  return <InstitutionsView />;
}
