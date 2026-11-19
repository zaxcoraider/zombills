import { focusKey } from "../graveyard/use-focus-request";
import { SAMPLE_LIST_NAME } from "../logic/chrome-text";
import { SAMPLES } from "../samples";
import type { Sample } from "../samples";

export interface SampleChipsProps {
  disabled: boolean;
  onChoose: (sample: Sample) => void;
}

/** The four Samples as small tombstone chips, in `SAMPLES` order (Req 3.9). */
export function SampleChips({ disabled, onChoose }: SampleChipsProps) {
  return (
    <ul aria-label={SAMPLE_LIST_NAME} className="flex flex-wrap gap-2">
      {SAMPLES.map((sample) => (
        <li key={sample.fileName}>
          <button
            type="button"
            data-exempt="sample-chip"
            data-focus={focusKey({ target: "sample-chip", id: sample.fileName })}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onChoose(sample);
            }}
            className="min-h-11 rounded-t-stone rounded-b-small border border-bone/50 bg-fog px-4 pb-2 pt-4 text-small font-semibold text-bone hover:border-moss aria-disabled:opacity-60 aria-disabled:hover:border-bone/50"
          >
            {sample.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
