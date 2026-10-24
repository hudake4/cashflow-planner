import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
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
    // suppressHydrationWarning: THEME_BOOT_SCRIPT may remove the `dark` class before React hydrates.
    <html lang="en" className={`${archivo.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
