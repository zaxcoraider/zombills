import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { formatMoney } from "../logic/money";
import type { CurrencyTotal } from "../logic/totals";
import { COUNTER_TWEEN, counterFade } from "./motion";

export interface SavingsCounterProps {
  /** haunt.savings, in code-unit order of currency */
  totals: readonly CurrencyTotal[];
  /** Shown as formatMoney(0, currency) when totals is empty */
  fallbackCurrency: string | null;
  reduceMotion: boolean;
  /** Extra classes for the group, for the Landing view's counter card */
  className?: string;
}

interface CounterLineProps {
  cents: number;
  initialCents: number;
  currency: string;
  reduceMotion: boolean;
}

/**
 * One currency's yearly savings, counted up in minor units. Right-aligned in a box with tabular
 * figures so the digits stay put as the number grows.
 */
function CounterLine({ cents, initialCents, currency, reduceMotion }: CounterLineProps) {
  const value = useMotionValue(initialCents);
  const text = useTransform(value, (v) => formatMoney(Math.round(v), currency));

  useEffect(() => {
    // A drop (unbury), no change (a line mounted at its value) and reduced motion set the value
    // at once; only a rise is tweened.
    if (reduceMotion || cents <= value.get()) {
      value.set(cents);
      return;
    }
    const controls = animate(value, cents, COUNTER_TWEEN);
    return () => controls.stop();
  }, [cents, reduceMotion, value]);

  return (
    <div className="flex flex-col items-end">
      <motion.span
        // Under reduced motion the new figure fades in instead of counting.
        key={reduceMotion ? cents : "counting"}
        aria-hidden="true"
        className="mt-2 inline-block min-w-[7ch] text-right [overflow-wrap:anywhere] text-[2rem] font-semibold leading-none text-moss tabular-nums sm:text-[2.5rem]"
        style={{
          textShadow:
            cents > 0 ? "0 0 1.5rem color-mix(in oklab, var(--moss) 45%, transparent)" : "none",
        }}
        {...counterFade(reduceMotion)}
      >
        {text}
      </motion.span>
      <span className="sr-only">{formatMoney(cents, currency)}</span>
    </div>
  );
}

/** Yearly savings, one line per currency (Req 6.2, 6.3, 6.8). */
export function SavingsCounter({
  totals,
  fallbackCurrency,
  reduceMotion,
  className,
}: SavingsCounterProps) {
  // Lines present at the first mount start at their value; lines added later count up from 0.
  const firstMount = useRef<Map<string, number> | null>(null);
  firstMount.current ??= new Map(totals.map((t) => [t.currency, t.totalCents]));
  const initial = firstMount.current;

  const lines: CurrencyTotal[] =
    totals.length > 0
      ? [...totals]
      : fallbackCurrency === null
        ? []
        : [{ currency: fallbackCurrency, totalCents: 0 }];
  if (lines.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Saved per year"
      className={
        className === undefined ? "flex flex-col items-end" : `flex flex-col items-end ${className}`
      }
    >
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-bone/70">
        Saved per year
      </span>
      {lines.map((line) => (
        <CounterLine
          key={line.currency}
          currency={line.currency}
          cents={line.totalCents}
          initialCents={initial.has(line.currency) ? line.totalCents : 0}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}
