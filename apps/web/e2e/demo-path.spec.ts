import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ALLOWED_EXTENSIONS = new Set(["html", "js", "css", "woff", "woff2", "svg", "png"]);
const CSP_TAG =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; ' +
  "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; " +
  "base-uri 'none'; form-action 'none'\"";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

test("demo path: sample statement to results and back, with no stray requests", async ({
  page,
  context,
}) => {
  // Step 1: collect console messages and page errors.
  const problems: string[] = [];
  page.on("console", (message) => problems.push(`console ${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  // Step 2: load the page, then record requests.
  const response = await page.goto("/");
  if (response === null) throw new Error("page.goto returned no response");
  await page.waitForLoadState("load");
  const urlAfterLoad = page.url();
  const requests: { url: string; method: string; postData: string | null }[] = [];
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method(), postData: request.postData() }),
  );

  // Step 3: the CSP tag is in the navigation response, before the first script tag.
  const body = await response.text();
  const cspIndex = body.indexOf(CSP_TAG);
  const scriptIndex = body.indexOf("<script");
  expect(cspIndex).toBeGreaterThanOrEqual(0);
  expect(scriptIndex).toBeGreaterThanOrEqual(0);
  expect(cspIndex).toBeLessThan(scriptIndex);

  // Step 4: choose a sample.
  await page.getByRole("button", { name: "US bank, signed amounts" }).click();
  await expect(page.getByRole("heading", { name: "Recurring charges found" })).toBeVisible();

  // Step 5: USD list items in order, and the total.
  const usdSection = page.locator("section", {
    has: page.getByRole("heading", { name: "USD", exact: true }),
  });
  const names = await usdSection.locator("> ul > li > strong").allTextContents();
  expect(names).toEqual(["Adobe Creative Cloud", "Riverside Gym Membership", "Netflix", "Spotify"]);
  await expect(usdSection.getByText("Yearly total (USD): $1,355.64")).toBeVisible();
  await expect(
    page.getByText("Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)"),
  ).toBeVisible();

  // Step 6: Start again, focus, and nothing stored.
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("heading", { name: "Recurring charges found" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Drop area: choose or drop a CSV statement" }),
  ).toBeFocused();
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    href: location.href,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: "", href: urlAfterLoad });
  expect(await context.cookies()).toEqual([]);

  // Step 7: every request is a same-origin GET for a file in dist; the console is empty.
  const origin = new URL(urlAfterLoad).origin;
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(origin);
    expect(request.method).toBe("GET");
    expect(url.search).toBe("");
    expect(request.postData).toBeNull();
    const file = path.resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
    expect(file.startsWith(DIST + path.sep)).toBe(true);
    expect(statSync(file).isFile()).toBe(true);
  }
  expect(problems).toEqual([]);

  // Step 8: dist holds only html, js, css, font and image files.
  const extensions = listFiles(DIST).map((file) => path.extname(file).slice(1).toLowerCase());
  expect(extensions.length).toBeGreaterThan(0);
  for (const extension of extensions) {
    expect(ALLOWED_EXTENSIONS.has(extension)).toBe(true);
  }
});
