import type { Cadence, ClassifiedSubscription } from "@zombills/core";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useId } from "react";
import { CADENCE_LABELS, formatDisplayDate } from "../logic/display-date";
import { priceRiseParts, trialParts } from "../logic/label-text";
import { LabelChip, type LabelKind } from "./label-chip";
import { Money, TextLine } from "./money-text";
import { REDUCED_FADE, SINK, cardVariants } from "./motion";
import { useFocusRequest } from "./use-focus-request";

export type CardPhase = "undead" | "resting" | "condemned" | "sinking";

export interface UndeadCardProps {
  subscription: ClassifiedSubscription;
  displayName: string;
  phase: CardPhase;
  canSkip: boolean;
  reduceMotion: boolean;
  onRest(): void;
  onBury(): void;
  onSkip(): void;
  /** The "condemned" shudder finished; time to sink. */
  onCondemned(): void;
  /** The card is fully underground. */
  onSunk(): void;
}

const VARIANT_FOR_PHASE: Record<CardPhase, string> = {
  undead: "risen",
  resting: "settled",
  condemned: "shudder",
  sinking: "sunk",
};

const PERIOD_WORD: Readonly<Record<Cadence, string>> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
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
      return { rotate: -2.5, transition: SINK };
    case "resting":
      return { rotate: 0, transition: { type: "spring", stiffness: 60, damping: 12 } };
  }
}

function KeptNote({
  subscription,
  reduceMotion,
}: {
  subscription: ClassifiedSubscription;
  reduceMotion: boolean;
}) {
  // The buttons that had focus are gone; hand focus to the outcome.
  const focusRef = useFocusRequest(`outcome:${subscription.id}`);
  const { currentAmountCents, currency, cadence, evidence } = subscription;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? REDUCED_FADE : { duration: 0.5, delay: 0.15 }}
    >
      <p ref={focusRef} tabIndex={-1} className="font-display text-[1.75rem] italic leading-tight">
        Kept. It rests.
      </p>
      <p className="mt-2 text-sm text-bone/70">
        It goes on charging <Money cents={currentAmountCents} currency={currency} />
        {evidence.cadenceAssumed ? " (how often is a guess)." : ` a ${PERIOD_WORD[cadence]}.`}
      </p>
    </motion.div>
  );
}

const BUTTON_BASE =
  "h-12 rounded-xl px-4 text-sm font-semibold aria-disabled:cursor-default cursor-pointer";

function DataLine({
  kind,
  reduceMotion,
  parts,
}: {
  kind: "possessed" | "trial-trap";
  reduceMotion: boolean;
  parts: ReturnType<typeof priceRiseParts>;
}) {
  return (
    <div className="mt-4 flex flex-col items-start gap-2 text-sm text-bone/90">
      <LabelChip kind={kind} reduceMotion={reduceMotion} />
      <TextLine parts={parts} />
    </div>
  );
}

export function UndeadCard(props: UndeadCardProps) {
  const {
    subscription,
    displayName,
    phase,
    canSkip,
    reduceMotion,
    onRest,
    onBury,
    onSkip,
    onCondemned,
    onSunk,
  } = props;
  const titleId = useId();
  const headingRef = useFocusRequest(`card-heading:${subscription.id}`);
  const { currency, cadence, currentAmountCents, yearlyCostCents, priceHistory, evidence } =
    subscription;
  const guessed = evidence.cadenceAssumed;
  const calm = phase === "resting";
  const deciding = phase === "undead";
  const labelKind: LabelKind = calm
    ? "resting"
    : subscription.labels.includes("zombie")
      ? "zombie"
      : "undead";
  const sway = swayFor(phase, reduceMotion);
  const tapProps = reduceMotion || !deciding ? {} : { whileTap: { scale: 0.97 } };
  const firstSeen = subscription.charges[0]?.date ?? evidence.firstChargeDate;
  const showPossessed =
    subscription.labels.includes("possessed") && subscription.priceRise !== null;
  const showTrial = subscription.labels.includes("trial-trap") && subscription.trial !== null;

  return (
    <motion.div
      variants={cardVariants(reduceMotion)}
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
        <section
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
            transition={reduceMotion ? REDUCED_FADE : { duration: 0.9, ease: "easeOut" }}
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <LabelChip kind={labelKind} reduceMotion={reduceMotion} />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-bone/70">
                {CADENCE_LABELS[cadence]}
              </span>
            </div>

            <h3
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="mt-6 break-words font-display text-4xl leading-none text-bone min-[360px]:text-5xl"
            >
              {displayName}
            </h3>

            {showPossessed && subscription.priceRise !== null ? (
              <DataLine
                kind="possessed"
                reduceMotion={reduceMotion}
                parts={priceRiseParts(subscription.priceRise, currency)}
              />
            ) : null}
            {showTrial && subscription.trial !== null ? (
              <DataLine
                kind="trial-trap"
                reduceMotion={reduceMotion}
                parts={trialParts(subscription.trial, currency)}
              />
            ) : null}

            <div className="mt-6 flex flex-wrap items-end justify-between gap-x-2 gap-y-2">
              <p className="flex items-baseline gap-1">
                <span className="text-[1.75rem] font-semibold leading-none">
                  <Money cents={currentAmountCents} currency={currency} />
                </span>
                <span className="text-sm text-bone/70">/{PERIOD_WORD[cadence]}</span>
              </p>
              {guessed ? null : (
                <motion.p
                  className="flex items-baseline gap-1"
                  initial={false}
                  animate={{ color: calm ? "var(--bone)" : "var(--blood)" }}
                  transition={{ duration: reduceMotion ? 0.15 : 0.9 }}
                >
                  {/* 24px: WCAG large text, since --blood on --fog is 4.53:1. */}
                  <span className="text-2xl font-semibold leading-none">
                    <Money cents={yearlyCostCents} currency={currency} />
                  </span>
                  <span className="text-sm text-bone/70">a year</span>
                </motion.p>
              )}
            </div>
            {guessed ? (
              <div className="mt-2 flex flex-col gap-1 text-sm text-bone/90">
                <span>Guessed from a single charge</span>
                <motion.span
                  className="text-2xl font-semibold leading-tight"
                  initial={false}
                  animate={{ color: calm ? "var(--bone)" : "var(--blood)" }}
                  transition={{ duration: reduceMotion ? 0.15 : 0.9 }}
                >
                  <span className="text-sm font-normal text-bone/70">about </span>
                  <Money cents={yearlyCostCents} currency={currency} />
                  <span className="text-sm font-normal text-bone/70"> a year (estimate)</span>
                </motion.span>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-bone/70">
              Seen since {evidence.startedInStatement ? "" : "at least "}
              {formatDisplayDate(firstSeen)}
            </p>

            {priceHistory.length > 1 ? (
              <ol
                aria-label="Price history"
                className="mt-3 flex flex-col gap-1 text-sm text-bone/70"
              >
                {priceHistory.map((point) => (
                  <li key={`${point.date}:${point.amountCents}`}>
                    {formatDisplayDate(point.date)}:{" "}
                    <Money cents={point.amountCents} currency={currency} />
                  </li>
                ))}
              </ol>
            ) : null}

            <div className="my-6 h-px bg-bone/10" />

            <div className="min-h-26">
              <AnimatePresence mode="wait" initial={false}>
                {calm ? (
                  <KeptNote key="kept" subscription={subscription} reduceMotion={reduceMotion} />
                ) : (
                  <motion.div key="ask" exit={{ opacity: 0 }} transition={REDUCED_FADE}>
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
                    {canSkip ? (
                      <button
                        type="button"
                        aria-disabled={!deciding}
                        onClick={() => deciding && onSkip()}
                        className="mt-3 h-12 cursor-pointer px-1 text-sm font-semibold text-bone/90 underline underline-offset-4 aria-disabled:cursor-default"
                      >
                        Skip for now
                      </button>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
}
