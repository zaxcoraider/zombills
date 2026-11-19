/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shareCardLayout, type DrawOp, type MeasureFn, type PathCommand, type ShareCardContent } from "./slice/logic/share-card";
import { GROUND_ALPHA, STONE_WASH_ALPHA } from "./slice/logic/share-card-art";
import {
  CANDLE_BAND_ALPHA,
  CANDLE_GLOW_ALPHA,
  FOCUS_BAND_ALPHA,
  FOCUS_GLOW_ALPHA,
  FOG_DENSITIES,
  SKY_GLOW_ALPHA,
  TITLE_GLOW_ALPHA,
} from "./slice/logic/scene-alphas";
import { BLOCK_SHAPES, textBoxes, type Point } from "./slice/logic/test-share-card-geometry";
import { PIT_GLOW_ALPHA } from "./slice/logic/design-tokens";
import { GRAVE_EARTH } from "./slice/statement/grave-art";

const CSS = readFileSync(new URL("./index.css", import.meta.url), "utf8");

function tokenHex(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(CSS);
  const hex = match?.[1];
  if (hex === undefined) throw new Error(`Token --${name} not found in index.css`);
  return hex;
}

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function srgbToLinear(hex: string, start: number): number {
  return channel(hex, start);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

type Triple = readonly [number, number, number];

function hexToOklab(hex: string): Triple {
  const r = srgbToLinear(hex, 1);
  const g = srgbToLinear(hex, 3);
  const b = srgbToLinear(hex, 5);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]: Triple): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((c) =>
      Math.round(linearToSrgb(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `color-mix(in oklab, b t%, a)`: the colour `b` laid over `a` at fraction `t`. */
function mixOklab(a: string, b: string, t: number): string {
  const la = hexToOklab(a);
  const lb = hexToOklab(b);
  return oklabToHex([
    la[0] * (1 - t) + lb[0] * t,
    la[1] * (1 - t) + lb[1] * t,
    la[2] * (1 - t) + lb[2] * t,
  ]);
}

/** `colour` laid over `background` at `alpha`, mixed per sRGB channel as canvas `globalAlpha` does. */
function over(background: string, colour: string, alpha: number): string {
  const channelAt = (hex: string, start: number): number => parseInt(hex.slice(start, start + 2), 16);
  return `#${[1, 3, 5]
    .map((start) =>
      Math.round(channelAt(background, start) * (1 - alpha) + channelAt(colour, start) * alpha)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Body of the first CSS rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  const body = match?.[1];
  if (body === undefined) throw new Error(`Rule ${selector} not found in index.css`);
  return body;
}

describe("text colour contrast", () => {
  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on fog is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("fog"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("graveyard text and chip contrast", () => {
  const fog = () => tokenHex("fog");

  it.each(["moss", "ember", "spectre"])("%s on fog is at least 4.5:1", (name) => {
    expect(contrast(tokenHex(name), fog())).toBeGreaterThanOrEqual(4.5);
  });

  it("blood on fog is at least 3:1 (large text only)", () => {
    expect(contrast(tokenHex("blood"), fog())).toBeGreaterThanOrEqual(3);
  });

  it("night on moss is at least 4.5:1", () => {
    expect(contrast(tokenHex("night"), tokenHex("moss"))).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["moss", "ember", "spectre", "bone"])(
    "%s chip text on its 10% tint over fog is at least 4.5:1",
    (name) => {
      const colour = tokenHex(name);
      expect(contrast(colour, mixOklab(fog(), colour, 0.1))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([0.7, 0.9])("text-bone/%s on fog is at least 4.5:1", (alpha) => {
    const text = mixOklab(fog(), tokenHex("bone"), alpha);
    expect(contrast(text, fog())).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["bone", "moss"])("%s on the stone face is at least 4.5:1", (name) => {
    const face = mixOklab(fog(), tokenHex("bone"), 0.2);
    expect(face).toBe("#3e424a");
    expect(contrast(tokenHex(name), face)).toBeGreaterThanOrEqual(4.5);
  });

  it("mixOklab returns its endpoints at 0 and 1", () => {
    expect(mixOklab(tokenHex("fog"), tokenHex("bone"), 0)).toBe(tokenHex("fog").toLowerCase());
    expect(mixOklab(tokenHex("fog"), tokenHex("bone"), 1)).toBe(tokenHex("bone").toLowerCase());
  });
});

describe("share card contrast (sRGB compositing, as the canvas does)", () => {
  const stoneFace = () => over(tokenHex("fog"), tokenHex("bone"), STONE_WASH_ALPHA);
  const ground = () => over(tokenHex("fog"), tokenHex("night"), GROUND_ALPHA);

  it.each(["bone", "moss"])("%s on the stone face is at least 4.5:1", (name) => {
    expect(contrast(tokenHex(name), stoneFace())).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on the ground is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), ground())).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it("over returns the background at alpha 0 and the colour at alpha 1", () => {
    expect(over(tokenHex("fog"), tokenHex("bone"), 0)).toBe(tokenHex("fog").toLowerCase());
    expect(over(tokenHex("fog"), tokenHex("bone"), 1)).toBe(tokenHex("bone").toLowerCase());
  });
});

/** Even-odd ray cast over the straight-line commands of one closed path. */
function insidePath(commands: readonly PathCommand[], x: number, y: number): boolean {
  const points: Point[] = commands.flatMap((c) => (c.op === "close" ? [] : [{ x: c.x, y: c.y }]));
  let inside = false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a && b && a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
  return Math.hypot(x - (a.x + t * abx), y - (a.y + t * aby));
}

/** Channel-wise linear interpolation of two hex colours, on the gamma-encoded 8-bit values. */
function lerpHex(a: string, b: string, t: number): string {
  const channelAt = (hex: string, start: number): number => parseInt(hex.slice(start, start + 2), 16);
  return `#${[1, 3, 5]
    .map((start) =>
      Math.round(channelAt(a, start) * (1 - t) + channelAt(b, start) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** The colour that the art operations leave at (x, y); the canvas starts transparent black. */
function compositeAt(ops: readonly DrawOp[], x: number, y: number): string {
  let colour = "#000000";
  for (const op of ops) {
    if (op.kind === "text") break;
    if (op.kind === "vertical-gradient") {
      if (x < op.x || x > op.x + op.w || y < op.y || y > op.y + op.h) continue;
      const offset = (y - op.y) / op.h;
      const stops = op.stops;
      let sky = tokenHex(stops[stops.length - 1]?.paint.token ?? "night");
      if (offset <= (stops[0]?.offset ?? 0)) sky = tokenHex(stops[0]?.paint.token ?? "night");
      for (let i = 1; i < stops.length; i += 1) {
        const lo = stops[i - 1];
        const hi = stops[i];
        if (lo && hi && offset >= lo.offset && offset <= hi.offset) {
          const span = hi.offset - lo.offset;
          sky = lerpHex(tokenHex(lo.paint.token), tokenHex(hi.paint.token), span === 0 ? 1 : (offset - lo.offset) / span);
          break;
        }
      }
      colour = sky;
    } else if (op.kind === "rect") {
      if (x >= op.x && x <= op.x + op.w && y >= op.y && y <= op.y + op.h) {
        colour = over(colour, tokenHex(op.fill.token), op.fill.alpha);
      }
    } else if (op.kind === "circle") {
      if (Math.hypot(x - op.cx, y - op.cy) <= op.r) colour = over(colour, tokenHex(op.fill.token), op.fill.alpha);
    } else if (op.kind === "path") {
      if (insidePath(op.commands, x, y)) colour = over(colour, tokenHex(op.fill.token), op.fill.alpha);
    } else if (op.kind === "radial-gradient") {
      const fraction = Math.hypot(x - op.cx, y - op.cy) / op.r;
      if (fraction >= 1) continue;
      for (let i = 1; i < op.stops.length; i += 1) {
        const lo = op.stops[i - 1];
        const hi = op.stops[i];
        if (lo && hi && fraction >= lo.offset && fraction <= hi.offset) {
          const t = (fraction - lo.offset) / (hi.offset - lo.offset);
          const alpha = lo.paint.alpha * (1 - t) + hi.paint.alpha * t;
          colour = over(colour, tokenHex(lo.paint.token), alpha);
          break;
        }
      }
    } else {
      const points: Point[] = op.commands.flatMap((c) => (c.op === "close" ? [] : [{ x: c.x, y: c.y }]));
      const touches = points.some((a, i) => {
        const b = points[i + 1];
        return b !== undefined && distanceToSegment(x, y, a, b) <= op.lineWidth / 2;
      });
      if (touches) colour = over(colour, tokenHex(op.stroke.token), op.stroke.alpha);
    }
  }
  return colour;
}

describe("share card contrast per operation (R11.8)", () => {
  /** Fake measure of Req 2.9: sizePx × 0.5 × code points. */
  const fakeMeasure: MeasureFn = (text, font) => {
    const match = /(\d+)px /.exec(font);
    return (match ? Number(match[1]) : 0) * 0.5 * Array.from(text).length;
  };
  const contents: readonly ShareCardContent[] = [
    ...BLOCK_SHAPES,
    { totalLines: ["I buried $215.88 a year."], moreCurrencies: 0, countLine: "1 subscription buried." },
    { totalLines: [], moreCurrencies: 0, countLine: "I buried 2 subscriptions. Saving unknown." },
  ];

  it("samples the sky between night and fog on the encoded channels", () => {
    const ops = shareCardLayout(contents[0] as ShareCardContent, fakeMeasure);
    expect(compositeAt(ops, 5, 0)).toBe(tokenHex("night").toLowerCase());
    expect(compositeAt(ops, 5, 432)).toBe(tokenHex("night").toLowerCase());
    expect(compositeAt(ops, 5, 864)).toBe(lerpHex(tokenHex("night"), tokenHex("fog"), (0.8 - 0.4) / 0.6));
    const skyAt1000 = lerpHex(tokenHex("night"), tokenHex("fog"), (1000 / 1080 - 0.4) / 0.6);
    expect(compositeAt(ops, 5, 1000)).toBe(over(skyAt1000, tokenHex("night"), GROUND_ALPHA));
  });

  it.each(contents.map((c, i) => [i, c] as const))(
    "every text line box of content %i is at least 4.5:1 against what is drawn under it",
    (_i, content) => {
      const ops = shareCardLayout(content, fakeMeasure);
      const boxes = textBoxes(ops);
      const texts = ops.filter((op) => op.kind === "text");
      expect(boxes).toHaveLength(texts.length);
      texts.forEach((op, i) => {
        const box = boxes[i];
        if (!box || op.kind !== "text") throw new Error("missing box");
        const midX = (box.x0 + box.x1) / 2;
        const samples: Point[] = [
          { x: box.x0, y: box.y0 },
          { x: box.x1, y: box.y0 },
          { x: box.x0, y: box.y1 },
          { x: box.x1, y: box.y1 },
          { x: midX, y: box.y0 },
          { x: midX, y: box.y1 },
        ];
        const text = over("#000000", tokenHex(op.fill.token), op.fill.alpha);
        for (const p of samples) {
          expect(contrast(text, compositeAt(ops, p.x, p.y))).toBeGreaterThanOrEqual(4.5);
        }
      });
    },
  );
});

describe("index.css rules", () => {
  it(":focus-visible draws a 2px moss outline with a 2px offset", () => {
    const body = ruleBody(":focus-visible");
    expect(body).toMatch(/outline:\s*2px solid var\(--moss\)\s*;/);
    expect(body).toMatch(/outline-offset:\s*2px\s*;/);
  });

  it(".money uses Inter with tabular figures", () => {
    const body = ruleBody(".money");
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)\s*;/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums\s*;/);
  });
});

describe("landing contrast (landing-polish R10.2)", () => {
  const night = () => tokenHex("night");
  const fog = () => tokenHex("fog");
  const bone = () => tokenHex("bone");
  const moss = () => tokenHex("moss");

  /** The lightest bare scene: fog, plus the sky glow, plus all three fog bands at full density. */
  const scene = () =>
    FOG_DENSITIES.reduce(
      (colour, density) => over(colour, bone(), density),
      over(fog(), bone(), SKY_GLOW_ALPHA),
    );
  const card = () => over(scene(), fog(), 0.95);
  const footer = () => over(scene(), night(), 0.8);

  it("the lightest bare scene is #646567", () => {
    expect(scene()).toBe("#646567");
  });

  it("bone text on the bare scene is at least 4.5:1", () => {
    expect(contrast(bone(), scene())).toBeGreaterThanOrEqual(4.5);
  });

  it("bone text on a fog card over the scene is at least 4.5:1", () => {
    expect(card()).toBe("#1e232e");
    expect(contrast(bone(), card())).toBeGreaterThanOrEqual(4.5);
  });

  it("moss step numbers and counter figure on a fog card are at least 4.5:1", () => {
    expect(contrast(moss(), card())).toBeGreaterThanOrEqual(4.5);
  });

  it("the counter label (bone at 70 %) on a fog card is at least 4.5:1", () => {
    expect(contrast(over(card(), bone(), 0.7), card())).toBeGreaterThanOrEqual(4.5);
  });

  it("Footer text on night at 80 % over the scene is at least 4.5:1", () => {
    expect(footer()).toBe("#1d1f23");
    expect(contrast(bone(), footer())).toBeGreaterThanOrEqual(4.5);
  });

  it("Primary action text, night on moss, is at least 4.5:1", () => {
    expect(contrast(night(), moss())).toBeGreaterThanOrEqual(4.5);
  });

  it("the Primary action fill against the scene is at least 3:1", () => {
    expect(contrast(moss(), scene())).toBeGreaterThanOrEqual(3);
  });

  it("the focus ring on the bare scene is at least 3:1", () => {
    const band = over(over(scene(), moss(), FOCUS_GLOW_ALPHA), night(), FOCUS_BAND_ALPHA);
    expect(band).toBe("#2a3330");
    expect(contrast(moss(), band)).toBeGreaterThanOrEqual(3);
  });

  it("text next to a focused bare-scene control is at least 4.5:1", () => {
    expect(contrast(bone(), scene())).toBeGreaterThanOrEqual(4.5);
  });

  it("the focus ring on a card is at least 3:1", () => {
    expect(contrast(moss(), fog())).toBeGreaterThanOrEqual(3);
  });

  it("the drop area dashed border is at least 3:1", () => {
    expect(contrast(bone(), fog())).toBeGreaterThanOrEqual(3);
  });

  it("FREE_LINE, bone on the bare scene S, is at least 4.5:1 (pro-polish R11.1)", () => {
    expect(contrast(bone(), scene())).toBeGreaterThanOrEqual(4.5);
  });
});

describe("effect contrast (landing-polish R9.7)", () => {
  const night = () => tokenHex("night");
  const fog = () => tokenHex("fog");
  const bone = () => tokenHex("bone");
  const moss = () => tokenHex("moss");
  const ember = () => tokenHex("ember");

  const scene = () =>
    FOG_DENSITIES.reduce(
      (colour, density) => over(colour, bone(), density),
      over(fog(), bone(), SKY_GLOW_ALPHA),
    );

  it("title glyphs in their glow are at least 4.5:1, with no credit for the night rims", () => {
    const glow = over(scene(), bone(), TITLE_GLOW_ALPHA);
    expect(glow).toBe("#666769");
    expect(contrast(bone(), glow)).toBeGreaterThanOrEqual(4.5);
  });

  it("the focus ring and the fill boundary over the candle glow are at least 3:1", () => {
    const band = over(over(scene(), ember(), CANDLE_GLOW_ALPHA), night(), CANDLE_BAND_ALPHA);
    expect(band).toBe("#352d29");
    expect(contrast(moss(), band)).toBeGreaterThanOrEqual(3);
  });
});

describe("footer graveyard contrast (pro-polish R2.11)", () => {
  const night = () => tokenHex("night");
  const fog = () => tokenHex("fog");
  const bone = () => tokenHex("bone");
  const moss = () => tokenHex("moss");
  /** GROUND_TOP, `color-mix(in oklab, var(--fog) 58%, var(--night))`: the lightest earth. */
  const groundTop = () => mixOklab(fog(), night(), 0.42);
  /** The lightest stone face stop, `color-mix(in oklab, var(--fog) 82%, var(--bone))`; the grain only darkens it. */
  const stoneFace = () => mixOklab(fog(), bone(), 0.18);

  it("the Reaper description and the Privacy note, bone on the earth, are at least 4.5:1", () => {
    expect(contrast(bone(), groundTop())).toBeGreaterThanOrEqual(4.5);
  });

  it("an engraved stone label, bone on the lightest stone face, is at least 4.5:1", () => {
    expect(contrast(bone(), stoneFace())).toBeGreaterThanOrEqual(4.5);
  });

  it("the moss hover and focus outline on the stone face and on the earth is at least 3:1", () => {
    expect(contrast(moss(), stoneFace())).toBeGreaterThanOrEqual(3);
    expect(contrast(moss(), groundTop())).toBeGreaterThanOrEqual(3);
  });
});

describe("pro-polish contrast (Req 12.4)", () => {
  const night = () => tokenHex("night");
  const fog = () => tokenHex("fog");
  const bone = () => tokenHex("bone");
  const moss = () => tokenHex("moss");
  /** S: the lightest bare scene (landing-polish). */
  const scene = () =>
    FOG_DENSITIES.reduce(
      (colour, density) => over(colour, bone(), density),
      over(fog(), bone(), SKY_GLOW_ALPHA),
    );
  /** C: a `bg-fog/95` Card over S. */
  const card = () => over(scene(), fog(), 0.95);
  /** P: the lightest pit colour, `mix(night 85 %, fog)` plus the moss pit glow at its full alpha. */
  const pit = () => over(mixOklab(night(), fog(), 0.15), moss(), PIT_GLOW_ALPHA);

  it("C and P have the design's values", () => {
    expect(card()).toBe("#1e232e");
    expect(PIT_GLOW_ALPHA).toBe(0.14);
    expect(pit()).toBe("#1f2c28");
  });

  it("grave text, bone on P, is at least 4.5:1", () => {
    expect(contrast(bone(), pit())).toBeGreaterThanOrEqual(4.5);
  });

  it("'Choose a file' in the pit, today's classes (bone border on bg-fog): text at least 4.5:1, border at least 3:1 against P and the fill", () => {
    // Today's pair (review B #6); task 25's secondary variant brings its own row.
    expect(contrast(bone(), fog())).toBeGreaterThanOrEqual(4.5);
    expect(contrast(bone(), pit())).toBeGreaterThanOrEqual(3);
    expect(contrast(bone(), fog())).toBeGreaterThanOrEqual(3);
  });

  it("'Choose a file' while aria-disabled (opacity 60 % over P): text at least 4.5:1", () => {
    expect(contrast(over(pit(), bone(), 0.6), over(pit(), fog(), 0.6))).toBeGreaterThanOrEqual(4.5);
  });

  it("a Sample chip: text bone on fog at least 4.5:1, outline bone 50 % over fog against C at least 3:1", () => {
    expect(contrast(bone(), fog())).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(fog(), bone(), 0.5), card())).toBeGreaterThanOrEqual(3);
    expect(contrast(over(fog(), bone(), 0.5), fog())).toBeGreaterThanOrEqual(3);
  });

  it("a Sample chip while aria-disabled (opacity 60 % over C): text at least 4.5:1 (review B #9)", () => {
    expect(contrast(over(card(), bone(), 0.6), over(card(), fog(), 0.6))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  /** E: the grave's earth ring, GRAVE_EARTH = `color-mix(in oklab, var(--night) 85%, var(--ember))`. */
  const earth = () => mixOklab(night(), tokenHex("ember"), 0.15);

  it("E has the design's value and reads apart from C by hue", () => {
    expect(GRAVE_EARTH).toBe("color-mix(in oklab, var(--night) 85%, var(--ember))");
    expect(earth()).toBe("#271f1d");
    // E is warm (red channel above blue); C is cool (blue above red).
    expect(parseInt(earth().slice(1, 3), 16)).toBeGreaterThan(parseInt(earth().slice(5, 7), 16));
    expect(parseInt(card().slice(5, 7), 16)).toBeGreaterThan(parseInt(card().slice(1, 3), 16));
  });

  it("the grave outline, bone 50 % over E, against E and against C is at least 3:1", () => {
    expect(contrast(over(earth(), bone(), 0.5), earth())).toBeGreaterThanOrEqual(3);
    expect(contrast(over(earth(), bone(), 0.5), card())).toBeGreaterThanOrEqual(3);
  });

  it("the grave rim glow, moss against C and against E, is at least 3:1", () => {
    expect(contrast(moss(), card())).toBeGreaterThanOrEqual(3);
    expect(contrast(moss(), earth())).toBeGreaterThanOrEqual(3);
  });
});
