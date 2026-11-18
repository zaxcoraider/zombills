import { useId, type Ref } from "react";
import { SavingsCounter } from "../graveyard/savings-counter";
import { BARE_FOCUS } from "../landing/bare-focus";
import { BrandMark } from "../landing/brand-mark";
import { HOME_CONTROL_NAME } from "../logic/chrome-text";
import type { HauntView } from "../logic/haunt-view";

export interface CompactHeaderProps {
  haunt: HauntView;
  reduceMotion: boolean;
  /** Widens the column at `lg` on Wide-layout views; passed `false` until task 35. */
  wide: boolean;
  homeDisabled: boolean;
  homeRef: Ref<HTMLButtonElement>;
  onHome: () => void;
}

/**
 * The landing-polish counter card. Below `sm` its side padding is 8 px, so the Home control
 * (160 px), the 16 px gap and a counter of 7-character figures (129 px + 16 px) fit in the
 * 328 px column at 360 px and share one row (Req 1.1); with `px-4` they need 337 px.
 */
const COUNTER_CARD = "rounded-card bg-fog/95 px-2 py-2 sm:px-4";

/**
 * The header of every Non-landing view (Req 1.1, 1.2): the Home control inside the one `h1`,
 * and the savings counter. No tagline. The counter renders nothing when it has no lines.
 */
export function CompactHeader({
  haunt,
  reduceMotion,
  wide,
  homeDisabled,
  homeRef,
  onHome,
}: CompactHeaderProps) {
  // The `h1` takes its name from the button explicitly, so every name computation gives
  // HOME_CONTROL_NAME rather than the button's text content (Req 1.2).
  const homeId = useId();
  return (
    <div
      className={`mx-auto w-full max-w-[640px] px-4 pt-4 ${wide ? "lg:max-w-[1184px] lg:px-8" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <h1 className="m-0" aria-labelledby={homeId}>
          <button
            id={homeId}
            ref={homeRef}
            type="button"
            data-exempt="home"
            aria-label={HOME_CONTROL_NAME}
            aria-disabled={homeDisabled || undefined}
            onClick={homeDisabled ? undefined : onHome}
            className={`inline-flex min-h-11 items-center gap-2 rounded-control pr-2 font-display text-title text-bone ${BARE_FOCUS}`}
          >
            <BrandMark size={40} />
            Zombills
          </button>
        </h1>
        <SavingsCounter
          size="compact"
          className={COUNTER_CARD}
          totals={haunt.savings}
          fallbackCurrency={haunt.counterFallbackCurrency}
          reduceMotion={reduceMotion}
        />
      </header>
    </div>
  );
}
