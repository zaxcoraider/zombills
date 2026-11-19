import {
  OTHER_SAMPLES_LABEL,
  OTHER_SAMPLES_LIST_NAME,
  US_SAMPLE_FILE_NAME,
} from "../logic/landing-text";
import { SAMPLES } from "../samples";
import type { Sample } from "../samples";
import { BARE_FOCUS } from "./bare-focus";

export interface SecondarySamplesProps {
  disabled: boolean;
  onChoose: (sample: Sample) => void;
}

const OTHER_SAMPLES = SAMPLES.filter((s) => s.fileName !== US_SAMPLE_FILE_NAME);

/** The Samples other than the US Sample, as text-style buttons under the Primary action. */
export function SecondarySamples({ disabled, onChoose }: SecondarySamplesProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-sm">
      <span className="py-3">{OTHER_SAMPLES_LABEL}</span>
      <ul aria-label={OTHER_SAMPLES_LIST_NAME} className="flex flex-wrap gap-x-1">
        {OTHER_SAMPLES.map((sample) => (
          <li key={sample.fileName}>
            <button
              type="button"
              data-exempt="secondary-sample"
              aria-disabled={disabled ? true : undefined}
              onClick={() => {
                if (!disabled) onChoose(sample);
              }}
              className={`inline-flex min-h-11 min-w-11 items-center px-2 text-sm text-bone underline underline-offset-4 aria-disabled:opacity-60 ${BARE_FOCUS}`}
            >
              {sample.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
