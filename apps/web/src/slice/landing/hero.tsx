import { FadeIn } from "../fade-in";
import { FREE_LINE } from "../logic/chrome-text";
import { HERO_LINE, US_SAMPLE_FILE_NAME } from "../logic/landing-text";
import { SAMPLES } from "../samples";
import type { Sample } from "../samples";
import { HeroArt } from "./hero-art";
import "./landing-motion.css";
import { PrimaryAction } from "./primary-action";
import { PrivacyBadge } from "./privacy-badge";
import { ReturnNotes } from "./return-notes";
import type { ReturnNotesProps } from "./return-notes";
import { SecondarySamples } from "./secondary-samples";
import { useLandingMotion } from "./use-landing-motion";

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
  const motion = useLandingMotion();
  return (
    <div className="zb-hero flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <p className="max-w-[40rem] text-base leading-6 sm:text-lg sm:leading-7 lg:col-start-1 lg:row-start-1">
        {HERO_LINE}
      </p>
      <HeroArt motion={motion} />
      <div className="flex flex-col items-start gap-4 lg:col-start-1 lg:row-start-2">
        <PrimaryAction disabled={working} onActivate={() => onChooseSample(usSample)} />
        {/* The free line is its own line at every width (Batch A review #2). It stays in the
            Secondary samples' wrapper so the Hero keeps the height the scene tests measure; see
            task 15's note. */}
        <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
          <p className="text-body text-bone sm:basis-full">{FREE_LINE}</p>
          {working && workingSourceName !== null ? (
            <div className="sm:basis-full">
              <FadeIn key="working">
                <div className="rounded-card bg-fog/95 px-4 py-3">
                  <p>Reading {workingSourceName}…</p>
                </div>
              </FadeIn>
            </div>
          ) : null}
          <SecondarySamples disabled={working} onChoose={onChooseSample} />
        </div>
        <PrivacyBadge onReadNote={onReadNote} />
        {returnNotes !== null ? <ReturnNotes {...returnNotes} /> : null}
      </div>
    </div>
  );
}
