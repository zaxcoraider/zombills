import { describe, expect, it } from "vitest";
import { buttonVariant, type ButtonVariant } from "./button-variants";
import { BARE_FOCUS } from "./landing/bare-focus";
import {
  DANGER_DISABLED_OUTLINE_ALPHA,
  DANGER_DISABLED_TEXT_ALPHA,
  DANGER_QUIET_ALPHA,
  DANGER_TEXT_BLOOD,
  OUTLINE_ALPHA,
  OUTLINE_DISABLED_ALPHA,
  PRIMARY_DISABLED_MOSS,
} from "./logic/design-tokens";

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "tertiary", "danger", "danger-quiet"];

const BASE = [
  "inline-flex",
  "min-h-11",
  "min-w-11",
  "items-center",
  "justify-center",
  "gap-2",
  "px-4",
  "py-2",
  "text-small",
  "cursor-pointer",
  "aria-disabled:cursor-default",
  "select-none",
  "rounded-control",
];

const COLOURS: Record<ButtonVariant, readonly string[]> = {
  primary: [
    "bg-moss",
    "font-semibold",
    "text-night",
    "hover:bg-[color-mix(in_srgb,var(--moss)_88%,var(--bone))]",
    "aria-disabled:bg-[color-mix(in_srgb,var(--moss)_70%,var(--fog))]",
    "aria-disabled:hover:bg-[color-mix(in_srgb,var(--moss)_70%,var(--fog))]",
  ],
  secondary: [
    "border",
    "border-bone/50",
    "bg-transparent",
    "font-semibold",
    "text-bone",
    "hover:bg-bone/10",
    "aria-disabled:border-bone/45",
    "aria-disabled:text-bone/70",
    "aria-disabled:hover:bg-transparent",
  ],
  tertiary: [
    "font-semibold",
    "text-bone",
    "underline",
    "decoration-1",
    "underline-offset-4",
    "hover:decoration-2",
    "aria-disabled:no-underline",
  ],
  danger: [
    "border",
    "border-blood",
    "font-semibold",
    "text-[color-mix(in_srgb,var(--blood)_80%,var(--bone))]",
    "hover:bg-blood/10",
    "aria-disabled:border-blood/80",
    "aria-disabled:text-[color-mix(in_srgb,color-mix(in_srgb,var(--blood)_80%,var(--bone))_90%,transparent)]",
    "aria-disabled:hover:bg-transparent",
  ],
  "danger-quiet": [
    "border",
    "border-blood/85",
    "font-normal",
    "text-[color-mix(in_srgb,var(--blood)_80%,var(--bone))]",
    "hover:bg-blood/10",
    "aria-disabled:border-blood/80",
    "aria-disabled:text-[color-mix(in_srgb,color-mix(in_srgb,var(--blood)_80%,var(--bone))_90%,transparent)]",
    "aria-disabled:hover:bg-transparent",
  ],
};

const classes = (className: string): string[] => className.split(/\s+/).filter(Boolean);
const pct = (fraction: number): number => Math.round(fraction * 100);

describe("buttonVariant", () => {
  it.each(VARIANTS)("%s has the base classes, its colour classes and no opacity", (variant) => {
    const list = classes(buttonVariant(variant).className);
    for (const c of [...BASE, ...COLOURS[variant]]) expect(list).toContain(c);
    expect(list.some((c) => c.includes("opacity-"))).toBe(false);
  });

  it("danger-quiet has no full-strength border and no semibold", () => {
    const list = classes(buttonVariant("danger-quiet").className);
    expect(list).not.toContain("border-blood");
    expect(list).not.toContain("font-semibold");
  });

  it.each([
    ["primary", "primary"],
    ["secondary", "secondary"],
    ["tertiary", "tertiary"],
    ["danger", "danger"],
    ["danger-quiet", "danger"],
  ] as const)("%s reports data-variant=%s", (variant, reported) => {
    expect(buttonVariant(variant)["data-variant"]).toBe(reported);
  });

  it("bare adds BARE_FOCUS; without it the focus band is absent", () => {
    expect(buttonVariant("tertiary", { bare: true }).className).toContain(BARE_FOCUS);
    expect(buttonVariant("tertiary").className).not.toContain(BARE_FOCUS);
  });

  it("full adds w-full; without it there is no w-full", () => {
    expect(classes(buttonVariant("primary", { full: true }).className)).toContain("w-full");
    expect(classes(buttonVariant("primary").className)).not.toContain("w-full");
  });

  it.each(VARIANTS)("inheritSize leaves text-small out of %s and keeps the rest", (variant) => {
    const list = classes(buttonVariant(variant, { inheritSize: true }).className);
    expect(list).not.toContain("text-small");
    for (const c of [...BASE.filter((b) => b !== "text-small"), ...COLOURS[variant]]) {
      expect(list).toContain(c);
    }
  });

  it("the alpha classes match the exported alphas", () => {
    const secondary = classes(buttonVariant("secondary").className);
    expect(secondary).toContain(`border-bone/${pct(OUTLINE_ALPHA)}`);
    expect(secondary).toContain(`aria-disabled:border-bone/${pct(OUTLINE_DISABLED_ALPHA)}`);
    const quiet = classes(buttonVariant("danger-quiet").className);
    expect(quiet).toContain(`border-blood/${pct(DANGER_QUIET_ALPHA)}`);
    const dangerText = `text-[color-mix(in_srgb,var(--blood)_${pct(DANGER_TEXT_BLOOD)}%,var(--bone))]`;
    expect(classes(buttonVariant("danger").className)).toContain(dangerText);
    expect(quiet).toContain(dangerText);
    for (const list of [classes(buttonVariant("danger").className), quiet]) {
      expect(list).toContain(`aria-disabled:border-blood/${pct(DANGER_DISABLED_OUTLINE_ALPHA)}`);
      expect(list).toContain(
        `aria-disabled:text-[color-mix(in_srgb,color-mix(in_srgb,var(--blood)_${pct(DANGER_TEXT_BLOOD)}%,var(--bone))_${pct(DANGER_DISABLED_TEXT_ALPHA)}%,transparent)]`,
      );
    }
    expect(classes(buttonVariant("primary").className)).toContain(
      `aria-disabled:bg-[color-mix(in_srgb,var(--moss)_${pct(PRIMARY_DISABLED_MOSS)}%,var(--fog))]`,
    );
  });
});
