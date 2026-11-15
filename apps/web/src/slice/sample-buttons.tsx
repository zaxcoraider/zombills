import { SAMPLES } from "./samples";
import type { Sample } from "./samples";

export interface SampleButtonsProps {
  disabled: boolean;
  onChoose: (sample: Sample) => void;
}

export function SampleButtons({ disabled, onChoose }: SampleButtonsProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">Or try a sample statement</h2>
      <ul className="flex flex-col gap-2">
        {SAMPLES.map((sample) => (
          <li key={sample.fileName}>
            <button
              type="button"
              aria-disabled={disabled ? true : undefined}
              onClick={() => {
                if (!disabled) onChoose(sample);
              }}
              className="rounded border border-bone bg-fog px-4 py-2 text-bone aria-disabled:opacity-60"
            >
              {sample.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
