// Accessibility helpers for tests. Imported only by tests, never by the app.
import { expect } from "vitest";

function accessibleName(button: Element): string {
  const label = button.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return label.trim();
  return (button.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Every button under `container` has a name, and no two buttons share one (Req 14.1). */
export function expectUniqueButtonNames(container: HTMLElement): void {
  const names = [...container.querySelectorAll("button")].map(accessibleName);
  expect(names.every((name) => name !== "")).toBe(true);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  expect(duplicates).toEqual([]);
}
