// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatMoney } from "../logic/money";
import { SavingsCounter } from "./savings-counter";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

function figures(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent ?? "");
}

function srValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".sr-only")].map((el) => el.textContent ?? "");
}

describe("SavingsCounter", () => {
  it("renders nothing with no totals and no fallback currency", () => {
    const { container } = render(
      <SavingsCounter totals={[]} fallbackCurrency={null} reduceMotion={false} />,
    );
    expect(container.childElementCount).toBe(0);
  });

  it("shows zero in the fallback currency when there are no totals", async () => {
    const { container } = render(
      <SavingsCounter totals={[]} fallbackCurrency="USD" reduceMotion={false} />,
    );
    expect(screen.getByRole("group", { name: "Saved per year" })).toBeTruthy();
    expect(srValues(container)).toEqual([formatMoney(0, "USD")]);
    await waitFor(() => expect(figures(container)).toEqual([formatMoney(0, "USD")]));
  });

  it("shows one line per currency in the given order", async () => {
    const { container } = render(
      <SavingsCounter
        totals={[
          { currency: "GBP", totalCents: 15588 },
          { currency: "USD", totalCents: 21588 },
        ]}
        fallbackCurrency={null}
        reduceMotion={false}
      />,
    );
    const expected = [formatMoney(15588, "GBP"), formatMoney(21588, "USD")];
    expect(srValues(container)).toEqual(expected);
    await waitFor(() => expect(figures(container)).toEqual(expected));
  });

  it("gives screen readers the value in a sr-only span and hides the animated figure", () => {
    const { container } = render(
      <SavingsCounter
        totals={[{ currency: "USD", totalCents: 21588 }]}
        fallbackCurrency={null}
        reduceMotion={false}
      />,
    );
    const sr = container.querySelector(".sr-only");
    expect(sr?.textContent).toBe(formatMoney(21588, "USD"));
    expect(sr?.hasAttribute("aria-hidden")).toBe(false);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it("shows the new value at once when the total decreases", async () => {
    const { container, rerender } = render(
      <SavingsCounter
        totals={[{ currency: "USD", totalCents: 21588 }]}
        fallbackCurrency={null}
        reduceMotion={false}
      />,
    );
    rerender(
      <SavingsCounter
        totals={[{ currency: "USD", totalCents: 5000 }]}
        fallbackCurrency={null}
        reduceMotion={false}
      />,
    );
    expect(srValues(container)).toEqual([formatMoney(5000, "USD")]);
    await waitFor(() => expect(figures(container)).toEqual([formatMoney(5000, "USD")]));
  });

  it("counts a USD line added after a EUR fallback line up to its value", async () => {
    const { container, rerender } = render(
      <SavingsCounter totals={[]} fallbackCurrency="EUR" reduceMotion={false} />,
    );
    await waitFor(() => expect(figures(container)).toEqual([formatMoney(0, "EUR")]));
    rerender(
      <SavingsCounter
        totals={[{ currency: "USD", totalCents: 21588 }]}
        fallbackCurrency="EUR"
        reduceMotion={false}
      />,
    );
    expect(srValues(container)).toEqual([formatMoney(21588, "USD")]);
    await waitFor(() => expect(figures(container)).toEqual([formatMoney(21588, "USD")]));
  });

  describe("size", () => {
    const totals = [
      { currency: "GBP", totalCents: 15588 },
      { currency: "USD", totalCents: 21588 },
    ];
    const expected = [formatMoney(15588, "GBP"), formatMoney(21588, "USD")];
    const figureEls = (container: HTMLElement) => [
      ...container.querySelectorAll('[aria-hidden="true"]'),
    ];

    it("compact sets each figure to text-title and lays the lines in a row from sm", async () => {
      const { container } = render(
        <SavingsCounter
          totals={totals}
          fallbackCurrency={null}
          reduceMotion={false}
          size="compact"
        />,
      );
      const figs = figureEls(container);
      expect(figs).toHaveLength(2);
      for (const fig of figs) {
        expect(fig.classList.contains("text-title")).toBe(true);
        expect(fig.classList.contains("leading-none")).toBe(true);
        expect(fig.classList.contains("tabular-nums")).toBe(true);
        expect(fig.classList.contains("min-w-[7ch]")).toBe(true);
      }
      const lines = figs[0]?.parentElement?.parentElement;
      expect(lines?.classList.contains("sm:flex-row")).toBe(true);
      expect(lines?.classList.contains("sm:gap-4")).toBe(true);
      expect(lines?.contains(figs[1] ?? null)).toBe(true);
      expect(screen.getByRole("group", { name: "Saved per year" })).toBeTruthy();
      expect(srValues(container)).toEqual(expected);
      await waitFor(() => expect(figures(container)).toEqual(expected));
    });

    it("full (the default) has no text-title and no sm:flex-row", async () => {
      const { container } = render(
        <SavingsCounter totals={totals} fallbackCurrency={null} reduceMotion={false} />,
      );
      expect(container.querySelector(".text-title")).toBeNull();
      expect(container.querySelector('[class*="sm:flex-row"]')).toBeNull();
      expect(screen.getByRole("group", { name: "Saved per year" })).toBeTruthy();
      expect(srValues(container)).toEqual(expected);
      await waitFor(() => expect(figures(container)).toEqual(expected));
    });
  });
});
