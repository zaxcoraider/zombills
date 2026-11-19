import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { LEAVE_QUESTION, LEAVE_TEXT, STAY_TEXT } from "../logic/chrome-text";
import { buttonVariant } from "../button-variants";

export interface LeaveQuestionProps {
  /** Bumped on every Home activation while open; each change refocuses "Stay". */
  seq: number;
  onStay: () => void;
  onLeave: () => void;
}

/**
 * The inline question the Home control asks before leaving the results
 * (Req 1.4 to 1.6). Like `ForgetControl`: no modal, no focus trap, no Live
 * region text; the focus move is the feedback.
 */
export function LeaveQuestion({ seq, onStay, onLeave }: LeaveQuestionProps) {
  const textId = useId();
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
  }, [seq]);

  return (
    <div
      role="group"
      aria-labelledby={textId}
      className="flex flex-col gap-3 rounded-card bg-fog/95 p-4 text-bone sm:p-6"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onStay();
        }
      }}
    >
      <p id={textId} className="m-0">
        {LEAVE_QUESTION}
      </p>
      <div className="flex flex-wrap gap-3">
        <button ref={stayRef} type="button" {...buttonVariant("secondary")} onClick={onStay}>
          {STAY_TEXT}
        </button>
        <button type="button" {...buttonVariant("secondary")} onClick={onLeave}>
          {LEAVE_TEXT}
        </button>
      </div>
    </div>
  );
}
