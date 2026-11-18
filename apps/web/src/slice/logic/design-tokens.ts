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
