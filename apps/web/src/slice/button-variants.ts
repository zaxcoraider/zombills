import { BARE_FOCUS } from "./landing/bare-focus";

/** The Button variants of pro-polish Requirement 6 (design "Button variants"). */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "danger-quiet";

export interface VariantOptions {
  /** Adds `BARE_FOCUS`, for a control on the bare scene. */
  bare?: boolean;
  /** Adds `w-full`. */
  full?: boolean;
  /** Leaves `text-small` out, so a button inside a heading takes the heading's size. */
  inheritSize?: boolean;
}

export interface VariantProps {
  className: string;
  "data-variant": "primary" | "secondary" | "tertiary" | "danger";
}

const BASE_LAYOUT = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-4 py-2";
const BASE_SIZE = "text-small";
const BASE_CURSOR = "cursor-pointer aria-disabled:cursor-default select-none";

const DANGER_TEXT = "text-[color-mix(in_srgb,var(--blood)_80%,var(--bone))]";
/** `aria-disabled`: outline at 80 % and text at 90 %, both still meeting Req 6.4 on C. */
const DANGER_DISABLED =
  "aria-disabled:border-blood/80 aria-disabled:text-[color-mix(in_srgb,color-mix(in_srgb,var(--blood)_80%,var(--bone))_90%,transparent)] aria-disabled:hover:bg-transparent";

/** Literal class strings, so Tailwind's scanner finds them. Alphas match `logic/design-tokens.ts`. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "rounded-control bg-moss font-semibold text-night hover:bg-[color-mix(in_srgb,var(--moss)_88%,var(--bone))] aria-disabled:bg-[color-mix(in_srgb,var(--moss)_70%,var(--fog))] aria-disabled:hover:bg-[color-mix(in_srgb,var(--moss)_70%,var(--fog))]",
  secondary:
    "rounded-control border border-bone/50 bg-transparent font-semibold text-bone hover:bg-bone/10 aria-disabled:border-bone/45 aria-disabled:text-bone/70 aria-disabled:hover:bg-transparent",
  tertiary:
    "rounded-control font-semibold text-bone underline decoration-1 underline-offset-4 hover:decoration-2 aria-disabled:no-underline",
  danger: `rounded-control border border-blood font-semibold ${DANGER_TEXT} hover:bg-blood/10 ${DANGER_DISABLED}`,
  "danger-quiet": `rounded-control border border-blood/85 font-normal ${DANGER_TEXT} hover:bg-blood/10 ${DANGER_DISABLED}`,
};

/** Class string and `data-variant` to spread on a native `button` or `a`. */
export function buttonVariant(variant: ButtonVariant, opts: VariantOptions = {}): VariantProps {
  const parts = [BASE_LAYOUT];
  if (!opts.inheritSize) parts.push(BASE_SIZE);
  parts.push(BASE_CURSOR, VARIANT_CLASSES[variant]);
  if (opts.full) parts.push("w-full");
  if (opts.bare) parts.push(BARE_FOCUS);
  return {
    className: parts.join(" "),
    "data-variant": variant === "danger-quiet" ? "danger" : variant,
  };
}
