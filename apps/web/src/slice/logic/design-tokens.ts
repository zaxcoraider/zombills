/**
 * The pro-polish design scales as plain data, for tests that check
 * `src/index.css` against them. Each entry names its CSS custom property
 * without the leading `--`.
 */

export interface SpaceToken {
  readonly name: string;
  readonly value: string;
}

export interface TypeToken {
  readonly name: string;
  readonly size: string;
  readonly lineHeight: string;
}

export interface RadiusToken {
  readonly name: string;
  readonly value: string;
}

export const SPACE_SCALE: readonly SpaceToken[] = [
  { name: "space-1", value: "0.5rem" },
  { name: "space-2", value: "1rem" },
  { name: "space-3", value: "1.5rem" },
  { name: "space-4", value: "2rem" },
  { name: "space-5", value: "2.5rem" },
  { name: "space-6", value: "3rem" },
  { name: "space-8", value: "4rem" },
];

export const TYPE_SCALE: readonly TypeToken[] = [
  { name: "text-caption", size: "0.8125rem", lineHeight: "1.25rem" },
  { name: "text-small", size: "0.875rem", lineHeight: "1.25rem" },
  { name: "text-body", size: "1rem", lineHeight: "1.5rem" },
  { name: "text-lead", size: "1.25rem", lineHeight: "1.75rem" },
  { name: "text-title", size: "1.75rem", lineHeight: "2rem" },
  { name: "text-display", size: "2.5rem", lineHeight: "1" },
];

export const RADIUS_SCALE: readonly RadiusToken[] = [
  { name: "radius-small", value: "0.5rem" },
  { name: "radius-control", value: "0.75rem" },
  { name: "radius-card", value: "1rem" },
  { name: "radius-stone", value: "1.5rem" },
  { name: "radius-pill", value: "9999px" },
];

/** Peak stop-opacity of the moss glow in the Grave pit (pro-polish "Colours and contrast", P). */
export const PIT_GLOW_ALPHA = 0.14;

/**
 * Alphas and mix fractions of the Button variants and the footnote (pro-polish "Colours and
 * contrast"). The class strings in `slice/button-variants.ts` are literal, for Tailwind's scanner;
 * `button-variants.test.ts` checks that they match these values.
 */
/** Secondary outline: `border-bone/50`. */
export const OUTLINE_ALPHA = 0.5;
/** Secondary outline while `aria-disabled`: `aria-disabled:border-bone/45`. */
export const OUTLINE_DISABLED_ALPHA = 0.45;
/** Danger text: `color-mix(in srgb, var(--blood) 80%, var(--bone))`. */
export const DANGER_TEXT_BLOOD = 0.8;
/** Quiet danger outline: `border-blood/85`. */
export const DANGER_QUIET_ALPHA = 0.85;
/** Danger and quiet danger outline while `aria-disabled`: `aria-disabled:border-blood/80`. */
export const DANGER_DISABLED_OUTLINE_ALPHA = 0.8;
/** Danger text while `aria-disabled`: the danger text mix at 90 % over the surface. */
export const DANGER_DISABLED_TEXT_ALPHA = 0.9;
/** Primary fill while `aria-disabled`: `color-mix(in srgb, var(--moss) 70%, var(--fog))`. */
export const PRIMARY_DISABLED_MOSS = 0.7;
/** Muted footnote text: `text-bone/80`. */
export const FOOTNOTE_ALPHA = 0.8;
