// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ClassifiedSubscription, PriceRise, TrialDetails } from "@zombills/core";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { formatMoney } from "../logic/money";
import { partsToText, priceRiseParts, trialParts } from "../logic/label-text";
import { CARD_SWAY } from "./motion";
import { GUESSED_AMAZON_PRIME, POSSESSED_TRIAL_TRAP, TRIAL_TRAP, APPLE_99 } from "./test-fixtures";
import { UndeadCard, type CardPhase, type UndeadCardProps } from "./undead-card";

/** The latest `animate` prop of the sway layer (the `motion.div` turning about its bottom centre). */
const swayAnimate = vi.hoisted(() => ({ current: undefined as unknown }));

// Pass-through: every `motion.div` renders the real one; the sway layer's `animate` is recorded.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  const { createElement, forwardRef } = await vi.importActual<typeof import("react")>("react");
  type DivProps = Parameters<typeof actual.motion.div>[0];
  const RecordingDiv = forwardRef<HTMLDivElement, DivProps>(function RecordingDiv(props, ref) {
    const style = props.style as { originY?: number } | undefined;
    if (style?.originY === 1) swayAnimate.current = props.animate;
    return createElement(actual.motion.div, { ...props, ref });
  });
  const motion = new Proxy(actual.motion, {
    get: (target, key, receiver) =>
      key === "div" ? RecordingDiv : Reflect.get(target, key, receiver),
  });
  return { ...actual, motion };
});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const CURRENCY = "USD";

const PRICE_RISE: PriceRise = {
  firstSeen: { date: "2026-01-02", amountCents: 1000 },
  currentAmountCents: 1400,
  latestRise: { fromAmountCents: 1000, toAmountCents: 1400, date: "2026-03-02" },
  increasePerChargeCents: 400,
  increasePerYearCents: 4800,
};

const FREE_ONLY: TrialDetails = {
  freeTrialDate: "2026-01-05",
  introCharge: null,
  firstFullCharge: { date: "2026-02-05", amountCents: 1099 },
};

const INTRO_ONLY: TrialDetails = {
  freeTrialDate: null,
  introCharge: { date: "2026-01-10", amountCents: 100 },
  firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
};

const BOTH: TrialDetails = {
  freeTrialDate: "2026-01-03",
  introCharge: { date: "2026-01-10", amountCents: 100 },
  firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
};

function withOverrides(overrides: Partial<ClassifiedSubscription>): ClassifiedSubscription {
  return { ...APPLE_99, ...overrides };
}

interface Handlers {
  onRest: Mock<() => void>;
  onBury: Mock<() => void>;
  onSkip: Mock<() => void>;
  onCondemned: Mock<() => void>;
  onSunk: Mock<() => void>;
}

function renderCard(
  subscription: ClassifiedSubscription,
  props: Partial<UndeadCardProps> = {},
): { container: HTMLElement; handlers: Handlers } {
  const handlers: Handlers = {
    onRest: vi.fn(),
    onBury: vi.fn(),
    onSkip: vi.fn(),
    onCondemned: vi.fn(),
    onSunk: vi.fn(),
  };
  const { container } = render(
    <UndeadCard
      subscription={subscription}
      displayName={subscription.merchant}
      phase="undead"
      canSkip
      reduceMotion={false}
      {...handlers}
      {...props}
    />,
  );
  return { container, handlers };
}

function renderCardWithRerender(subscription: ClassifiedSubscription): {
  handlers: Handlers;
  rerender: (props: Partial<UndeadCardProps>) => void;
} {
  const handlers: Handlers = {
    onRest: vi.fn(),
    onBury: vi.fn(),
    onSkip: vi.fn(),
    onCondemned: vi.fn(),
    onSunk: vi.fn(),
  };
  const element = (props: Partial<UndeadCardProps>) => (
    <UndeadCard
      subscription={subscription}
      displayName={subscription.merchant}
      phase="undead"
      canSkip
      reduceMotion={false}
      {...handlers}
      {...props}
    />
  );
  const view = render(element({}));
  return { handlers, rerender: (props) => view.rerender(element(props)) };
}

describe("UndeadCard content", () => {
  it("is a region named by the heading, with the cadence, amounts and question", () => {
    renderCard(TRIAL_TRAP);
    const region = screen.getByRole("region", { name: "Trialflix" });
    expect(within(region).getByRole("heading", { level: 3, name: "Trialflix" })).toBeTruthy();
    expect(within(region).getByText("Monthly")).toBeTruthy();
    expect(within(region).getAllByText(formatMoney(1499, CURRENCY)).length).toBeGreaterThan(0);
    expect(within(region).getByText(formatMoney(1499 * 12, CURRENCY))).toBeTruthy();
    expect(within(region).getByText("Still using this?")).toBeTruthy();
    expect(within(region).getByText("Undead")).toBeTruthy();
  });

  it("shows the price-rise sentence and the Possessed chip", () => {
    const { container } = renderCard(
      withOverrides({ labels: ["possessed"], priceRise: PRICE_RISE }),
    );
    const sentence = partsToText(priceRiseParts(PRICE_RISE, CURRENCY));
    expect(sentence.startsWith("Price went up from ")).toBe(true);
    expect(screen.getByText("Possessed")).toBeTruthy();
    expect(container.textContent).toContain(sentence);
    expect(container.textContent).not.toContain("ended on");
  });

  it("shows the Trial trap chip and the intro-price sentence", () => {
    const { container } = renderCard(TRIAL_TRAP);
    expect(screen.getByText("Trial trap")).toBeTruthy();
    expect(container.textContent).toContain(
      "Intro price ended on 10 Feb 2026 ($1.00 on 10 Jan 2026, then $14.99)".replace(
        /\$([\d.]+)/g,
        (_m, n: string) => formatMoney(Math.round(Number(n) * 100), CURRENCY),
      ),
    );
    expect(container.textContent).not.toContain("Price went up");
  });

  it.each([
    ["freeTrialDate only", FREE_ONLY, "Free trial ended on "],
    ["introCharge only", INTRO_ONLY, "Intro price ended on "],
    ["both", BOTH, "Free trial and intro price ended on "],
  ])("shows the trial line when trial holds %s", (_name, trial, prefix) => {
    const { container } = renderCard(withOverrides({ labels: ["trial-trap"], trial }));
    const expected = partsToText(trialParts(trial, CURRENCY));
    expect(expected.startsWith(prefix)).toBe(true);
    expect(container.textContent).toContain(expected);
  });

  it("puts the possessed chip and sentence before the trial ones", () => {
    const { container } = renderCard(POSSESSED_TRIAL_TRAP);
    const rise = partsToText(priceRiseParts(POSSESSED_TRIAL_TRAP.priceRise!, CURRENCY));
    const trial = partsToText(trialParts(POSSESSED_TRIAL_TRAP.trial!, CURRENCY));
    const text = container.textContent ?? "";
    expect(text.indexOf("Possessed")).toBeGreaterThan(-1);
    expect(text.indexOf("Possessed")).toBeLessThan(text.indexOf(rise));
    expect(text.indexOf(rise)).toBeLessThan(text.indexOf("Trial trap"));
    expect(text.indexOf("Trial trap")).toBeLessThan(text.indexOf(trial));
  });

  it("shows neither data line when both labels are absent", () => {
    const { container } = renderCard(APPLE_99);
    expect(container.textContent).not.toContain("Price went up");
    expect(container.textContent).not.toContain("ended on");
    expect(screen.queryByText("Possessed")).toBeNull();
    expect(screen.queryByText("Trial trap")).toBeNull();
  });

  it("lists the price history oldest first when there is more than one entry", () => {
    renderCard(TRIAL_TRAP);
    const list = screen.getByRole("list", { name: "Price history" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      `10 Jan 2026: ${formatMoney(100, CURRENCY)}`,
      `10 Feb 2026: ${formatMoney(1499, CURRENCY)}`,
      `10 Mar 2026: ${formatMoney(1499, CURRENCY)}`,
    ]);
  });

  it("omits the price history for a single entry", () => {
    renderCard(GUESSED_AMAZON_PRIME);
    expect(screen.queryByRole("list", { name: "Price history" })).toBeNull();
  });

  it("says 'Seen since at least' when the Series did not start in the statement", () => {
    renderCard(APPLE_99);
    expect(screen.getByText("Seen since at least 2 Jan 2026")).toBeTruthy();
  });

  it("says 'Seen since' when the Series started in the statement", () => {
    renderCard(TRIAL_TRAP);
    expect(screen.getByText("Seen since 10 Jan 2026")).toBeTruthy();
  });

  it("uses the first charge date when it has charges", () => {
    renderCard(
      withOverrides({
        charges: [
          {
            date: "2025-12-01",
            amountCents: 99,
            currency: CURRENCY,
          } as unknown as ClassifiedSubscription["charges"][number],
        ],
      }),
    );
    expect(screen.getByText("Seen since at least 1 Dec 2025")).toBeTruthy();
  });

  it("shows the guessed texts for a single charge", () => {
    const { container } = renderCard(GUESSED_AMAZON_PRIME);
    expect(screen.getByText("Guessed from a single charge")).toBeTruthy();
    expect(container.textContent).toContain(
      `about ${formatMoney(166_800, CURRENCY)} a year (estimate)`,
    );
  });

  it("puts every money figure in a .money span", () => {
    const { container } = renderCard(POSSESSED_TRIAL_TRAP);
    const spans = Array.from(container.querySelectorAll("span.money")).map((s) => s.textContent);
    expect(spans).toContain(formatMoney(1299, CURRENCY));
    expect(spans).toContain(formatMoney(1299 * 12, CURRENCY));
    const rise = priceRiseParts(POSSESSED_TRIAL_TRAP.priceRise!, CURRENCY)
      .filter((p) => p.kind === "money")
      .map((p) => p.text);
    for (const money of rise) expect(spans).toContain(money);
    // No money-looking text sits outside a .money span.
    const stripped = container.cloneNode(true) as HTMLElement;
    stripped.querySelectorAll("span.money").forEach((el) => el.remove());
    expect(stripped.textContent).not.toMatch(/[$€£]\s?\d/);
  });

  it("renders no img element", () => {
    const { container } = renderCard(POSSESSED_TRIAL_TRAP);
    expect(container.querySelector("img")).toBeNull();
  });

  it("takes the Zombie chip from labels, never from the phase", async () => {
    const { rerender, container } = render(
      <UndeadCard
        subscription={withOverrides({ labels: [] })}
        displayName="Apple"
        phase="condemned"
        canSkip
        reduceMotion={false}
        onRest={vi.fn()}
        onBury={vi.fn()}
        onSkip={vi.fn()}
        onCondemned={vi.fn()}
        onSunk={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain("Zombie");
    rerender(
      <UndeadCard
        subscription={withOverrides({ labels: ["zombie"] })}
        displayName="Apple"
        phase="condemned"
        canSkip
        reduceMotion={false}
        onRest={vi.fn()}
        onBury={vi.fn()}
        onSkip={vi.fn()}
        onCondemned={vi.fn()}
        onSunk={vi.fn()}
      />,
    );
    // The state chip swaps through AnimatePresence (exit, then enter).
    expect(await screen.findByText("Zombie")).toBeTruthy();
  });

  it("shows no usage claims", () => {
    const { container } = renderCard(POSSESSED_TRIAL_TRAP);
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["unopened", "forgotten", "last used"]) expect(text).not.toContain(word);
  });
});

describe("UndeadCard answers", () => {
  it("calls the handlers while deciding", () => {
    const { handlers } = renderCard(APPLE_99);
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(handlers.onRest).toHaveBeenCalledTimes(1);
    expect(handlers.onBury).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
  });

  it.each<CardPhase>(["condemned", "sinking"])(
    "renders the answer block in undead and removes it in %s",
    (phase) => {
      const { handlers, rerender } = renderCardWithRerender(APPLE_99);
      for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
        expect(screen.getByRole("button", { name })).toBeTruthy();
      }
      expect(screen.getByText("Still using this?")).toBeTruthy();
      rerender({ phase });
      // Synchronous: the block has no exit window beside "Next" (review C #1).
      for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
      expect(screen.queryByText("Still using this?")).toBeNull();
      expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(0);
      expect(handlers.onRest).not.toHaveBeenCalled();
      expect(handlers.onBury).not.toHaveBeenCalled();
      expect(handlers.onSkip).not.toHaveBeenCalled();
    },
  );

  it("keeps the fading answer block inert after 'Yes, let it rest'", () => {
    MotionGlobalConfig.skipAnimations = false;
    vi.useFakeTimers();
    try {
      const { handlers, rerender } = renderCardWithRerender(APPLE_99);
      rerender({ phase: "resting" });
      // The exiting copy is still mounted while it fades.
      for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
        const button = screen.getByRole("button", { name });
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("tabindex")).toBe("-1");
        fireEvent.click(button);
      }
      expect(handlers.onRest).not.toHaveBeenCalled();
      expect(handlers.onBury).not.toHaveBeenCalled();
      expect(handlers.onSkip).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      MotionGlobalConfig.skipAnimations = true;
    }
  });

  it.each<CardPhase>(["condemned", "sinking"])(
    "renders no answer block when first shown in %s",
    (phase) => {
      renderCard(APPLE_99, { phase });
      for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
    },
  );

  it("marks 'No, bury it' as the primary and every answer control as card-exempt", () => {
    renderCard(APPLE_99);
    expect(
      screen.getByRole("button", { name: "No, bury it" }).getAttribute("data-variant"),
    ).toBe("primary");
    for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
      expect(screen.getByRole("button", { name }).getAttribute("data-exempt")).toBe("card");
    }
    expect(
      screen.getByRole("button", { name: "Yes, let it rest" }).hasAttribute("data-variant"),
    ).toBe(false);
  });

  it("leaves the buttons enabled while deciding", () => {
    renderCard(APPLE_99);
    expect(screen.getByRole("button", { name: "No, bury it" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("omits 'Skip for now' when canSkip is false", () => {
    renderCard(APPLE_99, { canSkip: false });
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });
});

describe("UndeadCard outcome", () => {
  it("shows the kept note and the Resting chip when resting", () => {
    const { container } = renderCard(APPLE_99, { phase: "resting" });
    expect(screen.getByText("Kept. It rests.")).toBeTruthy();
    expect(screen.getByText("Resting")).toBeTruthy();
    expect(container.textContent).toContain(
      `It goes on charging ${formatMoney(99, CURRENCY)} a month.`,
    );
    expect(screen.queryByText("Still using this?")).toBeNull();
    expect(screen.getByText("Kept. It rests.").getAttribute("tabindex")).toBe("-1");
  });

  it("says how often is a guess for a guessed subscription", () => {
    const { container } = renderCard(GUESSED_AMAZON_PRIME, { phase: "resting" });
    expect(container.textContent).toContain(
      `It goes on charging ${formatMoney(13_900, CURRENCY)} (how often is a guess).`,
    );
  });
});

describe("UndeadCard sway (Req 10.4, 10.7)", () => {
  const STILL = { rotate: 0 };
  const SWAYING = { rotate: [...CARD_SWAY.rotate] };

  /** The sway layer: the card section's parent. */
  function swayLayer(): HTMLElement {
    const layer = screen.getByRole("region").parentElement;
    if (layer === null) throw new Error("no sway layer");
    return layer;
  }

  it("sways once while undead", () => {
    renderCard(APPLE_99);
    expect(swayAnimate.current).toEqual(SWAYING);
  });

  it("stills on pointer enter and stays still after pointer leave", () => {
    renderCard(APPLE_99);
    fireEvent.pointerEnter(swayLayer());
    expect(swayAnimate.current).toEqual(STILL);
    fireEvent.pointerLeave(swayLayer());
    expect(swayAnimate.current).toEqual(STILL);
  });

  it("stills on keyboard focus of an answer and stays still after blur", () => {
    renderCard(APPLE_99);
    const button = screen.getByRole("button", { name: "No, bury it" });
    const matches = button.matches.bind(button);
    vi.spyOn(button, "matches").mockImplementation((selector) =>
      selector === "button:focus-visible" ? true : matches(selector),
    );
    fireEvent.focus(button);
    expect(swayAnimate.current).toEqual(STILL);
    fireEvent.blur(button);
    expect(swayAnimate.current).toEqual(STILL);
  });

  it("keeps swaying when the card heading takes focus", () => {
    renderCard(APPLE_99);
    fireEvent.focus(screen.getByRole("heading", { level: 3 }));
    expect(swayAnimate.current).toEqual(SWAYING);
  });

  it("settles to 0 when condemned, and does not rotate under reduced motion", () => {
    renderCard(APPLE_99, { phase: "condemned" });
    expect(swayAnimate.current).toEqual(STILL);
    cleanup();
    renderCard(APPLE_99, { reduceMotion: true });
    expect(swayAnimate.current).toEqual(STILL);
  });
});
