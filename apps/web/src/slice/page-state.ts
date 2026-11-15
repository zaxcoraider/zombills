import type { NoSubscriptionsOutcome, ResultsOutcome } from "./logic/analyze-statement";
import type { PageError } from "./logic/messages";

export type PageView =
  | { kind: "idle" }
  | { kind: "working"; sourceName: string }
  | { kind: "results"; sourceName: string; outcome: ResultsOutcome }
  | { kind: "no-subscriptions"; sourceName: string; outcome: NoSubscriptionsOutcome }
  | { kind: "error"; sourceName: string | null; error: PageError };
