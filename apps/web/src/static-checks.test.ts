import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHARE_TEXT_RIGHT_LIMIT, shareTextLayout } from "../scripts/og-font-paths";

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
/** The three Footer URLs (pro-polish Req 4.6): the two GitHub links and the Kiro link. */
const FOOTER_URLS = [
  "https://github.com/zaxcoraider/zombills",
  "https://github.com/zaxcoraider/zombills-reaper",
  "https://kiro.dev",
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

const PUBLIC_DIR = join(SRC_DIR, "..", "public");
const OG_SVG_PATH = join(PUBLIC_DIR, "og-image.svg");
const OG_PNG_PATH = join(PUBLIC_DIR, "og-image.png");
/** The seven colour tokens of `spooky-design.md`, upper case. */
const TOKEN_HEX = ["#0B0D12", "#1A1F2B", "#ECE6D6", "#8FD694", "#F2994A", "#A99BF2", "#E05A5A"];

/** Every Req 4.3 breach in a preview SVG source. */
function previewSvgOffences(svg: string): string[] {
  const found: string[] = [];
  for (const m of svg.matchAll(/<(text|script|foreignObject|image)\b/g)) found.push(m[0]);
  for (const m of svg.matchAll(/\b(?:xlink:)?href\s*=\s*["']([^"']*)["']/g)) {
    if (!(m[1] ?? "").startsWith("#")) found.push(m[0]);
  }
  for (const m of svg.matchAll(/url\(\s*([^)]*)\)/g)) {
    if (!(m[1] ?? "").startsWith("#")) found.push(m[0]);
  }
  for (const m of svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (!TOKEN_HEX.includes(m[0].toUpperCase())) found.push(m[0]);
  }
  return found;
}

const LANDING_DIR = join(SRC_DIR, "slice", "landing");
const MOTION_CSS_PATH = join(LANDING_DIR, "landing-motion.css");
const NO_PREFERENCE = "prefers-reduced-motion: no-preference";

interface CssBlock {
  /** Text before the `{`, trimmed. */
  readonly prelude: string;
  /** Declarations that sit directly in the block, without nested blocks. */
  readonly declarations: string;
  readonly children: readonly CssBlock[];
}

/** A small brace parser. It is enough for the plain CSS of `landing-motion.css`. */
function parseCss(source: string): CssBlock[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let pos = 0;
  const parseBlocks = (): CssBlock[] => {
    const blocks: CssBlock[] = [];
    let prelude = "";
    while (pos < text.length) {
      const ch = text.charAt(pos);
      if (ch === "}") {
        pos += 1;
        return blocks;
      }
      if (ch === "{") {
        pos += 1;
        const start = pos;
        const children = parseBlocks();
        const inner = text.slice(start, pos - 1);
        blocks.push({ prelude: prelude.trim(), declarations: directDeclarations(inner), children });
        prelude = "";
        continue;
      }
      prelude += ch;
      pos += 1;
    }
    return blocks;
  };
  return parseBlocks();
}

/** `inner` without its nested `{ ... }` blocks (and the selectors that lead them). */
function directDeclarations(inner: string): string {
  let depth = 0;
  let out = "";
  let pending = "";
  for (const ch of inner) {
    if (ch === "{") {
      depth += 1;
      pending = "";
    } else if (ch === "}") {
      depth -= 1;
    } else if (depth === 0) {
      pending += ch;
      if (ch === ";") {
        out += pending;
        pending = "";
      }
    }
  }
  return out + pending;
}

interface StyleRule {
  readonly selector: string;
  readonly declarations: string;
  readonly inNoPreference: boolean;
}

/** Every non-keyframes style rule, flagged by whether a `no-preference` media query holds it. */
function styleRules(blocks: readonly CssBlock[], inNoPreference = false): StyleRule[] {
  return blocks.flatMap((block) => {
    if (block.prelude.startsWith("@keyframes")) return [];
    if (block.prelude.startsWith("@media")) {
      return styleRules(block.children, inNoPreference || block.prelude.includes(NO_PREFERENCE));
    }
    return [{ selector: block.prelude, declarations: block.declarations, inNoPreference }];
  });
}

function keyframeRules(blocks: readonly CssBlock[]): CssBlock[] {
  return blocks.flatMap((block) => {
    if (block.prelude.startsWith("@keyframes")) return [block];
    return block.prelude.startsWith("@media") ? keyframeRules(block.children) : [];
  });
}

interface AnimationUse {
  readonly name: string;
  readonly durationMs: number;
  readonly delayMs: number;
  readonly count: number;
}

function toMs(token: string): number {
  return token.endsWith("ms") ? parseFloat(token) : parseFloat(token) * 1000;
}

/** Splits at `separator` outside parentheses. */
function splitTopLevel(value: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && separator.test(ch)) {
      if (current !== "") parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current !== "") parts.push(current);
  return parts;
}

/** Every layer of every `animation:` shorthand in `css`. */
function animationUses(css: string): AnimationUse[] {
  const uses: AnimationUse[] = [];
  for (const rule of styleRules(parseCss(css))) {
    for (const match of rule.declarations.matchAll(/(?:^|[;\s])animation\s*:\s*([^;]+)/g)) {
      for (const layer of splitTopLevel(match[1] ?? "", /,/)) {
        const tokens = splitTopLevel(layer.trim(), /\s/);
        const times = tokens.filter((t) => /^\d*\.?\d+m?s$/.test(t)).map(toMs);
        const count = tokens.find((t) => /^\d+$/.test(t) || t === "infinite");
        uses.push({
          name: tokens.find((t) => /^zb-/.test(t)) ?? layer.trim(),
          durationMs: times[0] ?? 0,
          delayMs: times[1] ?? 0,
          count: count === undefined ? 1 : count === "infinite" ? Infinity : Number(count),
        });
      }
    }
  }
  return uses;
}

/** Percentages of the stops of a keyframes block, sorted, `from` as 0 and `to` as 100. */
function stopPercents(keyframes: CssBlock): number[] {
  const stops = keyframes.children.flatMap((stop) =>
    stop.prelude.split(",").map((s) => {
      const label = s.trim();
      return label === "from" ? 0 : label === "to" ? 100 : parseFloat(label);
    }),
  );
  return [...new Set(stops)].sort((a, b) => a - b);
}

/** Smallest gap between consecutive stops of `keyframes` over `durationMs`, in ms. */
function smallestStopGapMs(keyframes: CssBlock, durationMs: number): number {
  const stops = stopPercents(keyframes);
  let smallest = Infinity;
  for (let i = 1; i < stops.length; i += 1) {
    smallest = Math.min(smallest, (((stops[i] ?? 0) - (stops[i - 1] ?? 0)) / 100) * durationMs);
  }
  return smallest;
}

const FLICKER_PROPERTIES = /(?:^|[;\s])(opacity|text-shadow|box-shadow)\s*:/;

const STORAGE_WORDS = /localStorage|sessionStorage|indexedDB|caches\.|cookieStore|\.cookie/;
const STORE_MODULE_PATH = join(SRC_DIR, "slice", "storage", "graveyard-store.ts");

function scansForStorage(path: string): boolean {
  if (path === STORE_MODULE_PATH) return false;
  return !/(\.test\.tsx?|[\\/]test-store\.ts|[\\/]test-arbitraries\.ts)$/.test(path);
}

/** Art files of pro-polish Req 12.3. */
const ART_FILES = [
  join(SRC_DIR, "slice", "statement", "grave-art.tsx"),
  join(SRC_DIR, "slice", "chrome", "footer-tombstone.tsx"),
  join(SRC_DIR, "slice", "graveyard", "ground-line.tsx"),
  join(SRC_DIR, "slice", "site-footer.tsx"),
];

/**
 * Every Req 12.3 breach in `text`: a `<text`, `<image` or `<foreignObject` element, an `href`
 * that is not a same-document `#` reference, a hex colour, or an `id=` not taken from `useId`.
 * `href={href}` is allowed: it is a link's own target prop, not an art reference.
 */
function artOffences(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/<(text|image|foreignObject)\b/g)) found.push(m[0]);
  for (const m of text.matchAll(/\b(?:xlinkH|h)ref=(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
    const value = m[1] ?? "";
    const local = /^["']#/.test(value) || /^\{`#/.test(value) || value === "{href}";
    if (!local) found.push(m[0]);
  }
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push(m[0]);
  const idNames = new Set(
    [...text.matchAll(/\bconst\s+(\w+)\s*=\s*useId\(\)/g)].map((m) => m[1] ?? ""),
  );
  for (const m of text.matchAll(/\bid=(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
    const name = /^\{`?\$?\{?(\w+)/.exec(m[1] ?? "")?.[1];
    if (!name || !idNames.has(name)) found.push(m[0]);
  }
  return found;
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

  it("the only absolute URLs in source are the three Footer URLs, in landing-text.ts (pro-polish Req 4.6)", () => {
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
    expect([...found].sort()).toEqual([...FOOTER_URLS].sort());
    for (const url of FOOTER_URLS) expect(homes.get(url)).toEqual([LANDING_TEXT_PATH]);
  });

  it("the URL scan reports an extra URL and ignores the SVG namespace", () => {
    const fixture = `a "${FOOTER_URLS[0]}" b 'https://example.com/x' <svg xmlns="${SVG_NAMESPACE}">`;
    expect(absoluteUrls(fixture)).toEqual([FOOTER_URLS[0], "https://example.com/x"]);
  });

  it("the focus-ring classes and the scene alphas agree (landing-polish R10.2)", () => {
    const landing = join(SRC_DIR, "slice", "landing");
    const bareFocus = readFileSync(join(landing, "bare-focus.ts"), "utf8");
    expect(bareFocus, "bare-focus.ts").toContain("var(--moss)_35%");
    expect(bareFocus, "bare-focus.ts").toContain("var(--night)_70%");
    const motionCss = readFileSync(join(landing, "landing-motion.css"), "utf8");
    expect(motionCss, "landing-motion.css").toContain("var(--night) 70%");
    const alphas = readFileSync(join(SRC_DIR, "slice", "logic", "scene-alphas.ts"), "utf8");
    expect(alphas).toMatch(/export const FOCUS_GLOW_ALPHA = 0\.35;/);
    expect(alphas).toMatch(/export const FOCUS_BAND_ALPHA = 0\.7;/);
  });

  it("@keyframes live only in landing-motion.css (landing-polish R9.6)", () => {
    const files = urlSourceFiles(SRC_DIR);
    expect(files).toContain(MOTION_CSS_PATH);
    const holders = files.filter((file) => /@keyframes/.test(readFileSync(file, "utf8")));
    expect(holders).toEqual([MOTION_CSS_PATH]);
  });

  it("landing-motion.css has no infinite animation and every animation ends within 5 s (R9.2, R9.3)", () => {
    const css = readFileSync(MOTION_CSS_PATH, "utf8");
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/infinite/);
    expect(keyframeRules(parseCss(css)).length).toBeGreaterThan(0);
    const uses = animationUses(css);
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(Number.isFinite(use.count), `${use.name} count`).toBe(true);
      expect(use.delayMs + use.durationMs * use.count, use.name).toBeLessThanOrEqual(5000);
    }
  });

  it("keyframes that change opacity or a shadow have stops at least 334 ms apart (R9.4)", () => {
    const css = readFileSync(MOTION_CSS_PATH, "utf8");
    const rules = keyframeRules(parseCss(css));
    const uses = animationUses(css);
    expect(rules.length).toBeGreaterThan(0);
    expect(uses.length).toBeGreaterThan(0);
    let checked = 0;
    for (const keyframes of rules) {
      const name = keyframes.prelude.replace("@keyframes", "").trim();
      if (!keyframes.children.some((stop) => FLICKER_PROPERTIES.test(stop.declarations))) continue;
      const durations = uses.filter((use) => use.name === name).map((use) => use.durationMs);
      expect(durations.length, `${name} is used`).toBeGreaterThan(0);
      expect(smallestStopGapMs(keyframes, Math.min(...durations)), name).toBeGreaterThanOrEqual(334);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the stop-gap scan reports stops that are too close", () => {
    const fixture = "@keyframes zb-x { 0% { opacity: 0; } 10% { opacity: 1; } 100% { opacity: 0; } }";
    const [keyframes] = keyframeRules(parseCss(fixture));
    expect(keyframes).toBeDefined();
    expect(smallestStopGapMs(keyframes as CssBlock, 3000)).toBe(300);
  });

  it("every animation, transition and hover transform sits in the no-preference media query (R9.6)", () => {
    const rules = styleRules(parseCss(readFileSync(MOTION_CSS_PATH, "utf8")));
    expect(rules.some((rule) => rule.inNoPreference)).toBe(true);
    const motion = /(?:^|[;\s])(?:animation|transition)(?:-[a-z-]+)?\s*:/;
    const transform = /(?:^|[;\s])transform\s*:/;
    for (const rule of rules) {
      if (rule.inNoPreference) continue;
      expect(rule.declarations, `${rule.selector} has no animation or transition`).not.toMatch(motion);
      if (/:hover|:focus/.test(rule.selector)) {
        expect(rule.declarations, `${rule.selector} has no transform`).not.toMatch(transform);
      }
    }
    expect(rules.some((rule) => motion.test(rule.declarations))).toBe(true);
  });

  it("landing-motion.css carries the effect alphas of scene-alphas.ts (R9.7)", () => {
    const css = readFileSync(MOTION_CSS_PATH, "utf8");
    expect(css).toContain("var(--bone) 1.5%");
    expect(css).toContain("var(--ember) 35%");
    expect(css).toContain("var(--night) 70%");
    const alphas = readFileSync(join(SRC_DIR, "slice", "logic", "scene-alphas.ts"), "utf8");
    expect(alphas).toMatch(/export const TITLE_GLOW_ALPHA = 0\.015;/);
    expect(alphas).toMatch(/export const CANDLE_GLOW_ALPHA = 0\.35;/);
    expect(alphas).toMatch(/export const CANDLE_BAND_ALPHA = 0\.7;/);
  });

  it("no Landing file calls requestAnimationFrame or setInterval (R9.6)", () => {
    const files = sourceFiles(LANDING_DIR).filter((file) => !/\.test\.tsx?$/.test(file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/requestAnimationFrame|setInterval/);
    }
  });

  it("art files draw no text, image or external reference, no hex colour, and ids from useId (Req 12.3)", () => {
    for (const file of ART_FILES) {
      const text = readFileSync(file, "utf8");
      expect(artOffences(text), file).toEqual([]);
      expect(text, file).toMatch(/aria-hidden="true"/);
    }
  });

  it("the art scan reports each kind of breach", () => {
    const fixture = [
      "<text>x</text>",
      "<image />",
      "<foreignObject />",
      '<use href="https://example.com/a.svg" />',
      "fill='#ECE6D6'",
      'id="pit"',
      "id={other}",
    ].join("\n");
    expect(artOffences(fixture)).toHaveLength(7);
    const clean =
      'const id = useId();\n<pattern id={id} />\n<rect fill={`url(#${id})`} />\n<use href="#a" />\n<a href={href} />';
    expect(artOffences(clean)).toEqual([]);
  });
  it("Preview SVG (Req 4.3)", () => {
    const svg = readFileSync(OG_SVG_PATH, "utf8");
    expect(previewSvgOffences(svg)).toEqual([]);
    expect(svg).toMatch(/<svg\b[^>]*\bwidth="1200" height="630"/);
    expect(svg).toMatch(/<!-- text:start -->[\s\S]*<path[\s\S]*<!-- text:end -->/);
  });

  it("the preview SVG scan reports each kind of breach", () => {
    const fixture = [
      "<text>x</text>",
      "<script />",
      "<foreignObject />",
      "<image />",
      '<use href="https://example.com/a.svg" />',
      'fill="url(https://example.com/a)"',
      'fill="#123456"',
    ].join("\n");
    expect(previewSvgOffences(fixture)).toHaveLength(7);
    expect(previewSvgOffences('<use href="#a" /><rect fill="url(#sky)" stroke="#ece6d6" />')).toEqual([]);
  });

  it("the preview wordmark and tagline lines end at or before x 1150 (task 10, amended 2026-11-18)", () => {
    const { wordmark, tagline } = shareTextLayout();
    expect(tagline).toHaveLength(2);
    for (const line of [wordmark, ...tagline]) {
      expect(line.right, line.text).toBeLessThanOrEqual(SHARE_TEXT_RIGHT_LIMIT);
    }
  });

  it("Public files (Req 12.2)", () => {
    expect(readdirSync(PUBLIC_DIR).sort()).toEqual(["favicon.svg", "og-image.png", "og-image.svg"]);
  });

  it("og-image.png is 1200 × 630 and at most 300 KB (Req 4.2)", () => {
    const png = readFileSync(OG_PNG_PATH);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThanOrEqual(300 * 1024);
  });
});
