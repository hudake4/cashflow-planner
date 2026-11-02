import Link from "next/link";

/**
 * Says that BANK accounts which haven't refreshed in over a week were left out of the projection
 * start date (CONVENTIONS section 3). Their balance is still counted. Renders nothing for 0.
 */
export function StaleAccountsNote({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const one = count === 1;
  return (
    <span className={className} data-testid="stale-accounts-note">
      {one
        ? "1 account hasn't refreshed in over a week; its balance is still counted. "
        : `${count} accounts haven't refreshed in over a week; their balances are still counted. `}
      {one ? "Relabel it as Other, or refresh its bank, on the" : "Relabel them as Other, or refresh their banks, on the"}{" "}
      <Link href="/institutions" className="font-semibold text-brand-700 underline">
        Institutions page
      </Link>
      .
    </span>
  );
}
