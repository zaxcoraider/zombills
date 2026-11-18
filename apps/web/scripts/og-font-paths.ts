import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

// WOFF 1 → glyph outline `d` strings for the Share preview text (pro-polish design "Share
// preview"). Used by `e2e/og-image.export.spec.ts` and the layout check in
// `src/static-checks.test.ts`, so it lives in `scripts/`, outside both `src` and `e2e`.
// Node built-ins only: WOFF 1 tables are zlib-compressed, and the TrueType `head`, `hhea`, `maxp`, `cmap` (format 4), `loca`, `glyf`
// and `hmtx` tables are read by hand. Layout uses advance widths only, with no kerning.

const require = createRequire(import.meta.url);
const FONT_PATH = join(
  dirname(require.resolve("@fontsource/im-fell-english/package.json")),
  "files",
  "im-fell-english-latin-400-normal.woff",
);

const WOFF_SIGNATURE = 0x774f4646; // "wOFF"
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

interface Point {
  x: number;
  y: number;
  onCurve: boolean;
}

/** One glyph as a list of closed contours, in font units, y up. */
type Contours = Point[][];

export interface Font {
  readonly unitsPerEm: number;
  /** Height of "H" above the baseline, in font units. */
  readonly capHeight: number;
  /** Advance width of `text` at `size` px. */
  advance(text: string, size: number): number;
  /** One `d` string for `text` at `size` px, left edge `x`, baseline `baseline`. */
  linePath(text: string, size: number, x: number, baseline: number): string;
}

function readTables(woff: Buffer): Map<string, Buffer> {
  if (woff.readUInt32BE(0) !== WOFF_SIGNATURE) throw new Error("not a WOFF 1 file");
  const numTables = woff.readUInt16BE(12);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const tag = woff.toString("latin1", entry, entry + 4);
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : Buffer.from(raw));
  }
  return tables;
}

function table(tables: Map<string, Buffer>, tag: string): Buffer {
  const found = tables.get(tag);
  if (!found) throw new Error(`font has no ${tag} table`);
  return found;
}

/** Code point → glyph id, from the Windows Unicode BMP `cmap` subtable (format 4). */
function readCmap(cmap: Buffer): (code: number) => number {
  const count = cmap.readUInt16BE(2);
  let sub = -1;
  for (let i = 0; i < count; i++) {
    const rec = 4 + i * 8;
    const platform = cmap.readUInt16BE(rec);
    const encoding = cmap.readUInt16BE(rec + 2);
    const offset = cmap.readUInt32BE(rec + 4);
    if (cmap.readUInt16BE(offset) !== 4) continue;
    if ((platform === 3 && encoding === 1) || platform === 0) sub = offset;
  }
  if (sub < 0) throw new Error("font has no cmap format 4 subtable");
  const segX2 = cmap.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  return (code) => {
    for (let s = 0; s < segX2; s += 2) {
      const end = cmap.readUInt16BE(ends + s);
      if (code > end) continue;
      const start = cmap.readUInt16BE(starts + s);
      if (code < start) return 0;
      const delta = cmap.readInt16BE(deltas + s);
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + s);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const at = rangeOffsets + s + rangeOffset + (code - start) * 2;
      const glyph = cmap.readUInt16BE(at);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function readSimpleGlyph(glyf: Buffer, start: number, contourCount: number): Contours {
  let pos = start + 10;
  const endPts: number[] = [];
  for (let i = 0; i < contourCount; i++) {
    endPts.push(glyf.readUInt16BE(pos));
    pos += 2;
  }
  const pointCount = (endPts[endPts.length - 1] ?? -1) + 1;
  pos += 2 + glyf.readUInt16BE(pos); // skip instructions
  const flags: number[] = [];
  while (flags.length < pointCount) {
    const flag = glyf.readUInt8(pos++);
    flags.push(flag);
    if (flag & 0x08) {
      const repeat = glyf.readUInt8(pos++);
      for (let r = 0; r < repeat; r++) flags.push(flag);
    }
  }
  const readCoords = (shortBit: number, sameBit: number): number[] => {
    const values: number[] = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & shortBit) {
        const delta = glyf.readUInt8(pos++);
        value += flag & sameBit ? delta : -delta;
      } else if (!(flag & sameBit)) {
        value += glyf.readInt16BE(pos);
        pos += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = readCoords(0x02, 0x10);
  const ys = readCoords(0x04, 0x20);
  const contours: Contours = [];
  let first = 0;
  for (const last of endPts) {
    const contour: Point[] = [];
    for (let i = first; i <= last; i++) {
      contour.push({ x: xs[i] ?? 0, y: ys[i] ?? 0, onCurve: ((flags[i] ?? 0) & 0x01) !== 0 });
    }
    contours.push(contour);
    first = last + 1;
  }
  return contours;
}

function loadFont(): Font {
  const tables = readTables(readFileSync(FONT_PATH));
  const head = table(tables, "head");
  const hhea = table(tables, "hhea");
  const maxp = table(tables, "maxp");
  const loca = table(tables, "loca");
  const glyf = table(tables, "glyf");
  const hmtx = table(tables, "hmtx");
  const unitsPerEm = head.readUInt16BE(18);
  const longLoca = head.readInt16BE(50) === 1;
  const numGlyphs = maxp.readUInt16BE(4);
  const numberOfHMetrics = hhea.readUInt16BE(34);
  const glyphFor = readCmap(table(tables, "cmap"));

  const glyphOffset = (id: number): [number, number] =>
    longLoca
      ? [loca.readUInt32BE(id * 4), loca.readUInt32BE(id * 4 + 4)]
      : [loca.readUInt16BE(id * 2) * 2, loca.readUInt16BE(id * 2 + 2) * 2];

  const advanceOf = (id: number): number =>
    hmtx.readUInt16BE(Math.min(id, numberOfHMetrics - 1) * 4);

  const outline = (id: number, depth = 0): Contours => {
    if (id >= numGlyphs || depth > 8) return [];
    const [start, end] = glyphOffset(id);
    if (end <= start) return [];
    const contourCount = glyf.readInt16BE(start);
    if (contourCount >= 0) return readSimpleGlyph(glyf, start, contourCount);
    const contours: Contours = [];
    let pos = start + 10;
    let flags = MORE_COMPONENTS;
    while (flags & MORE_COMPONENTS) {
      flags = glyf.readUInt16BE(pos);
      const component = glyf.readUInt16BE(pos + 2);
      pos += 4;
      let dx = 0;
      let dy = 0;
      if (flags & ARG_1_AND_2_ARE_WORDS) {
        dx = glyf.readInt16BE(pos);
        dy = glyf.readInt16BE(pos + 2);
        pos += 4;
      } else {
        dx = glyf.readInt8(pos);
        dy = glyf.readInt8(pos + 1);
        pos += 2;
      }
      // Point-matched placement (ARGS_ARE_XY_VALUES unset) does not occur in this font's Latin set.
      if (!(flags & ARGS_ARE_XY_VALUES)) dx = dy = 0;
      let [a, b, c, d] = [1, 0, 0, 1];
      const f2dot14 = (at: number) => glyf.readInt16BE(at) / 16384;
      if (flags & WE_HAVE_A_SCALE) {
        a = d = f2dot14(pos);
        pos += 2;
      } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
        a = f2dot14(pos);
        d = f2dot14(pos + 2);
        pos += 4;
      } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
        [a, b, c, d] = [f2dot14(pos), f2dot14(pos + 2), f2dot14(pos + 4), f2dot14(pos + 6)];
        pos += 8;
      }
      for (const contour of outline(component, depth + 1)) {
        contours.push(
          contour.map((p) => ({
            x: a * p.x + c * p.y + dx,
            y: b * p.x + d * p.y + dy,
            onCurve: p.onCurve,
          })),
        );
      }
    }
    return contours;
  };

  const glyphIds = (text: string): number[] =>
    [...text].map((ch) => glyphFor(ch.codePointAt(0) ?? 0));

  const capHeight = Math.max(
    ...outline(glyphFor("H".codePointAt(0) ?? 0)).flatMap((c) => c.map((p) => p.y)),
  );

  return {
    unitsPerEm,
    capHeight,
    advance(text, size) {
      const units = glyphIds(text).reduce((sum, id) => sum + advanceOf(id), 0);
      return (units * size) / unitsPerEm;
    },
    linePath(text, size, x, baseline) {
      const scale = size / unitsPerEm;
      const n = (v: number) => String(Math.round(v * 100) / 100);
      const parts: string[] = [];
      let penX = 0;
      for (const id of glyphIds(text)) {
        const px = (p: { x: number; y: number }) =>
          `${n(x + (penX + p.x) * scale)} ${n(baseline - p.y * scale)}`;
        for (const contour of outline(id)) {
          parts.push(contourPath(contour, px));
        }
        penX += advanceOf(id);
      }
      return parts.join("");
    },
  };
}

/** A closed TrueType contour as SVG `M`/`L`/`Q` commands, with implied on-curve midpoints. */
function contourPath(contour: Point[], px: (p: { x: number; y: number }) => string): string {
  if (contour.length === 0) return "";
  const mid = (p: Point, q: Point): Point => ({
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
    onCurve: true,
  });
  const firstOn = contour.findIndex((p) => p.onCurve);
  // Start on an on-curve point; if there is none, start at the midpoint of the first two.
  const ordered =
    firstOn >= 0
      ? [...contour.slice(firstOn), ...contour.slice(0, firstOn)]
      : [mid(contour[contour.length - 1] as Point, contour[0] as Point), ...contour];
  const start = ordered[0] as Point;
  let d = `M${px(start)}`;
  let control: Point | null = null;
  for (const p of [...ordered.slice(1), start]) {
    if (p.onCurve) {
      d += control ? `Q${px(control)} ${px(p)}` : `L${px(p)}`;
      control = null;
    } else if (control) {
      const between = mid(control, p);
      d += `Q${px(control)} ${px(between)}`;
      control = p;
    } else {
      control = p;
    }
  }
  return `${d}Z`;
}

let cached: Font | null = null;

/** The bundled IM Fell English regular, parsed once. */
export function imFellEnglish(): Font {
  cached ??= loadFont();
  return cached;
}

export interface TextBlock {
  readonly text: string;
  readonly size: number;
  readonly x: number;
  readonly baseline: number;
  /** Wrap at word boundaries when a line would be wider than this, in px. */
  readonly maxWidth?: number;
  /** Distance between baselines when the text wraps, in px. */
  readonly lineHeight?: number;
}

/** Greedy word wrap by advance width. */
export function wrapLines(font: Font, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.advance(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** One `d` string per line of `block.text`, laid out by advance width. */
export function textPaths(block: TextBlock): string[] {
  const font = imFellEnglish();
  const lines =
    block.maxWidth === undefined
      ? [block.text]
      : wrapLines(font, block.text, block.size, block.maxWidth);
  const lineHeight = block.lineHeight ?? block.size * 1.2;
  return lines.map((line, i) =>
    font.linePath(line, block.size, block.x, block.baseline + i * lineHeight),
  );
}

/** Right edge every Share preview text line must stay within, in px (pro-polish task 10). */
export const SHARE_TEXT_RIGHT_LIMIT = 1150;
/** Wordmark cap height, in px. Amended 2026-11-18: 96 px (120 px overflowed by about 80 px). */
export const WORDMARK_CAP_HEIGHT = 96;
const WORDMARK_X = 620;
const WORDMARK_BASELINE = 380;
const TAGLINE_SIZE = 44;
const TAGLINE_X = 620;
const TAGLINE_BASELINE = 450;
const TAGLINE_MAX_WIDTH = 520;

export interface ShareLine {
  readonly text: string;
  readonly size: number;
  readonly x: number;
  readonly baseline: number;
  /** `x` plus the line's advance width, in px. */
  readonly right: number;
}

/**
 * The wordmark "Zombills" and the tagline lines of `og-image.svg`, laid out by advance width.
 * The wordmark's font size comes from the font's cap height; its left edge stays at x 620 unless
 * its right edge would pass `SHARE_TEXT_RIGHT_LIMIT`, in which case it moves left just enough.
 */
export function shareTextLayout(): { wordmark: ShareLine; tagline: ShareLine[] } {
  const font = imFellEnglish();
  const wordmarkSize = (WORDMARK_CAP_HEIGHT * font.unitsPerEm) / font.capHeight;
  const wordmarkWidth = font.advance("Zombills", wordmarkSize);
  const wordmarkX = Math.min(WORDMARK_X, SHARE_TEXT_RIGHT_LIMIT - wordmarkWidth);
  const lineHeight = TAGLINE_SIZE * 1.2;
  return {
    wordmark: {
      text: "Zombills",
      size: wordmarkSize,
      x: wordmarkX,
      baseline: WORDMARK_BASELINE,
      right: wordmarkX + wordmarkWidth,
    },
    tagline: wrapLines(
      font,
      "Your bank statement is haunted.",
      TAGLINE_SIZE,
      TAGLINE_MAX_WIDTH,
    ).map((text, i) => ({
      text,
      size: TAGLINE_SIZE,
      x: TAGLINE_X,
      baseline: TAGLINE_BASELINE + i * lineHeight,
      right: TAGLINE_X + font.advance(text, TAGLINE_SIZE),
    })),
  };
}

/** One `d` string for a laid-out line. */
export function sharePath(line: ShareLine): string {
  return imFellEnglish().linePath(line.text, line.size, line.x, line.baseline);
}
