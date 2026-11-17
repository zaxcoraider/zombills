import { PRIVACY_BADGE_TEXT, READ_PRIVACY_NOTE } from "../logic/landing-text";
import { BARE_FOCUS } from "./bare-focus";

export interface PrivacyBadgeProps {
  onReadNote: () => void;
}

/** The one-line privacy claim and the button that moves focus to the Footer's Privacy note. */
export function PrivacyBadge({ onReadNote }: PrivacyBadgeProps) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-moss/60 py-0 pl-3 pr-0 text-sm sm:pl-4 sm:pr-1">
      <span>{PRIVACY_BADGE_TEXT}</span>
      <button
        type="button"
        onClick={onReadNote}
        className={`inline-flex min-h-11 min-w-11 items-center px-2 text-sm text-bone underline underline-offset-4 ${BARE_FOCUS}`}
      >
        {READ_PRIVACY_NOTE}
      </button>
    </p>
  );
}
