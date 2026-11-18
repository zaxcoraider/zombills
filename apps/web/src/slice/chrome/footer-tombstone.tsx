// One stone of the Footer graveyard: an arched SVG headstone in the style of the app's Tombstone,
// with its label engraved as real HTML text. On hover or keyboard focus the stone lifts and a
// small ghost rises fully above its top (pro-polish Req 2.7 to 2.9, 2.14; amended 2026-11-18).

import { motion } from "framer-motion";
import { useId } from "react";
import { PEEK_GHOST_VARIANTS, stoneOutlineVariants, stoneVariants } from "../graveyard/motion";

/** Room above the stone, inside the control, for the risen ghost (px). */
export const GHOST_HEADROOM = 44;
/** The ghost's top sits this far below the stone top at rest, hidden behind the stone (px). */
export const GHOST_REST_INSET = 8;
/** Ghost size (px). */
export const GHOST_W = 28;
export const GHOST_H = 34;

/** Stone heights in rem, one per place in the row, so the four read as a little graveyard. */
export const FOOTER_STONE_HEIGHTS = [7.5, 7, 7.25, 6.75] as const;

const VIEW_W = 160;

export interface FooterTombstoneProps {
  label: string;
  reduceMotion: boolean;
  /** Place in the row, 0 to 3: picks the stone's height and crack. */
  place?: number;
  /** An `a` when set, else a `button` */
  href?: string;
  describedBy?: string;
  onActivate?: () => void;
}

// No box ring: the focus ring is the moss outline and glow drawn on the stone's own silhouette
// (StoneOutline), so a focused stone still reads as a tombstone, not a button.
const CONTROL_CLASS =
  "relative isolate mx-auto block w-full min-w-[96px] max-w-[10rem] text-center focus-visible:outline-none";

/** The arched slab, `VIEW_W` wide and `h` tall, standing on its bottom edge. */
function slab(h: number): string {
  return `M8 ${h}V76C8 30 40 4 80 4C120 4 152 30 152 76V${h}Z`;
}

/** The engraved rim, 10 units inside the slab. */
function rim(h: number): string {
  return `M18 ${h}V78C18 40 46 14 80 14C114 14 142 40 142 78V${h}`;
}

const stone = (bonePct: number) => `color-mix(in oklab, var(--fog) ${100 - bonePct}%, var(--bone))`;

/** Hairline cracks, one per place; odd places crack from the left shoulder. */
const CRACKS = [
  "M152 58l-9 8 3 7-10 11 2 6",
  "M8 64l8 7-2 8 9 9",
  "M152 70l-7 6 2 8-8 7",
  "M8 54l9 6-3 9 8 8-1 6",
] as const;

function StoneArt({ h, place }: { h: number; place: number }) {
  const id = useId();
  const crack = CRACKS[place % CRACKS.length] ?? CRACKS[0];
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${h}`}
      preserveAspectRatio="none"
      className="block size-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-face`} x1="0.85" y1="0" x2="0.15" y2="1">
          <stop offset="0" style={{ stopColor: stone(18) }} />
          <stop offset="0.5" style={{ stopColor: stone(13) }} />
          <stop offset="1" style={{ stopColor: stone(8) }} />
        </linearGradient>
        <clipPath id={`${id}-slab`}>
          <path d={slab(h)} />
        </clipPath>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={place + 4} />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -1.7" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </defs>
      {/* The shadowed flank, then the face. */}
      <path
        d={slab(h)}
        transform="translate(-4 2)"
        style={{ fill: "color-mix(in oklab, var(--fog) 70%, var(--night))" }}
      />
      <path d={slab(h)} fill={`url(#${id}-face)`} />
      <g clipPath={`url(#${id}-slab)`}>
        <rect
          width="100%"
          height="100%"
          filter={`url(#${id}-grain)`}
          style={{ fill: "var(--night)" }}
          opacity="0.35"
        />
        {/* Engraved rim: a dark cut with a moonlit lip. */}
        <path
          d={rim(h)}
          fill="none"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "color-mix(in oklab, var(--night) 50%, transparent)" }}
        />
        <path
          d={rim(h)}
          transform="translate(0.6 1.2)"
          fill="none"
          strokeWidth="0.75"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "color-mix(in oklab, var(--bone) 14%, transparent)" }}
        />
        <path
          d={crack}
          fill="none"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "color-mix(in oklab, var(--night) 60%, transparent)" }}
        />
      </g>
      {/* Moonlit edge along the arch. */}
      <path
        d={slab(h)}
        fill="none"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: "color-mix(in oklab, var(--bone) 18%, transparent)" }}
      />
    </svg>
  );
}

/** The moss outline drawn on the same silhouette: the hover and focus state. */
function StoneOutline({ h }: { h: number }) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${h}`}
      preserveAspectRatio="none"
      className="block size-full overflow-visible"
      style={{ filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--moss) 55%, transparent))" }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={slab(h)}
        fill="none"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: "var(--moss)" }}
      />
    </svg>
  );
}

/** A small cream ghost: a domed body with two oval eyes and no mouth. */
export function PeekGhost() {
  return (
    <svg viewBox="0 0 28 34" className="block size-full" aria-hidden="true" focusable="false">
      <path
        d="M0 34V14A14 14 0 0 1 28 14V34l-4.7-4-4.6 4-4.7-4-4.7 4-4.6-4Z"
        style={{ fill: "var(--bone)", fillOpacity: 0.95 }}
      />
      <ellipse cx="9.5" cy="12" rx="2.2" ry="3.4" style={{ fill: "var(--night)" }} />
      <ellipse cx="18.5" cy="12" rx="2.2" ry="3.4" style={{ fill: "var(--night)" }} />
    </svg>
  );
}

function StoneParts({
  label,
  reduceMotion,
  place,
}: Pick<FooterTombstoneProps, "label" | "reduceMotion"> & { place: number }) {
  const lift = stoneVariants(reduceMotion);
  const heightRem = FOOTER_STONE_HEIGHTS[place % FOOTER_STONE_HEIGHTS.length] ?? 7;
  const h = heightRem * 16;
  return (
    <span className="relative block" style={{ height: `${heightRem}rem` }}>
      {reduceMotion ? null : (
        <motion.span
          data-peek-ghost=""
          aria-hidden="true"
          className="absolute left-1/2 z-0"
          style={{
            top: GHOST_REST_INSET,
            width: GHOST_W,
            height: GHOST_H,
            marginLeft: -GHOST_W / 2,
          }}
          variants={PEEK_GHOST_VARIANTS}
        >
          <PeekGhost />
        </motion.span>
      )}
      <motion.span
        data-stone-face=""
        aria-hidden="true"
        className="absolute inset-0 z-[1] block"
        variants={lift}
      >
        <StoneArt h={h} place={place} />
      </motion.span>
      <motion.span
        data-stone-outline=""
        aria-hidden="true"
        className="absolute inset-0 z-[3] block"
        variants={stoneOutlineVariants(reduceMotion)}
      >
        <StoneOutline h={h} />
      </motion.span>
      {/* The engraving: the same box, the same distance above the ground on every stone, with
          the text centred in it, so one- and two-line labels share one centre line. */}
      <motion.span
        data-stone-label=""
        className="engraved absolute inset-x-[10%] bottom-[1.75rem] z-[2] flex min-h-[2.5rem] items-center justify-center font-display text-base leading-tight text-bone [overflow-wrap:anywhere]"
        variants={lift}
      >
        {label}
      </motion.span>
    </span>
  );
}

export function FooterTombstone({
  label,
  reduceMotion,
  place = 0,
  href,
  describedBy,
  onActivate,
}: FooterTombstoneProps) {
  // `animate="rest"` makes the return from a gesture use the `rest` variant and its STONE_REST
  // tween; without it Framer Motion falls back to its default spring, which settles late.
  const gesture = {
    initial: "rest",
    animate: "rest",
    whileHover: "peek",
    whileFocus: "peek",
  } as const;
  const style = { paddingTop: GHOST_HEADROOM };
  if (href !== undefined) {
    return (
      <motion.a
        data-exempt="footer-tombstone"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={describedBy}
        className={CONTROL_CLASS}
        style={style}
        {...gesture}
      >
        <StoneParts label={label} reduceMotion={reduceMotion} place={place} />
      </motion.a>
    );
  }
  return (
    <motion.button
      type="button"
      data-exempt="footer-tombstone"
      aria-describedby={describedBy}
      className={CONTROL_CLASS}
      style={style}
      onClick={onActivate}
      {...gesture}
    >
      <StoneParts label={label} reduceMotion={reduceMotion} place={place} />
    </motion.button>
  );
}
