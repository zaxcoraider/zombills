import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnswerRecord } from "./graveyard";
import { savingsTotals } from "./graveyard";
import { formatMoney } from "./money";
import {
  MAX_TOTAL_LINES,
  ROLE_STYLES,
  SHARE_EPITAPH,
  SHARE_SITE_ADDRESS,
  SHARE_SITE_NAME,
  moreCurrenciesLine,
  shareCardAlt,
  shareCardContent,
  shareCardLayout,
  type DrawOp,
  type MeasureFn,
  type ShareCardContent,
  type TextOp,
  type TextRole,
} from "./share-card";
import { DIVIDER, TOMBSTONE_BOX } from "./share-card-art";
import { answerRecordArb, deepFreeze } from "./test-arbitraries";
import {
  discRectDistance,
  polylineSegments,
  segmentRectDistance,
  textBoxes,
} from "./test-share-card-geometry";

// Generators (design "Generators", Req 10.1)

const merchantArb = fc.oneof(
  fc.string({ unit: "binary" }),
  fc.string({ maxLength: 500 }),
  fc.constantFrom("Zombills", "zombills.netlify.app", "I buried $1.00 a year."),
);

const tombstoneArb: fc.Arbitrary<AnswerRecord> = fc
  .tuple(answerRecordArb, merchantArb)
  .map(([record, merchant]) => ({
    ...record,
    merchant,
    answer: "not-using" as const,
    cadenceAssumed: record.yearlySavingCents === null,
  }));

type Graveyard = {
  readonly tombstones: readonly AnswerRecord[];
  readonly savings: ReturnType<typeof savingsTotals>;
};

const graveyardArb: fc.Arbitrary<Graveyard> = fc
  .array(tombstoneArb, { maxLength: 40 })
  .map((tombstones) => deepFreeze({ tombstones, savings: savingsTotals(tombstones) }));

const localeArb = fc.constantFrom("en-US", "en-GB", "de-DE");

function sizeOf(font: string): number {
  const match = / (\d+)px /.exec(font);
  if (match === null || match[1] === undefined) throw new Error("no size in font");
  return Number(match[1]);
}

const measureArb: fc.Arbitrary<MeasureFn> = fc
  .array(fc.double({ min: 0, max: 2, noNaN: true }), { minLength: 1, maxLength: 64 })
  .map((table) => (text, font) => {
    let sum = 0;
    for (const char of text) {
      const factor = table[(char.codePointAt(0) ?? 0) % table.length];
      sum += (factor ?? 0) * sizeOf(font);
    }
    return sum;
  });

const contentArb: fc.Arbitrary<ShareCardContent> = fc
  .tuple(graveyardArb, localeArb)
  .map(([g, locale]) => deepFreeze(shareCardContent(g.tombstones, g.savings, locale)));

function textOps(ops: readonly DrawOp[]): TextOp[] {
  return ops.filter((op): op is TextOp => op.kind === "text");
}

describe("share card properties", () => {
  it("P1: total lines state the Graveyard view's figures", () => {
    fc.assert(
      fc.property(graveyardArb, localeArb, (g, locale) => {
        const content = shareCardContent(g.tombstones, g.savings, locale);
        const expected = g.savings.map(
          (t) => "I buried " + formatMoney(t.totalCents, t.currency, locale) + " a year.",
        );
        expect(content.totalLines).toEqual(expected.slice(0, MAX_TOTAL_LINES));
        expect(content.totalLines.length + content.moreCurrencies).toBe(g.savings.length);
      }),
    );
  });

  it("P2: the image holds nothing but the content", () => {
    fc.assert(
      fc.property(graveyardArb, localeArb, measureArb, (g, locale, measure) => {
        const content = shareCardContent(g.tombstones, g.savings, locale);
        const sources: { role: TextRole; text: string }[] = [
          { role: "brand", text: SHARE_SITE_NAME },
          { role: "epitaph", text: SHARE_EPITAPH },
          ...content.totalLines.map((text) => ({ role: "total" as const, text })),
        ];
        if (content.moreCurrencies > 0) {
          sources.push({
            role: "more-currencies",
            text: moreCurrenciesLine(content.moreCurrencies),
          });
        }
        sources.push(
          { role: "count", text: content.countLine },
          { role: "address", text: SHARE_SITE_ADDRESS },
        );

        const ops = textOps(shareCardLayout(content, measure));
        expect(ops.map((op) => op.role)).toEqual(sources.map((s) => s.role));
        ops.forEach((op, i) => {
          const source = sources[i];
          if (source === undefined) throw new Error("missing source");
          if (op.role === "total" || op.role === "count") {
            expect(op.text).toBe(source.text);
          } else if (op.text !== source.text) {
            const points = Array.from(source.text);
            const isPrefixForm =
              op.text === "…" ||
              (op.text.endsWith("…") &&
                points.some((_, k) => points.slice(0, k).join("") + "…" === op.text));
            expect(isPrefixForm).toBe(true);
          }
        });

        const replaced = g.tombstones.map((t) => ({ ...t, merchant: "X", serviceId: null }));
        expect(shareCardContent(replaced, savingsTotals(replaced), locale)).toEqual(content);
      }),
    );
  });

  it("P3: every line fits and nothing is clipped", () => {
    fc.assert(
      fc.property(contentArb, measureArb, (content, measure) => {
        const ops = textOps(shareCardLayout(content, measure));
        let totalIndex = 0;
        for (const op of ops) {
          expect(measure(op.text, op.font)).toBeLessThanOrEqual(op.maxWidth);
          if (op.role === "total") {
            expect(op.text).toBe(content.totalLines[totalIndex]);
            totalIndex += 1;
          }
          if (op.role === "count") expect(op.text).toBe(content.countLine);

          expect(Number.isInteger(op.sizePx)).toBe(true);
          expect(op.sizePx).toBeGreaterThan(0);
          expect(op.sizePx).toBeLessThanOrEqual(ROLE_STYLES[op.role].startPx);
          expect(op.font).toContain(`${op.sizePx}px`);

          const top = op.y - op.sizePx;
          const bottom = op.y + 0.3 * op.sizePx;
          expect(top).toBeGreaterThanOrEqual(48);
          expect(bottom).toBeLessThanOrEqual(1032);
          expect(op.x - op.maxWidth / 2).toBeGreaterThanOrEqual(48);
          expect(op.x + op.maxWidth / 2).toBeLessThanOrEqual(1032);

          if (
            op.role === "epitaph" ||
            op.role === "total" ||
            op.role === "more-currencies" ||
            op.role === "count"
          ) {
            expect(top).toBeGreaterThanOrEqual(TOMBSTONE_BOX.y);
            expect(bottom).toBeLessThanOrEqual(TOMBSTONE_BOX.y + TOMBSTONE_BOX.h);
            expect(op.x - op.maxWidth / 2).toBeGreaterThanOrEqual(TOMBSTONE_BOX.x);
            expect(op.x + op.maxWidth / 2).toBeLessThanOrEqual(TOMBSTONE_BOX.x + TOMBSTONE_BOX.w);
          }
        }
        expect(totalIndex).toBe(content.totalLines.length);

        for (let i = 0; i < ops.length; i += 1) {
          for (let j = i + 1; j < ops.length; j += 1) {
            const a = ops[i];
            const b = ops[j];
            if (a === undefined || b === undefined) throw new Error("missing op");
            const aTop = a.y - a.sizePx;
            const aBottom = a.y + 0.3 * a.sizePx;
            const bTop = b.y - b.sizePx;
            const bBottom = b.y + 0.3 * b.sizePx;
            expect(aBottom < bTop || bBottom < aTop).toBe(true);
          }
        }
      }),
    );
  });

  it("P4: the alt text states the facts", () => {
    fc.assert(
      fc.property(contentArb, (content) => {
        const parts = ["Image of your Zombills graveyard.", ...content.totalLines];
        if (content.moreCurrencies === 1) parts.push("And 1 more currency.");
        else if (content.moreCurrencies > 1) {
          parts.push(`And ${content.moreCurrencies} more currencies.`);
        }
        parts.push(content.countLine, "zombills.netlify.app.");
        const alt = shareCardAlt(content);
        expect(alt).toBe(parts.join(" "));
        for (const line of content.totalLines) expect(alt).toContain(line);
        expect(alt).toContain(content.countLine);
        expect(alt.endsWith("zombills.netlify.app.")).toBe(true);
      }),
    );
  });

  it("P5: art stays off the text", () => {
    fc.assert(
      fc.property(contentArb, measureArb, (content, measure) => {
        const ops = shareCardLayout(content, measure);
        const boxes = textBoxes(ops);
        expect(boxes.length).toBeGreaterThan(0);
        const art = ops.filter((op) => op.kind !== "text");
        for (const op of art) {
          for (const box of boxes) {
            if (op.kind === "circle" && op.r <= 3) {
              expect(discRectDistance(op.cx, op.cy, op.r, box)).toBeGreaterThan(0);
            } else if (op.kind === "radial-gradient") {
              expect(discRectDistance(op.cx, op.cy, op.r, box)).toBeGreaterThan(0);
            } else if (op.kind === "stroke-path") {
              for (const [a, b] of polylineSegments(op.commands)) {
                expect(segmentRectDistance(a, b, box)).toBeGreaterThan(op.lineWidth / 2);
              }
            } else if (op.kind === "rect" && op.y === DIVIDER.y) {
              expect(op.y + op.h < box.y0 || op.y > box.y1 || op.x + op.w < box.x0 || op.x > box.x1).toBe(true);
            } else if (op.kind === "path" && op.fill.token === "moss") {
              const points = op.commands.flatMap((c) => (c.op === "close" ? [] : [c]));
              const xs = points.map((p) => p.x);
              const ys = points.map((p) => p.y);
              const apart =
                Math.max(...xs) < box.x0 ||
                Math.min(...xs) > box.x1 ||
                Math.max(...ys) < box.y0 ||
                Math.min(...ys) > box.y1;
              expect(apart).toBe(true);
            }
          }
        }
        // the layout holds each kind of art, so the loop above checked something
        expect(art.some((op) => op.kind === "radial-gradient")).toBe(true);
        expect(art.filter((op) => op.kind === "stroke-path")).toHaveLength(2);
      }),
    );
  });
});
