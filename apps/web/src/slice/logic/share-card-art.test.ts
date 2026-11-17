import { describe, expect, it } from "vitest";
import {
  BEVEL,
  BRAND_KEEP_OUT,
  CRACK,
  DIVIDER,
  GLOW_R,
  GRASS_TUFTS,
  GROUND_ALPHA,
  GROUND_TOP,
  MOON,
  STARS,
  STAR_COUNT,
  STAR_SEED,
  STONE,
  STONE_WASH_ALPHA,
  STROKE_WIDTH,
  TOMBSTONE_BOX,
  mulberry32,
  shareCardArt,
} from "./share-card-art";
import {
  ROLE_STYLES,
  TEXT_LAYOUT,
  shareCardLayout,
  type MeasureFn,
  type Paint,
  type ShapeOp,
  type ShareCardContent,
} from "./share-card";
import {
  BLOCK_SHAPES,
  discRectDistance,
  polylineSegments,
  segmentRectDistance,
  stoneInsideMargin,
  textBoxes,
  type Box,
} from "./test-share-card-geometry";

const TOKENS = ["night", "fog", "bone", "moss"];

/** First four values of mulberry32(0x1031), pinned so that a changed generator is caught. */
const EXPECTED_RANDOM = [0.462707037338987, 0.3318894258700311, 0.9584190556779504, 0.1587371164932847];

function paintsOf(op: ShapeOp): Paint[] {
  if (op.kind === "vertical-gradient" || op.kind === "radial-gradient") {
    return op.stops.map((s) => s.paint);
  }
  if (op.kind === "stroke-path") return [op.stroke];
  return [op.fill];
}

/** Fake measure of Req 2.9: sizePx × 0.5 × code points. */
const fakeMeasure: MeasureFn = (text, font) => {
  const match = /(\d+)px /.exec(font);
  return (match ? Number(match[1]) : 0) * 0.5 * Array.from(text).length;
};

const FIRST_EXAMPLE: ShareCardContent = {
  totalLines: ["I buried $215.88 a year."],
  moreCurrencies: 0,
  countLine: "1 subscription buried.",
};
const ALL_GUESSED: ShareCardContent = {
  totalLines: [],
  moreCurrencies: 0,
  countLine: "I buried 2 subscriptions. Saving unknown.",
};
const CONTENTS: readonly ShareCardContent[] = [...BLOCK_SHAPES, FIRST_EXAMPLE, ALL_GUESSED];

/** Every Text box, at start size, of every content above. */
const ALL_TEXT_BOXES: readonly Box[] = CONTENTS.flatMap((c) => textBoxes(shareCardLayout(c, fakeMeasure), true));

const GROUND_BAND: Box = { x0: 0, y0: GROUND_TOP, x1: 1080, y1: 1080 };
const STONE_BOX: Box = {
  x0: TOMBSTONE_BOX.x,
  y0: TOMBSTONE_BOX.y,
  x1: TOMBSTONE_BOX.x + TOMBSTONE_BOX.w,
  y1: TOMBSTONE_BOX.y + TOMBSTONE_BOX.h,
};

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
  it("returns 69 operations in the R11.7 order, by kind and paint", () => {
    const ops = shareCardArt();
    expect(ops).toHaveLength(69);
    expect(ops[0]?.kind).toBe("vertical-gradient");
    for (let i = 1; i <= 44; i += 1) {
      const op = ops[i];
      expect(op?.kind).toBe("circle");
      expect(op?.kind === "circle" && op.fill.token).toBe("bone");
    }
    const kinds = ops.slice(45, 55).map((op) => op.kind);
    expect(kinds).toEqual([
      "radial-gradient",
      "circle",
      "path",
      "path",
      "path",
      "stroke-path",
      "stroke-path",
      "rect",
      "rect",
      "rect",
    ]);
    const paint = (i: number): Paint | undefined => {
      const op = ops[i];
      if (op?.kind === "stroke-path") return op.stroke;
      return op && "fill" in op ? op.fill : undefined;
    };
    expect(paint(46)).toEqual({ token: "bone", alpha: 0.9 });
    expect(paint(47)).toEqual({ token: "night", alpha: 0.6 });
    expect(paint(48)).toEqual({ token: "fog", alpha: 1 });
    expect(paint(49)).toEqual({ token: "bone", alpha: STONE_WASH_ALPHA });
    expect(paint(50)).toEqual({ token: "bone", alpha: 0.16 });
    expect(paint(51)).toEqual({ token: "night", alpha: 0.7 });
    expect(paint(52)).toEqual({ token: "bone", alpha: 0.3 });
    expect(paint(53)).toEqual({ token: "night", alpha: GROUND_ALPHA });
    expect(paint(54)).toEqual({ token: "bone", alpha: 0.14 });
    for (let i = 55; i < 69; i += 1) {
      expect(ops[i]?.kind).toBe("path");
      expect(paint(i)).toEqual({ token: "moss", alpha: 0.3 });
    }
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

  it("keeps today's numbers for the moon, the stone's three fills and the ground", () => {
    const ops = shareCardArt();
    expect(ops[46]).toMatchObject({ kind: "circle", cx: 870, cy: 290, r: 52 });
    expect(ops[48]).toMatchObject({ kind: "path", commands: STONE });
    expect(ops[53]).toMatchObject({ kind: "rect", x: 0, y: 900, w: 1080, h: 180 });
    expect(ops[54]).toMatchObject({ kind: "rect", x: 0, y: 900, w: 1080, h: 2 });
  });

  it("returns the same frozen list on every call", () => {
    const a = shareCardArt();
    expect(shareCardArt()).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    for (const op of a) expect(Object.isFrozen(op)).toBe(true);
  });
});

describe("stars", () => {
  it("has exactly STAR_COUNT stars, all bone, radius at most 3, between the sky and the glow", () => {
    expect(STAR_COUNT).toBeGreaterThanOrEqual(30);
    expect(STAR_COUNT).toBeLessThanOrEqual(60);
    expect(STARS).toHaveLength(STAR_COUNT);
    const ops = shareCardArt();
    const glow = ops.findIndex((op) => op.kind === "radial-gradient");
    expect(glow).toBe(45);
    const stars = ops.slice(1, glow);
    expect(stars).toHaveLength(STAR_COUNT);
    for (const op of stars) {
      expect(op.kind).toBe("circle");
      if (op.kind === "circle") {
        expect(op.fill.token).toBe("bone");
        expect(op.r).toBeLessThanOrEqual(3);
      }
    }
  });

  it("pins the first four values of mulberry32(0x1031)", () => {
    expect(STAR_SEED).toBe(0x1031);
    const rand = mulberry32(0x1031);
    expect([rand(), rand(), rand(), rand()]).toEqual(EXPECTED_RANDOM);
  });

  it("keeps every star disc clear of the stone box, the ground, every Text box and the glow", () => {
    for (const s of STARS) {
      for (const box of [STONE_BOX, GROUND_BAND, ...ALL_TEXT_BOXES]) {
        expect(discRectDistance(s.x, s.y, s.r, box)).toBeGreaterThan(0);
      }
      expect(Math.hypot(s.x - 870, s.y - 290)).toBeGreaterThan(GLOW_R + s.r);
    }
  });

  it("has a BRAND_KEEP_OUT that contains the brand box", () => {
    const style = ROLE_STYLES.brand;
    const y = TEXT_LAYOUT.brandBaseline;
    const x = TEXT_LAYOUT.centreX;
    expect(BRAND_KEEP_OUT.x0).toBeLessThanOrEqual(x - style.maxWidth / 2);
    expect(BRAND_KEEP_OUT.x1).toBeGreaterThanOrEqual(x + style.maxWidth / 2);
    expect(BRAND_KEEP_OUT.y0).toBeLessThanOrEqual(y - style.startPx);
    expect(BRAND_KEEP_OUT.y1).toBeGreaterThanOrEqual(y + 0.3 * style.startPx);
  });
});

describe("moon glow", () => {
  const glow = () => {
    const op = shareCardArt().find((o) => o.kind === "radial-gradient");
    if (op?.kind !== "radial-gradient") throw new Error("no glow");
    return op;
  };

  it("is centred on the moon and contains the moon disc", () => {
    expect(glow().cx).toBe(MOON.cx);
    expect(glow().cy).toBe(MOON.cy);
    expect(glow().r).toBe(GLOW_R);
    expect(MOON.r).toBeLessThan(GLOW_R);
    expect(GLOW_R).toBeLessThanOrEqual(110);
  });

  it("has ascending offsets, falling alpha, last stop (1, 0) and bone stops with integer percentages", () => {
    const { stops } = glow();
    stops.forEach((stop, i) => {
      expect(stop.offset).toBeGreaterThanOrEqual(0);
      expect(stop.offset).toBeLessThanOrEqual(1);
      expect(stop.paint.token).toBe("bone");
      expect(Number.isInteger(Math.round(stop.paint.alpha * 100 * 1e6) / 1e6)).toBe(true);
      const previous = stops[i - 1];
      if (previous) {
        expect(stop.offset).toBeGreaterThan(previous.offset);
        expect(stop.paint.alpha).toBeLessThanOrEqual(previous.paint.alpha);
      }
    });
    const last = stops[stops.length - 1];
    expect(last?.offset).toBe(1);
    expect(last?.paint.alpha).toBe(0);
  });

  it("is clear of every Text box", () => {
    for (const box of ALL_TEXT_BOXES) {
      expect(discRectDistance(870, 290, GLOW_R, box)).toBeGreaterThan(0);
    }
  });
});

describe("bevel and crack", () => {
  const strokes = () =>
    shareCardArt().flatMap((op) => (op.kind === "stroke-path" ? [op] : []));

  it("has two stroke paths with lineWidth at most 3", () => {
    expect(strokes()).toHaveLength(2);
    for (const s of strokes()) {
      expect(s.lineWidth).toBe(STROKE_WIDTH);
      expect(s.lineWidth).toBeLessThanOrEqual(3);
    }
  });

  it("keeps the bevel 10 px inside the stone, open, and above the ground", () => {
    const points = BEVEL.flatMap((c) => (c.op === "close" ? [] : [c]));
    expect(BEVEL.some((c) => c.op === "close")).toBe(false);
    expect(points[0]).toMatchObject({ x: 160 });
    expect(points[1]).toMatchObject({ x: 160, y: 610 });
    expect(points[points.length - 1]).toMatchObject({ x: 920 });
    const arch = points.slice(2, -1);
    expect(arch).toHaveLength(32);
    for (const p of arch) {
      expect(Math.abs(Math.hypot(p.x - 540, p.y - 610) - 380)).toBeLessThanOrEqual(0.71);
    }
    expect(points[points.length - 1]?.y).toBeLessThanOrEqual(GROUND_TOP - STROKE_WIDTH / 2);
  });

  it("keeps every bevel and crack vertex inside the stone", () => {
    for (const commands of [BEVEL, CRACK]) {
      for (const c of commands) {
        if (c.op !== "close") expect(stoneInsideMargin(c)).toBeGreaterThan(STROKE_WIDTH / 2);
      }
    }
  });

  it("keeps every bevel and crack segment clear of every Text box", () => {
    for (const commands of [BEVEL, CRACK]) {
      for (const [a, b] of polylineSegments(commands)) {
        for (const box of ALL_TEXT_BOXES) {
          expect(segmentRectDistance(a, b, box)).toBeGreaterThan(STROKE_WIDTH / 2);
        }
      }
    }
  });
});

describe("divider", () => {
  it("is centred, thin, between the epitaph and the first block line, and inside the stone", () => {
    expect(DIVIDER.x + DIVIDER.w / 2).toBe(540);
    expect(DIVIDER.w).toBeLessThanOrEqual(320);
    expect(DIVIDER.h).toBeLessThanOrEqual(3);
    for (const content of CONTENTS) {
      const boxes = textBoxes(shareCardLayout(content, fakeMeasure), true);
      const [, epitaph, first] = boxes;
      expect(DIVIDER.y).toBeGreaterThan(epitaph?.y1 ?? Infinity);
      expect(DIVIDER.y + DIVIDER.h).toBeLessThan(first?.y0 ?? -Infinity);
    }
    for (const [x, y] of [
      [DIVIDER.x, DIVIDER.y],
      [DIVIDER.x + DIVIDER.w, DIVIDER.y],
      [DIVIDER.x, DIVIDER.y + DIVIDER.h],
      [DIVIDER.x + DIVIDER.w, DIVIDER.y + DIVIDER.h],
    ] as const) {
      expect(stoneInsideMargin({ x, y })).toBeGreaterThan(0);
    }
  });
});

describe("grass", () => {
  const tufts = () => shareCardArt().slice(55);

  it("has 14 tufts standing on the ground line, at most 40 px tall", () => {
    expect(GRASS_TUFTS).toHaveLength(14);
    expect(tufts()).toHaveLength(14);
    for (const op of tufts()) {
      if (op.kind !== "path") throw new Error("not a path");
      const points = op.commands.flatMap((c) => (c.op === "close" ? [] : [c]));
      for (const p of points) {
        expect(p.y).toBeGreaterThanOrEqual(GROUND_TOP - 40);
        expect(p.y).toBeLessThanOrEqual(GROUND_TOP);
      }
      expect(points[0]?.y).toBe(GROUND_TOP);
      expect(points[points.length - 1]?.y).toBe(GROUND_TOP);
      expect(op.commands[op.commands.length - 1]?.op).toBe("close");
    }
  });

  it("keeps tufts over x 220 to 860 at most 30 px tall and clear of every Text box", () => {
    GRASS_TUFTS.forEach((t, i) => {
      const op = tufts()[i];
      if (op?.kind !== "path") throw new Error("not a path");
      const box: Box = { x0: t.x - 10, y0: GROUND_TOP - t.h, x1: t.x + 9, y1: GROUND_TOP };
      if (box.x1 >= 220 && box.x0 <= 860) expect(t.h).toBeLessThanOrEqual(30);
      const ys = op.commands.flatMap((c) => (c.op === "close" ? [] : [c.y]));
      expect(Math.min(...ys)).toBe(box.y0);
      for (const text of ALL_TEXT_BOXES) {
        const apart = box.x1 < text.x0 || box.x0 > text.x1 || box.y1 < text.y0 || box.y0 > text.y1;
        expect(apart).toBe(true);
      }
    });
  });
});
