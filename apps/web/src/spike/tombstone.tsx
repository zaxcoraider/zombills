// Original SVG headstone with the epitaph set as real text (money is never an image).

import { motion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { SUBSCRIPTION, YEARLY_CENTS, formatCents } from "./spike-data";

const STONE = { width: 300, height: 400 };
const SLAB = "M24 400V140C24 68 80 18 150 18C220 18 276 68 276 140V400Z";
const BEVEL = "M42 400V144C42 84 90 36 150 36C210 36 258 84 258 144V400";

const stone = (bonePct: number) => `color-mix(in oklab, var(--fog) ${100 - bonePct}%, var(--bone))`;

function StoneArt() {
  const id = useId();
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox={`0 0 ${STONE.width} ${STONE.height}`}
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-face`} x1="0.85" y1="0" x2="0.15" y2="1">
          <stop offset="0" style={{ stopColor: stone(20) }} />
          <stop offset="0.5" style={{ stopColor: stone(15) }} />
          <stop offset="1" style={{ stopColor: stone(10) }} />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: "color-mix(in oklab, var(--fog) 80%, var(--night))" }}
          />
          <stop offset="1" style={{ stopColor: "var(--night)" }} />
        </linearGradient>
        <radialGradient id={`${id}-moonlight`} cx="0.78" cy="0.08" r="0.7">
          <stop offset="0" style={{ stopColor: "var(--bone)", stopOpacity: 0.08 }} />
          <stop offset="1" style={{ stopColor: "var(--bone)", stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={`${id}-slab`}>
          <path d={SLAB} />
        </clipPath>
        {/* Fine grain of the stone. */}
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -1.7" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
        {/* Broad weathering stains. */}
        <filter id={`${id}-stains`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves={3} seed={19} />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.95" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* Depth: the shadowed left flank of the stone. */}
      <path d={SLAB} transform="translate(-9 5)" fill={`url(#${id}-side)`} />
      <path d={SLAB} fill={`url(#${id}-face)`} />

      <g clipPath={`url(#${id}-slab)`}>
        <rect
          width="100%"
          height="100%"
          filter={`url(#${id}-stains)`}
          style={{ fill: "var(--night)" }}
          opacity="0.3"
        />
        <rect
          width="100%"
          height="100%"
          filter={`url(#${id}-grain)`}
          style={{ fill: "var(--night)" }}
          opacity="0.4"
        />
        <rect width="100%" height="100%" fill={`url(#${id}-moonlight)`} />

        {/* Bevelled inner border: a dark cut with a moonlit lip. */}
        <path
          d={BEVEL}
          fill="none"
          strokeWidth="1.5"
          style={{ stroke: "color-mix(in oklab, var(--night) 45%, transparent)" }}
        />
        <path
          d={BEVEL}
          transform="translate(0.5 1.5)"
          fill="none"
          strokeWidth="1"
          style={{ stroke: "color-mix(in oklab, var(--bone) 12%, transparent)" }}
        />

        {/* A hairline crack running in from the right shoulder. */}
        <path
          d="M276 112l-12 10 4 9-13 14 3 8-9 12"
          fill="none"
          strokeWidth="1.25"
          strokeLinejoin="round"
          style={{ stroke: "color-mix(in oklab, var(--night) 60%, transparent)" }}
        />
        <path
          d="M276 113.5l-11 9.5 4 9-13 14 3 8-9 12"
          transform="translate(0.8 0.8)"
          fill="none"
          strokeWidth="0.75"
          style={{ stroke: "color-mix(in oklab, var(--bone) 10%, transparent)" }}
        />
      </g>

      {/* Moonlit rim along the arch. */}
      <path
        d={SLAB}
        fill="none"
        strokeWidth="1"
        style={{ stroke: "color-mix(in oklab, var(--bone) 14%, transparent)" }}
      />
    </svg>
  );
}

function Flourish({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 12"
      className={className}
      fill="none"
      strokeWidth="1"
      strokeLinecap="round"
      style={{ stroke: "color-mix(in oklab, var(--bone) 45%, transparent)" }}
      aria-hidden="true"
    >
      <path d="M4 6h34M58 6h34" />
      <path d="M48 1.5 52.5 6 48 10.5 43.5 6Z" />
      <circle
        cx="40.5"
        cy="6"
        r="0.9"
        style={{ fill: "color-mix(in oklab, var(--bone) 45%, transparent)" }}
      />
      <circle
        cx="55.5"
        cy="6"
        r="0.9"
        style={{ fill: "color-mix(in oklab, var(--bone) 45%, transparent)" }}
      />
    </svg>
  );
}

export function Tombstone({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  // The "No, bury it" button is gone; hand focus to the outcome.
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="relative aspect-[3/4] w-[min(18.75rem,calc(100vw-3rem))]"
      initial={reduceMotion ? { opacity: 0 } : { y: "105%" }}
      animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 80, damping: 12, delay: 0.05 }
      }
    >
      {/* A slight lean: old stones never stand quite straight. Static, not motion. */}
      <div className="absolute inset-0 -rotate-[1.2deg]">
        <StoneArt />
        <div className="engraved absolute inset-x-[15%] top-[15%] flex flex-col items-center text-center">
          <Flourish className="w-20" />
          <p className="mt-2 font-display text-xl italic leading-none text-bone/90">
            <span id={titleId}>
              Here lies{" "}
              <span className="mt-2 block text-[2.75rem] not-italic text-bone">
                {SUBSCRIPTION.name}.
              </span>
            </span>
          </p>
          <p className="mt-4 font-display text-[1.0625rem] italic leading-snug text-balance text-bone/90">
            Fed on you every month since {SUBSCRIPTION.since}.
          </p>
          <Flourish className="mt-4 w-16" />
          <p className="mt-4 leading-none">
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-bone/90">
              Saves
            </span>
            <span className="mt-2 block">
              <span className="text-[1.75rem] font-semibold text-moss">
                {formatCents(YEARLY_CENTS)}
              </span>
              <span className="text-base text-bone/90">/year.</span>
            </span>
          </p>
        </div>
      </div>
    </motion.section>
  );
}
