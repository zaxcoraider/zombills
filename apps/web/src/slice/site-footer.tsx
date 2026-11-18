// The Footer graveyard: four tombstone links standing on the scene's earth, then the Reaper
// description and the Privacy note (pro-polish Req 2.1 to 2.6).

import { useId } from "react";
import type { Ref } from "react";
import { FOOTER_STONE_HEIGHTS, FooterTombstone, GHOST_HEADROOM } from "./chrome/footer-tombstone";
import { GroundLine } from "./graveyard/ground-line";
import { GROUND_TOP } from "./graveyard/graveyard-backdrop";
import { NEW_TAB_TEXT } from "./logic/cancel-text";
import { PRIVACY_TOMBSTONE, SITE_LINKS_NAME } from "./logic/chrome-text";
import { KIRO_LINK, REAPER_DESCRIPTION, REAPER_LINK, REPO_LINK } from "./logic/landing-text";
import { PRIVACY_NOTE } from "./logic/memory-text";

export interface SiteFooterProps {
  noteRef: Ref<HTMLParagraphElement>;
  wide: boolean;
  reduceMotion: boolean;
  onReadNote: () => void;
}

/** One stone of the list: a link that opens in a new tab, or the "Privacy note" button. */
type FooterStone =
  { label: string; href: string; describedBy: string } | { label: string; onActivate: () => void };

function StoneItem({
  stone,
  place,
  reduceMotion,
}: {
  stone: FooterStone;
  place: number;
  reduceMotion: boolean;
}) {
  if ("href" in stone) {
    const { label, href, describedBy } = stone;
    return (
      <FooterTombstone
        label={label}
        href={href}
        describedBy={describedBy}
        place={place}
        reduceMotion={reduceMotion}
      />
    );
  }
  return (
    <FooterTombstone
      label={stone.label}
      onActivate={stone.onActivate}
      place={place}
      reduceMotion={reduceMotion}
    />
  );
}

/** Opaque earth from 24 px down, so the footer text stands on GROUND_TOP or darker. */
const GROUND_BACKGROUND = `linear-gradient(to bottom, transparent 0, ${GROUND_TOP} 24px, color-mix(in oklab, var(--fog) 30%, var(--night)) 60%, var(--night) 100%)`;

/** The mound at a stone's foot: a shade lighter than the earth, with a moonlit rim. */
const MOUND = "color-mix(in oklab, var(--fog) 85%, var(--night))";
const MOUND_RIM = "inset 0 1px 0 color-mix(in oklab, var(--bone) 14%, transparent)";

/** The footer's top padding (rem), matching `pt-8`. */
const FOOTER_PAD_TOP = 2;
/**
 * The first row's ground line, from the footer top: the padding, the ghost headroom and the
 * tallest stone (stones stand bottom-aligned). The earth fades in over the 24 px above it, so
 * the stones stand on the scene, not in a box.
 */
const EARTH_TOP = `calc(${FOOTER_PAD_TOP}rem + ${GHOST_HEADROOM}px + ${Math.max(...FOOTER_STONE_HEIGHTS)}rem - 24px)`;

export function SiteFooter({ noteRef, wide, reduceMotion, onReadNote }: SiteFooterProps) {
  const newTabId = useId();
  const reaperDescId = useId();
  const stones: FooterStone[] = [
    { label: REPO_LINK.text, href: REPO_LINK.href, describedBy: newTabId },
    { label: REAPER_LINK.text, href: REAPER_LINK.href, describedBy: `${reaperDescId} ${newTabId}` },
    { label: PRIVACY_TOMBSTONE, onActivate: onReadNote },
    { label: KIRO_LINK.text, href: KIRO_LINK.href, describedBy: newTabId },
  ];
  const column = wide ? "mx-auto w-full max-w-[1184px] px-4 sm:px-8" : "mx-auto max-w-[640px] px-4";
  return (
    <footer className={`${column} relative pb-8 pt-8`}>
      <div
        data-footer-ground=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 w-screen -translate-x-1/2"
        style={{ top: EARTH_TOP, background: GROUND_BACKGROUND }}
      />
      <ul
        aria-label={SITE_LINKS_NAME}
        className="relative grid grid-cols-2 items-end gap-x-4 gap-y-2 sm:grid-cols-4"
      >
        {stones.map((stone, place) => (
          <li key={stone.label} className="relative flex flex-col">
            <StoneItem stone={stone} place={place} reduceMotion={reduceMotion} />
            {/* The row's ground: each cell's strip reaches into the gaps, so a row of stones
                shares one grass line, with a low mound at each stone's foot. The strip overlaps
                the stone's base by 8 px, so the grass grows in front of it. */}
            <div aria-hidden="true" className="pointer-events-none relative -mx-2 -mt-2">
              <span
                data-stone-mound=""
                className="absolute left-1/2 top-0 h-4 w-[min(11.5rem,96%)] -translate-x-1/2 rounded-[50%]"
                style={{ background: MOUND, boxShadow: MOUND_RIM }}
              />
              <GroundLine className="relative" />
            </div>
          </li>
        ))}
      </ul>
      <p id={reaperDescId} className="relative mt-4 text-small text-bone">
        {REAPER_DESCRIPTION}
      </p>
      <p ref={noteRef} tabIndex={-1} className="relative mt-2 text-small text-bone">
        {PRIVACY_NOTE}
      </p>
      <span id={newTabId} className="sr-only">
        {NEW_TAB_TEXT}
      </span>
    </footer>
  );
}
