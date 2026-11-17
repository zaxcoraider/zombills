// The Memory panel: the remember checkbox, its hint, the notes and the Forget confirmation.

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
  NEWER_NOTE,
  REMOVE_FAILED_NOTE,
  UNREADABLE_NOTE,
  WRITE_FAILED_NOTE,
  droppedNote,
  leftOutNote,
} from "../logic/memory-text";
import type { LoadNote, MemoryModel, PageAction, StorageNote } from "../page-state";
import { useFocusRequest } from "./use-focus-request";

export interface MemoryPanelProps {
  memory: MemoryModel;
  /** true when the Graveyard has a record */
  hasRecords: boolean;
  /** true while the tombstone rise of Req 7.4 runs */
  busy: boolean;
  dispatch: Dispatch<PageAction>;
}

/** Same classes as the Graveyard view's buttons. */
const BUTTON_CLASS = "rounded border border-bone bg-fog px-4 py-2 text-bone";

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
          className={BUTTON_CLASS}
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
          className={BUTTON_CLASS}
          aria-disabled={busy ? "true" : undefined}
          onClick={() => {
            if (busy) return;
            dispatch({ type: "forget" });
            setConfirming(false);
          }}
        >
          {FORGET_CONFIRM}
        </button>
        <button ref={cancelRef} type="button" className={BUTTON_CLASS} onClick={cancel}>
          {FORGET_CANCEL}
        </button>
      </div>
    </div>
  );
}

export function MemoryPanel({ memory, hasRecords, busy, dispatch }: MemoryPanelProps) {
  const headingId = useId();
  const hintId = useId();
  const checkboxRef = useFocusRequest("memory-checkbox");
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 p-0 text-bone">
      <h3 id={headingId} className="text-lg font-bold">
        {MEMORY_HEADING}
      </h3>
      <label className="flex items-start gap-3">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={memory.on}
          aria-describedby={hintId}
          onChange={(event) => dispatch({ type: "set-memory", on: event.target.checked })}
        />
        <span>{MEMORY_LABEL}</span>
      </label>
      <p id={hintId}>{MEMORY_HINT}</p>
      {memory.loadNote !== null ? <p>{loadNoteText(memory.loadNote)}</p> : null}
      {memory.storageNote !== null ? <p>{storageNoteText(memory.storageNote)}</p> : null}
      {memory.leftOut > 0 ? <p>{leftOutNote(memory.leftOut)}</p> : null}
      {hasRecords || memory.on ? <ForgetControl busy={busy} dispatch={dispatch} /> : null}
    </section>
  );
}
