import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { groupCharges } from "./bands.js";
import { buildSubscription } from "./build-subscription.js";
import { compareContent } from "./content-order.js";
import { parseIsoDate } from "./dates.js";
import { assignIds, sortSubscriptions } from "./ids.js";
import type { Entry, Series } from "./internal-types.js";
import { matchRefunds } from "./refunds.js";
import { charge } from "./test-fixtures.js";
import type { Cadence, StatementInfo, Subscription } from "./types.js";
import { validateElement } from "./validate.js";

const APPLE = "unidentified:apple:apple.com/bill 866-712-7753 ca";

function entriesOf(rows: NormalizedTransaction[]): Entry[] {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  return valid.map((entry, rank) => ({ ...entry, rank }));
}

/** A Series over all charges of the rows' first Group. */
function seriesOf(rows: NormalizedTransaction[], cadence: Cadence = "monthly"): Series {
  const entries = entriesOf(rows);
  const { refunded, refunds } = matchRefunds(entries);
  const group = groupCharges(entries, refunded, refunds)[0];
  if (group === undefined) throw new Error("no group");
  return {
    group,
    cadence,
    regular: [...group.charges],
    intervals: [],
    bandIds: [0],
    intro: null,
    cadenceAssumed: false,
    confidence: "high",
  };
}

const STATEMENT: StatementInfo = {
  firstDate: "2026-01-01",
  lastDate: null,
  asOf: null,
  asOfSource: null,
  currencies: ["USD"],
};

/** Builds the Subscriptions of the Series, then gives them ids. */
function idsOf(all: Series[]): string[] {
  const asOf = parseIsoDate("2026-12-31");
  if (asOf === null) throw new Error("bad date");
  const subs = all.map((series) => {
    const sub = buildSubscription(series, STATEMENT, asOf);
    if (sub === null) throw new Error("unexpected overflow");
    return sub;
  });
  return assignIds(subs, all).map((sub) => sub.id);
}

/** Monthly rows for `key`, one per date, all with the same amount. */
function rows(key: string, amount: number, dates: string[], currency = "USD") {
  return dates.map((d) => charge(d, amount, key, { currency }));
}

describe("assignIds: discriminator (Req 8.1, 8.2)", () => {
  it("uses * for the only Subscription of a key, currency and cadence", () => {
    const series = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"]));
    expect(idsOf([series])).toEqual(["sub:USD:monthly:*:netflix"]);
  });

  it("keeps * when the amount or the dates change", () => {
    const later = seriesOf(rows("netflix", 1799, ["2026-05-02", "2026-06-02", "2026-07-02"]));
    expect(idsOf([later])).toEqual(["sub:USD:monthly:*:netflix"]);
  });

  it("uses the current amount for several Subscriptions of one key (Apple example)", () => {
    const small = seriesOf(rows(APPLE, 99, ["2026-01-05", "2026-02-05"]));
    const big = seriesOf(rows(APPLE, 1099, ["2026-01-12", "2026-02-12"]));
    expect(idsOf([small, big])).toEqual([
      `sub:USD:monthly:99:${APPLE}`,
      `sub:USD:monthly:1099:${APPLE}`,
    ]);
  });

  it("follows the Subscriptions, not their position in the list", () => {
    const small = seriesOf(rows(APPLE, 99, ["2026-01-05", "2026-02-05"]));
    const big = seriesOf(rows(APPLE, 1099, ["2026-01-12", "2026-02-12"]));
    expect(idsOf([big, small])).toEqual([
      `sub:USD:monthly:1099:${APPLE}`,
      `sub:USD:monthly:99:${APPLE}`,
    ]);
  });

  it("gives * to the same key in two currencies", () => {
    const usd = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"], "USD"));
    const eur = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"], "EUR"));
    expect(idsOf([usd, eur])).toEqual(["sub:USD:monthly:*:netflix", "sub:EUR:monthly:*:netflix"]);
  });

  it("gives * to the same key in two cadences", () => {
    const monthly = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"]));
    const yearly = seriesOf(rows("netflix", 9900, ["2025-03-01", "2026-03-01"]), "yearly");
    expect(idsOf([monthly, yearly])).toEqual([
      "sub:USD:monthly:*:netflix",
      "sub:USD:yearly:*:netflix",
    ]);
  });

  it("keeps a key that contains ':' as the whole remainder after the fourth ':'", () => {
    const [id] = idsOf([seriesOf(rows(APPLE, 99, ["2026-01-05", "2026-02-05"]))]);
    expect(id).toBe(`sub:USD:monthly:*:${APPLE}`);
    expect((id as string).split(":").slice(4).join(":")).toBe(APPLE);
  });
});

describe("assignIds: rank of Subscriptions sharing an amount (Req 8.2)", () => {
  const KEY = "merchant:gym";
  const first = (r: number) => `sub:USD:monthly:500-${r}:${KEY}`;

  it("ranks by first charge date, earliest first", () => {
    const a = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05"]));
    const b = seriesOf(rows(KEY, 500, ["2026-01-10", "2026-02-10"]));
    expect(idsOf([a, b])).toEqual([first(1), first(2)]);
    expect(idsOf([b, a])).toEqual([first(2), first(1)]);
  });

  it("ranks by the list of charge dates when the first dates are equal", () => {
    const a = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05"]));
    const b = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-07"]));
    expect(idsOf([a, b])).toEqual([first(1), first(2)]);
    expect(idsOf([b, a])).toEqual([first(2), first(1)]);
  });

  it("ranks by the list of amounts when the dates are equal", () => {
    const low = seriesOf([charge("2026-01-05", 480, KEY), charge("2026-02-05", 500, KEY)]);
    const high = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05"]));
    expect(idsOf([high, low])).toEqual([first(2), first(1)]);
    expect(idsOf([low, high])).toEqual([first(1), first(2)]);
  });

  it("ranks a list that is a prefix of another first", () => {
    const short = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05"]));
    const long = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05", "2026-03-05"]));
    expect(idsOf([long, short])).toEqual([first(2), first(1)]);
    expect(idsOf([short, long])).toEqual([first(1), first(2)]);
  });

  it("numbers only the Subscriptions that share an amount", () => {
    const a = seriesOf(rows(KEY, 500, ["2026-01-05", "2026-02-05"]));
    const b = seriesOf(rows(KEY, 500, ["2026-01-10", "2026-02-10"]));
    const c = seriesOf(rows(KEY, 900, ["2026-01-15", "2026-02-15"]));
    expect(idsOf([a, b, c])).toEqual([first(1), first(2), `sub:USD:monthly:900:${KEY}`]);
  });
});

describe("assignIds: result", () => {
  it("returns new objects with the same fields plus the id, and leaves the input alone", () => {
    const series = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"]));
    const asOf = parseIsoDate("2026-12-31");
    if (asOf === null) throw new Error("bad date");
    const built = buildSubscription(series, STATEMENT, asOf);
    if (built === null) throw new Error("unexpected overflow");
    const [sub] = assignIds([built], [series]);
    expect(sub).toEqual({ id: "sub:USD:monthly:*:netflix", ...built });
    expect("id" in built).toBe(false);
    expect(sub).not.toBe(built);
  });

  it("returns an empty list for no Subscriptions", () => {
    expect(assignIds([], [])).toEqual([]);
  });
});

describe("sortSubscriptions (Req 1.11)", () => {
  function sub(id: string, yearlyCostCents: number): Subscription {
    const series = seriesOf(rows("netflix", 1549, ["2026-01-15", "2026-02-15"]));
    const asOf = parseIsoDate("2026-12-31");
    if (asOf === null) throw new Error("bad date");
    const built = buildSubscription(series, STATEMENT, asOf);
    if (built === null) throw new Error("unexpected overflow");
    return { ...built, id, yearlyCostCents };
  }

  it("orders by yearly cost, highest first", () => {
    const sorted = sortSubscriptions([sub("a", 100), sub("b", 300), sub("c", 200)]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("falls back to the id by code units when yearly costs are equal", () => {
    const sorted = sortSubscriptions([sub("b", 100), sub("B", 100), sub("a", 100), sub("1", 100)]);
    expect(sorted.map((s) => s.id)).toEqual(["1", "B", "a", "b"]);
  });

  it("sorts ids numerically-looking amounts by code units, not by number", () => {
    const sorted = sortSubscriptions([
      sub("sub:USD:monthly:99:k", 100),
      sub("sub:USD:monthly:1099:k", 100),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["sub:USD:monthly:1099:k", "sub:USD:monthly:99:k"]);
  });

  it("does not change its input", () => {
    const input = [sub("a", 100), sub("b", 300)];
    sortSubscriptions(input);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
