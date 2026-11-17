// @vitest-environment jsdom
// The one flow test that leaves animations on: focus must reach the note after a real animation.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { PRIMARY_ACTION_NAME } from "./logic/landing-text";

beforeEach(() => {
  window.location.hash = "";
});

afterEach(cleanup);

describe("graveyard flow: keep focus with real animation", () => {
  it("moves focus to 'Kept. It rests.' and never leaves it on body once the note mounted", async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });

    const yes = screen.getByRole("button", { name: "Yes, let it rest" });
    yes.focus();

    // Watch every DOM change: once the note exists, focus must never sit on body.
    let onBodyWithNote = false;
    const observer = new MutationObserver(() => {
      if (
        screen.queryByText("Kept. It rests.") !== null &&
        document.activeElement === document.body
      ) {
        onBodyWithNote = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    await user.keyboard("{Enter}");

    const note = await screen.findByText("Kept. It rests.");
    await waitFor(() => expect(document.activeElement).toBe(note));
    observer.disconnect();
    expect(onBodyWithNote).toBe(false);
  });
});
