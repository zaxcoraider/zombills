// The Grave drop area's art (pro-polish "Signature moments: 3"): an open pit and the ghost that
// rests in it. Tokens only, through color-mix(); no text, images or external references.

import { motion } from "framer-motion";
import {
  GRAVE_GHOST_REST_Y,
  GRAVE_GHOST_RETURN,
  GRAVE_GHOST_RISE,
  GRAVE_GHOST_RISE_Y,
  GRAVE_GLOW_FADE,
  REDUCED_FADE,
} from "../graveyard/motion";
import { PIT_GLOW_ALPHA } from "../logic/design-tokens";

/** E: the earth ring around the pit, a dark brown that reads apart from the blue-grey Card. */
export const GRAVE_EARTH = "color-mix(in oklab, var(--night) 85%, var(--ember))";
/** The pit: night at the top to `mix(night 85 %, fog)` at the bottom. */
export const PIT_BACKGROUND =
  "linear-gradient(to bottom, var(--night), color-mix(in oklab, var(--night) 85%, var(--fog)))";
/** The moss glow in the pit, at `PIT_GLOW_ALPHA` in the centre and clear at the edges. */
export const PIT_GLOW_BACKGROUND = `radial-gradient(closest-side, color-mix(in oklab, var(--moss) ${Math.round(
  PIT_GLOW_ALPHA * 100,
)}%, transparent), transparent)`;
/** The grave's one outline, bone at 50 %. */
export const GRAVE_OUTLINE = "color-mix(in oklab, var(--bone) 50%, transparent)";

export interface GraveArtProps {
  /** A file is over the drop target and the area is not disabled. */
  dragging: boolean;
  reduceMotion: boolean;
}

/**
 * The open grave, drawn in CSS so every edge follows the `rounded-card` corners: the earth, the
 * pit at an even 12 px inset with a 4 px radius (16 − 12, so it nests in the Card radius), its
 * moss glow, then one outline and one moss rim glow on the grave's own rounded edge.
 */
export function GravePit({ dragging, reduceMotion }: GraveArtProps) {
  const glow = { opacity: dragging ? 1 : 0 };
  const transition = reduceMotion ? REDUCED_FADE : GRAVE_GLOW_FADE;
  return (
    <div
      data-grave-pit=""
      aria-hidden="true"
      className="absolute inset-0 overflow-clip rounded-card"
      style={{ background: GRAVE_EARTH }}
    >
      <div
        data-pit=""
        className="absolute inset-3 overflow-clip rounded-[4px]"
        style={{ background: PIT_BACKGROUND }}
      >
        <motion.div
          data-pit-glow=""
          className="absolute inset-0"
          style={{ background: PIT_GLOW_BACKGROUND }}
          initial={false}
          animate={glow}
          transition={transition}
        />
      </div>
      <div
        data-grave-outline=""
        className="absolute inset-0 rounded-card border-2"
        style={{ borderColor: GRAVE_OUTLINE }}
      />
      <motion.div
        data-rim-glow=""
        className="absolute inset-0 rounded-card border-[3px]"
        style={{ borderColor: "var(--moss)" }}
        initial={false}
        animate={glow}
        transition={transition}
      />
    </div>
  );
}

/** The ghost resting in the grave. It rises 16 px while a file is over the drop target. */
export function RestingGhost({ dragging, reduceMotion }: GraveArtProps) {
  const risen = dragging && !reduceMotion;
  return (
    <motion.svg
      data-resting-ghost=""
      width="40"
      height="56"
      viewBox="0 0 40 56"
      aria-hidden="true"
      focusable="false"
      initial={false}
      animate={{ y: risen ? GRAVE_GHOST_RISE_Y : GRAVE_GHOST_REST_Y }}
      transition={risen ? GRAVE_GHOST_RISE : GRAVE_GHOST_RETURN}
    >
      <path
        d="M2 50 L2 20 A18 18 0 0 1 38 20 L38 50 Q33 45 29 50 Q24 55 20 50 Q16 45 11 50 Q6 55 2 50 Z"
        style={{ fill: "var(--bone)", opacity: 0.92 }}
      />
      <ellipse cx="13" cy="20" rx="3" ry="4.5" style={{ fill: "var(--night)" }} />
      <ellipse cx="27" cy="20" rx="3" ry="4.5" style={{ fill: "var(--night)" }} />
    </motion.svg>
  );
}
