"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * A one-shot target from a deep link such as `/bills?edit=<id>` (CONVENTIONS section 20). The value
 * is kept in state and `params` are removed from the address, so a reload doesn't repeat it and the
 * same link opened again arrives as new. Call `clear` once the page has acted on it.
 */
export function useLinkTarget(value: string | undefined, params: readonly string[]): [string | null, () => void] {
  const router = useRouter();
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(value ?? null);
  const paramKey = params.join(",");

  useEffect(() => {
    if (!value) return;
    setTarget(value);
    const search = new URLSearchParams(window.location.search);
    for (const param of paramKey.split(",")) search.delete(param);
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [value, paramKey, pathname, router]);

  const clear = useCallback(() => setTarget(null), []);
  return [target, clear];
}

/** The row or card a deep link landed on: an inset ring and a tint, the same in both themes. */
export const LINK_TARGET_CLASS = "bg-muted ring-2 ring-inset ring-brand-600 focus-visible:outline-none";

/** Ref callback for the linked element: scrolls it into view once, when it mounts. */
export function scrollToLinkTarget(element: HTMLElement | null) {
  element?.scrollIntoView?.({ block: "center" });
}

/** Like scrollToLinkTarget, and also moves focus to it (it needs `tabIndex={-1}`), for pages that open no dialog. */
export function revealLinkTarget(element: HTMLElement | null) {
  if (!element) return;
  scrollToLinkTarget(element);
  element.focus({ preventScroll: true });
}
