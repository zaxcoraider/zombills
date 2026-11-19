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

  // Step 2: load the page, then record requests. `landingRequests` is attached before the
  // navigation, so it also holds everything the Landing view asks for while it loads.
  const landingRequests: { url: string; method: string; postData: string | null }[] = [];
  page.on("request", (request) =>
    landingRequests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
    }),
  );
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

  // Landing load request check (landing-polish Req 11.1, 13.8): the same predicate as step 10,
  // and a path that is `/` or a file of dist with an allowed extension. No request to github.com.
  expect(landingRequests.length).toBeGreaterThan(0);
  const distFiles = new Set(
    listFiles(DIST)
      .filter((file) => ALLOWED_EXTENSIONS.has(path.extname(file).slice(1).toLowerCase()))
      .map((file) => path.resolve(file)),
  );
  const landingOrigin = new URL(urlAfterLoad).origin;
  for (const request of landingRequests) {
    const url = new URL(request.url);
    expect(url.origin, `landing request ${request.url}`).toBe(landingOrigin);
    expect(request.method).toBe("GET");
    expect(url.search).toBe("");
    expect(request.postData).toBeNull();
    if (url.pathname !== "/") {
      const file = path.resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
      expect(distFiles.has(file), `landing request ${request.url} is a file of dist`).toBe(true);
    }
  }

  // Step 4: choose a sample; the Rising summary shows the whole yearly cost.
  await page
    .getByRole("button", { name: "Summon the undead with a sample US bank statement" })
    .click();
  await expect(stillDraining("$1,355.64")).toBeVisible();

  // Step 4b (pro-polish Req 12.1): the Home control asks before leaving `results`; "Leave" shows
  // the Landing view, and the Primary action reaches `results` again.
  const home = page.getByRole("button", { name: "Zombills, back to the start" });
  await home.click();
  const leaveQuestion = page.getByRole("group", { name: /^Go back to the start\?/ });
  await expect(leaveQuestion).toBeVisible();
  await expect(leaveQuestion.getByRole("button", { name: "Stay", exact: true })).toBeFocused();
  await leaveQuestion.getByRole("button", { name: "Leave", exact: true }).click();
  const primary = page.getByRole("button", {
    name: "Summon the undead with a sample US bank statement",
  });
  await expect(primary).toBeFocused();
  await primary.click();
  await expect(stillDraining("$1,355.64")).toBeVisible();

  // Step 4c: hover and focus each Footer tombstone without following a link.
  const footerStones = page
    .getByRole("contentinfo")
    .getByRole("list", { name: "Site links" })
    .locator(':scope > li > [data-exempt="footer-tombstone"]');
  await expect(footerStones).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const footerStone = footerStones.nth(i);
    await footerStone.hover();
    await footerStone.focus();
    await expect(footerStone).toBeFocused();
  }
  await page.mouse.move(0, 0);
  expect(page.url()).toBe(urlAfterLoad);
  expect(context.pages()).toHaveLength(1);

  // Step 4d (pro-polish Req 12.1): open and close the Statement disclosure on `results`.
  const statementDisclosure = page.getByRole("button", { name: "Try another statement" });
  await expect(statementDisclosure).toHaveAttribute("aria-expanded", "false");
  await statementDisclosure.click();
  await expect(statementDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(dropArea).toBeVisible();
  await statementDisclosure.click();
  await expect(statementDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(dropArea).toBeHidden();
  expect(page.url()).toBe(urlAfterLoad);

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
  await page.getByRole("button", { name: "Try another statement" }).click();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(dropArea).toBeFocused();

  // Step 9: at 320 px wide nothing scrolls sideways on the Rising or the Graveyard view.
  await page.setViewportSize({ width: 320, height: 640 });
  await page
    .getByRole("button", { name: "Summon the undead with a sample US bank statement" })
    .click();
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

test("memory path: remember, reload, restore and forget, with no stray requests", async ({
  page,
  context,
}) => {
  // Same console listeners as the demo path.
  const problems: string[] = [];
  page.on("console", (message) => problems.push(`console ${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  // Same request and CSP checks as the demo path; the listener stays on across the reload.
  const response = await page.goto("/");
  if (response === null) throw new Error("page.goto returned no response");
  await page.waitForLoadState("load");
  const urlAfterLoad = page.url();
  const requests: { url: string; method: string; postData: string | null }[] = [];
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method(), postData: request.postData() }),
  );
  const body = await response.text();
  const cspIndex = body.indexOf(CSP_TAG);
  const scriptIndex = body.indexOf("<script");
  expect(cspIndex).toBeGreaterThanOrEqual(0);
  expect(scriptIndex).toBeGreaterThanOrEqual(0);
  expect(cspIndex).toBeLessThan(scriptIndex);

  // Answer buttons are focused and pressed with Enter, as in the demo path.
  const answer = async (name: string) => {
    const button = page.getByRole("button", { name });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
  };

  // Skip Adobe and Riverside so Netflix is the only answered card.
  await page
    .getByRole("button", { name: "Summon the undead with a sample US bank statement" })
    .click();
  for (const name of ["Adobe Creative Cloud", "Riverside Gym Membership"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
    await answer("Skip for now");
  }
  await expect(page.getByRole("region", { name: "Netflix" })).toBeVisible();
  await answer("No, bury it");
  await expect(page.getByRole("region", { name: "Here lies Netflix." })).toBeVisible();

  // Open the graveyard and tick the checkbox: exactly one key, version 1, one record.
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  await page.getByRole("checkbox", { name: "Remember my graveyard on this device" }).check();
  const stored = await page.evaluate(() => ({
    keys: Object.keys(localStorage),
    value: localStorage.getItem("zombills.graveyard.v1"),
  }));
  expect(stored.keys).toEqual(["zombills.graveyard.v1"]);
  if (stored.value === null) throw new Error("the Store key has no value");
  const parsed: unknown = JSON.parse(stored.value);
  expect(parsed).toMatchObject({ version: 1, records: [expect.anything()] });
  expect((parsed as { records: unknown[] }).records).toHaveLength(1);

  // Reload: the idle panel says the graveyard is back, and the tombstone comes from the Store.
  await page.reload();
  await expect(
    page.getByText("Your graveyard from this device is back: 1 buried, 0 resting."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  const tombstone = page.getByRole("region", { name: "Here lies Netflix." });
  await expect(tombstone).toBeVisible();
  await expect(tombstone).toContainText("From an earlier statement");
  await expect(page.getByRole("group", { name: "Saved per year" })).toContainText("$215.88");

  // Forget everything leaves nothing in any browser store.
  await page.getByRole("button", { name: "Forget everything" }).click();
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(page.getByText("Nothing buried yet.")).toBeVisible();
  const after = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
  }));
  expect(after).toEqual({ local: 0, session: 0, cookie: "" });
  expect(await context.cookies()).toEqual([]);

  // Every request is a same-origin GET for a file in dist; the console is empty.
  const origin = new URL(urlAfterLoad).origin;
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(origin);
    expect(request.method).toBe("GET");
    expect(url.search).toBe("");
    expect(request.postData).toBeNull();
    // The reload requests the document at "/", which the server answers with dist/index.html.
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
    expect(file.startsWith(DIST + path.sep)).toBe(true);
    expect(statSync(file).isFile()).toBe(true);
  }
  expect(problems).toEqual([]);
});
