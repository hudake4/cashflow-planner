import type { Metadata } from "next";
import { version } from "../../../package.json";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  // Read on the server so only the version string reaches the client bundle.
  return <SettingsView appVersion={version} />;
}
