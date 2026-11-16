import { describe, expect, it } from "vitest";
import {
  GROUND_ALPHA,
  GROUND_TOP,
  STONE,
  STONE_WASH_ALPHA,
  TOMBSTONE_BOX,
  shareCardArt,
} from "./share-card-art";
import type { Paint, ShapeOp } from "./share-card";

const TOKENS = ["night", "fog", "bone", "moss"];

function paintsOf(op: ShapeOp): Paint[] {
  if (op.kind === "vertical-gradient") return op.stops.map((s) => s.paint);
  return [op.fill];
}

describe("STONE", () => {
  it("has a bounding box equal to TOMBSTONE_BOX", () => {
    const points = STONE.flatMap((c) => (c.op === "close" ? [] : [c]));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }).toEqual(TOMBSTONE_BOX);
  });

  it("starts with move, ends with close and holds only move, line and close", () => {
    expect(STONE[0]?.op).toBe("move");
    expect(STONE[STONE.length - 1]?.op).toBe("close");
    for (const c of STONE) expect(["move", "line", "close"]).toContain(c.op);
    expect(STONE.filter((c) => c.op === "move")).toHaveLength(1);
  });

  it("starts at (150, 900) and has 32 arch segments", () => {
    expect(STONE[0]).toEqual({ op: "move", x: 150, y: 900 });
    expect(STONE).toHaveLength(2 + 32 + 2);
  });

  it("uses integer coordinates only", () => {
    for (const c of STONE) {
      if (c.op !== "close") {
        expect(Number.isInteger(c.x)).toBe(true);
        expect(Number.isInteger(c.y)).toBe(true);
      }
    }
  });

  it("stands on the ground line", () => {
    expect(TOMBSTONE_BOX.y + TOMBSTONE_BOX.h).toBe(GROUND_TOP);
  });
});

describe("shareCardArt", () => {
  it("returns eight operations", () => {
    expect(shareCardArt()).toHaveLength(8);
  });

  it("keeps the moon disc outside the stone", () => {
    const disc = shareCardArt().find((op) => op.kind === "circle" && op.r === 52);
    expect(disc).toBeDefined();
    const distance = Math.hypot(870 - 540, 290 - 610);
    expect(distance - 390).toBeGreaterThanOrEqual(52);
  });

  it("uses only the four Colour tokens with alpha in [0, 1]", () => {
    for (const op of shareCardArt()) {
      for (const paint of paintsOf(op)) {
        expect(TOKENS).toContain(paint.token);
        expect(paint.alpha).toBeGreaterThanOrEqual(0);
        expect(paint.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives every gradient stop alpha 1", () => {
    const gradient = shareCardArt().find((op) => op.kind === "vertical-gradient");
    expect(gradient?.kind === "vertical-gradient" && gradient.stops.every((s) => s.paint.alpha === 1)).toBe(true);
  });

  it("reads its alphas from the exported constants", () => {
    const alphas = shareCardArt().flatMap((op) => (op.kind === "path" ? [op.fill.alpha] : []));
    expect(alphas).toContain(STONE_WASH_ALPHA);
    const ground = shareCardArt().find((op) => op.kind === "rect" && op.h === 180);
    expect(ground?.kind === "rect" && ground.fill.alpha).toBe(GROUND_ALPHA);
  });

  it("returns the same frozen list on every call", () => {
    const a = shareCardArt();
    expect(shareCardArt()).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    for (const op of a) expect(Object.isFrozen(op)).toBe(true);
  });
});
