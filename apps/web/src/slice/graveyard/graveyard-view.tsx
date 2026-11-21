// The Graveyard view: tombstones, what is resting, what is waiting and what has stopped.

import { motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import type { Dispatch } from "react";
import { CADENCE_LABELS } from "../logic/display-date";
import { CADENCE_FACTOR, type AnswerRecord } from "../logic/graveyard";
import type { HauntView } from "../logic/haunt-view";
import { CARRIED_OVER_NOTE, EARLIER_NOTE } from "../logic/memory-text";
import { formatMoney } from "../logic/money";
import type { MemoryModel, PageAction } from "../page-state";
import { buttonVariant } from "../button-variants";
import { CancelHelper } from "./cancel-helper";
import { GroundLine } from "./ground-line";
import { MemoryPanel } from "./memory-panel";
import { BURIAL_FALLBACK_MS, helperPanelVariants } from "./motion";
import { Money } from "./money-text";
import { EndedList } from "./rising-view";
import { SharePanel } from "./share-panel";
import { Tombstone } from "./tombstone";
import { useFocusRequest } from "./use-focus-request";

export interface GraveyardViewProps {
  haunt: HauntView;
  /** true when the view is "results": shows Back to the rising, Answer now; otherwise Back to the start */
  hasStatement: boolean;
  /** id of the tombstone that should rise (event buried(id) on this screen) */
  enteringId: string | null;
  /** model.focus.seq while enteringId is set, else null; keys the rise for busy */
  enteringSeq: number | null;
  /** model.memory, for MemoryPanel */
  memory: MemoryModel;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
}

/** A Card on the scene: the `--fog` plate every block of text and every secondary control sits on. */
const CARD = "rounded-card bg-fog/95 p-4 sm:p-6";

/** The Helper panel `How to cancel` opens; it stays mounted while hidden. */
function HelperPanel({
  id,
  record,
  name,
  reduceMotion,
  open,
}: {
  id: string;
  record: AnswerRecord;
  name: string;
  reduceMotion: boolean;
  open: boolean;
}) {
  return (
    <motion.div
      id={id}
      hidden={!open}
      className="mx-auto mt-4 w-full max-w-xl"
      initial={false}
      animate={open ? "shown" : "collapsed"}
      variants={helperPanelVariants(reduceMotion)}
    >
      <CancelHelper record={record} displayName={name} reduceMotion={reduceMotion} />
    </motion.div>
  );
}

/** One tombstone cell. While its Helper panel is open it spans the full row, so the panel has room. */
function TombstoneItem({
  record,
  name,
  ended,
  note,
  entering,
  onRisen,
  reduceMotion,
  dispatch,
}: {
  record: AnswerRecord;
  name: string;
  ended: boolean;
  note: string | undefined;
  entering: boolean;
  onRisen: () => void;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className={`flex flex-col ${open ? "col-span-full" : ""}`}>
      <Tombstone
        record={record}
        displayName={name}
        size="list"
        entering={entering}
        reduceMotion={reduceMotion}
        ended={ended}
        {...(note === undefined ? {} : { note })}
        onRisen={onRisen}
      />
      <GroundLine className="-mx-2" />
      <div className="flex flex-wrap gap-2 rounded-card bg-fog/95 p-2">
        {ended ? null : (
          <button
            type="button"
            {...buttonVariant("secondary")}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`How to cancel ${name}`}
            onClick={() => setOpen(!open)}
          >
            How to cancel
          </button>
        )}
        <button
          type="button"
          {...buttonVariant("danger-quiet")}
          aria-label={`Unbury ${name}`}
          onClick={() => dispatch({ type: "unbury", id: record.id })}
        >
          Unbury
        </button>
      </div>
      {/* After the plate, not inside it: the Helper panel is its own Card (Batch D #4, Req 8.6). */}
      {ended ? null : (
        <HelperPanel
          id={panelId}
          record={record}
          name={name}
          reduceMotion={reduceMotion}
          open={open}
        />
      )}
    </li>
  );
}

/** Visible text of a Waiting chip: `Name · [about ]<yearly> a year[ (estimate)]`. */
function waitingChipText(
  name: string,
  yearlyCents: number,
  currency: string,
  cadenceAssumed: boolean,
): string {
  const about = cadenceAssumed ? "about " : "";
  const estimate = cadenceAssumed ? " (estimate)" : "";
  return `${name} · ${about}${formatMoney(yearlyCents, currency)} a year${estimate}`;
}

/** A Waiting chip: one queued subscription in "Not answered yet"; activating it answers it now. */
function WaitingChip({
  name,
  yearlyCents,
  currency,
  cadenceAssumed,
  onAnswer,
}: {
  name: string;
  yearlyCents: number;
  currency: string;
  cadenceAssumed: boolean;
  onAnswer: () => void;
}) {
  const visibleText = waitingChipText(name, yearlyCents, currency, cadenceAssumed);
  return (
    <button
      type="button"
      data-exempt="waiting-chip"
      aria-label={`Answer now ${visibleText}`}
      className="min-h-11 rounded-control border border-bone/50 bg-fog px-4 text-small"
      onClick={onAnswer}
    >
      {name} · {cadenceAssumed ? "about " : ""}
      <Money cents={yearlyCents} currency={currency} /> a year
      {cadenceAssumed ? " (estimate)" : ""}
    </button>
  );
}

function RestingItem({
  record,
  name,
  yearlyCents,
  note,
  dispatch,
}: {
  record: AnswerRecord;
  name: string;
  yearlyCents: number;
  note: string | undefined;
  dispatch: Dispatch<PageAction>;
}) {
  const focusRef = useFocusRequest(`resting-item:${record.id}`);
  return (
    <li ref={focusRef} tabIndex={-1} className="flex flex-col items-start gap-2">
      <p>
        {name}
        {note === undefined ? null : <span> · {note}</span>} · {CADENCE_LABELS[record.cadence]} ·{" "}
        <Money cents={record.currentAmountCents} currency={record.currency} /> ·{" "}
        {record.cadenceAssumed ? "about " : ""}
        <Money cents={yearlyCents} currency={record.currency} /> a year
        {record.cadenceAssumed ? " (estimate)" : ""}
      </p>
      <button
        type="button"
        {...buttonVariant("secondary")}
        aria-label={`Bury after all ${name}`}
        onClick={() => dispatch({ type: "bury-after-all", id: record.id })}
      >
        Bury after all
      </button>
    </li>
  );
}

export function GraveyardView({
  haunt,
  hasStatement,
  enteringId,
  enteringSeq,
  memory,
  reduceMotion,
  dispatch,
}: GraveyardViewProps) {
  const headingRef = useFocusRequest("graveyard-heading");
  const { tombstones, kept, names, savings } = haunt;
  const [risenSeq, setRisenSeq] = useState<number | null>(null);
  const busy = enteringSeq !== null && risenSeq !== enteringSeq;
  // A skipped animation never calls onAnimationComplete, so a timer ends the busy state too.
  useEffect(() => {
    if (enteringSeq === null) return undefined;
    const timer = setTimeout(() => setRisenSeq(enteringSeq), BURIAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [enteringSeq]);
  const noteOf = (id: string) => {
    if (haunt.earlierIds.has(id)) return EARLIER_NOTE;
    return haunt.carriedOverIds.has(id) ? CARRIED_OVER_NOTE : undefined;
  };
  const hasRecords = tombstones.length + kept.length > 0;
  const nameOf = (id: string, fallback: string) => names.get(id) ?? fallback;
  const queued = haunt.queue.flatMap((id) => {
    const subscription = haunt.byId.get(id);
    return subscription === undefined ? [] : [subscription];
  });

  const showStopped = hasStatement && haunt.ended.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex flex-col gap-3 ${CARD}`}>
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl">
          Your graveyard
        </h2>
        {tombstones.length === 0 ? (
          <p>Nothing buried yet.</p>
        ) : (
          savings.map((total) => (
            <p key={total.currency}>
              You buried{" "}
              <span className="text-moss text-2xl font-semibold">
                <Money cents={total.totalCents} currency={total.currency} />
              </span>{" "}
              a year.
            </p>
          ))
        )}
      </div>
      {tombstones.length === 0 ? null : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 min-[100rem]:grid-cols-4">
          {tombstones.map((record) => (
            <TombstoneItem
              key={record.id}
              record={record}
              name={nameOf(record.id, record.merchant)}
              ended={haunt.byId.get(record.id)?.status === "ended"}
              note={noteOf(record.id)}
              entering={record.id === enteringId}
              onRisen={() => setRisenSeq(enteringSeq)}
              reduceMotion={reduceMotion}
              dispatch={dispatch}
            />
          ))}
        </ul>
      )}
      {tombstones.length === 0 ? null : (
        <div className={CARD}>
          <SharePanel tombstones={tombstones} savings={savings} reduceMotion={reduceMotion} />
        </div>
      )}
      {kept.length > 0 || showStopped ? (
        <div className={`flex flex-col gap-6 ${CARD}`}>
          {kept.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-lg font-bold">Resting</h3>
              <ul className="flex flex-col gap-3">
                {kept.map((record) => (
                  <RestingItem
                    key={record.id}
                    record={record}
                    name={nameOf(record.id, record.merchant)}
                    yearlyCents={
                      record.yearlySavingCents ??
                      haunt.byId.get(record.id)?.yearlyCostCents ??
                      record.currentAmountCents * CADENCE_FACTOR[record.cadence]
                    }
                    note={noteOf(record.id)}
                    dispatch={dispatch}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {showStopped ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-lg font-bold">Already stopped</h3>
              <EndedList ended={haunt.ended} names={names} />
            </section>
          ) : null}
        </div>
      ) : null}
      {hasStatement && queued.length > 0 ? (
        <section className={`flex flex-col gap-3 ${CARD}`}>
          <h3 className="text-lg font-bold">Not answered yet</h3>
          <ul className="flex flex-wrap gap-2">
            {queued.map((subscription) => (
              <li key={subscription.id}>
                <WaitingChip
                  name={nameOf(subscription.id, subscription.merchant)}
                  yearlyCents={subscription.yearlyCostCents}
                  currency={subscription.currency}
                  cadenceAssumed={subscription.evidence.cadenceAssumed}
                  onAnswer={() => dispatch({ type: "answer-now", id: subscription.id })}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <MemoryPanel memory={memory} hasRecords={hasRecords} busy={busy} dispatch={dispatch} />
      <div className={CARD}>
        {hasStatement ? (
          <button
            type="button"
            {...buttonVariant("secondary")}
            onClick={() => dispatch({ type: "back-to-rising" })}
          >
            Back to the rising
          </button>
        ) : (
          <button
            type="button"
            {...buttonVariant("secondary")}
            onClick={() => dispatch({ type: "back-to-start" })}
          >
            Back to the start
          </button>
        )}
      </div>
    </div>
  );
}
