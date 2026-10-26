"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { BillDTO, IncomeDTO } from "@/contracts/api";

type Command = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
  keywords?: string[];
};

const NAV_COMMANDS: Command[] = [
  { id: "nav-dashboard", label: "Dashboard", href: "/", group: "Pages", keywords: ["home", "overview"] },
  { id: "nav-calendar", label: "Calendar", href: "/calendar", group: "Pages", keywords: ["schedule", "weeks"] },
  { id: "nav-spending", label: "Spend Analyzer", href: "/spending", group: "Pages", keywords: ["spending", "categories"] },
  { id: "nav-bills", label: "Bills", href: "/bills", group: "Pages", keywords: ["expenses"] },
  { id: "nav-income", label: "Income", href: "/income", group: "Pages", keywords: ["paychecks"] },
  { id: "nav-institutions", label: "Institutions", href: "/institutions", group: "Pages", keywords: ["banks", "accounts"] },
  { id: "nav-settings", label: "Settings", href: "/settings", group: "Pages", keywords: ["preferences"] },
];

const QUICK_ADD: Command[] = [
  { id: "add-bill", label: "Add bill", href: "/bills?new=1", group: "Quick add", keywords: ["new", "create"] },
  { id: "add-income", label: "Add income", href: "/income?new=1", group: "Quick add", keywords: ["new", "create", "paycheck"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bills, setBills] = useState<BillDTO[]>([]);
  const [income, setIncome] = useState<IncomeDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    setQuery("");
    setActiveIndex(0);

    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listBills().catch(() => [] as BillDTO[]),
      api.listIncome().catch(() => [] as IncomeDTO[]),
    ])
      .then(([nextBills, nextIncome]) => {
        if (cancelled) return;
        setBills(nextBills);
        setIncome(nextIncome);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    const previous = previousFocusRef.current;
    if (previous && previous.isConnected) {
      previous.focus();
    }
    previousFocusRef.current = null;
  }, [open]);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    const commands: Command[] = [...NAV_COMMANDS, ...QUICK_ADD];

    const billCommands: Command[] = bills.map((bill) => ({
      id: `bill-${bill.id}`,
      label: bill.name,
      hint: "Bill",
      href: `/bills?edit=${encodeURIComponent(bill.id)}`,
      group: "Bills",
      keywords: [bill.category ?? "", bill.notes ?? ""],
    }));

    const incomeCommands: Command[] = income.map((source) => ({
      id: `income-${source.id}`,
      label: source.name,
      hint: "Income",
      href: `/income?edit=${encodeURIComponent(source.id)}`,
      group: "Income",
      keywords: [source.notes ?? ""],
    }));

    const all = [...commands, ...billCommands, ...incomeCommands];
    if (!q) return all.slice(0, 60);
    return all.filter((command) => {
      const haystack = [command.label, command.hint ?? "", command.group, ...(command.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Query handling for ?new=1 / ?edit= is intentionally left to the destination pages.

  function close() {
    setOpen(false);
  }

  function select(command: Command | undefined) {
    if (!command) return;
    setOpen(false);
    const element = itemRefs.current.get(command.id);
    if (element) {
      element.click();
    } else {
      window.location.assign(command.href);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(filtered.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      select(filtered[activeIndex]);
      return;
    }
    if (event.key === "Tab") {
      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (!open) return null;

  const activeId = filtered[activeIndex] ? `command-option-${filtered[activeIndex].id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]"
      data-testid="command-palette"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/40"
        onClick={close}
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette-dialog"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-dialog border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search commands"
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            placeholder="Search pages, bills, income…"
            data-testid="command-palette-input"
            className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2" data-testid="command-palette-results">
          {loading ? (
            <p className="px-2 py-6 text-sm text-muted-foreground" data-testid="command-palette-loading">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground" data-testid="command-palette-empty">
              No results
            </p>
          ) : (
            <ul
              id="command-palette-list"
              role="listbox"
              aria-label="Commands"
              data-testid="command-palette-list"
              className="flex flex-col gap-0.5"
            >
              {filtered.map((command, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={command.id}>
                    <Link
                      ref={(element) => {
                        if (element) itemRefs.current.set(command.id, element);
                        else itemRefs.current.delete(command.id);
                      }}
                      href={command.href}
                      role="option"
                      aria-selected={isActive}
                      id={`command-option-${command.id}`}
                      data-testid="command-palette-option"
                      onClick={close}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex min-h-10 items-center justify-between gap-3 rounded-control px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className="truncate">{command.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{command.hint ?? command.group}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          ↑↓ navigate · Enter select · Esc close
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
