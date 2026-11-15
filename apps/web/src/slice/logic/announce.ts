// Live-region text per view (Req 8.3). Pure: no React, DOM or clock.
import type { PageView } from "../page-state";
import { errorMessage } from "./messages";
import { formatMoney } from "./money";

/** Text for the always-mounted role="status" region (Req 8.3). */
export function announcement(view: PageView, locale?: string): string {
  switch (view.kind) {
    case "idle":
      return "";
    case "working":
      return `Reading ${view.sourceName}…`;
    case "results": {
      const count = view.outcome.subscriptions.length;
      const found = `Found ${count} recurring ${count === 1 ? "charge" : "charges"}.`;
      const totals = view.outcome.totals.map(
        (total) =>
          `Yearly total in ${total.currency}: ${formatMoney(total.totalCents, total.currency, locale)}.`,
      );
      return [found, ...totals].join(" ");
    }
    case "no-subscriptions":
      return "No recurring charges found.";
    case "error":
      return errorMessage(view.error).summary;
  }
}
