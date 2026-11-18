/** Copy for the Landing view and the Footer (landing-polish, Req 3.2, 4.1, 5.1, 6.1, 7.1, 8.1). */

export const HERO_LINE =
  "We find the subscriptions still feeding on you. You decide which ones to bury.";

export const PRIMARY_ACTION_LINES = [
  "Summon the undead",
  "with a sample US bank statement",
] as const;
export const PRIMARY_ACTION_NAME = PRIMARY_ACTION_LINES.join(" ");

export const OTHER_SAMPLES_LABEL = "Other samples:";
export const OTHER_SAMPLES_LIST_NAME = "Other sample statements";

export const PRIVACY_BADGE_TEXT = "Your statement never leaves your device.";
export const READ_PRIVACY_NOTE = "Read the privacy note";

export const HOW_IT_WORKS_HEADING = "How it works";
export const HOW_IT_WORKS_STEPS: readonly { heading: string; text: string }[] = [
  {
    heading: "Find the undead",
    text: "Drop in a statement. Every charge that keeps coming back rises from the grave.",
  },
  { heading: "Count what they cost", text: "See what each one drains from you in a year." },
  {
    heading: "Bury them",
    text: "Bury the ones you no longer use, and get help to cancel them.",
  },
];

export const OWN_STATEMENT_HEADING = "Or use your own statement";

export const BUILT_WITH_KIRO = "Built with Kiro";
export const REPO_LINK = {
  text: "Zombills on GitHub",
  href: "https://github.com/zaxcoraider/zombills",
};
export const REAPER_LINK = {
  text: "The Reaper",
  href: "https://github.com/zaxcoraider/zombills-reaper",
};
export const REAPER_DESCRIPTION =
  "A Kiro Crew app that watches for new statements each month and drafts cancellation emails when you ask.";
export const KIRO_LINK = {
  text: "Built with Kiro",
  href: "https://kiro.dev",
};

/** The file name of the US Sample, which the Primary action analyses. */
export const US_SAMPLE_FILE_NAME = "us-signed.csv";
