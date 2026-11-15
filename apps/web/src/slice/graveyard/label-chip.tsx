import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import { EmberIcon, EyeClosedIcon, EyeOpenIcon, HourglassIcon, ShovelIcon } from "./icons";
import { REDUCED_FADE } from "./motion";

export type LabelKind = "undead" | "zombie" | "resting" | "possessed" | "trial-trap";

const LABELS: Record<
  LabelKind,
  { word: string; Icon: ComponentType<{ className?: string | undefined }>; className: string }
> = {
  undead: { word: "Undead", Icon: EyeOpenIcon, className: "border-moss/40 bg-moss/10 text-moss" },
  zombie: { word: "Zombie", Icon: ShovelIcon, className: "border-moss bg-moss text-night" },
  resting: {
    word: "Resting",
    Icon: EyeClosedIcon,
    className: "border-bone/20 bg-bone/5 text-bone",
  },
  possessed: {
    word: "Possessed",
    Icon: EmberIcon,
    className: "border-ember/50 bg-ember/10 text-ember",
  },
  "trial-trap": {
    word: "Trial trap",
    Icon: HourglassIcon,
    className: "border-spectre/50 bg-spectre/10 text-spectre",
  },
};

const CHIP_BASE =
  "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.14em]";

export interface LabelChipProps {
  kind: LabelKind;
  reduceMotion: boolean;
}

/** A label is always an icon plus a word, never colour alone. */
export function LabelChip({ kind, reduceMotion }: LabelChipProps) {
  const { word, Icon, className } = LABELS[kind];
  const content = (
    <>
      <Icon className="size-4" />
      {word}
    </>
  );

  if (kind === "possessed" || kind === "trial-trap") {
    return <span className={`${CHIP_BASE} ${className}`}>{content}</span>;
  }

  const offset = reduceMotion ? 0 : 4;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={kind}
        className={`${CHIP_BASE} ${className}`}
        initial={{ opacity: 0, y: offset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -offset }}
        transition={REDUCED_FADE}
      >
        {content}
      </motion.span>
    </AnimatePresence>
  );
}
