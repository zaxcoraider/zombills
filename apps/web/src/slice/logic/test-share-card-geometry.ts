// Test-only and pure: the geometry checks shared by the share-card tests (design "Tests (R11.13)").
import { STONE } from "./share-card-art";
import { ROLE_STYLES, type DrawOp, type PathCommand, type ShareCardContent, type TextOp } from "./share-card";

export type Box = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

const TOTAL_LINES = [
  "I buried $1.00 a year.",
  "I buried €2.00 a year.",
  "I buried £3.00 a year.",
] as const;

function shape(totals: number, moreCurrencies: number, countLine: string): ShareCardContent {
  return { totalLines: TOTAL_LINES.slice(0, totals), moreCurrencies, countLine };
}

/** The five Block shapes as hand-built contents: 0–3 totals, more-currencies only with 3, plus count. */
export const BLOCK_SHAPES: readonly ShareCardContent[] = [
  shape(0, 0, "I buried 1 subscription."),
  shape(1, 0, "1 subscription buried."),
  shape(2, 0, "2 subscriptions buried."),
  shape(3, 0, "3 subscriptions buried."),
  shape(3, 3, "4 subscriptions buried."),
];

/** Line box × maxWidth of each TextOp at its own sizePx; with startPx when `atStart` is true. */
export function textBoxes(ops: readonly DrawOp[], atStart = false): readonly Box[] {
  return ops
    .filter((op): op is TextOp => op.kind === "text")
    .map((op) => {
      const size = atStart ? ROLE_STYLES[op.role].startPx : op.sizePx;
      return {
        x0: op.x - op.maxWidth / 2,
        y0: op.y - size,
        x1: op.x + op.maxWidth / 2,
        y1: op.y + 0.3 * size,
      };
    });
}

export type Point = { readonly x: number; readonly y: number };

/** Centre-to-box distance minus r; <= 0 when the disc touches or overlaps the box. */
export function discRectDistance(cx: number, cy: number, r: number, box: Box): number {
  const dx = Math.max(box.x0 - cx, 0, cx - box.x1);
  const dy = Math.max(box.y0 - cy, 0, cy - box.y1);
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function pointInBox(p: Point, box: Box): boolean {
  return p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function orientation(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  const within = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (
    (o1 === 0 && within(a, b, c)) ||
    (o2 === 0 && within(a, b, d)) ||
    (o3 === 0 && within(c, d, a)) ||
    (o4 === 0 && within(c, d, b))
  );
}

/** 0 when they touch or cross; otherwise the least of the end-to-box and corner-to-segment distances. */
export function segmentRectDistance(a: Point, b: Point, box: Box): number {
  if (pointInBox(a, box) || pointInBox(b, box)) return 0;
  const corners: Point[] = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  for (let i = 0; i < 4; i += 1) {
    const c = corners[i];
    const d = corners[(i + 1) % 4];
    if (c && d && segmentsCross(a, b, c, d)) return 0;
  }
  let least = Infinity;
  for (const end of [a, b]) {
    const dx = Math.max(box.x0 - end.x, 0, end.x - box.x1);
    const dy = Math.max(box.y0 - end.y, 0, end.y - box.y1);
    least = Math.min(least, Math.hypot(dx, dy));
  }
  for (const corner of corners) least = Math.min(least, pointSegmentDistance(corner, a, b));
  return least;
}

/** > 0 inside STONE: distance to the nearest outline edge, negative outside. */
export function stoneInsideMargin(p: Point): number {
  const outline: Point[] = [];
  for (const c of STONE) if (c.op !== "close") outline.push({ x: c.x, y: c.y });
  let least = Infinity;
  let inside = false;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (!a || !b) continue;
    least = Math.min(least, pointSegmentDistance(p, a, b));
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? least : -least;
}

/** The consecutive-vertex segments of a path (move/line only; close is ignored). */
export function polylineSegments(commands: readonly PathCommand[]): readonly [Point, Point][] {
  const segments: [Point, Point][] = [];
  let previous: Point | null = null;
  for (const c of commands) {
    if (c.op === "close") continue;
    const current = { x: c.x, y: c.y };
    if (c.op === "line" && previous) segments.push([previous, current]);
    previous = current;
  }
  return segments;
}
