import { Moon } from "../graveyard/graveyard-backdrop";
import { SavingsCounter } from "../graveyard/savings-counter";
import type { HauntView } from "../logic/haunt-view";

export interface LandingBannerProps {
  haunt: HauntView;
  reduceMotion: boolean;
}

/** The Landing view's top: title, tagline, savings counter and the moon, on the bare scene. */
export function LandingBanner({ haunt, reduceMotion }: LandingBannerProps) {
  return (
    <div className="mx-auto w-full max-w-[1184px] px-4 pt-4 sm:px-8 sm:pt-8">
      <header className="relative flex min-h-[calc(var(--moon-d)*1.75+16px)] flex-col items-start gap-2 pr-[calc(var(--moon-d)*1.75+4px)] [--moon-d:48px] sm:[--moon-d:64px] lg:[--moon-d:96px] 2xl:[--moon-d:112px]">
        <Moon placement="landing" />
        <h1 className="min-w-0 font-display text-[3rem] leading-[1.1] [overflow-wrap:anywhere] sm:text-[3.75rem] lg:text-[4.5rem] 2xl:text-[5rem]">
          Zombills
        </h1>
        <p className="font-display text-[1.5rem] leading-tight sm:text-[1.75rem] 2xl:text-[2rem]">
          Your bank statement is haunted.
        </p>
        <SavingsCounter
          totals={haunt.savings}
          fallbackCurrency={haunt.counterFallbackCurrency}
          reduceMotion={reduceMotion}
          className="max-w-full rounded-xl bg-fog/95 px-4 py-2"
        />
      </header>
    </div>
  );
}
