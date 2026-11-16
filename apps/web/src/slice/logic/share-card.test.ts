import { describe, expect, it } from "vitest";
import type { AnswerRecord } from "./graveyard";
import {
  MAX_TOTAL_LINES,
  SHARE_FILE_NAME,
  SHARE_IMAGE_SIZE,
  SHARE_SITE_ADDRESS,
  SHARE_SITE_NAME,
  ROLE_STYLES,
  TEXT_LAYOUT,
  moreCurrenciesLine,
  sameShareContent,
  shareCardAlt,
  shareCardContent,
  shareCardLayout,
  type DrawOp,
  type MeasureFn,
  type ShareCardContent,
  type TextOp,
} from "./share-card";
import { TOMBSTONE_BOX, shareCardArt } from "./share-card-art";
import { formatMoney } from "./money";
import { deepFreeze } from "./test-arbitraries";
import type { CurrencyTotal } from "./totals";

const LOCALE = "en-US";

function record(
  id: string,
  yearlySavingCents: number | null,
  serviceId: string | null = null,
): AnswerRecord {
  return {
    id,
    merchant: id,
    serviceId,
    currency: "USD",
    cadence: "monthly",
    currentAmountCents: 999,
    answer: "not-using",
    cadenceAssumed: yearlySavingCents === null,
    yearlySavingCents,
  };
}

const NETFLIX = record("netflix", 21588, "netflix");
const GYM = record("riverside-gym", 30000);
const ECONOMIST = record("economist", null);

function total(currency: string, totalCents: number): CurrencyTotal {
  return { currency, totalCents };
}

describe("constants", () => {
  it("match Req 1.1", () => {
    expect(SHARE_IMAGE_SIZE).toBe(1080);
    expect(MAX_TOTAL_LINES).toBe(3);
    expect(SHARE_SITE_NAME).toBe("Zombills");
    expect(SHARE_SITE_ADDRESS).toBe("zombills.netlify.app");
    expect(SHARE_FILE_NAME).toBe("zombills-graveyard.png");
  });
});

describe("shareCardContent: Req 1.8 examples", () => {
  it("one Netflix Tombstone", () => {
    expect(shareCardContent([NETFLIX], [total("USD", 21588)], LOCALE)).toEqual({
      totalLines: ["I buried $215.88 a year."],
      moreCurrencies: 0,
      countLine: "1 subscription buried.",
    });
  });

  it("three Tombstones, one guessed", () => {
    expect(shareCardContent([NETFLIX, GYM, ECONOMIST], [total("USD", 56388)], LOCALE)).toEqual({
      totalLines: ["I buried $563.88 a year."],
      moreCurrencies: 0,
      countLine: "3 subscriptions buried, 1 with saving unknown.",
    });
  });

  it("one guessed Tombstone and no totals", () => {
    expect(shareCardContent([ECONOMIST], [], LOCALE)).toEqual({
      totalLines: [],
      moreCurrencies: 0,
      countLine: "I buried 1 subscription. Saving unknown.",
    });
  });

  it("four currencies show three lines and count one more", () => {
    const tombstones = [record("a", 100), record("b", 200), record("c", 300), record("d", 400)];
    const savings = [total("EUR", 100), total("GBP", 200), total("JPY", 30000), total("USD", 400)];
    expect(shareCardContent(tombstones, savings, LOCALE)).toEqual({
      totalLines: ["I buried €1.00 a year.", "I buried £2.00 a year.", "I buried ¥300 a year."],
      moreCurrencies: 1,
      countLine: "4 subscriptions buried.",
    });
  });
});

describe("shareCardContent: count line (Req 1.4)", () => {
  const usd = [total("USD", 100)];

  it("savings not empty, g = 0", () => {
    expect(shareCardContent([NETFLIX], usd, LOCALE).countLine).toBe("1 subscription buried.");
    expect(shareCardContent([NETFLIX, GYM], usd, LOCALE).countLine).toBe("2 subscriptions buried.");
  });

  it("savings not empty, g > 0", () => {
    expect(shareCardContent([NETFLIX, ECONOMIST], usd, LOCALE).countLine).toBe(
      "2 subscriptions buried, 1 with saving unknown.",
    );
    expect(shareCardContent([ECONOMIST, record("x", null)], usd, LOCALE).countLine).toBe(
      "2 subscriptions buried, 2 with saving unknown.",
    );
  });

  it("savings empty", () => {
    expect(shareCardContent([ECONOMIST], [], LOCALE).countLine).toBe(
      "I buried 1 subscription. Saving unknown.",
    );
    expect(shareCardContent([ECONOMIST, record("x", null)], [], LOCALE).countLine).toBe(
      "I buried 2 subscriptions. Saving unknown.",
    );
  });

  it("n = 0", () => {
    expect(shareCardContent([], [], LOCALE).countLine).toBe(
      "I buried 0 subscriptions. Saving unknown.",
    );
  });

  it("writes numbers with ASCII digits and no grouping", () => {
    const many = Array.from({ length: 1000 }, (_, i) => record(`r${i}`, i === 0 ? null : 100));
    expect(shareCardContent(many, usd, "ar-EG").countLine).toBe(
      "1000 subscriptions buried, 1 with saving unknown.",
    );
  });
});

describe("shareCardContent: fixed Graveyards", () => {
  const usd = [total("USD", 100)];
  const forty = Array.from({ length: 40 }, (_, i) => record(`r${i}`, i % 2 === 0 ? 100 : null));
  const cases: { name: string; tombstones: AnswerRecord[]; savings: CurrencyTotal[] }[] = [
    { name: "none", tombstones: [], savings: [] },
    { name: "one Tombstone", tombstones: [NETFLIX], savings: usd },
    { name: "all guessed", tombstones: [ECONOMIST, record("x", null)], savings: [] },
    { name: "mixed", tombstones: [NETFLIX, GYM, ECONOMIST], savings: usd },
    { name: "40 Tombstones", tombstones: forty, savings: usd },
  ];

  it.each(cases)("$name: the number is the Buried count and guessed shows saving unknown", (c) => {
    const { countLine } = shareCardContent(c.tombstones, c.savings, LOCALE);
    if (c.tombstones.length === 0) {
      // Req 9.1: the empty Graveyard is outside the exactly-when check; it keeps the Req 1.4 row.
      expect(countLine).toBe("I buried 0 subscriptions. Saving unknown.");
      return;
    }
    const number = /(\d+) subscriptions?/.exec(countLine);
    expect(Number(number?.[1])).toBe(c.tombstones.length);
    const guessed = c.tombstones.some((r) => r.yearlySavingCents === null);
    expect(/saving unknown/i.test(countLine)).toBe(guessed);
  });
});

describe("shareCardContent: reads only the allowed fields (Req 1.5)", () => {
  function throwingRecord(yearlySavingCents: number | null): AnswerRecord {
    const target = { yearlySavingCents } as Record<string, unknown>;
    for (const key of [
      "id",
      "merchant",
      "serviceId",
      "currency",
      "cadence",
      "currentAmountCents",
      "answer",
      "cadenceAssumed",
    ]) {
      Object.defineProperty(target, key, {
        enumerable: true,
        get() {
          throw new Error(`read ${key}`);
        },
      });
    }
    // The throwing getters stand in for the other AnswerRecord fields, so the cast is the point of the test.
    return target as unknown as AnswerRecord;
  }

  function throwingTotal(currency: string, totalCents: number): CurrencyTotal {
    const target = { currency, totalCents } as Record<string, unknown>;
    Object.defineProperty(target, "extra", {
      enumerable: true,
      get() {
        throw new Error("read extra");
      },
    });
    return target as unknown as CurrencyTotal;
  }

  it("never reads another field", () => {
    expect(() =>
      shareCardContent(
        [throwingRecord(100), throwingRecord(null)],
        [throwingTotal("USD", 100)],
        LOCALE,
      ),
    ).not.toThrow();
  });
});

describe("purity", () => {
  const tombstones = [NETFLIX, ECONOMIST];
  const savings = [total("USD", 21588), total("EUR", 100)];

  it("does not throw or mutate deep-frozen arguments, and is repeatable on a clone", () => {
    const frozenTombstones = deepFreeze(structuredClone(tombstones));
    const frozenSavings = deepFreeze(structuredClone(savings));
    const content = deepFreeze(shareCardContent(frozenTombstones, frozenSavings, LOCALE));
    expect(() => shareCardAlt(content)).not.toThrow();
    expect(frozenTombstones).toEqual(tombstones);
    expect(frozenSavings).toEqual(savings);
    expect(shareCardContent(structuredClone(tombstones), structuredClone(savings), LOCALE)).toEqual(
      content,
    );
    expect(shareCardAlt(structuredClone(content))).toBe(shareCardAlt(content));
  });
});

describe("shareCardAlt", () => {
  it("equals the literal of Req 2.9 for the second Req 1.8 row", () => {
    const content = shareCardContent([NETFLIX, GYM, ECONOMIST], [total("USD", 56388)], LOCALE);
    expect(shareCardAlt(content)).toBe(
      "Image of your Zombills graveyard. I buried $563.88 a year. 3 subscriptions buried, 1 with saving unknown. zombills.netlify.app.",
    );
  });

  const base = { totalLines: ["I buried $1.00 a year."], countLine: "1 subscription buried." };

  it("adds no currency sentence for 0", () => {
    expect(shareCardAlt({ ...base, moreCurrencies: 0 })).toBe(
      "Image of your Zombills graveyard. I buried $1.00 a year. 1 subscription buried. zombills.netlify.app.",
    );
  });

  it("says `And 1 more currency.` for 1", () => {
    expect(shareCardAlt({ ...base, moreCurrencies: 1 })).toBe(
      "Image of your Zombills graveyard. I buried $1.00 a year. And 1 more currency. 1 subscription buried. zombills.netlify.app.",
    );
  });

  it("says `And 3 more currencies.` for 3", () => {
    expect(shareCardAlt({ ...base, moreCurrencies: 3 })).toBe(
      "Image of your Zombills graveyard. I buried $1.00 a year. And 3 more currencies. 1 subscription buried. zombills.netlify.app.",
    );
  });
});

describe("moreCurrenciesLine", () => {
  it("is `+2 more` for 2", () => {
    expect(moreCurrenciesLine(2)).toBe("+2 more");
  });
});

describe("sameShareContent", () => {
  const content: ShareCardContent = {
    totalLines: ["I buried $1.00 a year.", "I buried €2.00 a year."],
    moreCurrencies: 1,
    countLine: "3 subscriptions buried.",
  };

  it("is true for a clone", () => {
    expect(sameShareContent(content, structuredClone(content))).toBe(true);
  });

  it("is false when a total line differs", () => {
    expect(
      sameShareContent(content, { ...content, totalLines: ["I buried $1.00 a year.", "x"] }),
    ).toBe(false);
  });

  it("is false when the number of total lines differs", () => {
    expect(sameShareContent(content, { ...content, totalLines: ["I buried $1.00 a year."] })).toBe(
      false,
    );
  });

  it("is false when moreCurrencies differs", () => {
    expect(sameShareContent(content, { ...content, moreCurrencies: 2 })).toBe(false);
  });

  it("is false when countLine differs", () => {
    expect(sameShareContent(content, { ...content, countLine: "4 subscriptions buried." })).toBe(
      false,
    );
  });
});

// ---- Layout (task 3) ----

/** Fake measure of Req 2.9: sizePx × 0.5 × code points. */
const fakeMeasure: MeasureFn = (text, font) => {
  const match = /(\d+)px /.exec(font);
  const size = match ? Number(match[1]) : 0;
  return size * 0.5 * Array.from(text).length;
};

function textOps(ops: readonly DrawOp[]): TextOp[] {
  return ops.filter((op): op is TextOp => op.kind === "text");
}

const ONE_TOTAL: ShareCardContent = {
  totalLines: ["I buried $215.88 a year."],
  moreCurrencies: 0,
  countLine: "1 subscription buried.",
};

const LARGEST: ShareCardContent = {
  totalLines: ["I buried $1.00 a year.", "I buried €2.00 a year.", "I buried £3.00 a year."],
  moreCurrencies: 3,
  countLine: "4 subscriptions buried.",
};

describe("shareCardLayout: Req 2.9 examples", () => {
  it("first Req 1.8 row: brand, total at 53 px, count, address, no more-currencies", () => {
    const texts = textOps(shareCardLayout(ONE_TOTAL, fakeMeasure));
    expect(texts.map((t) => t.role)).toEqual(["brand", "total", "count", "address"]);
    expect(texts[0]?.text).toBe("Zombills");
    expect(texts[1]?.text).toBe("I buried $215.88 a year.");
    expect(texts[1]?.sizePx).toBe(53);
    expect(texts[2]?.text).toBe("1 subscription buried.");
    expect(texts[3]?.text).toBe("zombills.netlify.app");
  });

  it("every text op is centred at x = 540", () => {
    for (const t of textOps(shareCardLayout(LARGEST, fakeMeasure))) {
      expect(t.x).toBe(540);
      expect(t.align).toBe("center");
    }
  });

  it("draws the largest safe-integer total whole at 32 px", () => {
    const line = `I buried ${formatMoney(9007199254740991, "USD", "en-US")} a year.`;
    expect(line).toBe("I buried $90,071,992,547,409.91 a year.");
    const content = { totalLines: [line], moreCurrencies: 0, countLine: "1 subscription buried." };
    const total = textOps(shareCardLayout(content, fakeMeasure)).find((t) => t.role === "total");
    expect(total?.text).toBe(line);
    expect(total?.sizePx).toBe(32);
  });

  it("draws the 51-code-point count line whole at 25 px", () => {
    const countLine = "1000 subscriptions buried, 999 with saving unknown.";
    expect(Array.from(countLine)).toHaveLength(51);
    const content = { ...ONE_TOTAL, countLine };
    const count = textOps(shareCardLayout(content, fakeMeasure)).find((t) => t.role === "count");
    expect(count?.text).toBe(countLine);
    expect(count?.sizePx).toBe(25);
  });
});

describe("shareCardLayout: more-currencies line", () => {
  const moreLine = (moreCurrencies: number) =>
    textOps(shareCardLayout({ ...ONE_TOTAL, moreCurrencies }, fakeMeasure)).find(
      (t) => t.role === "more-currencies",
    );

  it("says +1 more for four currencies", () => {
    const content = shareCardContent(
      [record("a", 1)],
      [total("EUR", 100), total("GBP", 200), total("JPY", 300), total("USD", 400)],
      LOCALE,
    );
    expect(content.moreCurrencies).toBe(1);
    const line = textOps(shareCardLayout(content, fakeMeasure)).find(
      (t) => t.role === "more-currencies",
    );
    expect(line?.text).toBe("+1 more");
  });

  it("says +3 more for six currencies", () => {
    const savings = ["EUR", "GBP", "JPY", "USD", "CAD", "AUD"].map((c) => total(c, 100));
    const content = shareCardContent([record("a", 1)], savings, LOCALE);
    const line = textOps(shareCardLayout(content, fakeMeasure)).find(
      (t) => t.role === "more-currencies",
    );
    expect(line?.text).toBe("+3 more");
  });

  it("is absent for three currencies", () => {
    const savings = ["EUR", "GBP", "JPY"].map((c) => total(c, 100));
    const content = shareCardContent([record("a", 1)], savings, LOCALE);
    expect(content.moreCurrencies).toBe(0);
    const ops = textOps(shareCardLayout(content, fakeMeasure));
    expect(ops.some((t) => t.role === "more-currencies")).toBe(false);
    expect(moreLine(0)).toBeUndefined();
  });
});

describe("shareCardLayout: structure", () => {
  const ops = shareCardLayout(LARGEST, fakeMeasure);

  it("starts with the art and has no shape after the first TextOp (Req 2.2)", () => {
    const first = ops.findIndex((op) => op.kind === "text");
    expect(first).toBeGreaterThan(0);
    expect(ops.slice(0, first)).toEqual(shareCardArt());
    expect(ops.slice(first).every((op) => op.kind === "text")).toBe(true);
  });

  it("orders the text roles brand, totals, more-currencies, count, address", () => {
    expect(textOps(ops).map((t) => t.role)).toEqual([
      "brand",
      "total",
      "total",
      "total",
      "more-currencies",
      "count",
      "address",
    ]);
  });

  it("uses only the shape kinds and path commands of Req 2.1", () => {
    for (const op of ops) {
      expect(["text", "rect", "vertical-gradient", "circle", "path"]).toContain(op.kind);
      if (op.kind === "path") {
        for (const c of op.commands) expect(["move", "line", "close"]).toContain(c.op);
      }
    }
  });

  it("uses only Colour tokens, alpha in [0, 1], and gradient stops with alpha 1", () => {
    const paints: { token: string; alpha: number }[] = [];
    for (const op of ops) {
      if (op.kind === "vertical-gradient") {
        for (const stop of op.stops) {
          expect(stop.paint.alpha).toBe(1);
          paints.push(stop.paint);
        }
      } else {
        paints.push(op.fill);
      }
    }
    for (const paint of paints) {
      expect(["night", "fog", "bone", "moss"]).toContain(paint.token);
      expect(paint.alpha).toBeGreaterThanOrEqual(0);
      expect(paint.alpha).toBeLessThanOrEqual(1);
    }
  });
});

describe("shareCardLayout: positions (Req 2.6)", () => {
  it("the largest content gives top 412 and a last slot ending at 857", () => {
    const texts = textOps(shareCardLayout(LARGEST, fakeMeasure));
    const first = texts.find((t) => t.role === "total");
    const count = texts.find((t) => t.role === "count");
    expect(first?.y).toBe(412 + ROLE_STYLES.total.startPx);
    expect((count?.y ?? 0) - ROLE_STYLES.count.startPx + TEXT_LAYOUT.slotPx.count).toBe(857);
  });

  it("a count-only content has baseline 649", () => {
    const content = { totalLines: [], moreCurrencies: 0, countLine: "I buried 1 subscription." };
    const count = textOps(shareCardLayout(content, fakeMeasure)).find((t) => t.role === "count");
    expect(count?.y).toBe(649);
  });

  it("brand and address sit at their fixed baselines", () => {
    const texts = textOps(shareCardLayout(ONE_TOTAL, fakeMeasure));
    expect(texts.find((t) => t.role === "brand")?.y).toBe(150);
    expect(texts.find((t) => t.role === "address")?.y).toBe(1004);
  });

  const contents: ShareCardContent[] = [
    ONE_TOTAL,
    LARGEST,
    { totalLines: [], moreCurrencies: 0, countLine: "I buried 1 subscription." },
    { ...LARGEST, moreCurrencies: 0 },
  ];

  it.each(contents.map((content, i) => [i, content] as const))(
    "content %i: block line boxes lie inside the tombstone box, all boxes inside the margins",
    (_i, content) => {
      const texts = textOps(shareCardLayout(content, fakeMeasure));
      const boxes = texts.map((t) => ({
        t,
        top: t.y - t.sizePx,
        bottom: t.y + 0.3 * t.sizePx,
        left: t.x - t.maxWidth / 2,
        right: t.x + t.maxWidth / 2,
      }));
      for (const b of boxes) {
        expect(b.top).toBeGreaterThanOrEqual(48);
        expect(b.bottom).toBeLessThanOrEqual(1032);
        expect(b.left).toBeGreaterThanOrEqual(48);
        expect(b.right).toBeLessThanOrEqual(1032);
        if (b.t.role === "total" || b.t.role === "more-currencies" || b.t.role === "count") {
          expect(b.top).toBeGreaterThanOrEqual(TOMBSTONE_BOX.y);
          expect(b.bottom).toBeLessThanOrEqual(TOMBSTONE_BOX.y + TOMBSTONE_BOX.h);
          expect(b.left).toBeGreaterThanOrEqual(TOMBSTONE_BOX.x);
          expect(b.right).toBeLessThanOrEqual(TOMBSTONE_BOX.x + TOMBSTONE_BOX.w);
        }
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          expect(a && b && (a.bottom <= b.top || b.bottom <= a.top)).toBe(true);
        }
      }
    },
  );
});

describe("shareCardLayout: totality and purity", () => {
  it("does not throw for a hand-built five-line content", () => {
    const content = {
      totalLines: ["a", "b", "c", "d", "e"].map((c) => `I buried $${c} a year.`),
      moreCurrencies: 2,
      countLine: "5 subscriptions buried.",
    };
    expect(() => shareCardLayout(content, fakeMeasure)).not.toThrow();
    expect(textOps(shareCardLayout(content, fakeMeasure)).filter((t) => t.role === "total")).toHaveLength(5);
  });

  it("does not throw when the measure returns NaN", () => {
    expect(() => shareCardLayout(LARGEST, () => Number.NaN)).not.toThrow();
  });

  it("calls measure only as Req 2.7 allows", () => {
    const calls: { text: string; size: number; font: string }[] = [];
    const measure: MeasureFn = (text, font) => {
      calls.push({ text, size: Number(/(\d+)px /.exec(font)?.[1]), font });
      return fakeMeasure(text, font);
    };
    const longContent = {
      ...LARGEST,
      countLine: "x".repeat(300),
    };
    const ops = shareCardLayout(longContent, measure);
    const sources = new Set<string>([
      SHARE_SITE_NAME,
      SHARE_SITE_ADDRESS,
      moreCurrenciesLine(3),
      ...longContent.totalLines,
      longContent.countLine,
    ]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const isSource = sources.has(call.text);
      const isCandidate =
        call.text.endsWith("…") && [...sources].some((s) => s.startsWith(call.text.slice(0, -1).trimEnd()));
      expect(isSource || isCandidate).toBe(true);
      expect(call.size).toBeGreaterThanOrEqual(1);
      const role = Object.values(ROLE_STYLES).find((style) => call.font.startsWith(`${style.weight} `));
      expect(role).toBeDefined();
      expect(call.size).toBeLessThanOrEqual(72);
    }
    expect(ops.length).toBeGreaterThan(0);
  });

  it("accepts deep-frozen arguments, does not mutate them, and is repeatable on a clone", () => {
    const content = deepFreeze(structuredClone(LARGEST));
    const before = structuredClone(LARGEST);
    const first = shareCardLayout(content, fakeMeasure);
    expect(content).toEqual(before);
    const second = shareCardLayout(structuredClone(LARGEST), fakeMeasure);
    expect(second).toEqual(first);
  });
});
