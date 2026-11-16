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
    { kind: "circle", cx: 870, cy: 290, r: 100, fill: { token: "bone", alpha: 0.06 } },
    { kind: "circle", cx: 870, cy: 290, r: 52, fill: { token: "bone", alpha: 0.9 } },
    { kind: "path", commands: shifted(STONE, -12, 6), fill: { token: "night", alpha: 0.6 } },
    { kind: "path", commands: STONE, fill: { token: "fog", alpha: 1 } },
    { kind: "path", commands: STONE, fill: { token: "bone", alpha: STONE_WASH_ALPHA } },
    { kind: "rect", x: 0, y: GROUND_TOP, w: 1080, h: 180, fill: { token: "night", alpha: GROUND_ALPHA } },
    { kind: "rect", x: 0, y: GROUND_TOP, w: 1080, h: 2, fill: { token: "bone", alpha: 0.14 } },
  ];
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
