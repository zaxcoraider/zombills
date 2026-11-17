import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const URL_PATTERN = /\bhttps?:\/\/[^\s"'`)]+/g;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LANDING_TEXT_PATH = join(SRC_DIR, "slice", "logic", "landing-text.ts");
const GITHUB_URLS = [
  "https://github.com/zaxcoraider/zombills",
  "https://github.com/zaxcoraider/zombills-reaper",
];

function urlSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return urlSourceFiles(path);
    if (!/\.(ts|tsx|css)$/.test(name)) return [];
    if (/\.test\.tsx?$/.test(name) || /^test-[^\\/]+\.ts$/.test(name)) return [];
    return [path];
  });
}

/** Every absolute URL in `text`, except the SVG namespace. */
function absoluteUrls(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((m) => m[0]).filter((url) => url !== SVG_NAMESPACE);
}

const STORAGE_WORDS = /localStorage|sessionStorage|indexedDB|caches\.|cookieStore|\.cookie/;
const STORE_MODULE_PATH = join(SRC_DIR, "slice", "storage", "graveyard-store.ts");

function scansForStorage(path: string): boolean {
  if (path === STORE_MODULE_PATH) return false;
  return !/(\.test\.tsx?|[\\/]test-store\.ts|[\\/]test-arbitraries\.ts)$/.test(path);
}

describe("static checks", () => {
  it("index.css has no @keyframes (Req 13.1)", () => {
    expect(readFileSync(join(SRC_DIR, "index.css"), "utf8")).not.toMatch(/@keyframes/);
  });

  it("no source file imports a spike or routing module (Req 1.7)", () => {
    const files = sourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
        if (/spike|routing/.test(match[1] ?? "")) offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only the Store module names a storage API (Req 10.3)", () => {
    const files = sourceFiles(SRC_DIR).filter(scansForStorage);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => STORAGE_WORDS.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the storage scan catches a cast window and ignores the Store module", () => {
    expect(STORAGE_WORDS.test("(window as Window).localStorage.getItem(k);")).toBe(true);
    expect(scansForStorage(STORE_MODULE_PATH)).toBe(false);
    expect(scansForStorage(join(SRC_DIR, "slice", "storage", "test-store.ts"))).toBe(false);
    expect(scansForStorage(join(SRC_DIR, "slice", "slice-page.tsx"))).toBe(true);
  });

  it("only main.tsx calls load on the graveyard store (Req 4.1)", () => {
    const files = sourceFiles(SRC_DIR).filter(
      (file) => !/\.test\.tsx?$/.test(file) && !/[\\/]test-[^\\/]+\.ts$/.test(file),
    );
    const LOAD_CALL = /\b(?:graveyardStore|[sS]tore)\.load\(/;
    const callers = files.filter((file) => LOAD_CALL.test(readFileSync(file, "utf8")));
    expect(callers.map((file) => file.slice(SRC_DIR.length + 1))).toEqual(["main.tsx"]);
  });

  it("the only absolute URLs in source are the two GitHub links (landing-polish R11.4)", () => {
    const files = urlSourceFiles(SRC_DIR);
    expect(files).toContain(LANDING_TEXT_PATH);
    const found = new Set<string>();
    const homes = new Map<string, string[]>();
    for (const file of files) {
      for (const url of absoluteUrls(readFileSync(file, "utf8"))) {
        found.add(url);
        homes.set(url, [...(homes.get(url) ?? []), file]);
      }
    }
    expect([...found].sort()).toEqual([...GITHUB_URLS].sort());
    for (const url of GITHUB_URLS) expect(homes.get(url)).toEqual([LANDING_TEXT_PATH]);
  });

  it("the URL scan reports a third URL and ignores the SVG namespace", () => {
    const fixture = `a "${GITHUB_URLS[0]}" b 'https://example.com/x' <svg xmlns="${SVG_NAMESPACE}">`;
    expect(absoluteUrls(fixture)).toEqual([GITHUB_URLS[0], "https://example.com/x"]);
  });
});
