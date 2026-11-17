// Page setup for the Share panel tests. Imported only by tests, never by the app.
// Test files mock "./share-card-renderer" themselves with `renderControl.render`.
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { App } from "../../App";
import { PRIMARY_ACTION_NAME } from "../logic/landing-text";

export { renderControl } from "./test-share-render";

async function bury(name: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
  await screen.findByRole("region", { name: `Here lies ${name}.` });
}

function keepAndNext(): void {
  fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** Keeps Adobe and the gym, buries Netflix, and returns with the cards in the order Netflix, Spotify. */
async function reachNetflixAndBury(): Promise<void> {
  render(createElement(App));
  fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
  keepAndNext();
  keepAndNext();
  screen.getByRole("heading", { level: 3, name: "Netflix" });
  await bury("Netflix");
}

export async function openGraveyardWithNetflix(): Promise<void> {
  await reachNetflixAndBury();
  fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
  await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
}

export async function openGraveyardWithNetflixAndSpotify(): Promise<void> {
  await reachNetflixAndBury();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  screen.getByRole("heading", { level: 3, name: "Spotify" });
  await bury("Spotify");
  fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
  await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
}
