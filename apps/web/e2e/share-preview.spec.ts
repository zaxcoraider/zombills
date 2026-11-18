import { expect, test } from "@playwright/test";

// Share preview (pro-polish Requirement 4.1, 4.2, 4.5, 4.7): reads the served index.html and the
// served og-image.png from dist. Text checks only; no page is opened, so the Page never requests
// the image here either.

const DESCRIPTION =
  "Your bank statement is haunted. Zombills finds the subscriptions still feeding on you, in your browser. Your statement never leaves your device.";
const SITE_URL = "https://zombills.netlify.app/";
const IMAGE_URL = "https://zombills.netlify.app/og-image.png";
const IMAGE_ALT =
  "A ghost rising from a tombstone under the moon, with the words Zombills and Your bank statement is haunted.";

/** The new tags in document order: [attribute, key, content]. */
const PREVIEW_TAGS: readonly (readonly ["name" | "property", string, string])[] = [
  ["name", "description", DESCRIPTION],
  ["property", "og:type", "website"],
  ["property", "og:title", "Zombills"],
  ["property", "og:description", DESCRIPTION],
  ["property", "og:url", SITE_URL],
  ["property", "og:image", IMAGE_URL],
  ["property", "og:image:type", "image/png"],
  ["property", "og:image:width", "1200"],
  ["property", "og:image:height", "630"],
  ["property", "og:image:alt", IMAGE_ALT],
  ["name", "twitter:card", "summary_large_image"],
  ["name", "twitter:title", "Zombills"],
  ["name", "twitter:description", DESCRIPTION],
  ["name", "twitter:image", IMAGE_URL],
];

interface MetaTag {
  readonly index: number;
  readonly attrs: ReadonlyMap<string, string>;
}

/** Every `<meta>` in the document head, with its attributes, in source order. */
function metaTags(html: string): MetaTag[] {
  const head = /<head>([\s\S]*?)<\/head>/i.exec(html);
  expect(head, "index.html has a head").not.toBeNull();
  const tags: MetaTag[] = [];
  for (const match of (head?.[1] ?? "").matchAll(/<meta\b([^>]*?)\/?>/gi)) {
    const attrs = new Map<string, string>();
    for (const attr of (match[1] ?? "").matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) {
      attrs.set((attr[1] ?? "").toLowerCase(), attr[2] ?? "");
    }
    for (const bare of (match[1] ?? "").matchAll(/\bcharset\s*=\s*([^\s"'/>]+)/gi)) {
      attrs.set("charset", bare[1] ?? "");
    }
    tags.push({ index: match.index ?? -1, attrs });
  }
  return tags;
}

test("index.html carries every Share preview tag, after the CSP meta", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  const tags = metaTags(html);

  // The element right after <meta charset> (only whitespace between) is the CSP meta (injectCsp).
  expect(html).toMatch(
    /<meta\s+charset\s*=\s*["']?[^"'>\s]+["']?\s*\/?>\s*<meta http-equiv="Content-Security-Policy"/i,
  );

  // Each tag of Req 4.1 appears exactly once, with exactly its value.
  const positions: number[] = [];
  for (const [attr, key, content] of PREVIEW_TAGS) {
    const found = tags.filter((tag) => tag.attrs.get(attr) === key);
    expect(found, `${attr}="${key}"`).toHaveLength(1);
    expect(found[0]?.attrs.get("content"), `${attr}="${key}" content`).toBe(content);
    positions.push(tags.indexOf(found[0] as MetaTag));
  }
  // They come in the order of the design.
  expect(positions).toEqual([...positions].sort((a, b) => a - b));

  // <meta charset> is the first meta; the CSP meta comes directly after it, before every new tag.
  expect(tags[0]?.attrs.has("charset")).toBe(true);
  expect(tags[1]?.attrs.get("http-equiv")).toBe("Content-Security-Policy");
  expect(Math.min(...positions)).toBeGreaterThan(1);
});

test("og-image.png is served from dist as a 1200 × 630 PNG of at most 300 KB", async ({
  request,
}) => {
  const response = await request.get("/og-image.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const body = await response.body();
  expect(body.length).toBeLessThanOrEqual(300 * 1024);
  expect([...body.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(body.subarray(12, 16).toString("latin1")).toBe("IHDR");
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
});
