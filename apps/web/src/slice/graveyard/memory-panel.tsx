// The Memory panel: the remember toggle, its short sentence, the "What is kept?" hint, the notes
// and the Forget confirmation.

import { useEffect, useId, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent } from "react";
import {
  FORGET_BUTTON,
  FORGET_CANCEL,
  FORGET_CONFIRM,
  FORGET_QUESTION,
  MEMORY_HEADING,
  MEMORY_HINT,
  MEMORY_LABEL,
  MEMORY_SHORT,
  NEWER_NOTE,
  REMOVE_FAILED_NOTE,
  UNREADABLE_NOTE,
  WRITE_FAILED_NOTE,
  droppedNote,
  leftOutNote,
} from "../logic/memory-text";
import type { LoadNote, MemoryModel, PageAction, StorageNote } from "../page-state";
import { buttonVariant } from "../button-variants";
import { WHAT_IS_KEPT } from "../logic/chrome-text";
import { useFocusRequest } from "./use-focus-request";

export interface MemoryPanelProps {
  memory: MemoryModel;
  /** true when the Graveyard has a record */
  hasRecords: boolean;
  /** true while the tombstone rise of Req 7.4 runs */
  busy: boolean;
  dispatch: Dispatch<PageAction>;
}

function loadNoteText(note: LoadNote): string {
  switch (note.kind) {
    case "unreadable":
      return UNREADABLE_NOTE;
    case "dropped":
      return droppedNote(note.count);
    case "newer":
      return NEWER_NOTE;
  }
}

function storageNoteText(note: StorageNote): string {
  return note === "write-failed" ? WRITE_FAILED_NOTE : REMOVE_FAILED_NOTE;
}

function ForgetControl({ busy, dispatch }: { busy: boolean; dispatch: Dispatch<PageAction> }) {
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const forgetRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      forgetRef.current?.focus();
    }
  }, [confirming]);

  function cancel() {
    restoreFocus.current = true;
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <div>
        <button
          ref={forgetRef}
          type="button"
          {...buttonVariant("danger")}
          aria-disabled={busy ? "true" : undefined}
          onClick={() => {
            if (busy) return;
            setConfirming(true);
          }}
        >
          {FORGET_BUTTON}
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={questionId}
      className="flex flex-col gap-3"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <p id={questionId}>{FORGET_QUESTION}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          {...buttonVariant("danger")}
          aria-disabled={busy ? "true" : undefined}
          onClick={() => {
            if (busy) return;
            dispatch({ type: "forget" });
            setConfirming(false);
          }}
        >
          {FORGET_CONFIRM}
        </button>
        <button ref={cancelRef} type="button" {...buttonVariant("secondary")} onClick={cancel}>
          {FORGET_CANCEL}
        </button>
      </div>
    </div>
  );
}

/**
 * The checkbox drawn as a switch (pro-polish Req 9.4, 9.5). The native checkbox stays the
 * control (`appearance-none`, the same 44 × 24 px pill, so its focus ring outlines the track);
 * the track and the 16 px knob are sibling spans placed by `peer-checked:` classes, so the knob
 * does not depend on a pseudo-element on an `<input>` (Batch D #5). No transition.
 */
const SWITCH_WRAP = "relative block h-6 w-11 shrink-0";
const SWITCH_INPUT =
  "peer absolute inset-0 m-0 h-6 w-11 cursor-pointer appearance-none rounded-pill bg-transparent";
const SWITCH_TRACK =
  "pointer-events-none absolute inset-0 rounded-pill border border-bone/45 peer-checked:border-moss peer-checked:bg-moss";
const SWITCH_KNOB =
  "pointer-events-none absolute top-1 left-1 size-4 rounded-pill bg-bone peer-checked:translate-x-5 peer-checked:bg-night";

export function MemoryPanel({ memory, hasRecords, busy, dispatch }: MemoryPanelProps) {
  const headingId = useId();
  const shortId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const checkboxRef = useFocusRequest("memory-checkbox");
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-card bg-fog/95 p-4 text-bone sm:p-6"
    >
      <h3 id={headingId} className="text-lg font-bold">
        {MEMORY_HEADING}
      </h3>
      <label className="flex min-h-11 items-center gap-2">
        <span className={SWITCH_WRAP}>
          <input
            ref={checkboxRef}
            type="checkbox"
            className={SWITCH_INPUT}
            checked={memory.on}
            aria-describedby={`${shortId} ${hintId}`}
            onChange={(event) => dispatch({ type: "set-memory", on: event.target.checked })}
          />
          <span aria-hidden="true" data-switch-track="" className={SWITCH_TRACK} />
          <span aria-hidden="true" data-switch-knob="" className={SWITCH_KNOB} />
        </span>
        <span>{MEMORY_LABEL}</span>
      </label>
      <p id={shortId}>{MEMORY_SHORT}</p>
      {/* The hint sits in the disclosure's own box, so a collapsed hint leaves no empty part in
          the panel's column (layout.spec "the Memory panel is one column"). The button has no
          inline padding, so its text starts at the short sentence's left edge (Batch D V1); the
          Card's padding keeps its focus band visible. */}
      <div className="flex flex-col items-start gap-3 [&>button]:px-0">
        <button
          type="button"
          {...buttonVariant("tertiary")}
          aria-expanded={open}
          aria-controls={hintId}
          onClick={() => setOpen((value) => !value)}
        >
          {WHAT_IS_KEPT}
        </button>
        <p id={hintId} hidden={!open}>
          {MEMORY_HINT}
        </p>
      </div>
      {memory.loadNote !== null ? <p>{loadNoteText(memory.loadNote)}</p> : null}
      {memory.storageNote !== null ? <p>{storageNoteText(memory.storageNote)}</p> : null}
      {memory.leftOut > 0 ? <p>{leftOutNote(memory.leftOut)}</p> : null}
      {hasRecords || memory.on ? <ForgetControl busy={busy} dispatch={dispatch} /> : null}
    </section>
  );
}
