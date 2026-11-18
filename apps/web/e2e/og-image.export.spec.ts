import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SHARE_TEXT_RIGHT_LIMIT, sharePath, shareTextLayout } from "../scripts/og-font-paths";

// Hand-run export of the Share preview (pro-polish design "Share preview"). Skipped unless
// ZB_EXPORT_OG=1, so the default e2e run never writes to public/.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const SVG_PATH = join(PUBLIC_DIR, "og-image.svg");
const PNG_PATH = join(PUBLIC_DIR, "og-image.png");
const TEXT_BLOCK = /<!-- text:start -->[\s\S]*?<!-- text:end -->/;

test.skip(!process.env.ZB_EXPORT_OG, "set ZB_EXPORT_OG=1 to export the Share preview");
test.use({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

test("exports og-image.svg text paths and og-image.png", async ({ page }) => {
  const { wordmark, tagline } = shareTextLayout();
  for (const line of [wordmark, ...tagline]) {
    expect(line.right, line.text).toBeLessThanOrEqual(SHARE_TEXT_RIGHT_LIMIT);
  }
  const text = [
    "<!-- text:start -->",
    `  <path fill="#ECE6D6" d="${sharePath(wordmark)}" />`,
    `  <g fill="#ECE6D6" fill-opacity="0.85">`,
    ...tagline.map((line) => `    <path d="${sharePath(line)}" />`),
    "  </g>",
    "  <!-- text:end -->",
  ].join("\n");
  const source = readFileSync(SVG_PATH, "utf8");
  expect(source).toMatch(TEXT_BLOCK);
  const svg = source.replace(TEXT_BLOCK, text);
  writeFileSync(SVG_PATH, svg);

  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0B0D12">${svg}</body></html>`,
  );
  writeFileSync(PNG_PATH, await page.screenshot({ type: "png" }));
});
