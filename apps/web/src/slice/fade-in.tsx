import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const FADE_DURATION_SECONDS = 0.15;

/** Opacity-only motion; the duration is 0 when the user prefers reduced motion (Req 8.7). */
export function fadeInMotion(reduced: boolean) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: reduced ? 0 : FADE_DURATION_SECONDS },
  };
}

export function FadeIn({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  return <motion.div {...fadeInMotion(reduced)}>{children}</motion.div>;
}
