import { GHOST_H, GHOST_HEADROOM, GHOST_REST_INSET } from "../chrome/footer-tombstone";
import type { Variants } from "framer-motion";
import { describe, expect, it } from "vitest";
import * as motionValues from "./motion";
import {
  BURIAL_FALLBACK_MS,
  CARD_REDUCED_VARIANTS,
  CARD_RISE_SPRING,
  CARD_SETTLE_SPRING,
  CARD_VARIANTS,
  COPY_LABEL_FADE,
  COUNTER_TWEEN,
  GRAVE_GHOST_REST_Y,
  GRAVE_GHOST_RETURN,
  GRAVE_GHOST_RISE,
  GRAVE_GHOST_RISE_Y,
  GRAVE_GLOW_FADE,
  REDUCED_FADE,
  SHUDDER,
  SINK,
  SINK_EASE,
  PEEK_GHOST_RISE,
  PEEK_GHOST_Y,
  STONE_LIFT,
  STONE_LIFT_Y,
  STONE_REST,
  PEEK_GHOST_VARIANTS,
  stoneOutlineVariants,
  stoneVariants,
  TOMBSTONE_RISE_SPRING,
  cardVariants,
  counterFade,
  fogFade,
  helperPanelMotion,
  helperPanelVariants,
  moundMotion,
  tombstoneMotion,
} from "./motion";

type Dict = Record<string, unknown>;

/** Every key that a target object animates, ignoring `transition`. */
function animatedKeys(target: unknown): string[] {
  if (typeof target !== "object" || target === null) return [];
  return Object.keys(target as Dict).filter((key) => key !== "transition");
}

/** Every `duration` found anywhere inside a value. */
function durations(value: unknown): number[] {
  if (typeof value !== "object" || value === null) return [];
  const found: number[] = [];
  for (const [key, inner] of Object.entries(value as Dict)) {
    if (key === "duration" && typeof inner === "number") found.push(inner);
    else found.push(...durations(inner));
  }
  return found;
}

describe("reduced motion", () => {
  it("card variants animate only opacity, in at most 0.15 s", () => {
    const variants = cardVariants(true);
    expect(variants).toBe(CARD_REDUCED_VARIANTS);
    for (const variant of Object.values(variants)) {
      expect(animatedKeys(variant)).toEqual(["opacity"]);
      const found = durations(variant);
      for (const duration of found) expect(duration).toBeLessThanOrEqual(0.15);
    }
    expect(CARD_REDUCED_VARIANTS).not.toHaveProperty("shudder");
  });

  it("tombstone, mound and counter animate only opacity, in at most 0.15 s", () => {
    const results = [
      tombstoneMotion(true),
      moundMotion(true, "left"),
      moundMotion(true, "right"),
      counterFade(true),
    ];
    for (const result of results) {
      expect(animatedKeys(result.initial === false ? {} : result.initial)).toEqual(
        result.initial === false ? [] : ["opacity"],
      );
      expect(animatedKeys(result.animate)).toEqual(["opacity"]);
      const found = durations(result.transition);
      expect(found.length).toBeGreaterThan(0);
      for (const duration of found) expect(duration).toBeLessThanOrEqual(0.15);
    }
  });

  it("fog fades opacity only, in at most 0.15 s", () => {
    const result = fogFade(true, true);
    expect(animatedKeys(result.animate)).toEqual(["opacity"]);
    expect(durations(result.transition)).toEqual([0.15]);
  });
});

describe("full motion", () => {
  it("uses the Spike's spring and tween values", () => {
    expect(CARD_RISE_SPRING).toMatchObject({ type: "spring", stiffness: 120, damping: 14 });
    expect(CARD_SETTLE_SPRING).toMatchObject({ type: "spring", stiffness: 90, damping: 18 });
    expect(SHUDDER).toEqual({ duration: 0.45, ease: "easeInOut" });
    expect(SINK).toEqual({ duration: 0.6, ease: SINK_EASE });
    expect(SINK_EASE).toEqual([0.55, 0, 1, 0.45]);
    expect(TOMBSTONE_RISE_SPRING).toMatchObject({ type: "spring", stiffness: 80, damping: 12 });
    expect(COUNTER_TWEEN.duration).toBe(0.8);
    expect(REDUCED_FADE).toEqual({ duration: 0.15 });
  });

  it("card variants use those values", () => {
    const variants = cardVariants(false);
    expect(variants).toBe(CARD_VARIANTS);
    expect(variants.risen).toMatchObject({ y: 0, transition: CARD_RISE_SPRING });
    expect(variants.settled).toMatchObject({ transition: CARD_SETTLE_SPRING });
    expect(variants.shudder).toMatchObject({ transition: SHUDDER });
    expect(variants.sunk).toMatchObject({ y: "115%", transition: SINK });
  });

  it("the tombstone rises on its spring", () => {
    const result = tombstoneMotion(false);
    expect(result.initial).toEqual({ y: "105%" });
    expect(result.animate).toEqual({ y: 0 });
    expect(result.transition).toBe(TOMBSTONE_RISE_SPRING);
  });

  it("the mound halves close from opposite sides in 0.55 s", () => {
    const left = moundMotion(false, "left");
    const right = moundMotion(false, "right");
    expect(left.initial).toMatchObject({ x: -96 });
    expect(right.initial).toMatchObject({ x: 96 });
    expect(left.transition).toMatchObject({ duration: 0.55, ease: "easeOut" });
  });

  it("the counter shows without an entrance and fog thins over 2.4 s", () => {
    expect(counterFade(false).initial).toBe(false);
    expect(fogFade(false, true).transition).toEqual({ duration: 2.4, ease: "easeOut" });
  });
});

describe("fog", () => {
  it("fades to 0.45 once cleared and to 1 otherwise", () => {
    expect(fogFade(true, true).animate).toEqual({ opacity: 0.45 });
    expect(fogFade(true, false).animate).toEqual({ opacity: 1 });
    expect(fogFade(false, true).animate).toEqual({ opacity: 0.45 });
    expect(fogFade(false, false).animate).toEqual({ opacity: 1 });
  });
});

describe("burial fallback", () => {
  it("is 2,000 ms", () => {
    expect(BURIAL_FALLBACK_MS).toBe(2000);
  });
});

describe("nothing flashes", () => {
  /** True when a value has `repeat` and animates colour or opacity. */
  function flashes(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const dict = value as Dict;
    if ("repeat" in dict) {
      const keys = Object.keys(dict).concat(Object.keys((dict.transition ?? {}) as Dict));
      if (keys.some((key) => /opacity|color|background|fill|stroke/i.test(key))) return true;
    }
    return Object.values(dict).some(flashes);
  }

  it("no exported value repeats a colour or opacity animation", () => {
    for (const [name, exported] of Object.entries(motionValues)) {
      if (typeof exported !== "function") expect(flashes(exported), name).toBe(false);
    }
    for (const reduced of [true, false]) {
      expect(flashes(cardVariants(reduced))).toBe(false);
      expect(flashes(tombstoneMotion(reduced))).toBe(false);
      expect(flashes(moundMotion(reduced, "left"))).toBe(false);
      expect(flashes(moundMotion(reduced, "right"))).toBe(false);
      expect(flashes(counterFade(reduced))).toBe(false);
      expect(flashes(fogFade(reduced, true))).toBe(false);
      expect(flashes(fogFade(reduced, false))).toBe(false);
    }
  });

  it("no exported value repeats at all", () => {
    expect(JSON.stringify(CARD_VARIANTS)).not.toContain("repeat");
    expect(JSON.stringify(CARD_REDUCED_VARIANTS)).not.toContain("repeat");
  });
});

describe("helper panel", () => {
  /** Every key animated by a target and the longest duration among the transitions. */
  const animatedKeys = (target: Dict) => Object.keys(target).filter((k) => k !== "transition");
  const durationOf = (value: Dict) => (value.transition as { duration: number }).duration;

  it("animates only opacity, within 0.15 s, when reduced", () => {
    const entrance = helperPanelMotion(true);
    expect(animatedKeys(entrance.initial as Dict)).toEqual(["opacity"]);
    expect(animatedKeys(entrance.animate as Dict)).toEqual(["opacity"]);
    expect(entrance.transition).toEqual(REDUCED_FADE);
    expect(durationOf(entrance as Dict)).toBeLessThanOrEqual(0.15);

    const variants = helperPanelVariants(true) as Record<string, Dict>;
    expect(Object.keys(variants).sort()).toEqual(["collapsed", "shown"]);
    expect(variants.collapsed).toEqual({ opacity: 0 });
    expect(animatedKeys(variants.shown as Dict)).toEqual(["opacity"]);
    expect(durationOf(variants.shown as Dict)).toBeLessThanOrEqual(0.15);

    expect(Object.keys(COPY_LABEL_FADE)).toEqual(["duration"]);
    expect(COPY_LABEL_FADE.duration).toBeLessThanOrEqual(0.15);
  });

  it("rises 6 px over 0.2 s when not reduced", () => {
    const entrance = helperPanelMotion(false);
    expect(entrance.initial).toEqual({ opacity: 0, y: 6 });
    expect(entrance.animate).toEqual({ opacity: 1, y: 0 });
    expect(durationOf(entrance as Dict)).toBe(0.2);

    const variants = helperPanelVariants(false) as Record<string, Dict>;
    expect(variants.collapsed).toEqual({ opacity: 0 });
    expect(variants.shown?.opacity).toBe(1);
    expect(durationOf(variants.shown as Dict)).toBe(0.2);
  });

  it("never repeats", () => {
    for (const reduced of [true, false]) {
      expect(JSON.stringify(helperPanelMotion(reduced))).not.toContain("repeat");
      expect(JSON.stringify(helperPanelVariants(reduced))).not.toContain("repeat");
    }
    expect(JSON.stringify(COPY_LABEL_FADE)).not.toContain("repeat");
  });
});

describe("footer peek", () => {
  it("lifts the stone 4 px and the ghost 48 px, until it clears the lifted stone top", () => {
    expect(STONE_LIFT_Y).toBe(-4);
    expect(PEEK_GHOST_Y).toBe(-48);
    // Rest inset + body height, less the lift, is how far the ghost must rise to be seen whole.
    expect(-PEEK_GHOST_Y).toBeGreaterThanOrEqual(GHOST_REST_INSET + GHOST_H - STONE_LIFT_Y);
    // And it stays inside the control's headroom.
    expect(-PEEK_GHOST_Y - GHOST_REST_INSET).toBeLessThanOrEqual(GHOST_HEADROOM);
  });

  it("ends every peek transition within 0.3 s (Req 2.8)", () => {
    for (const [name, transition] of Object.entries({ STONE_LIFT, PEEK_GHOST_RISE, STONE_REST })) {
      const delay = "delay" in transition ? transition.delay : 0;
      expect(delay + transition.duration, name).toBeLessThanOrEqual(0.3);
      expect(JSON.stringify(transition), name).not.toContain("repeat");
    }
  });
});

describe("footer peek variants", () => {
  const legs = (variants: Variants) =>
    Object.values(variants).flatMap((target) => {
      const t = (target as Dict).transition as Dict | undefined;
      if (!t) return [];
      const inner = [t, ...Object.values(t).filter((v) => typeof v === "object")] as Dict[];
      return inner.map(
        (leg) => ((leg.delay as number | undefined) ?? 0) + (leg.duration as number),
      );
    });

  it("moves the face, outline and ghost by the peek offsets", () => {
    const face = stoneVariants(false) as Record<string, Dict>;
    expect(face.rest?.y).toBe(0);
    expect(face.peek?.y).toBe(STONE_LIFT_Y);
    const outline = stoneOutlineVariants(false) as Record<string, Dict>;
    expect(outline.rest).toMatchObject({ y: 0, opacity: 0 });
    expect(outline.peek).toMatchObject({ y: STONE_LIFT_Y, opacity: 1 });
    const ghost = PEEK_GHOST_VARIANTS as Record<string, Dict>;
    expect(ghost.rest?.y).toBe(0);
    expect(ghost.peek?.y).toBe(PEEK_GHOST_Y);
  });

  it("has no y under reduced motion and fades the outline in 0.15 s (Req 2.9)", () => {
    for (const variants of [stoneVariants(true), stoneOutlineVariants(true)]) {
      for (const target of Object.values(variants)) expect(target).not.toHaveProperty("y");
    }
    const outline = stoneOutlineVariants(true) as Record<string, Dict>;
    expect(outline.peek?.opacity).toBe(1);
    expect(legs(stoneOutlineVariants(true)).every((d) => d <= 0.15)).toBe(true);
  });

  it("ends every leg within 0.3 s (Req 2.8)", () => {
    for (const variants of [
      stoneVariants(false),
      stoneOutlineVariants(false),
      PEEK_GHOST_VARIANTS,
    ]) {
      const found = legs(variants);
      expect(found.length).toBeGreaterThan(0);
      for (const d of found) expect(d).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("grave drop zone ghost", () => {
  it("rests at 24 px and rises to 8 px", () => {
    expect(GRAVE_GHOST_REST_Y).toBe(24);
    expect(GRAVE_GHOST_RISE_Y).toBe(8);
  });

  it("ends every grave leg within 0.3 s, inside the 0.4 s of Req 3.6", () => {
    const legs = { GRAVE_GHOST_RISE, GRAVE_GHOST_RETURN, GRAVE_GLOW_FADE };
    for (const [name, transition] of Object.entries(legs)) {
      const delay = "delay" in transition ? (transition.delay as number) : 0;
      expect(delay + transition.duration, name).toBeLessThanOrEqual(0.4);
      expect(delay + transition.duration, name).toBeLessThanOrEqual(0.3);
      expect(JSON.stringify(transition), name).not.toContain("repeat");
    }
  });

  it("uses the design's easings", () => {
    expect(GRAVE_GHOST_RISE).toEqual({ duration: 0.3, ease: [0.22, 1, 0.36, 1] });
    expect(GRAVE_GHOST_RETURN).toEqual({ duration: 0.25, ease: "easeIn" });
    expect(GRAVE_GLOW_FADE).toEqual({ duration: 0.2, ease: "easeOut" });
  });
});
