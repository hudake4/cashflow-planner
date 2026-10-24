"use client";

import { clsx } from "clsx";
import { CalendarDays, HandCoins, LayoutDashboard, Receipt, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, testId: "nav-calendar" },
  { href: "/bills", label: "Bills", icon: Receipt, testId: "nav-bills" },
  { href: "/income", label: "Income", icon: HandCoins, testId: "nav-income" },
  { href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="CashFlow Planner home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm" aria-hidden="true">
        <Wallet className="h-4.5 w-4.5" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">CashFlow Planner</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-2">
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon, testId }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    data-testid={testId}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand-600" aria-hidden="true" />}
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="border-t border-slate-200 px-5 py-4 text-xs leading-relaxed text-slate-600">
          Your data stays on this computer. No bank connection.
        </p>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Logo />
      </header>

      <main id="main" className="pb-24 lg:pb-10 lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map(({ href, label, icon: Icon, testId }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-testid={`${testId}-mobile`}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                    active ? "text-brand-700" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand-600" aria-hidden="true" />}
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
