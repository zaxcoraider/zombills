import { FadeIn } from "../fade-in";
import { HERO_LINE, US_SAMPLE_FILE_NAME } from "../logic/landing-text";
import { SAMPLES } from "../samples";
import type { Sample } from "../samples";
import { HeroArt } from "./hero-art";
import { PrimaryAction } from "./primary-action";
import { PrivacyBadge } from "./privacy-badge";
import { ReturnNotes } from "./return-notes";
import type { ReturnNotesProps } from "./return-notes";
import { SecondarySamples } from "./secondary-samples";

function findUsSample(): Sample {
  const found = SAMPLES.find((s) => s.fileName === US_SAMPLE_FILE_NAME);
  if (found === undefined) throw new Error(`Sample ${US_SAMPLE_FILE_NAME} is missing`);
  return found;
}

// Looked up at import, so a renamed Sample fails every test at once.
const usSample = findUsSample();

export interface HeroProps {
  working: boolean;
  workingSourceName: string | null;
  onChooseSample: (sample: Sample) => void;
  onReadNote: () => void;
  returnNotes: ReturnNotesProps | null;
}

/** The Hero line, the art and the controls that start a run. */
export function Hero({
  working,
  workingSourceName,
  onChooseSample,
  onReadNote,
  returnNotes,
}: HeroProps) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <p className="max-w-[40rem] text-base leading-6 sm:text-lg sm:leading-7 lg:col-start-1 lg:row-start-1">
        {HERO_LINE}
      </p>
      <HeroArt />
      <div className="flex flex-col items-start gap-4 lg:col-start-1 lg:row-start-2">
        <PrimaryAction disabled={working} onActivate={() => onChooseSample(usSample)} />
        {working && workingSourceName !== null ? (
          <FadeIn key="working">
            <div className="rounded-2xl bg-fog/95 px-4 py-3">
              <p>Reading {workingSourceName}…</p>
            </div>
          </FadeIn>
        ) : null}
        <SecondarySamples disabled={working} onChoose={onChooseSample} />
        <PrivacyBadge onReadNote={onReadNote} />
        {returnNotes !== null ? <ReturnNotes {...returnNotes} /> : null}
      </div>
    </div>
  );
}
