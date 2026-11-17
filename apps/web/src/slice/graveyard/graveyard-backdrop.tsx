// Original SVG scenery for the graveyard. All colours come from the seven tokens in index.css,
// either directly or through color-mix(). No images, no logos.

import { motion } from "framer-motion";
import { useId, type CSSProperties } from "react";
import { FOG_DENSITIES, SKY_GLOW_ALPHA } from "../logic/scene-alphas";
import { fogFade } from "./motion";

/** Shorthand for a token mixed toward another token (or transparent). */
const mix = (token: string, pct: number, other = "transparent") =>
  `color-mix(in oklab, var(--${token}) ${pct}%, ${other === "transparent" ? other : `var(--${other})`})`;

export const SKY_BACKGROUND = `linear-gradient(to bottom, var(--night) 0%, var(--night) 22%, ${mix("fog", 65, "night")} 62%, var(--fog) 88%)`;

/* ------------------------------------------------------------------------------------------------
 * Stars: fixed positions from a seeded PRNG so they never shift between renders. Static, no
 * twinkle (no flashing content).
 * ---------------------------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; r: number; o: number };

const STAR_FIELD = { width: 1600, height: 620 };

const STARS: Star[] = (() => {
  const rand = mulberry32(1031);
  return Array.from({ length: 150 }, () => {
    const y = rand() ** 1.6 * STAR_FIELD.height; // denser near the top
    const fade = 1 - y / STAR_FIELD.height;
    return {
      x: rand() * STAR_FIELD.width,
      y,
      r: 0.45 + rand() ** 3 * 1.35,
      o: (0.25 + rand() * 0.6) * fade,
    };
  });
})();

function Stars() {
  return (
    <svg
      className="absolute inset-x-0 top-0 h-[70%] w-full"
      viewBox={`0 0 ${STAR_FIELD.width} ${STAR_FIELD.height}`}
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      {STARS.map((s, i) => (
        <g key={i} style={{ fill: "var(--bone)" }}>
          {s.r > 1.2 && <circle cx={s.x} cy={s.y} r={s.r * 4} opacity={s.o * 0.08} />}
          <circle cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Moon
 * ---------------------------------------------------------------------------------------------- */

export type MoonPlacement = "landing" | "sky";

const MOON_PLACEMENT: Record<MoonPlacement, { className: string; style: CSSProperties }> = {
  // Anchored inside the Landing Banner, which sets --moon-d (the disc diameter).
  landing: {
    className: "pointer-events-none absolute -z-10",
    style: {
      width: "calc(var(--moon-d) * 2.5)",
      height: "calc(var(--moon-d) * 2.5)",
      right: "calc(var(--moon-d) * -0.75)",
      top: "calc(12px - var(--moon-d) * 0.75)",
    },
  },
  // Fixed to the scene, in the band right of the 640 px column; hidden below 1024 px.
  sky: {
    className:
      "pointer-events-none absolute hidden aspect-square -translate-x-1/2 -translate-y-1/2 lg:block",
    style: {
      left: "calc(75% + 160px)",
      top: "17%",
      width: "calc(2.5 * min(112px, 20% - 120px))",
    },
  },
};

export function Moon({ placement }: { placement: MoonPlacement }) {
  const id = useId();
  const { className, style } = MOON_PLACEMENT[placement];
  return (
    <div className={className} style={style} aria-hidden="true">
      <div
        data-moon-glow
        className="absolute left-1/2 top-1/2 h-[56rem] w-[72rem] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `radial-gradient(closest-side, ${mix("bone", SKY_GLOW_ALPHA * 100)}, transparent 70%)`,
        }}
      />
      <svg className="absolute inset-0 size-full" viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0.38" style={{ stopColor: "var(--bone)", stopOpacity: 0.22 }} />
            <stop offset="0.6" style={{ stopColor: "var(--bone)", stopOpacity: 0.06 }} />
            <stop offset="1" style={{ stopColor: "var(--bone)", stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`${id}-disc`} cx="0.62" cy="0.36" r="0.75">
            <stop offset="0" style={{ stopColor: "var(--bone)" }} />
            <stop offset="0.7" style={{ stopColor: mix("bone", 90, "fog") }} />
            <stop offset="1" style={{ stopColor: mix("bone", 68, "fog") }} />
          </radialGradient>
          <clipPath id={`${id}-clip`}>
            <circle r="40" />
          </clipPath>
          <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        <circle data-moon-halo r="100" fill={`url(#${id}-halo)`} />
        <circle data-moon-disc r="40" fill={`url(#${id}-disc)`} />
        {/* Maria: blurred darker seas on the moon's face. */}
        <g clipPath={`url(#${id}-clip)`}>
          <g filter={`url(#${id}-soft)`} style={{ fill: "var(--fog)" }}>
            <path
              d="M-26-10c2-9 12-13 20-10 6 2 9 8 6 13-3 6-11 7-17 6-6-1-10-4-9-9Z"
              opacity="0.16"
            />
            <path d="M-6-22c4-3 11-2 13 2 1 4-3 6-8 6-4 0-7-4-5-8Z" opacity="0.12" />
            <path d="M2 4c5-5 15-4 18 2 2 6-3 11-10 11-6 0-11-6-8-13Z" opacity="0.14" />
            <path d="M-22 12c3-3 9-2 10 2 1 4-3 7-7 6-4 0-5-5-3-8Z" opacity="0.11" />
            <ellipse cx="6" cy="25" rx="6" ry="3.5" opacity="0.1" />
          </g>
          <g style={{ fill: "var(--fog)" }}>
            <circle cx="18" cy="-18" r="2" opacity="0.12" />
            <circle cx="-25" cy="3" r="1.4" opacity="0.1" />
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Hills: two silhouettes, the far one lighter (atmospheric depth).
 * ---------------------------------------------------------------------------------------------- */

function Hills() {
  return (
    <svg
      className="absolute inset-x-0 h-[clamp(5rem,17vh,11rem)] w-full"
      style={{ bottom: "var(--ground-h)" }}
      viewBox="0 0 1600 200"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 112C150 74 300 58 470 86S790 150 980 112S1330 34 1600 80V200H0Z"
        style={{ fill: mix("fog", 72, "night") }}
      />
      <path
        d="M0 112C150 74 300 58 470 86S790 150 980 112S1330 34 1600 80"
        fill="none"
        style={{ stroke: mix("bone", 5) }}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0 164C220 132 430 150 660 166S1020 138 1230 148S1480 170 1600 156V200H0Z"
        style={{ fill: mix("fog", 38, "night") }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Fog: fractal noise rendered once per band, then translated in a seamless loop. The two tiles in
 * a band share one stitched filter, so the seam between them is invisible.
 * ---------------------------------------------------------------------------------------------- */

type FogBandProps = {
  seed: number;
  style: CSSProperties;
  density: number;
  durationS: number;
  direction: 1 | -1;
  /** Drift is paused at the first point of the loop (reduced motion, or the Landing view). */
  still: boolean;
};

const FOG_TILE = { width: 1600, height: 240 };

function FogBand({ seed, style, density, durationS, direction, still }: FogBandProps) {
  const filterId = `${useId()}-fog`;
  const loop: [string, string] = direction === 1 ? ["-50%", "0%"] : ["0%", "-50%"];
  const tile = (
    <svg
      className="h-full w-1/2"
      viewBox={`0 0 ${FOG_TILE.width} ${FOG_TILE.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width={FOG_TILE.width} height={FOG_TILE.height} filter={`url(#${filterId})`} />
    </svg>
  );

  return (
    <div
      className="pointer-events-none absolute inset-x-0 overflow-clip"
      style={{
        ...style,
        opacity: density,
        maskImage:
          "linear-gradient(to bottom, transparent, var(--night) 35%, var(--night) 70%, transparent)",
      }}
      aria-hidden="true"
      data-backdrop-fog
    >
      <svg width="0" height="0" className="absolute">
        <filter
          id={filterId}
          x="0"
          y="0"
          width={FOG_TILE.width}
          height={FOG_TILE.height}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.002 0.022"
            numOctaves={4}
            seed={seed}
            stitchTiles="stitch"
          />
          {/* Noise brightness → alpha, so only the thicker wisps show. */}
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.95" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </svg>
      <motion.div
        className="flex h-full w-[200%]"
        style={{ fill: "var(--bone)", willChange: "transform" }}
        initial={{ x: loop[0] }}
        animate={still ? { x: loop[0] } : { x: loop }}
        transition={
          still ? { duration: 0 } : { duration: durationS, ease: "linear", repeat: Infinity }
        }
      >
        {tile}
        {tile}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Fence: low wrought-iron run with spear finials and a capped post every eighth picket.
 * ---------------------------------------------------------------------------------------------- */

const FENCE_H = 72;

function Fence() {
  const id = useId();
  return (
    <svg
      className="absolute inset-x-0 w-full"
      style={{ bottom: "calc(var(--ground-h) - 2px)", height: FENCE_H }}
      aria-hidden="true"
    >
      <defs>
        <pattern id={`${id}-pickets`} width="32" height={FENCE_H} patternUnits="userSpaceOnUse">
          <g style={{ fill: "var(--night)" }}>
            <path d="M16 6l3.4 7.2h-1.8V16h-3.2v-2.8h-1.8Z" />
            <rect x="14.6" y="16" width="2.8" height={FENCE_H - 16} />
          </g>
          {/* Moonlight catches the right edge of each picket. */}
          <rect
            x="16.8"
            y="16"
            width="0.8"
            height={FENCE_H - 16}
            style={{ fill: mix("bone", 9) }}
          />
        </pattern>
        <pattern id={`${id}-posts`} width="256" height={FENCE_H} patternUnits="userSpaceOnUse">
          <g style={{ fill: "var(--night)" }}>
            <circle cx="128" cy="5" r="4.5" />
            <rect x="121" y="9" width="14" height="4" rx="1" />
            <rect x="123" y="13" width="10" height={FENCE_H - 13} />
          </g>
          <rect
            x="131"
            y="13"
            width="1.2"
            height={FENCE_H - 13}
            style={{ fill: mix("bone", 10) }}
          />
          <circle cx="129.6" cy="3.6" r="1.4" style={{ fill: mix("bone", 14) }} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-pickets)`} />
      <g style={{ fill: "var(--night)" }}>
        <rect y="22" width="100%" height="3" />
        <rect y={FENCE_H - 16} width="100%" height="3" />
      </g>
      <rect y="22" width="100%" height="0.75" style={{ fill: mix("bone", 10) }} />
      <rect width="100%" height="100%" fill={`url(#${id}-posts)`} />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Ground: the earth the undead rise from. Its top edge is the ground line.
 * ---------------------------------------------------------------------------------------------- */

export const GROUND_TOP = mix("fog", 58, "night");

function GrassTufts() {
  const id = useId();
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 w-full"
      style={{ bottom: "calc(var(--ground-h) - 6px)", height: 20 }}
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} width="184" height="20" patternUnits="userSpaceOnUse">
          <path
            style={{ fill: GROUND_TOP }}
            d="M8 20l2-11 1.6 11Zm3 0 4.5-14L15 20Zm4 0-1-8 3.4 8ZM58 20l1.4-8 1.4 8Zm2.4 0 3.6-11L63.6 20ZM104 20l2.4-13 1 13Zm2.6 0 3.8-9-1.4 9Zm2.2 0-.8-15 3 15ZM150 20l1.2-7 1.6 7Zm2.4 0 2.8-10-.8 10Z"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function Ground() {
  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "var(--ground-h)",
          background: [
            // Moonlight pooling where the card stands, to draw the eye there.
            `radial-gradient(ellipse min(30rem, 70vw) 70% at 50% 0%, ${mix("bone", 7)}, transparent 70%)`,
            `linear-gradient(to bottom, ${GROUND_TOP} 0%, ${mix("fog", 30, "night")} 35%, var(--night) 100%)`,
          ].join(", "),
          boxShadow: `inset 0 1px 0 ${mix("bone", 14)}`,
        }}
        aria-hidden="true"
      />
      <GrassTufts />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Composed layers. Fog thins as you bury (design.md: "fog clears as you bury more").
 * ---------------------------------------------------------------------------------------------- */

type LayerProps = { reduceMotion: boolean; fogCleared: boolean; fogStill: boolean };

/** Everything behind the card: sky, stars, moon, hills, far fog, fence, low fog. */
export function BackdropLayers({
  reduceMotion,
  fogCleared,
  fogStill,
  moon,
}: LayerProps & { moon: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Stars />
      {moon && <Moon placement="sky" />}
      <Hills />
      <motion.div className="absolute inset-0" {...fogFade(reduceMotion, fogCleared)}>
        <FogBand
          seed={7}
          style={{ bottom: "calc(var(--ground-h) + 1.5rem)", height: "15rem" }}
          density={FOG_DENSITIES[0]}
          durationS={40}
          direction={-1}
          still={fogStill}
        />
      </motion.div>
      <Fence />
      <motion.div className="absolute inset-0" {...fogFade(reduceMotion, fogCleared)}>
        <FogBand
          seed={23}
          style={{ bottom: "calc(var(--ground-h) - 2.5rem)", height: "9rem" }}
          density={FOG_DENSITIES[1]}
          durationS={28}
          direction={1}
          still={fogStill}
        />
      </motion.div>
    </div>
  );
}

/** Fog in front of the earth. Stays below the ground line so it never covers the card. */
export function ForegroundFog({ reduceMotion, fogCleared, fogStill }: LayerProps) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      {...fogFade(reduceMotion, fogCleared)}
    >
      <FogBand
        seed={61}
        style={{ bottom: "-2rem", height: "calc(var(--ground-h) + 2rem)" }}
        density={FOG_DENSITIES[2]}
        durationS={22}
        direction={-1}
        still={fogStill}
      />
    </motion.div>
  );
}
