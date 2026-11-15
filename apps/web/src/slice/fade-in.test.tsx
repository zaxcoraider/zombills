// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FadeIn, fadeInMotion } from "./fade-in";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => true };
});

describe("fadeInMotion", () => {
  it("sets only opacity and a 0 s duration when motion is reduced", () => {
    const motion = fadeInMotion(true);
    expect(motion.initial).toEqual({ opacity: 0 });
    expect(motion.animate).toEqual({ opacity: 1 });
    expect(motion.transition).toEqual({ duration: 0 });
  });

  it("sets only opacity and a 0.15 s duration otherwise", () => {
    const motion = fadeInMotion(false);
    expect(motion.initial).toEqual({ opacity: 0 });
    expect(motion.animate).toEqual({ opacity: 1 });
    expect(motion.transition).toEqual({ duration: 0.15 });
  });
});

describe("FadeIn", () => {
  it("renders its children when reduced motion is on", () => {
    render(
      <FadeIn>
        <p>Hello</p>
      </FadeIn>,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
