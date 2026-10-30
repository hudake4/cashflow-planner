/** The first value of a Next.js page search param (`?a=1&a=2` gives "1"); undefined when absent or empty. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first || undefined;
}
