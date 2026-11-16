import { CANCEL_ENTRIES } from "./cancel-data.js";
import type { CancelEntry, CancelHelp, CancelRegion } from "./types.js";
import { parseUrl } from "./url-parts.js";

/** The Region of a statement currency: exact USD, GBP or EUR, else null (Req 2.2, 2.3). */
export function statementRegion(currency: string): CancelRegion | null {
  if (currency === "USD") return "US";
  if (currency === "GBP") return "UK";
  if (currency === "EUR") return "EU";
  return null;
}

/** Host of a URL without a leading "www."; "" when the URL does not parse. */
function hostOf(url: string): string {
  const h = parseUrl(url)?.hostname ?? "";
  return h.startsWith("www.") ? h.slice(4) : h;
}

function help(
  byId: ReadonlyMap<string, CancelEntry>,
  serviceId: unknown,
  currency: string,
): CancelHelp {
  if (typeof serviceId !== "string") return { kind: "email-only", serviceId: null };
  const entry = byId.get(serviceId);
  if (entry === undefined) return { kind: "email-only", serviceId };
  const region = statementRegion(currency);
  const url = (region !== null ? entry.regionalUrls[region] : undefined) ?? entry.url;
  return {
    kind: "link",
    serviceId,
    url,
    linkKind: entry.kind,
    host: hostOf(url),
    steps: entry.steps,
    appStoreMayApply: entry.appStoreMayApply,
    lastChecked: entry.lastChecked,
  };
}

/** Internal (not in the barrel): the lookup over any entry list. */
export function lookupIn(
  entries: readonly CancelEntry[],
): (serviceId: string | null, currency: string) => CancelHelp {
  const byId: ReadonlyMap<string, CancelEntry> = new Map(entries.map((e) => [e.serviceId, e]));
  return (serviceId, currency) => help(byId, serviceId, currency);
}

/** Never throws. A serviceId with no Cancel entry, or not a string, gives "email-only" (Req 2.4). */
export const getCancelHelp: (serviceId: string | null, currency: string) => CancelHelp =
  lookupIn(CANCEL_ENTRIES);
