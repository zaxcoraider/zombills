import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { CANCEL_ENTRIES } from "@zombills/core";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ALLOWED_EXTENSIONS = new Set(["html", "js", "css", "woff", "woff2", "svg", "png"]);
const CSP_TAG =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; " +
  "base-uri 'none'; form-action 'none'\"";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

test("demo path: sample statement to burial, graveyard and back, with no stray requests", async ({
  page,
  context,
}) => {
  // Step 1: collect console messages and page errors.
  const problems: string[] = [];
  page.on("console", (message) => problems.push(`console ${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  // Remove Web Share so the Save path is taken on every platform. The cast is needed because,
  // under `strict`, `delete` needs an optional operand (TS2790).
  await page.addInitScript(() => {
    delete (Navigator.prototype as Partial<Navigator>).share;
    delete (Navigator.prototype as Partial<Navigator>).canShare;
  });

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

  const stillDraining = (amount: string) =>
    page.locator("main p", { hasText: new RegExp(`^Still draining \\${amount} a year$`) });
  const dropArea = page.getByRole("button", {
    name: "Drop area: choose or drop a CSV statement",
  });

  // An undead card sways for ever (design "Undead card"), so Playwright's "stable" check never
  // passes on its buttons and a forced click can land while the card is still rising. Answer
  // buttons are focused and pressed with Enter instead, which is how a keyboard user answers.
  const answer = async (name: string) => {
    const button = page.getByRole("button", { name });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
  };

  // Step 4: choose a sample; the Rising summary shows the whole yearly cost.
  await page.getByRole("button", { name: "US bank, signed amounts" }).click();
  await expect(stillDraining("$1,355.64")).toBeVisible();

  // Step 5: keep Adobe Creative Cloud and Riverside Gym Membership.
  for (const name of ["Adobe Creative Cloud", "Riverside Gym Membership"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
    await answer("Yes, let it rest");
    await page.getByRole("button", { name: "Next" }).click();
  }

  // Step 6: bury Netflix.
  const netflix = page.getByRole("region", { name: "Netflix" });
  await expect(netflix).toContainText(
    "Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)",
  );
  await answer("No, bury it");
  const tombstone = page.getByRole("region", { name: "Here lies Netflix." });
  // "Saves" and the amount are separate blocks, so the DOM text has no space between them.
  await expect(tombstone).toContainText(/Saves\s*\$215\.88\/year\./);
  await expect(page.getByRole("group", { name: "Saved per year" })).toContainText("$215.88");
  await expect(stillDraining("$1,139.76")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Netflix is buried. Saves $215.88 a year.");

  // Step 6b: the Helper panel under the tombstone. Nothing here is clicked: the cancel link, the
  // App-store links and the mailto link are only read (cancel-helper Req 4.6).
  const netflixEntry = CANCEL_ENTRIES.find((entry) => entry.serviceId === "netflix");
  if (netflixEntry === undefined) throw new Error("no Netflix entry in CANCEL_ENTRIES");
  const panel = page.getByRole("region", { name: "Seal the grave: Netflix" });
  await expect(panel).toBeVisible();
  const cancelLink = panel.getByRole("link", { name: /^Open the Netflix /, exact: false });
  await expect(cancelLink).toHaveAttribute("target", "_blank");
  await expect(cancelLink).toHaveAttribute("rel", "noopener noreferrer");
  const cancelHref = await cancelLink.getAttribute("href");
  if (cancelHref === null) throw new Error("the cancel link has no href");
  const cancelUrl = new URL(cancelHref);
  expect(cancelUrl.protocol).toBe("https:");
  expect(
    netflixEntry.providerDomains.some(
      (domain) => cancelUrl.hostname === domain || cancelUrl.hostname.endsWith(`.${domain}`),
    ),
  ).toBe(true);
  await expect(panel.getByRole("link", { name: /^Open in my email app/ })).toHaveAttribute(
    "href",
    /^mailto:\?subject=Please%20cancel%20my%20Netflix%20subscription/,
  );
  await expect(panel.locator("[data-email-text]")).toContainText(
    "I am currently charged $17.99 (USD) every month.",
  );
  await expect(panel.getByText("Opens your email app with this text filled in.")).toBeVisible();

  // Step 7: the graveyard, then nothing stored and the URL unchanged.
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  await expect(page.locator("main p", { hasText: "You buried $215.88 a year." })).toBeVisible();

  // Step 7b: make the Share image, check it and save it. The file is a 1080 x 1080 PNG.
  const sharePanel = page.getByRole("region", { name: "Share your graveyard" });
  await expect(sharePanel).toBeVisible();
  await sharePanel.getByRole("button", { name: "Make an image" }).click();
  await expect(sharePanel.getByRole("img")).toHaveAttribute(
    "alt",
    "Image of your Zombills graveyard. I buried $215.88 a year. 1 subscription buried. zombills.netlify.app.",
  );
  const save = sharePanel.getByRole("button", { name: "Save image" });
  await expect(save).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
  expect(download.suggestedFilename()).toBe("zombills-graveyard.png");
  const downloadPath = await download.path();
  const png = readFileSync(downloadPath);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);

  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    href: location.href,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: "", href: urlAfterLoad });
  expect(await context.cookies()).toEqual([]);

  // Step 8: Start again returns focus to the drop area.
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(dropArea).toBeFocused();

  // Step 9: at 320 px wide nothing scrolls sideways on the Rising or the Graveyard view.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole("button", { name: "US bank, signed amounts" }).click();
  // The Graveyard keeps Netflix's tombstone, so the same Sample now has less left to drain.
  await expect(stillDraining("$1,139.76")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  await expect(page.getByRole("heading", { name: "Your graveyard", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  // Step 10: every request is a same-origin GET for a file in dist; the console is empty.
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

  // Step 11: dist holds only html, js, css, font and image files.
  const extensions = listFiles(DIST).map((file) => path.extname(file).slice(1).toLowerCase());
  expect(extensions.length).toBeGreaterThan(0);
  for (const extension of extensions) {
    expect(ALLOWED_EXTENSIONS.has(extension)).toBe(true);
  }
});
