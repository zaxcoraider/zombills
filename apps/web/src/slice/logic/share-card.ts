import type { AnswerRecord } from "./graveyard";
import { formatMoney } from "./money";
import { shareCardArt } from "./share-card-art";
import { fitLine, type RoleStyle } from "./share-card-fit";
import type { CurrencyTotal } from "./totals";

export const SHARE_IMAGE_SIZE = 1080;
export const MAX_TOTAL_LINES = 3;
export const SHARE_SITE_NAME = "Zombills";
export const SHARE_SITE_ADDRESS = "zombills.netlify.app";
export const SHARE_FILE_NAME = "zombills-graveyard.png";

export type ShareCardContent = {
  readonly totalLines: readonly string[]; // "I buried $215.88 a year.", at most MAX_TOTAL_LINES
  readonly moreCurrencies: number; // currencies not shown in totalLines, >= 0
  readonly countLine: string; // Req 1.4
};

export type MeasureFn = (text: string, font: string) => number;
export type ColourToken = "night" | "fog" | "bone" | "moss";
export type Paint = { readonly token: ColourToken; readonly alpha: number }; // alpha in [0, 1]

export type TextRole = "brand" | "total" | "more-currencies" | "count" | "address";

export type TextOp = {
  readonly kind: "text";
  readonly role: TextRole;
  readonly text: string;
  readonly x: number; // centre, because align is "center"
  readonly y: number; // alphabetic baseline
  readonly align: "center";
  readonly font: string; // CSS font shorthand
  readonly sizePx: number; // the px size inside `font`
  readonly maxWidth: number; // width of the Text box
  readonly fill: Paint;
};

export type PathCommand =
  | { readonly op: "move" | "line"; readonly x: number; readonly y: number }
  | { readonly op: "close" };

export type ShapeOp =
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: Paint;
    }
  | {
      readonly kind: "vertical-gradient";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly stops: readonly { readonly offset: number; readonly paint: Paint }[];
    }
  | {
      readonly kind: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: Paint;
    }
  | {
      readonly kind: "path";
      readonly commands: readonly PathCommand[];
      readonly fill: Paint;
    };

export type DrawOp = TextOp | ShapeOp;

/**
 * Req 1. Reads only yearlySavingCents from a record, and currency and totalCents from a total
 * (Req 1.5). Nothing is summed or rounded here; `savingsTotals` stays the only place that sums.
 */
export function shareCardContent(
  tombstones: readonly AnswerRecord[],
  savings: readonly CurrencyTotal[],
  locale?: string,
): ShareCardContent {
  const totalLines = savings.slice(0, MAX_TOTAL_LINES).map((total) => {
    const amount = formatMoney(total.totalCents, total.currency, locale);
    return `I buried ${amount} a year.`;
  });
  const n = tombstones.length;
  let g = 0;
  for (const record of tombstones) {
    if (record.yearlySavingCents === null) g += 1;
  }
  const noun = n === 1 ? "subscription" : "subscriptions";
  let countLine: string;
  if (savings.length === 0) {
    countLine = `I buried ${n} ${noun}. Saving unknown.`;
  } else if (g === 0) {
    countLine = `${n} ${noun} buried.`;
  } else {
    countLine = `${n} ${noun} buried, ${g} with saving unknown.`;
  }
  return { totalLines, moreCurrencies: savings.length - totalLines.length, countLine };
}

/** Req 2.8. The Preview's alt text; it states the facts of the image and does not describe the art. */
export function shareCardAlt(content: ShareCardContent): string {
  const parts = ["Image of your Zombills graveyard.", ...content.totalLines];
  if (content.moreCurrencies === 1) {
    parts.push("And 1 more currency.");
  } else if (content.moreCurrencies > 1) {
    parts.push(`And ${content.moreCurrencies} more currencies.`);
  }
  parts.push(content.countLine, `${SHARE_SITE_ADDRESS}.`);
  return parts.join(" ");
}

/** Deep equality of two Share contents (Req 4.6). */
export function sameShareContent(a: ShareCardContent, b: ShareCardContent): boolean {
  return (
    a.moreCurrencies === b.moreCurrencies &&
    a.countLine === b.countLine &&
    a.totalLines.length === b.totalLines.length &&
    a.totalLines.every((line, i) => line === b.totalLines[i])
  );
}

/** "+<n> more", the source text of the more-currencies line (Req 2.4). */
export function moreCurrenciesLine(moreCurrencies: number): string {
  return `+${moreCurrencies} more`;
}

/** Role styles (design "Role styles and fixed positions"). Sizes are px, widths are Text box widths. */
export const ROLE_STYLES: Readonly<Record<TextRole, RoleStyle & { readonly fill: Paint }>> = {
  brand: {
    family: "display",
    weight: 400,
    startPx: 72,
    floorPx: 40,
    shorten: true,
    maxWidth: 888,
    fill: { token: "bone", alpha: 1 },
  },
  total: {
    family: "sans",
    weight: 600,
    startPx: 72,
    floorPx: 1,
    shorten: false,
    maxWidth: 640,
    fill: { token: "moss", alpha: 1 },
  },
  "more-currencies": {
    family: "sans",
    weight: 500,
    startPx: 36,
    floorPx: 24,
    shorten: true,
    maxWidth: 640,
    fill: { token: "bone", alpha: 1 },
  },
  count: {
    family: "sans",
    weight: 500,
    startPx: 40,
    floorPx: 1,
    shorten: false,
    maxWidth: 640,
    fill: { token: "bone", alpha: 1 },
  },
  address: {
    family: "sans",
    weight: 500,
    startPx: 36,
    floorPx: 24,
    shorten: true,
    maxWidth: 888,
    fill: { token: "bone", alpha: 1 },
  },
};

export const TEXT_LAYOUT = {
  centreX: 540,
  brandBaseline: 150,
  addressBaseline: 1004,
  /** The band on the stone that holds the total, more-currencies and count lines */
  bandTop: 410,
  bandBottom: 860,
  lineGap: 16,
  /** Integer slot heights, each at least 1.3 × the role's start size */
  slotPx: { total: 94, "more-currencies": 47, count: 52 },
} as const;

function textOp(
  role: TextRole,
  source: string,
  y: number,
  measure: MeasureFn,
): TextOp {
  const style = ROLE_STYLES[role];
  const { text, sizePx, font } = fitLine(source, style, measure);
  return {
    kind: "text",
    role,
    text,
    x: TEXT_LAYOUT.centreX,
    y,
    align: "center",
    font,
    sizePx,
    maxWidth: style.maxWidth,
    fill: style.fill,
  };
}

/**
 * Req 2. Pure and total: the art first, then the text lines top to bottom. Positions never depend
 * on `measure`; only the fitted size and text do.
 *
 * Req 2.6 (no overlap, inside the stone and the margins) holds only for contents that
 * `shareCardContent` can return, which has at most MAX_TOTAL_LINES total lines. A hand-built
 * content with more total lines is still laid out without throwing, but its block can be taller
 * than the band.
 */
export function shareCardLayout(content: ShareCardContent, measure: MeasureFn): readonly DrawOp[] {
  const ops: DrawOp[] = [...shareCardArt()];
  ops.push(textOp("brand", SHARE_SITE_NAME, TEXT_LAYOUT.brandBaseline, measure));

  const block: { readonly role: "total" | "more-currencies" | "count"; readonly text: string }[] =
    content.totalLines.map((text) => ({ role: "total", text }));
  if (content.moreCurrencies > 0) {
    block.push({ role: "more-currencies", text: moreCurrenciesLine(content.moreCurrencies) });
  }
  block.push({ role: "count", text: content.countLine });

  let height = TEXT_LAYOUT.lineGap * (block.length - 1);
  for (const line of block) height += TEXT_LAYOUT.slotPx[line.role];
  let top =
    TEXT_LAYOUT.bandTop + Math.floor((TEXT_LAYOUT.bandBottom - TEXT_LAYOUT.bandTop - height) / 2);
  for (const line of block) {
    ops.push(textOp(line.role, line.text, top + ROLE_STYLES[line.role].startPx, measure));
    top += TEXT_LAYOUT.slotPx[line.role] + TEXT_LAYOUT.lineGap;
  }

  ops.push(textOp("address", SHARE_SITE_ADDRESS, TEXT_LAYOUT.addressBaseline, measure));
  return ops;
}
