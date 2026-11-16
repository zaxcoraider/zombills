// The Graveyard view: tombstones, what is resting, what is waiting and what has stopped.

import type { Cadence } from "@zombills/core";
import { motion } from "framer-motion";
import { useId, useState } from "react";
import type { Dispatch } from "react";
import { CADENCE_LABELS } from "../logic/display-date";
import type { AnswerRecord } from "../logic/graveyard";
import type { HauntView } from "../logic/haunt-view";
import type { PageAction } from "../page-state";
import { CancelHelper } from "./cancel-helper";
import { helperPanelVariants } from "./motion";
import { Money } from "./money-text";
import { EndedList } from "./rising-view";
import { Tombstone } from "./tombstone";
import { useFocusRequest } from "./use-focus-request";

export interface GraveyardViewProps {
  haunt: HauntView;
  /** true when the view is "results": shows Back to the rising, Answer now; otherwise Back to the start */
  hasStatement: boolean;
  /** id of the tombstone that should rise (event buried(id) on this screen) */
  enteringId: string | null;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
}

const BUTTON_CLASS = "rounded border border-bone bg-fog px-4 py-2 text-bone";

/** Same factors the detector uses for `yearlyCostCents`; only for a guessed Kept record. */
const PERIODS_PER_YEAR: Readonly<Record<Cadence, number>> = {
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

/** `How to cancel` and the Helper panel it opens; the panel stays mounted while hidden. */
function HelperDisclosure({
  record,
  name,
  reduceMotion,
  open,
  onToggle,
}: {
  record: AnswerRecord;
  name: string;
  reduceMotion: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`How to cancel ${name}`}
        onClick={onToggle}
      >
        How to cancel
      </button>
      <motion.div
        id={panelId}
        hidden={!open}
        className="mx-auto mt-4 w-full max-w-xl"
        initial={false}
        animate={open ? "shown" : "collapsed"}
        variants={helperPanelVariants(reduceMotion)}
      >
        <CancelHelper record={record} displayName={name} reduceMotion={reduceMotion} />
      </motion.div>
    </>
  );
}

function TombstoneActions({
  record,
  name,
  isCurrent,
  ended,
  reduceMotion,
  open,
  onToggle,
  dispatch,
}: {
  record: AnswerRecord;
  name: string;
  isCurrent: boolean;
  ended: boolean;
  reduceMotion: boolean;
  open: boolean;
  onToggle: () => void;
  dispatch: Dispatch<PageAction>;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {isCurrent ? (
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={`Unbury ${name}`}
          onClick={() => dispatch({ type: "unbury", id: record.id })}
        >
          Unbury
        </button>
      ) : null}
      {ended ? null : (
        <HelperDisclosure
          record={record}
          name={name}
          reduceMotion={reduceMotion}
          open={open}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

/** One tombstone cell. While its Helper panel is open it spans the full row, so the panel has room. */
function TombstoneItem({
  record,
  name,
  ended,
  isCurrent,
  entering,
  reduceMotion,
  dispatch,
}: {
  record: AnswerRecord;
  name: string;
  ended: boolean;
  isCurrent: boolean;
  entering: boolean;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={open ? "w-full min-[641px]:col-span-2" : undefined}>
      <Tombstone
        record={record}
        displayName={name}
        size="list"
        entering={entering}
        reduceMotion={reduceMotion}
        ended={ended}
        action={
          isCurrent || !ended ? (
            <TombstoneActions
              record={record}
              name={name}
              isCurrent={isCurrent}
              ended={ended}
              reduceMotion={reduceMotion}
              open={open}
              onToggle={() => setOpen(!open)}
              dispatch={dispatch}
            />
          ) : null
        }
      />
    </li>
  );
}

function RestingItem({
  record,
  name,
  yearlyCents,
  isCurrent,
  dispatch,
}: {
  record: AnswerRecord;
  name: string;
  yearlyCents: number;
  isCurrent: boolean;
  dispatch: Dispatch<PageAction>;
}) {
  const focusRef = useFocusRequest(`resting-item:${record.id}`);
  return (
    <li ref={focusRef} tabIndex={-1} className="flex flex-col items-start gap-2">
      <p>
        {name} · {CADENCE_LABELS[record.cadence]} ·{" "}
        <Money cents={record.currentAmountCents} currency={record.currency} /> ·{" "}
        {record.cadenceAssumed ? "about " : ""}
        <Money cents={yearlyCents} currency={record.currency} /> a year
        {record.cadenceAssumed ? " (estimate)" : ""}
      </p>
      {isCurrent ? (
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={`Bury after all ${name}`}
          onClick={() => dispatch({ type: "bury-after-all", id: record.id })}
        >
          Bury after all
        </button>
      ) : null}
    </li>
  );
}

export function GraveyardView({
  haunt,
  hasStatement,
  enteringId,
  reduceMotion,
  dispatch,
}: GraveyardViewProps) {
  const headingRef = useFocusRequest("graveyard-heading");
  const { tombstones, kept, names, currentIds, savings } = haunt;
  const nameOf = (id: string, fallback: string) => names.get(id) ?? fallback;
  const queued = haunt.queue.flatMap((id) => {
    const subscription = haunt.byId.get(id);
    return subscription === undefined ? [] : [subscription];
  });

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-fog/95 p-6">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl">
        Your graveyard
      </h2>
      {tombstones.length === 0 ? (
        <p>Nothing buried yet.</p>
      ) : (
        <>
          {savings.map((total) => (
            <p key={total.currency}>
              You buried{" "}
              <span className="text-moss text-2xl font-semibold">
                <Money cents={total.totalCents} currency={total.currency} />
              </span>{" "}
              a year.
            </p>
          ))}
          <ul className="grid grid-cols-1 justify-items-center gap-6 min-[641px]:grid-cols-2">
            {tombstones.map((record) => (
              <TombstoneItem
                key={record.id}
                record={record}
                name={nameOf(record.id, record.merchant)}
                ended={haunt.byId.get(record.id)?.status === "ended"}
                isCurrent={currentIds.has(record.id)}
                entering={record.id === enteringId}
                reduceMotion={reduceMotion}
                dispatch={dispatch}
              />
            ))}
          </ul>
        </>
      )}
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
                  record.currentAmountCents * PERIODS_PER_YEAR[record.cadence]
                }
                isCurrent={currentIds.has(record.id)}
                dispatch={dispatch}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {hasStatement && queued.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">Not answered yet</h3>
          <ul className="flex flex-col gap-3">
            {queued.map((subscription) => {
              const name = nameOf(subscription.id, subscription.merchant);
              return (
                <li key={subscription.id} className="flex flex-col items-start gap-2">
                  <p>
                    {name} · {subscription.evidence.cadenceAssumed ? "about " : ""}
                    <Money
                      cents={subscription.yearlyCostCents}
                      currency={subscription.currency}
                    />{" "}
                    a year{subscription.evidence.cadenceAssumed ? " (estimate)" : ""}
                  </p>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    aria-label={`Answer now ${name}`}
                    onClick={() => dispatch({ type: "answer-now", id: subscription.id })}
                  >
                    Answer now
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {hasStatement && haunt.ended.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">Already stopped</h3>
          <EndedList ended={haunt.ended} names={names} />
        </section>
      ) : null}
      <div>
        {hasStatement ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => dispatch({ type: "back-to-rising" })}
          >
            Back to the rising
          </button>
        ) : (
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => dispatch({ type: "back-to-start" })}
          >
            Back to the start
          </button>
        )}
      </div>
    </div>
  );
}
