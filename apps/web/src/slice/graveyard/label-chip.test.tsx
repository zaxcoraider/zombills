// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { LabelChip, type LabelKind } from "./label-chip";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const KINDS: readonly (readonly [LabelKind, string])[] = [
  ["undead", "Undead"],
  ["zombie", "Zombie"],
  ["resting", "Resting"],
  ["possessed", "Possessed"],
  ["trial-trap", "Trial trap"],
];

describe("LabelChip", () => {
  it.each(KINDS)("%s renders the word %s", (kind, word) => {
    render(<LabelChip kind={kind} reduceMotion={false} />);
    expect(screen.getByText(word)).toBeTruthy();
  });

  it.each(KINDS)("%s has an aria-hidden icon and no img element", (kind, word) => {
    const { container } = render(<LabelChip kind={kind} reduceMotion={true} />);
    const svg = screen.getByText(word).querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
