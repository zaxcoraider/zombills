import type { MeasureFn } from "./share-card";

export type RoleStyle = {
  readonly family: "display" | "sans";
  readonly weight: 400 | 500 | 600;
  /** R11.6: "italic" only for epitaph. */
  readonly style: "normal" | "italic";
  readonly startPx: number;
  /** Lowest size the shrink loop reaches: 1 for total and count. */
  readonly floorPx: number;
  /** false for total and count: never shortened (Req 2.5). */
  readonly shorten: boolean;
  readonly maxWidth: number;
};

export const DISPLAY_FAMILY = '"IM Fell English", Georgia, serif'; // --font-display
export const SANS_FAMILY = '"Inter", ui-sans-serif, system-ui, sans-serif'; // --font-sans
export const ELLIPSIS = "…";

/** e.g. `600 72px "Inter", ui-sans-serif, system-ui, sans-serif`, or `italic 400 40px "IM Fell English", Georgia, serif` */
export function fontFor(style: RoleStyle, sizePx: number): string {
  const family = style.family === "display" ? DISPLAY_FAMILY : SANS_FAMILY;
  const prefix = style.style === "italic" ? "italic " : "";
  return `${prefix}${style.weight} ${sizePx}px ${family}`;
}

export type FittedLine = {
  readonly text: string;
  readonly sizePx: number;
  readonly font: string;
};

/** Longest code-point prefix, trailing whitespace removed, plus "…", that fits; else "…". */
export function shortenToFit(
  source: string,
  font: string,
  maxWidth: number,
  measure: MeasureFn,
): string {
  const points = Array.from(source);
  for (let k = points.length - 1; k >= 1; k -= 1) {
    const prefix = points.slice(0, k).join("").trimEnd();
    if (prefix === "") continue;
    const candidate = prefix + ELLIPSIS;
    if (measure(candidate, font) <= maxWidth) return candidate;
  }
  return ELLIPSIS;
}

/** Shrink, then (where allowed) shorten. Req 2.5 and 2.7. */
export function fitLine(source: string, style: RoleStyle, measure: MeasureFn): FittedLine {
  for (let size = style.startPx; size >= style.floorPx; size -= 1) {
    const font = fontFor(style, size);
    if (measure(source, font) <= style.maxWidth) return { text: source, sizePx: size, font };
  }
  const font = fontFor(style, style.floorPx);
  if (!style.shorten) return { text: source, sizePx: style.floorPx, font };
  return {
    text: shortenToFit(source, font, style.maxWidth, measure),
    sizePx: style.floorPx,
    font,
  };
}
