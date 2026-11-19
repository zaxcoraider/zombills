import { useId } from "react";
import type { ReactNode } from "react";
import { buttonVariant } from "../button-variants";
import { TRY_ANOTHER_STATEMENT } from "../logic/chrome-text";
import type { FocusTarget } from "../page-state";

export interface StatementDisclosureProps {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * What the Page's `[data-focus]` effect does with a request (Req 3.8): a drop-area request
 * while the disclosure is shown and collapsed opens it first, since a `hidden` element cannot
 * take focus; every other request is claimed as today.
 */
export function disclosureFocusStep(
  target: FocusTarget,
  shown: boolean,
  open: boolean,
): "open" | "claim" {
  return target === "drop-zone" && shown && !open ? "open" : "claim";
}

/**
 * Whether a `dragenter` on the window opens the disclosure (Req 3.8): a drag carrying files,
 * while the disclosure is shown and collapsed and the Page is not `working`.
 */
export function openOnWindowDrag(
  types: readonly string[] | undefined,
  shown: boolean,
  open: boolean,
  working: boolean,
): boolean {
  return shown && !open && !working && types !== undefined && types.includes("Files");
}

/** A chevron that points down when collapsed and up when open; a state, not a motion. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={open ? "rotate-180" : undefined}
    >
      <path
        d="M3 6 L8 11 L13 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The "Try another statement" disclosure on `results` and the Graveyard view (Req 3.7). */
export function StatementDisclosure({ open, onToggle, children }: StatementDisclosureProps) {
  const headingId = useId();
  const bodyId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      {/* No inline padding on the button, so its text lines up with the Cards above (review C
          V1); min-h-11 and min-w-11 keep the 44 px target. */}
      <h2 id={headingId} className="text-lead font-bold [&>button]:px-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          {...buttonVariant("tertiary", { bare: true, inheritSize: true })}
        >
          {TRY_ANOTHER_STATEMENT}
          <ChevronIcon open={open} />
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-4">
        {children}
      </div>
    </section>
  );
}
