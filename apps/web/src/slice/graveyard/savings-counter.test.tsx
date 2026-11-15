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
});
