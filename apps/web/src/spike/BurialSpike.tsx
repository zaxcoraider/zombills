// Throwaway art spike: one undead card, the burial, the tombstone and the savings counter.
// Tests whether the haunted UI in spooky-design.md is achievable. Not production code.

import { motion, useReducedMotion } from "framer-motion";
import { useState, type CSSProperties } from "react";
import { BurialMound, SinkCrumbs } from "./burial-earth";
import { BackdropLayers, ForegroundFog, Ground, SKY_BACKGROUND } from "./graveyard-backdrop";
import { SavingsCounter } from "./savings-counter";
import { SUBSCRIPTION, YEARLY_CENTS, formatCents } from "./spike-data";
import { ReplayIcon } from "./spike-icons";
import { Tombstone } from "./tombstone";
import { UndeadCard, type CardPhase } from "./undead-card";

/**
 * undead → resting                                  ("Yes, let it rest")
 * undead → condemned → sinking → closing → buried   ("No, bury it")
 * Reduced motion skips "condemned" (the shudder is pure motion).
 */
type Phase = CardPhase | "closing" | "buried";

const SCENE_STYLE = {
  // Height of the earth band. Everything that rises or sinks is measured from its top edge.
  "--ground-h": "clamp(7rem, 24svh, 15rem)",
  background: SKY_BACKGROUND,
} as CSSProperties;

const VIGNETTE =
  "radial-gradient(ellipse 85% 80% at 50% 55%, transparent 55%, color-mix(in oklab, var(--night) 70%, transparent) 100%)";

function announcement(phase: Phase): string {
  if (phase === "resting") return `${SUBSCRIPTION.name} rests. Kept.`;
  if (phase === "buried") {
    return `${SUBSCRIPTION.name} is buried. Saves ${formatCents(YEARLY_CENTS)} a year.`;
  }
  return "";
}

export function BurialSpike() {
  const reduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("undead");
  const [run, setRun] = useState(0);

  const advance = (from: Phase, to: Phase) => setPhase((p) => (p === from ? to : p));

  const cardPhase = phase === "closing" || phase === "buried" ? null : phase;
  const earthShown = phase === "closing" || phase === "buried";
  const buried = phase === "buried";

  return (
    <main className="relative isolate h-svh min-h-160 overflow-clip text-bone" style={SCENE_STYLE}>
      <BackdropLayers reduceMotion={reduceMotion} fogCleared={buried} />

      {/* Stage: clipped at the ground line, so whatever is below it is underground. */}
      <div className="absolute inset-x-0 top-0 overflow-clip" style={{ bottom: "var(--ground-h)" }}>
        {cardPhase && (
          <div className="absolute inset-x-0 -bottom-3 flex justify-center">
            <UndeadCard
              key={run}
              phase={cardPhase}
              reduceMotion={reduceMotion}
              onRest={() => advance("undead", "resting")}
              onBury={() => advance("undead", reduceMotion ? "sinking" : "condemned")}
              onCondemned={() => advance("condemned", "sinking")}
              onSunk={() => advance("sinking", "closing")}
            />
          </div>
        )}
        {buried && (
          <div className="absolute inset-x-0 -bottom-7 flex justify-center">
            <Tombstone key={run} reduceMotion={reduceMotion} />
          </div>
        )}
      </div>

      <Ground />

      {phase === "sinking" && !reduceMotion && <SinkCrumbs key={run} />}

      {earthShown && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ bottom: "calc(var(--ground-h) - 22px)" }}
        >
          <BurialMound
            key={run}
            reduceMotion={reduceMotion}
            onClosed={() => advance("closing", "buried")}
          />
        </div>
      )}

      <ForegroundFog reduceMotion={reduceMotion} fogCleared={buried} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: VIGNETTE }}
      />

      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-8">
        <h1 className="font-display text-[1.75rem] leading-none text-bone sm:text-[2rem]">
          Zombills
        </h1>
        <SavingsCounter cents={buried ? YEARLY_CENTS : 0} reduceMotion={reduceMotion} />
      </header>

      <motion.button
        type="button"
        onClick={() => {
          setPhase("undead");
          setRun((r) => r + 1);
        }}
        {...(reduceMotion ? {} : { whileTap: { scale: 0.96 } })}
        className="absolute bottom-4 right-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-bone/20 bg-night/60 px-4 text-sm font-medium text-bone hover:border-bone/40 hover:bg-fog sm:bottom-8 sm:right-8"
      >
        <ReplayIcon className="size-4" />
        Replay
      </motion.button>

      <p role="status" className="sr-only">
        {announcement(phase)}
      </p>
    </main>
  );
}
