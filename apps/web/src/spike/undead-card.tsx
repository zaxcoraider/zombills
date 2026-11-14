import { AnimatePresence, motion, type Transition, type Variants } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { EyeClosedIcon, EyeOpenIcon, ShovelIcon } from "./spike-icons";
import { SUBSCRIPTION, YEARLY_CENTS, formatCents } from "./spike-data";

export type CardPhase = "undead" | "resting" | "condemned" | "sinking";

type UndeadCardProps = {
  phase: CardPhase;
  reduceMotion: boolean;
  onRest: () => void;
  onBury: () => void;
  /** The "condemned" shudder finished; time to sink. */
  onCondemned: () => void;
  /** The card is fully underground. */
  onSunk: () => void;
};

const SINK_EASE: [number, number, number, number] = [0.55, 0, 1, 0.45]; // ease-in

// Outer layer: vertical travel through the ground line (spooky-design.md, Motion rules).
const MOTION_VARIANTS: Variants = {
  below: { y: "115%" },
  risen: { y: 0, x: 0, transition: { type: "spring", stiffness: 120, damping: 14, delay: 0.3 } },
  settled: { y: 6, transition: { type: "spring", stiffness: 90, damping: 18 } },
  shudder: { x: [0, -5, 5, -4, 3, 0], transition: { duration: 0.45, ease: "easeInOut" } },
  sunk: { y: "115%", transition: { duration: 0.6, ease: SINK_EASE } },
};

// Reduced motion: opacity only, ≤ 150 ms. No "shudder": the page skips the condemned phase.
const REDUCED_VARIANTS: Variants = {
  below: { opacity: 0 },
  risen: { opacity: 1, transition: { duration: 0.15 } },
  settled: { opacity: 1, transition: { duration: 0.15 } },
  sunk: { opacity: 0, transition: { duration: 0.15 } },
};

const VARIANT_FOR_PHASE: Record<CardPhase, string> = {
  undead: "risen",
  resting: "settled",
  condemned: "shudder",
  sinking: "sunk",
};

function swayFor(
  phase: CardPhase,
  reduceMotion: boolean,
): { rotate: number | number[]; transition: Transition } {
  if (reduceMotion) return { rotate: 0, transition: { duration: 0 } };
  switch (phase) {
    case "undead":
    case "condemned":
      // The undead never quite stand still.
      return {
        rotate: [-0.9, 0.9],
        transition: { duration: 2.8, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" },
      };
    case "sinking":
      return { rotate: -2.5, transition: { duration: 0.6, ease: SINK_EASE } };
    case "resting":
      return { rotate: 0, transition: { type: "spring", stiffness: 60, damping: 12 } };
  }
}

type LabelKind = "undead" | "zombie" | "resting";

const LABELS = {
  undead: { word: "Undead", Icon: EyeOpenIcon, className: "border-moss/40 bg-moss/10 text-moss" },
  zombie: { word: "Zombie", Icon: ShovelIcon, className: "border-moss bg-moss text-night" },
  resting: {
    word: "Resting",
    Icon: EyeClosedIcon,
    className: "border-bone/20 bg-bone/5 text-bone/80",
  },
} as const;

function StateLabel({ kind, reduceMotion }: { kind: LabelKind; reduceMotion: boolean }) {
  const { word, Icon, className } = LABELS[kind];
  const offset = reduceMotion ? 0 : 4;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={kind}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.14em] ${className}`}
        initial={{ opacity: 0, y: offset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -offset }}
        transition={{ duration: 0.15 }}
      >
        <Icon className="size-4" />
        {word}
      </motion.span>
    </AnimatePresence>
  );
}

function KeptNote({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // The buttons that had focus are gone; hand focus to the outcome.
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0.15 } : { duration: 0.5, delay: 0.15 }}
    >
      <p ref={ref} tabIndex={-1} className="font-display text-[1.75rem] italic leading-tight">
        Kept. It rests.
      </p>
      <p className="mt-2 text-sm text-bone/70">
        It goes on charging {formatCents(SUBSCRIPTION.monthlyCents)} a month.
      </p>
    </motion.div>
  );
}

const BUTTON_BASE =
  "h-12 rounded-xl px-4 text-sm font-semibold aria-disabled:cursor-default cursor-pointer";

export function UndeadCard(props: UndeadCardProps) {
  const { phase, reduceMotion, onRest, onBury, onCondemned, onSunk } = props;
  const titleId = useId();
  const calm = phase === "resting";
  const deciding = phase === "undead";
  const labelKind: LabelKind = calm ? "resting" : deciding ? "undead" : "zombie";
  const sway = swayFor(phase, reduceMotion);
  const tapProps = reduceMotion || !deciding ? {} : { whileTap: { scale: 0.97 } };

  return (
    <motion.div
      variants={reduceMotion ? REDUCED_VARIANTS : MOTION_VARIANTS}
      initial="below"
      animate={VARIANT_FOR_PHASE[phase]}
      onAnimationComplete={(definition) => {
        if (definition === "shudder") onCondemned();
        if (definition === "sunk") onSunk();
      }}
    >
      <motion.div
        style={{ originX: 0.5, originY: 1 }}
        animate={{ rotate: sway.rotate }}
        transition={sway.transition}
      >
        <article
          aria-labelledby={titleId}
          className="relative w-[min(22.5rem,calc(100vw-2rem))] rounded-2xl border border-bone/10 bg-fog px-6 pb-8 pt-6"
          style={{
            boxShadow: [
              "inset 0 1px 0 color-mix(in oklab, var(--bone) 8%, transparent)",
              "0 2rem 3rem -1.5rem color-mix(in oklab, var(--night) 90%, transparent)",
            ].join(", "),
          }}
        >
          {/* Zombie styling: grave-light from below and a moss halo. Fades out when calm. */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "linear-gradient(to top, color-mix(in oklab, var(--moss) 13%, transparent), transparent 60%)",
              boxShadow: [
                "inset 0 0 0 1px color-mix(in oklab, var(--moss) 40%, transparent)",
                "0 0 2.5rem -0.25rem color-mix(in oklab, var(--moss) 30%, transparent)",
              ].join(", "),
            }}
            initial={false}
            animate={{ opacity: calm ? 0 : 1 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.9, ease: "easeOut" }}
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <StateLabel kind={labelKind} reduceMotion={reduceMotion} />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-bone/70">
                Monthly
              </span>
            </div>

            <h2 id={titleId} className="mt-6 font-display text-5xl leading-none text-bone">
              {SUBSCRIPTION.name}
            </h2>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-x-2 gap-y-2">
              <p className="flex items-baseline gap-1">
                <span className="text-[1.75rem] font-semibold leading-none">
                  {formatCents(SUBSCRIPTION.monthlyCents)}
                </span>
                <span className="text-sm text-bone/70">/month</span>
              </p>
              <motion.p
                className="flex items-baseline gap-1"
                initial={false}
                animate={{ color: calm ? "var(--bone)" : "var(--blood)" }}
                transition={{ duration: reduceMotion ? 0.15 : 0.9 }}
              >
                {/* 24px: WCAG large text, since --blood on --fog is 4.3:1. */}
                <span className="text-2xl font-semibold leading-none">
                  {formatCents(YEARLY_CENTS)}
                </span>
                <span className="text-sm text-bone/70">/year</span>
              </motion.p>
            </div>
            <p className="mt-2 text-sm text-bone/70">
              Charged every month since {SUBSCRIPTION.since}.
            </p>

            <div className="my-6 h-px bg-bone/10" />

            <div className="min-h-26">
              <AnimatePresence mode="wait" initial={false}>
                {calm ? (
                  <KeptNote key="kept" reduceMotion={reduceMotion} />
                ) : (
                  <motion.div key="ask" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <p className="font-display text-[1.75rem] italic leading-tight">
                      Still using this?
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <motion.button
                        type="button"
                        aria-disabled={!deciding}
                        {...tapProps}
                        onClick={() => deciding && onRest()}
                        className={`${BUTTON_BASE} border border-bone/25 text-bone hover:border-bone/45 hover:bg-bone/5`}
                      >
                        Yes, let it rest
                      </motion.button>
                      <motion.button
                        type="button"
                        aria-disabled={!deciding}
                        {...tapProps}
                        onClick={() => deciding && onBury()}
                        className={`${BUTTON_BASE} bg-moss text-night hover:bg-moss/90`}
                      >
                        No, bury it
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </article>
      </motion.div>
    </motion.div>
  );
}
