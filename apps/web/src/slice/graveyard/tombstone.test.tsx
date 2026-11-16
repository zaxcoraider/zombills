// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AnswerRecord } from "../logic/graveyard";
import { formatMoney } from "../logic/money";
import { Tombstone } from "./tombstone";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const NETFLIX: AnswerRecord = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  yearlySavingCents: 21588,
};

const GUESSED: AnswerRecord = {
  ...NETFLIX,
  id: "sub:USD:monthly:*:amazon-prime",
  merchant: "Amazon Prime",
  serviceId: "amazon-prime",
  cadenceAssumed: true,
  yearlySavingCents: null,
};

function renderStone(
  record: AnswerRecord,
  size: "stage" | "list",
  action?: React.ReactNode,
  name = record.merchant,
) {
  return render(
    <Tombstone
      record={record}
      displayName={name}
      size={size}
      entering={false}
      reduceMotion={false}
      action={action}
    />,
  );
}

describe("Tombstone", () => {
  it("is a region named 'Here lies Netflix.'", () => {
    renderStone(NETFLIX, "stage");
    const region = screen.getByRole("region", { name: "Here lies Netflix." });
    expect(region.getAttribute("data-focus")).toBe("tombstone:sub:USD:monthly:*:netflix");
    expect(region.getAttribute("tabindex")).toBe("-1");
  });

  it("shows how often it fed and the saving through formatMoney", () => {
    renderStone(NETFLIX, "stage");
    const region = screen.getByRole("region", { name: "Here lies Netflix." });
    const text = region.textContent ?? "";
    expect(text).toContain("Fed on you every month.");
    expect(text).toContain(`Saves${formatMoney(21588, "USD")}/year.`);
  });

  it("shows the unknown-saving text for a null saving", () => {
    renderStone(GUESSED, "stage");
    const region = screen.getByRole("region", { name: "Here lies Amazon Prime." });
    expect(region.textContent).toContain("Saving unknown: guessed from one charge");
    expect(region.textContent).not.toContain("Saves");
  });

  it("shows the cancel line and never says 'cancelled'", () => {
    const OLD_LINE = "Cancel it with the provider to stop the charges.";
    const { container } = renderStone(NETFLIX, "list");
    expect(screen.getByText("Still feeding until you cancel.")).toBeTruthy();
    expect(screen.queryByText(OLD_LINE)).toBeNull();
    expect(/cancelled/i.test(container.textContent ?? "")).toBe(false);
    cleanup();
    const ended = render(
      <Tombstone
        record={NETFLIX}
        displayName="Netflix"
        size="list"
        entering={false}
        reduceMotion={false}
        ended
      />,
    );
    expect(screen.getByText("It has stopped charging.")).toBeTruthy();
    expect(screen.queryByText("Still feeding until you cancel.")).toBeNull();
    expect(screen.queryByText(OLD_LINE)).toBeNull();
    expect(/cancelled/i.test(ended.container.textContent ?? "")).toBe(false);
  });

  it("renders the action slot only in the list size", () => {
    const action = <button type="button">Unbury Netflix</button>;
    renderStone(NETFLIX, "list", action);
    expect(screen.getByRole("button", { name: "Unbury Netflix" })).toBeTruthy();
    cleanup();
    renderStone(NETFLIX, "stage", action);
    expect(screen.queryByRole("button", { name: "Unbury Netflix" })).toBeNull();
  });
});
