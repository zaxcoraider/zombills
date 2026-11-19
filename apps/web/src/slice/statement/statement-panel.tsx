import { useId } from "react";
import { DropZone } from "../drop-zone";
import { STATEMENT_HINT, TRY_ANOTHER_STATEMENT } from "../logic/chrome-text";
import { OWN_STATEMENT_HEADING } from "../logic/landing-text";
import { STATEMENT_TIP } from "../logic/memory-text";
import type { Sample } from "../samples";
import { SampleChips } from "./sample-chips";

export type StatementPlace = "landing" | "gate";

export interface StatementPanelProps {
  place: StatementPlace;
  /** false inside the Statement disclosure, whose h2 is the heading */
  showHeading: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onFiles: (files: File[]) => void;
  onChooseSample: (sample: Sample) => void;
}

/** Heading, hint, Tip, Grave drop area and (on the gate) the Sample chips (Req 3.1). */
export function StatementPanel({
  place,
  showHeading,
  disabled,
  reduceMotion,
  onFiles,
  onChooseSample,
}: StatementPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={showHeading ? headingId : undefined}
      className="flex flex-col gap-4 rounded-card bg-fog/95 p-4 sm:p-6"
    >
      {showHeading ? (
        <h2 id={headingId} className="text-xl font-bold">
          {place === "landing" ? OWN_STATEMENT_HEADING : TRY_ANOTHER_STATEMENT}
        </h2>
      ) : null}
      <p>{STATEMENT_HINT}</p>
      <p>{STATEMENT_TIP}</p>
      <DropZone disabled={disabled} reduceMotion={reduceMotion} onFiles={onFiles} />
      {place === "gate" ? <SampleChips disabled={disabled} onChoose={onChooseSample} /> : null}
    </section>
  );
}
