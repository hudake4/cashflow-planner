import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Self-hosted at build time; no font requests leave the machine at runtime.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CashFlow Planner", template: "%s · CashFlow Planner" },
  description: "Project your running cash balance week by week.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e9eeea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
