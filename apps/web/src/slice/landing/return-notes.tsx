import { NEWER_NOTE, UNREADABLE_NOTE, droppedNote } from "../logic/memory-text";
import { buttonVariant } from "../button-variants";
import type { LoadNote } from "../page-state";

export interface ReturnNotesProps {
  restored: string | null;
  loadNote: LoadNote | null;
  showOpen: boolean;
  onOpen: () => void;
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

/** What the Page tells a returning visitor, in one card; nothing when there is nothing to say. */
export function ReturnNotes({ restored, loadNote, showOpen, onOpen }: ReturnNotesProps) {
  if (restored === null && loadNote === null && !showOpen) return null;
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-fog/95 p-4">
      {restored !== null ? <p>{restored}</p> : null}
      {loadNote !== null ? <p>{loadNoteText(loadNote)}</p> : null}
      {showOpen ? (
        <button type="button" {...buttonVariant("secondary")} onClick={onOpen}>
          Open the graveyard
        </button>
      ) : null}
    </div>
  );
}
