import type { PathCommand, ShapeOp } from "./share-card";

/** Bounding box of the stone above the ground: x 150..930, y 220..900 (Req 2.6). */
export const TOMBSTONE_BOX = { x: 150, y: 220, w: 780, h: 680 } as const;
/** y of the ground line. */
export const GROUND_TOP = 900;
/** Alphas that the contrast cases read (contrast.test.ts). */
export const STONE_WASH_ALPHA = 0.12;
export const GROUND_ALPHA = 0.75;

const ARCH_SEGMENTS = 32;
const ARCH_CENTRE_X = 540;
const ARCH_CENTRE_Y = 610;
const ARCH_RADIUS = 390;

function buildStone(): readonly PathCommand[] {
  const commands: PathCommand[] = [
    { op: "move", x: 150, y: 900 },
    { op: "line", x: 150, y: 610 },
  ];
  for (let i = 1; i <= ARCH_SEGMENTS; i += 1) {
    const theta = Math.PI + (i * Math.PI) / ARCH_SEGMENTS;
    commands.push({
      op: "line",
      x: Math.round(ARCH_CENTRE_X + ARCH_RADIUS * Math.cos(theta)),
      y: Math.round(ARCH_CENTRE_Y + ARCH_RADIUS * Math.sin(theta)),
    });
  }
  commands.push({ op: "line", x: 930, y: 900 }, { op: "close" });
  return commands;
}

/** The tombstone outline: integer coordinates, straight lines only. */
export const STONE: readonly PathCommand[] = deepFreezeOps(buildStone());

// R11 (values and reasons in design "Art polish (Req 11)")
/** The moon disc. */
export const MOON = { cx: 870, cy: 290, r: 52 } as const;
/** Radius of the moon glow; the glow disc contains the moon disc. */
export const GLOW_R = 108;
export const STAR_SEED = 0x1031;
export const STAR_COUNT = 44;
export const BEVEL_INSET = 10;
/** lineWidth of the bevel and the crack. */
export const STROKE_WIDTH = 2;
export const DIVIDER = { x: 400, y: 402, w: 280, h: 2 } as const;
/** Brand line box at start size, rounded out; the stars keep 8 px from it (a test checks it against TEXT_LAYOUT). */
export const BRAND_KEEP_OUT = { x0: 96, y0: 78, x1: 984, y1: 172 } as const;

const STAR_RADII = [1, 1, 1.5, 1.5, 2, 2.5] as const;
const STAR_ALPHAS = [0.35, 0.5, 0.65, 0.8] as const;
/** Stone and its shadow (STONE moved by -12, +6). */
const STAR_KEEP_OUT_STONE = { x0: 138, y0: 220, x1: 930, y1: 906 } as const;
const STAR_GAP = 8;
const STAR_SPACING = 24;
const STAR_MAX_TRIES = 5000;

type Rect = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
type Star = { readonly x: number; readonly y: number; readonly r: number; readonly alpha: number };

/** Public-domain 32-bit PRNG. Uses only Math.imul, shifts, xor and one division by 2^32. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Squared distance from a point to an axis-aligned rectangle; 0 inside. */
function rectDistanceSq(x: number, y: number, box: Rect): number {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  return dx * dx + dy * dy;
}

/** Every comparison is between integers after scaling by 4, so it is exact in every engine. */
function buildStars(): readonly Star[] {
  const rand = mulberry32(STAR_SEED);
  const stars: Star[] = [];
  let tries = 0;
  while (stars.length < STAR_COUNT && tries < STAR_MAX_TRIES) {
    tries += 1;
    const x = 12 + Math.floor(rand() * 1057);
    const y = 12 + Math.floor(rand() * 700);
    const r = STAR_RADII[Math.floor(rand() * 6)] ?? 1;
    const alpha = STAR_ALPHAS[Math.floor(rand() * 4)] ?? 0.35;
    const keep = (2 * (r + STAR_GAP)) ** 2;
    const glow = (2 * (GLOW_R + r + STAR_GAP)) ** 2;
    const ok =
      4 * rectDistanceSq(x, y, STAR_KEEP_OUT_STONE) >= keep &&
      4 * rectDistanceSq(x, y, BRAND_KEEP_OUT) >= keep &&
      4 * ((x - MOON.cx) ** 2 + (y - MOON.cy) ** 2) >= glow &&
      stars.every((s) => (x - s.x) ** 2 + (y - s.y) ** 2 >= STAR_SPACING ** 2);
    if (ok) stars.push({ x, y, r, alpha });
  }
  return stars;
}

export const STARS: readonly Star[] = deepFreezeOps(buildStars());

function archPoints(radius: number): PathCommand[] {
  const points: PathCommand[] = [];
  for (let i = 1; i <= ARCH_SEGMENTS; i += 1) {
    const theta = Math.PI + (i * Math.PI) / ARCH_SEGMENTS;
    points.push({
      op: "line",
      x: Math.round(ARCH_CENTRE_X + radius * Math.cos(theta)),
      y: Math.round(ARCH_CENTRE_Y + radius * Math.sin(theta)),
    });
  }
  return points;
}

/** An open path inside the stone, BEVEL_INSET px in from the outline. */
export const BEVEL: readonly PathCommand[] = deepFreezeOps([
  { op: "move", x: 150 + BEVEL_INSET, y: GROUND_TOP - BEVEL_INSET },
  { op: "line", x: 150 + BEVEL_INSET, y: ARCH_CENTRE_Y },
  ...archPoints(ARCH_RADIUS - BEVEL_INSET),
  { op: "line", x: 930 - BEVEL_INSET, y: GROUND_TOP - BEVEL_INSET },
] as PathCommand[]);

/** One open path of five straight segments on the upper-left shoulder. */
export const CRACK: readonly PathCommand[] = deepFreezeOps([
  { op: "move", x: 276, y: 330 },
  { op: "line", x: 300, y: 347 },
  { op: "line", x: 293, y: 366 },
  { op: "line", x: 318, y: 383 },
  { op: "line", x: 312, y: 395 },
  { op: "line", x: 332, y: 405 },
] as PathCommand[]);

/** Grass tufts: x is the centre of the tuft, h the tallest blade. */
export const GRASS_TUFTS: readonly { readonly x: number; readonly h: number }[] = deepFreezeOps([
  { x: 30, h: 28 },
  { x: 96, h: 36 },
  { x: 160, h: 32 },
  { x: 200, h: 38 },
  { x: 250, h: 24 },
  { x: 340, h: 18 },
  { x: 470, h: 22 },
  { x: 610, h: 20 },
  { x: 740, h: 18 },
  { x: 830, h: 26 },
  { x: 884, h: 36 },
  { x: 924, h: 30 },
  { x: 980, h: 38 },
  { x: 1048, h: 30 },
]);

/** One closed path of three triangular blades standing on the ground line. */
function tuft(t: { readonly x: number; readonly h: number }): PathCommand[] {
  const b = t.x;
  const g = GROUND_TOP;
  return [
    { op: "move", x: b - 10, y: g },
    { op: "line", x: b - 7, y: g - Math.round(0.6 * t.h) },
    { op: "line", x: b - 4, y: g },
    { op: "line", x: b - 1, y: g - t.h },
    { op: "line", x: b + 2, y: g },
    { op: "line", x: b + 6, y: g - Math.round(0.75 * t.h) },
    { op: "line", x: b + 9, y: g },
    { op: "close" },
  ];
}

function shifted(commands: readonly PathCommand[], dx: number, dy: number): PathCommand[] {
  return commands.map((c) => (c.op === "close" ? c : { op: c.op, x: c.x + dx, y: c.y + dy }));
}

function buildArt(): readonly ShapeOp[] {
  const ops: ShapeOp[] = [
    {
      kind: "vertical-gradient",
      x: 0,
      y: 0,
      w: 1080,
      h: 1080,
      stops: [
        { offset: 0, paint: { token: "night", alpha: 1 } },
        { offset: 0.4, paint: { token: "night", alpha: 1 } },
        { offset: 1, paint: { token: "fog", alpha: 1 } },
      ],
    },
  ];
  for (const s of STARS) {
    ops.push({ kind: "circle", cx: s.x, cy: s.y, r: s.r, fill: { token: "bone", alpha: s.alpha } });
  }
  ops.push(
    {
      kind: "radial-gradient",
      cx: MOON.cx,
      cy: MOON.cy,
      r: GLOW_R,
      stops: [
        { offset: 0, paint: { token: "bone", alpha: 0.2 } },
        { offset: 0.5, paint: { token: "bone", alpha: 0.1 } },
        { offset: 1, paint: { token: "bone", alpha: 0 } },
      ],
    },
    { kind: "circle", cx: MOON.cx, cy: MOON.cy, r: MOON.r, fill: { token: "bone", alpha: 0.9 } },
    { kind: "path", commands: shifted(STONE, -12, 6), fill: { token: "night", alpha: 0.6 } },
    { kind: "path", commands: STONE, fill: { token: "fog", alpha: 1 } },
    { kind: "path", commands: STONE, fill: { token: "bone", alpha: STONE_WASH_ALPHA } },
    { kind: "stroke-path", commands: BEVEL, stroke: { token: "bone", alpha: 0.16 }, lineWidth: STROKE_WIDTH },
    { kind: "stroke-path", commands: CRACK, stroke: { token: "night", alpha: 0.7 }, lineWidth: STROKE_WIDTH },
    {
      kind: "rect",
      x: DIVIDER.x,
      y: DIVIDER.y,
      w: DIVIDER.w,
      h: DIVIDER.h,
      fill: { token: "bone", alpha: 0.3 },
    },
    { kind: "rect", x: 0, y: GROUND_TOP, w: 1080, h: 180, fill: { token: "night", alpha: GROUND_ALPHA } },
    { kind: "rect", x: 0, y: GROUND_TOP, w: 1080, h: 2, fill: { token: "bone", alpha: 0.14 } },
  );
  for (const t of GRASS_TUFTS) {
    ops.push({ kind: "path", commands: tuft(t), fill: { token: "moss", alpha: 0.3 } });
  }
  return ops;
}

function deepFreezeOps<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreezeOps((value as Record<string, unknown>)[key]); // index access on a plain data object
    }
  }
  return value;
}

const ART: readonly ShapeOp[] = deepFreezeOps(buildArt());

/** The art, in drawing order. Does not depend on the content. */
export function shareCardArt(): readonly ShapeOp[] {
  return ART;
}
