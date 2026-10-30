"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { kindMoney, money, signedMoney } from "@/lib/format";
import { SEARCH_MAX_QUERY_LENGTH, type SearchKind, type SearchResultDTO } from "@/contracts/api";

type Command = {
  id: string;
  label: string;
  hint?: string;
  /** Second line under the label (account and date, frequency, ...). */
  subtitle?: string | null;
  /** Formatted amount shown on the right instead of the hint. */
  amount?: string;
  href: string;
  group: string;
  keywords?: string[];
};

type SearchState = "idle" | "loading" | "done" | "error";

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

const GROUP_LABELS: Record<SearchKind, string> = {
  BILL: "Bills",
  INCOME: "Income",
  TRANSACTION: "Transactions",
  GOAL: "Savings Goals",
  ACCOUNT: "Accounts",
};

/** Wait this long after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 200;
/** Results per group; the endpoint caps each group separately. */
const RESULTS_PER_GROUP = 8;

function resultAmount(result: SearchResultDTO): string | undefined {
  if (result.amountCents === null || result.currency === null) return undefined;
  switch (result.kind) {
    case "BILL":
      return kindMoney("BILL", result.amountCents, result.currency);
    case "INCOME":
      return kindMoney("INCOME", result.amountCents, result.currency);
    case "TRANSACTION":
      return signedMoney(result.amountCents, result.currency);
    default:
      return money(result.amountCents, result.currency);
  }
}

function resultToCommand(result: SearchResultDTO): Command {
  return {
    id: `${result.kind.toLowerCase()}-${result.id}`,
    label: result.title,
    subtitle: result.subtitle,
    amount: resultAmount(result),
    href: result.href,
    group: GROUP_LABELS[result.kind],
  };
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultDTO[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
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

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    const previous = previousFocusRef.current;
    if (previous && previous.isConnected) {
      previous.focus();
    }
    previousFocusRef.current = null;
  }, [open]);

  // Bills, income, transactions, goals and accounts come from the server; the cleanup drops a
  // response that arrives after the query changed or the palette closed.
  useEffect(() => {
    const trimmed = query.trim();
    setResults([]);
    if (!open || !trimmed) {
      setSearchState("idle");
      return;
    }
    setSearchState("loading");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .search(trimmed, RESULTS_PER_GROUP)
        .then((response) => {
          if (cancelled) return;
          setResults(response.results);
          setSearchState("done");
        })
        .catch(() => {
          if (cancelled) return;
          setSearchState("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    const local: Command[] = [...NAV_COMMANDS, ...QUICK_ADD];
    if (!q) return local;
    const matching = local.filter((command) => {
      const haystack = [command.label, command.hint ?? "", command.group, ...(command.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    return [...matching, ...results.map(resultToCommand)];
  })();

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // With several groups of results the active row can be below the fold.
  const activeCommandId = filtered[activeIndex]?.id;
  useEffect(() => {
    if (!activeCommandId) return;
    itemRefs.current.get(activeCommandId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeCommandId]);

  // The destination pages read ?new=1, ?edit=, ?tx=, ?goal= and ?account= (CONVENTIONS section 20).

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
  // "idle" with text typed is the render before the effect starts the search; don't flash "No results".
  const searching = searchState === "loading" || (searchState === "idle" && query.trim() !== "");

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
            maxLength={SEARCH_MAX_QUERY_LENGTH}
            aria-label="Search commands"
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            placeholder="Search bills, income, transactions…"
            data-testid="command-palette-input"
            className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2" data-testid="command-palette-results">
          {filtered.length > 0 && (
            <ul
              id="command-palette-list"
              role="listbox"
              aria-label="Commands"
              data-testid="command-palette-list"
              className="flex flex-col gap-0.5"
            >
              {filtered.map((command, index) => {
                const isActive = index === activeIndex;
                const startsGroup = index === 0 || filtered[index - 1].group !== command.group;
                return (
                  <li key={command.id} role="presentation" className="contents">
                    {startsGroup && (
                      <span
                        role="presentation"
                        data-testid="command-palette-group"
                        className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground"
                      >
                        {command.group}
                      </span>
                    )}
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
                      <span className="min-w-0">
                        <span className="block truncate">{command.label}</span>
                        {command.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">{command.subtitle}</span>
                        )}
                      </span>
                      {(command.amount ?? command.hint) && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {command.amount ?? command.hint}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {searching && (
            <p className="px-2 py-3 text-sm text-muted-foreground" role="status" data-testid="command-palette-loading">
              Searching…
            </p>
          )}
          {searchState === "error" && (
            <p className="px-2 py-3 text-sm text-muted-foreground" role="status" data-testid="command-palette-error">
              Search is unavailable right now. Pages and shortcuts still work.
            </p>
          )}
          {filtered.length === 0 && !searching && searchState !== "error" && (
            <p className="px-2 py-6 text-sm text-muted-foreground" data-testid="command-palette-empty">
              No results
            </p>
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
