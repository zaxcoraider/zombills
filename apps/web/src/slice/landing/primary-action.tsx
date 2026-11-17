import { PRIMARY_ACTION_LINES } from "../logic/landing-text";

export interface PrimaryActionProps {
  disabled: boolean;
  onActivate: () => void;
}

// Class strings are written out in full so Tailwind's scanner finds each utility.
const BUTTON_CLASS = [
  "group flex min-h-14 w-full min-w-11 flex-col items-center justify-center rounded-2xl bg-moss px-6 py-3 text-center text-night",
  "shadow-[0_4px_0_0_color-mix(in_oklab,var(--moss)_40%,var(--night))]",
  "hover:shadow-[0_4px_0_0_color-mix(in_oklab,var(--moss)_40%,var(--night)),0_0_0_5px_color-mix(in_srgb,var(--night)_70%,transparent),0_0_14px_4px_color-mix(in_srgb,var(--moss)_35%,transparent)]",
  "focus-visible:shadow-[0_4px_0_0_color-mix(in_oklab,var(--moss)_40%,var(--night)),0_0_0_5px_color-mix(in_srgb,var(--night)_70%,transparent),0_0_14px_4px_color-mix(in_srgb,var(--moss)_35%,transparent)]",
  "aria-disabled:opacity-60 sm:w-auto",
].join(" ");

/** The one `--moss` control on the Landing view: it reads the US Sample. */
export function PrimaryAction({ disabled, onActivate }: PrimaryActionProps) {
  return (
    <button
      type="button"
      aria-disabled={disabled ? true : undefined}
      onClick={() => {
        if (!disabled) onActivate();
      }}
      className={BUTTON_CLASS}
    >
      <span className="block text-xl font-semibold leading-tight group-hover:underline group-focus-visible:underline">
        {PRIMARY_ACTION_LINES[0]}
      </span>{" "}
      <span className="block text-base leading-6">{PRIMARY_ACTION_LINES[1]}</span>
    </button>
  );
}
