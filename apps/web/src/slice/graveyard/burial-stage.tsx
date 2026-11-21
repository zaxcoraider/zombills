// The stage where one card is asked, rests or is buried. It stays mounted for the whole burial
// and is keyed by subscription id, so the next card remounts it.

import type { ClassifiedSubscription } from "@zombills/core";
import { motion } from "framer-motion";
import type { CSSProperties, Dispatch, ReactNode } from "react";
import type { PageAction, RisingStage } from "../page-state";
import type { AnswerRecord } from "../logic/graveyard";
import { BurialMound, SinkCrumbs } from "./burial-earth";
import { CancelHelper } from "./cancel-helper";
import { Ground } from "./graveyard-backdrop";
import { helperPanelMotion } from "./motion";
import { Tombstone } from "./tombstone";
import { UndeadCard, type CardPhase } from "./undead-card";
import { useFocusRequest } from "./use-focus-request";

export interface BurialStageProps {
  subscription: ClassifiedSubscription;
  /** The Current record, for the tombstone */
  record: AnswerRecord | null;
  displayName: string;
  /** Never "ask" with an empty Queue */
  stage: RisingStage;
  /** Queue length > 1 */
  canSkip: boolean;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
  /** Rendered last inside the Helper panel while buried (Req 8.4) */
  next?: ReactNode;
}

// The stage's own earth band: whatever is below the ground line is underground. It holds only
// what the burial needs there: the mound reaches 22 px below the ground line, and the card
// sinks out of sight at the line.
const STAGE_STYLE = {
  "--ground-h": "4.5rem",
  paddingBottom: "var(--ground-h)",
} as CSSProperties;

// Room above the ground line. The card sits in the flow, so the stage is never shorter than the
// card. This floor is the tallest card measured (Netflix: possessed, with price history, 603 px
// at 1000 px wide and 641 px at 390 px wide, less the 12 px that sink under the line), so the
// stage keeps one height from card to card.
const SKY_MIN_HEIGHT = "39.5rem";

function cardPhaseFor(stage: RisingStage): CardPhase | null {
  switch (stage.kind) {
    case "ask":
      return "undead";
    case "rested":
      return "resting";
    case "burying":
      if (stage.phase === "condemned") return "condemned";
      if (stage.phase === "sinking") return "sinking";
      return null;
    case "buried":
      return null;
  }
}

export function BurialStage({
  subscription,
  record,
  displayName,
  stage,
  canSkip,
  reduceMotion,
  dispatch,
  next,
}: BurialStageProps) {
  const { id } = subscription;
  const stageRef = useFocusRequest(`stage:${id}`);
  const burying = stage.kind === "burying";
  const cardPhase = cardPhaseFor(stage);
  const sinking = stage.kind === "burying" && stage.phase === "sinking";
  const earthShown =
    stage.kind === "buried" || (stage.kind === "burying" && stage.phase === "closing");
  const buried = stage.kind === "buried";

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      role="group"
      data-burial-stage=""
      className="scroll-mt-4"
      {...(burying ? { "aria-label": `Burying ${displayName}` } : {})}
    >
      <div className="relative isolate overflow-clip" style={STAGE_STYLE}>
        {/* Clipped at the ground line, so whatever is below it is underground. */}
        <div
          className="relative flex items-end justify-center overflow-clip px-3"
          style={{ minHeight: SKY_MIN_HEIGHT }}
        >
          {cardPhase !== null && (
            <div className="-mb-3 flex justify-center">
              <UndeadCard
                subscription={subscription}
                displayName={displayName}
                phase={cardPhase}
                canSkip={canSkip}
                reduceMotion={reduceMotion}
                onRest={() => dispatch({ type: "keep", id })}
                onBury={() => dispatch({ type: "bury", id, reducedMotion: reduceMotion })}
                onSkip={() => dispatch({ type: "skip", id })}
                onCondemned={() => dispatch({ type: "burial-step", id, from: "condemned" })}
                onSunk={() => dispatch({ type: "burial-step", id, from: "sinking" })}
              />
            </div>
          )}
          {buried && record !== null && (
            <div className="-mb-7 flex justify-center">
              <Tombstone
                record={record}
                displayName={displayName}
                size="stage"
                entering
                reduceMotion={reduceMotion}
              />
            </div>
          )}
        </div>

        <Ground />

        {sinking && !reduceMotion && <SinkCrumbs />}

        {earthShown && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ bottom: "calc(var(--ground-h) - 22px)" }}
          >
            <BurialMound
              reduceMotion={reduceMotion}
              onClosed={() => dispatch({ type: "burial-step", id, from: "closing" })}
            />
          </div>
        )}
      </div>

      {buried && record !== null && (
        <motion.div className="mt-6 flex justify-center px-3" {...helperPanelMotion(reduceMotion)}>
          <CancelHelper
            record={record}
            displayName={displayName}
            reduceMotion={reduceMotion}
            next={next}
          />
        </motion.div>
      )}
    </div>
  );
}
