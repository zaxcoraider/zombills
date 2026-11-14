// The earth that closes over a buried zombie: crumbs kicked up as it sinks, then two mounds of
// soil that slide together, with clods tumbling in. Original SVG.

import { motion } from "framer-motion";
import { useId } from "react";

const SOIL_TOP = "color-mix(in oklab, var(--fog) 86%, var(--bone))";
const SOIL_BASE = "color-mix(in oklab, var(--fog) 50%, var(--night))";

/* ------------------------------------------------------------------------------------------------
 * Crumbs: small bits of earth that jump at the ground line while the card sinks.
 * Positions are px offsets from the centre of the ground line.
 * ---------------------------------------------------------------------------------------------- */

type Crumb = { x: number; drift: number; peak: number; size: number; delay: number };

const SINK_CRUMBS: Crumb[] = [
  { x: -176, drift: -14, peak: -26, size: 5, delay: 0.04 },
  { x: -150, drift: -6, peak: -16, size: 3, delay: 0.12 },
  { x: -104, drift: -8, peak: -20, size: 4, delay: 0.2 },
  { x: -48, drift: -4, peak: -12, size: 3, delay: 0.28 },
  { x: 12, drift: 4, peak: -18, size: 4, delay: 0.16 },
  { x: 70, drift: 6, peak: -14, size: 3, delay: 0.24 },
  { x: 118, drift: 10, peak: -22, size: 4, delay: 0.08 },
  { x: 160, drift: 8, peak: -18, size: 3, delay: 0.18 },
  { x: 182, drift: 16, peak: -28, size: 5, delay: 0.02 },
];

function Clump({ size }: { size: number }) {
  return (
    <span
      className="absolute block"
      style={{
        width: size,
        height: size * 0.8,
        left: -size / 2,
        top: -size / 2,
        background: SOIL_TOP,
        borderRadius: "45% 55% 40% 60%",
      }}
    />
  );
}

export function SinkCrumbs() {
  return (
    <div
      className="pointer-events-none absolute left-1/2"
      style={{ bottom: "var(--ground-h)" }}
      aria-hidden="true"
    >
      {SINK_CRUMBS.map((c, i) => (
        <motion.span
          key={i}
          className="absolute block"
          initial={{ x: c.x, y: 0, opacity: 0 }}
          animate={{ x: c.x + c.drift, y: [0, c.peak, 10], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 0.55,
            delay: c.delay,
            x: { duration: 0.55, delay: c.delay, ease: "linear" },
            y: { duration: 0.55, delay: c.delay, times: [0, 0.4, 1], ease: ["easeOut", "easeIn"] },
            opacity: { duration: 0.55, delay: c.delay, times: [0, 0.1, 0.75, 1] },
          }}
        >
          <Clump size={c.size} />
        </motion.span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Mound
 * ---------------------------------------------------------------------------------------------- */

const MOUND = { width: 400, height: 64 };
const MOUND_EDGE =
  "M0 64C26 52 44 40 78 34C104 29 118 24 146 22C172 20 186 14 212 15C240 16 256 21 284 25C318 30 350 42 372 52C384 57 394 61 400 64";
const MOUND_PATH = `${MOUND_EDGE}Z`;

type Clod = {
  from: number;
  to: number;
  peak: number;
  land: number;
  size: number;
  spin: number;
  delay: number;
};

// Shovelfuls arcing in from both sides and landing on the mound.
const CLOSING_CLODS: Clod[] = [
  { from: -200, to: -70, peak: -70, land: -30, size: 9, spin: 160, delay: 0.02 },
  { from: -180, to: -24, peak: -86, land: -38, size: 7, spin: -140, delay: 0.1 },
  { from: -160, to: -110, peak: -54, land: -20, size: 6, spin: 210, delay: 0.18 },
  { from: -140, to: 6, peak: -92, land: -40, size: 5, spin: -90, delay: 0.24 },
  { from: 200, to: 60, peak: -76, land: -32, size: 8, spin: -170, delay: 0.06 },
  { from: 176, to: 18, peak: -90, land: -40, size: 6, spin: 130, delay: 0.14 },
  { from: 158, to: 112, peak: -58, land: -18, size: 7, spin: -220, delay: 0.2 },
  { from: 132, to: -8, peak: -80, land: -38, size: 4, spin: 100, delay: 0.28 },
];

function ClosingClods() {
  return (
    <div className="absolute left-1/2" style={{ bottom: 22 }} aria-hidden="true">
      {CLOSING_CLODS.map((c, i) => (
        <motion.span
          key={i}
          className="absolute block"
          initial={{ x: c.from, y: 0, opacity: 0, rotate: 0 }}
          animate={{ x: c.to, y: [0, c.peak, c.land], opacity: [0, 1, 1, 0], rotate: c.spin }}
          transition={{
            duration: 0.7,
            delay: c.delay,
            x: { duration: 0.7, delay: c.delay, ease: "linear" },
            y: { duration: 0.7, delay: c.delay, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] },
            opacity: { duration: 0.7, delay: c.delay, times: [0, 0.1, 0.85, 1] },
          }}
        >
          <Clump size={c.size} />
        </motion.span>
      ))}
    </div>
  );
}

function MoundBody({ id }: { id: string }) {
  return (
    <>
      <path d={MOUND_PATH} fill={`url(#${id}-soil)`} />
      <g clipPath={`url(#${id}-shape)`}>
        <rect
          width={MOUND.width}
          height={MOUND.height}
          filter={`url(#${id}-grain)`}
          style={{ fill: "var(--night)" }}
          opacity="0.55"
        />
        {/* Pebbles catching moonlight, and darker clods. */}
        <g style={{ fill: "color-mix(in oklab, var(--bone) 16%, transparent)" }}>
          <ellipse cx="120" cy="34" rx="3" ry="1.6" />
          <ellipse cx="236" cy="26" rx="2.4" ry="1.3" />
          <ellipse cx="300" cy="40" rx="2" ry="1.1" />
          <ellipse cx="70" cy="48" rx="2.2" ry="1.2" />
          <ellipse cx="190" cy="22" rx="1.6" ry="1" />
        </g>
        <g style={{ fill: "color-mix(in oklab, var(--night) 55%, transparent)" }}>
          <ellipse cx="160" cy="30" rx="5" ry="2.4" />
          <ellipse cx="262" cy="34" rx="4" ry="2" />
          <ellipse cx="96" cy="42" rx="4.5" ry="2.2" />
          <ellipse cx="330" cy="48" rx="3.5" ry="1.8" />
        </g>
      </g>
      <path
        d={MOUND_EDGE}
        fill="none"
        strokeWidth="1.25"
        style={{ stroke: "color-mix(in oklab, var(--bone) 20%, transparent)" }}
      />
    </>
  );
}

type BurialMoundProps = { reduceMotion: boolean; onClosed: () => void };

export function BurialMound({ reduceMotion, onClosed }: BurialMoundProps) {
  const id = useId();

  const half = (side: "left" | "right") => {
    const from = side === "left" ? -96 : 96;
    return (
      <motion.g
        clipPath={`url(#${id}-${side})`}
        style={{ originX: 0.5, originY: 1 }}
        initial={reduceMotion ? { opacity: 0 } : { x: from, scaleY: 0.2, opacity: 0 }}
        animate={reduceMotion ? { opacity: 1 } : { x: 0, scaleY: [0.2, 1.08, 1], opacity: 1 }}
        transition={
          reduceMotion
            ? { duration: 0.15 }
            : {
                duration: 0.55,
                ease: "easeOut",
                scaleY: { duration: 0.55, times: [0, 0.75, 1], ease: "easeOut" },
                opacity: { duration: 0.12 },
              }
        }
        {...(side === "right" ? { onAnimationComplete: onClosed } : {})}
      >
        <MoundBody id={id} />
      </motion.g>
    );
  };

  return (
    <div className="relative" style={{ width: "min(25rem, 92vw)" }}>
      <svg
        className="block w-full"
        viewBox={`0 0 ${MOUND.width} ${MOUND.height}`}
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${id}-soil`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.15" style={{ stopColor: SOIL_TOP }} />
            <stop offset="1" style={{ stopColor: SOIL_BASE }} />
          </linearGradient>
          <clipPath id={`${id}-shape`}>
            <path d={MOUND_PATH} />
          </clipPath>
          {/* Halves overlap by 4 units so no seam shows where they meet. */}
          <clipPath id={`${id}-left`}>
            <rect x="-10" y="-10" width={MOUND.width / 2 + 12} height={MOUND.height + 20} />
          </clipPath>
          <clipPath id={`${id}-right`}>
            <rect
              x={MOUND.width / 2 - 2}
              y="-10"
              width={MOUND.width / 2 + 12}
              height={MOUND.height + 20}
            />
          </clipPath>
          <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={11} />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -1.5" />
            <feComposite in="SourceGraphic" operator="in" />
          </filter>
        </defs>
        {half("left")}
        {half("right")}
      </svg>
      {!reduceMotion && <ClosingClods />}
    </div>
  );
}
