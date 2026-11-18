import { useId } from "react";
import type { Ref } from "react";
import { NEW_TAB_TEXT } from "./logic/cancel-text";
import { BUILT_WITH_KIRO, REAPER_DESCRIPTION, REAPER_LINK, REPO_LINK } from "./logic/landing-text";
import { PRIVACY_NOTE } from "./logic/memory-text";

export interface SiteFooterProps {
  noteRef: Ref<HTMLParagraphElement>;
  wide: boolean;
}

const LINK_CLASS = "inline-flex min-h-11 items-center text-bone underline underline-offset-4";

/** The Privacy note, the Kiro credit and the two GitHub links, on every view (Req 8.1). */
export function SiteFooter({ noteRef, wide }: SiteFooterProps) {
  const newTabId = useId();
  const column = wide ? "mx-auto w-full max-w-[1184px] px-4 sm:px-8" : "mx-auto max-w-[640px] px-4";
  return (
    <footer className={`${column} pb-8`}>
      <div className="flex flex-col gap-3 rounded-2xl bg-night/80 p-6 text-sm">
        <p ref={noteRef} tabIndex={-1}>
          {PRIVACY_NOTE}
        </p>
        <p>{BUILT_WITH_KIRO}</p>
        <ul className="flex flex-col gap-1">
          <li>
            <a
              href={REPO_LINK.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={newTabId}
              className={LINK_CLASS}
            >
              {REPO_LINK.text}
            </a>
          </li>
          <li>
            <a
              href={REAPER_LINK.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={newTabId}
              className={LINK_CLASS}
            >
              {REAPER_LINK.text}
            </a>{" "}
            <span className="block">{REAPER_DESCRIPTION}</span>
          </li>
        </ul>
        <span id={newTabId} className="sr-only">
          {NEW_TAB_TEXT}
        </span>
      </div>
    </footer>
  );
}
