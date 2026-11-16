import type { MotionProps, Variants } from "framer-motion";

/**
 * Every motion value of the Graveyard UI. All motion goes through Framer Motion and every
 * number lives here. The values are the Spike's, copied unchanged.
 */

export const CARD_RISE_SPRING = {
  type: "spring",
  stiffness: 120,
  damping: 14,
  delay: 0.3,
} as const;
export const CARD_SETTLE_SPRING = { type: "spring", stiffness: 90, damping: 18 } as const;
export const SHUDDER = { duration: 0.45, ease: "easeInOut" } as const;
/** ease-in */
export const SINK_EASE = [0.55, 0, 1, 0.45] as const;
export const SINK = { duration: 0.6, ease: SINK_EASE } as const;
export const TOMBSTONE_RISE_SPRING = {
  type: "spring",
  stiffness: 80,
  damping: 12,
  delay: 0.05,
} as const;
export const COUNTER_TWEEN = { duration: 0.8, ease: [0.16, 1, 0.3, 1] } as const;
export const REDUCED_FADE = { duration: 0.15 } as const;
/** The Copy label swaps by fading, in both motion modes (cancel-helper Req 8.7). */
export const COPY_LABEL_FADE = { duration: 0.15 } as const;
const HELPER_PANEL_FADE = { duration: 0.2, ease: "easeOut" } as const;
/** One budget for the whole burial sequence (Req 13.6). */
export const BURIAL_FALLBACK_MS = 2000;

/** Outer layer: vertical travel through the ground line. */
export const CARD_VARIANTS: Variants = {
  below: { y: "115%" },
  risen: { y: 0, x: 0, transition: CARD_RISE_SPRING },
  settled: { y: 6, transition: CARD_SETTLE_SPRING },
  shudder: { x: [0, -5, 5, -4, 3, 0], transition: SHUDDER },
  sunk: { y: "115%", transition: SINK },
};

/** Reduced motion: opacity only, at most 150 ms. No "shudder": the page skips the condemned phase. */
export const CARD_REDUCED_VARIANTS: Variants = {
  below: { opacity: 0 },
  risen: { opacity: 1, transition: REDUCED_FADE },
  settled: { opacity: 1, transition: REDUCED_FADE },
  sunk: { opacity: 0, transition: REDUCED_FADE },
};

export function cardVariants(reduced: boolean): Variants {
  return reduced ? CARD_REDUCED_VARIANTS : CARD_VARIANTS;
}

type EntranceMotion = Pick<MotionProps, "initial" | "animate" | "transition">;

export function tombstoneMotion(reduced: boolean): EntranceMotion {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: REDUCED_FADE }
    : { initial: { y: "105%" }, animate: { y: 0 }, transition: TOMBSTONE_RISE_SPRING };
}

export function moundMotion(reduced: boolean, side: "left" | "right"): EntranceMotion {
  if (reduced) {
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: REDUCED_FADE };
  }
  const from = side === "left" ? -96 : 96;
  return {
    initial: { x: from, scaleY: 0.2, opacity: 0 },
    animate: { x: 0, scaleY: [0.2, 1.08, 1], opacity: 1 },
    transition: {
      duration: 0.55,
      ease: "easeOut",
      scaleY: { duration: 0.55, times: [0, 0.75, 1], ease: "easeOut" },
      opacity: { duration: 0.12 },
    },
  };
}

/** The savings figure fades in under reduced motion instead of counting. */
export function counterFade(reduced: boolean): EntranceMotion {
  return {
    initial: reduced ? { opacity: 0 } : false,
    animate: { opacity: 1 },
    transition: REDUCED_FADE,
  };
}

/** Fog thins as the user buries more. */
export function fogFade(
  reduced: boolean,
  fogCleared: boolean,
): Pick<MotionProps, "animate" | "transition"> {
  return {
    animate: { opacity: fogCleared ? 0.45 : 1 },
    transition: reduced ? REDUCED_FADE : { duration: 2.4, ease: "easeOut" },
  };
}

/** The Helper panel fades in on mount, with a 6 px rise unless motion is reduced. */
export function helperPanelMotion(reduced: boolean): EntranceMotion {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: REDUCED_FADE }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: HELPER_PANEL_FADE,
      };
}

/** The disclosure panel in the Graveyard view: `collapsed` and `shown`. */
export function helperPanelVariants(reduced: boolean): Variants {
  return reduced
    ? {
        collapsed: { opacity: 0 },
        shown: { opacity: 1, transition: REDUCED_FADE },
      }
    : {
        collapsed: { opacity: 0 },
        shown: { opacity: 1, transition: HELPER_PANEL_FADE },
      };
}
