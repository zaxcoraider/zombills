import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { formatCents } from "./spike-data";

type SavingsCounterProps = { cents: number; reduceMotion: boolean };

/**
 * Yearly savings, counted up in whole cents. Right-aligned in a fixed-width box with tabular
 * figures so the digits stay put as the number grows.
 */
export function SavingsCounter({ cents, reduceMotion }: SavingsCounterProps) {
  const value = useMotionValue(0);
  const text = useTransform(value, (v) => formatCents(Math.round(v)));

  useEffect(() => {
    // Reset (Replay) and reduced motion jump straight to the value.
    if (reduceMotion || cents < value.get()) {
      value.set(cents);
      return;
    }
    const controls = animate(value, cents, { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.35 });
    return () => controls.stop();
  }, [cents, reduceMotion, value]);

  return (
    <div className="flex flex-col items-end">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-bone/70">
        Saved per year
      </span>
      <motion.span
        // Under reduced motion the new figure fades in instead of counting.
        key={reduceMotion ? cents : "counting"}
        aria-hidden="true"
        className="mt-2 inline-block w-[7ch] text-right text-[2rem] font-semibold leading-none text-moss tabular-nums sm:text-[2.5rem]"
        style={{
          textShadow:
            cents > 0 ? "0 0 1.5rem color-mix(in oklab, var(--moss) 45%, transparent)" : "none",
        }}
        initial={reduceMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {text}
      </motion.span>
      <span className="sr-only">{formatCents(cents)}</span>
    </div>
  );
}
