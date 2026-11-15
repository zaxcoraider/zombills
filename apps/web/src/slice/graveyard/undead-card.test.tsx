// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ClassifiedSubscription, PriceRise, TrialDetails } from "@zombills/core";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { formatMoney } from "../logic/money";
import { partsToText, priceRiseParts, trialParts } from "../logic/label-text";
import { GUESSED_AMAZON_PRIME, POSSESSED_TRIAL_TRAP, TRIAL_TRAP, APPLE_99 } from "./test-fixtures";
import { UndeadCard, type CardPhase, type UndeadCardProps } from "./undead-card";

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
    "keeps the buttons rendered but inert in %s",
    (phase) => {
      const { handlers } = renderCard(APPLE_99, { phase });
      for (const name of ["Yes, let it rest", "No, bury it", "Skip for now"]) {
        const button = screen.getByRole("button", { name });
        expect(button.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(button);
      }
      expect(handlers.onRest).not.toHaveBeenCalled();
      expect(handlers.onBury).not.toHaveBeenCalled();
      expect(handlers.onSkip).not.toHaveBeenCalled();
    },
  );

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
