import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

/** Says that what a deep link pointed at (a search result) is no longer on this page. */
export function LinkTargetMissing({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-4 flex items-start gap-2 text-sm text-muted-foreground" data-testid="link-target-missing">
      <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
