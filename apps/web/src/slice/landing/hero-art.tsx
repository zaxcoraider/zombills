import { useId } from "react";
import type { LandingMotion } from "./use-landing-motion";

// Colours go through color-mix() over the seven tokens, as in the night scene.
const mix = (token: string, pct: number, other = "transparent") =>
  `color-mix(in oklab, var(--${token}) ${pct}%, ${other === "transparent" ? other : `var(--${other})`})`;

const GROUND = mix("fog", 58, "night");
const STONE_FACE = mix("bone", 20, "fog");
const STONE_EDGE = mix("bone", 14);
const GROOVE = mix("night", 60);
const SHEET = mix("bone", 88);

/**
 * A ghost rising over a tombstone, still. Decorative: hidden from assistive technology, not
 * focusable, no text and no external reference. Its only `url()` values point at its own ids.
 */
export function HeroArt({ motion }: { motion: LandingMotion }) {
  const id = useId();
  const groundId = `${id}-ground`;
  const glowId = `${id}-glow`;
  const stoneId = `${id}-stone`;
  const fadeId = `${id}-fade`;
  const fadeUpId = `${id}-fade-up`;
  const fadeSideId = `${id}-fade-side`;
  const fadeDownId = `${id}-fade-down`;
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
      data-hero-art=""
      data-motion={motion}
      className="zb-art h-24 w-32 self-center max-sm:[@media(min-height:700px)]:h-48 max-sm:[@media(min-height:700px)]:w-64 sm:h-32 sm:w-[10.5rem] sm:max-lg:[@media(min-height:700px)]:h-[15.75rem] sm:max-lg:[@media(min-height:700px)]:w-[21rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[16.5rem] lg:w-[22rem] lg:self-start 2xl:h-[19.5rem] 2xl:w-[26rem]"
    >
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor="var(--bone)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--bone)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={stoneId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={STONE_FACE} />
          <stop offset="1" stopColor={mix("bone", 12, "fog")} />
        </linearGradient>
        <clipPath id={groundId}>
          <rect x="0" y="96" width="160" height="24" />
        </clipPath>
        {/* Vertical fade: alpha 1 down to y 110, 0 from y 117 (so 0 at y 120 and in the last 2 px). */}
        <mask
          id={fadeDownId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="160"
          height="120"
          style={{ maskType: "alpha" }}
        >
          <linearGradient id={fadeUpId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--night)" stopOpacity="1" />
            <stop offset={110 / 120} stopColor="var(--night)" stopOpacity="1" />
            <stop offset={117 / 120} stopColor="var(--night)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--night)" stopOpacity="0" />
          </linearGradient>
          <rect x="0" y="0" width="160" height="120" fill={`url(#${fadeUpId})`} />
        </mask>
        {/* Product of the two fades: horizontal (0 up to x 3, 1 from x 28 to 132, 0 from x 157) times the vertical one. */}
        <mask
          id={fadeId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="160"
          height="120"
          style={{ maskType: "alpha" }}
        >
          <linearGradient id={fadeSideId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--night)" stopOpacity="0" />
            <stop offset={3 / 160} stopColor="var(--night)" stopOpacity="0" />
            <stop offset={28 / 160} stopColor="var(--night)" stopOpacity="1" />
            <stop offset={132 / 160} stopColor="var(--night)" stopOpacity="1" />
            <stop offset={157 / 160} stopColor="var(--night)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--night)" stopOpacity="0" />
          </linearGradient>
          <g mask={`url(#${fadeDownId})`}>
            <rect x="0" y="0" width="160" height="120" fill={`url(#${fadeSideId})`} />
          </g>
        </mask>
      </defs>
      <ellipse className="zb-hero-glow" cx="80" cy="62" rx="74" ry="56" fill={`url(#${glowId})`} />
      <g mask={`url(#${fadeId})`}>
        <path d="M0 120 L0 112 Q40 102 80 106 Q120 102 160 112 L160 120 Z" fill={GROUND} />
        <g clipPath={`url(#${groundId})`}>
          <ellipse
            className="zb-fog-a"
            cx="54"
            cy="108"
            rx="40"
            ry="6"
            fill="var(--bone)"
            opacity="0.1"
          />
          <ellipse
            className="zb-fog-b"
            cx="112"
            cy="113"
            rx="34"
            ry="5"
            fill="var(--bone)"
            opacity="0.07"
          />
        </g>
      </g>
      <g className="zb-ghost-lean">
        <g className="zb-ghost-rise">
          <path
            d="M62 62 L62 32 A18 18 0 0 1 98 32 L98 62 Q93 57 89 62 Q84 67 80 62 Q76 57 71 62 Q66 67 62 62 Z"
            fill={SHEET}
            opacity="0.92"
          />
          <ellipse cx="73" cy="32" rx="3" ry="4.5" fill="var(--night)" />
          <ellipse cx="87" cy="32" rx="3" ry="4.5" fill="var(--night)" />
        </g>
      </g>
      <path
        d="M52 108 L52 80 A28 28 0 0 1 108 80 L108 108 Z"
        fill={`url(#${stoneId})`}
        stroke={STONE_EDGE}
        strokeWidth="1.5"
      />
      <path d="M68 78 H92 M72 88 H88" stroke={GROOVE} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
