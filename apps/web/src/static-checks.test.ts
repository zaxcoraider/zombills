import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHARE_TEXT_RIGHT_LIMIT, shareTextLayout } from "../scripts/og-font-paths";
import * as motionValues from "./slice/graveyard/motion";

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

const SLICE_DIR = join(SRC_DIR, "slice");

/** The files whose motion objects P7 checks: the four signature moments. */
const P7_FILES = [
  join(SLICE_DIR, "graveyard", "undead-card.tsx"),
  join(SLICE_DIR, "drop-zone.tsx"),
  join(SLICE_DIR, "statement", "grave-art.tsx"),
  join(SLICE_DIR, "chrome", "footer-tombstone.tsx"),
];
const P7_KEYS = new Set(["x", "y", "rotate", "scaleY", "opacity"]);
/** Keys of a target that configure, rather than animate. */
const TARGET_META = new Set(["transition", "transitionEnd"]);

/** The text from `open` (at `start`) to its matching closer, outside quotes. */
function balanced(text: string, start: number): string {
  const open = text.charAt(start);
  const close = open === "{" ? "}" : open === "(" ? ")" : "]";
  let depth = 0;
  let quote = "";
  for (let i = start; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/** The top-level keys of an object literal `{ … }` (shorthand, `key:` and `"key":`). */
function literalKeys(literal: string): string[] {
  const inner = literal.slice(1, -1);
  const keys: string[] = [];
  let depth = 0;
  let quote = "";
  let segment = "";
  const flush = () => {
    const key = /^\s*["']?([A-Za-z_$][\w$]*)["']?\s*(?::|$)/.exec(segment)?.[1];
    if (key) keys.push(key);
    segment = "";
  };
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if ("{([".includes(ch)) {
      depth += 1;
    } else if ("})]".includes(ch)) {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    segment += ch;
  }
  flush();
  return keys;
}

/** Animated keys of a runtime target, or of every target in a Variants object. */
function runtimeKeys(value: unknown, isVariants: boolean): string[] {
  if (typeof value !== "object" || value === null) return [];
  const targets = isVariants ? Object.values(value) : [value];
  return targets.flatMap((target) =>
    typeof target === "object" && target !== null
      ? Object.keys(target).filter((key) => !TARGET_META.has(key))
      : [],
  );
}

/** Every animated key named by one `animate`, `variants` or `whileHover` value expression. */
function p7Keys(
  expr: string,
  isVariants: boolean,
  fileText: string,
  exported: Readonly<Record<string, unknown>>,
): string[] {
  const value = expr.trim();
  // A variant label (a string, or a lookup of one) names a target checked through `variants`.
  if (/^["'`]/.test(value) || /^[A-Z_]+\[/.test(value)) return [];
  if (value.startsWith("{")) {
    const keys = literalKeys(value);
    return isVariants ? [] : keys.filter((key) => !TARGET_META.has(key));
  }
  const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(value);
  if (call) {
    const fn = exported[call[1] ?? ""];
    if (typeof fn !== "function") throw new Error(`P7: cannot resolve ${value}`);
    // Motion helpers take the reduced flag first; check both modes.
    return [true, false].flatMap((reduced) =>
      runtimeKeys((fn as (reduced: boolean) => unknown)(reduced), isVariants),
    );
  }
  const name = /^[A-Za-z_$][\w$]*$/.exec(value)?.[0];
  if (name === undefined) throw new Error(`P7: cannot read ${value}`);
  if (name in exported) return runtimeKeys(exported[name], isVariants);
  const local = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*`).exec(fileText);
  if (local === null) throw new Error(`P7: cannot resolve ${name}`);
  const start = local.index + local[0].length;
  const rest = fileText.slice(start);
  const init = rest.startsWith("{") ? balanced(fileText, start) : (rest.split(/;|\n/)[0] ?? "");
  return p7Keys(init, isVariants, fileText, exported);
}

/**
 * The one named P7 exception (design P7): the graveyard-ui "kept" fade of the yearly-cost figure
 * may animate `color`. It applies only to the `animate` prop of a tag marked with this attribute.
 */
const P7_EXCEPTION_MARK = 'data-p7-exception="yearly-cost-fade"';
const P7_EXCEPTION_KEYS = new Set(["color"]);

/** The opening tags of `text` that carry the P7 exception mark, as [start, end) ranges. */
function p7ExceptionTags(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of text.matchAll(/<[A-Za-z][\w.]*(?=[\s>/])/g)) {
    const tag = openingTag(text, m.index);
    if (tag.includes(P7_EXCEPTION_MARK)) ranges.push([m.index, m.index + tag.length]);
  }
  return ranges;
}

/** Every P7 offence in a file: an animated key outside `x`, `y`, `rotate`, `scaleY`, `opacity`. */
function p7Offences(text: string, exported: Readonly<Record<string, unknown>>): string[] {
  const found: string[] = [];
  const excepted = p7ExceptionTags(text);
  for (const m of text.matchAll(/\b(animate|variants|whileHover)=\{/g)) {
    const braces = balanced(text, m.index + m[0].length - 1);
    const keys = p7Keys(braces.slice(1, -1), m[1] === "variants", text, exported);
    const inMarkedTag =
      m[1] === "animate" && excepted.some(([start, end]) => m.index > start && m.index < end);
    for (const key of keys) {
      if (P7_KEYS.has(key) || (inMarkedTag && P7_EXCEPTION_KEYS.has(key))) continue;
      found.push(`${m[1]}: ${key}`);
    }
  }
  return found;
}

/** Non-test `.tsx` files under `src/slice/**`. */
function sliceTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sliceTsxFiles(path);
    return name.endsWith(".tsx") && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/**
 * The opening tag that starts at `start`: up to the first `>` outside `{ … }` and outside
 * quotes, so `onClick={() => …}` does not end it early.
 */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote = "";
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === ">" && depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/**
 * Every Req 6.3 breach in `text`: a `<button` or `<motion.button` tag, or an `<a` or
 * `<motion.a` tag with `min-h-11` or `rounded-control`, that has none of `data-variant`, an
 * inline `{...buttonVariant(` spread and `data-exempt`, or that spreads anything else.
 */
function variantOffences(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/<(?:motion\.)?(button|a)(?=[\s>/])/g)) {
    const tag = openingTag(text, m.index);
    // An `a` is checked when it looks like a button or spreads anything (review C #8).
    if (m[1] === "a" && !/\bmin-h-11\b|\brounded-control\b|\{\s*\.\.\./.test(tag)) continue;
    const marked = /\bdata-variant\b|\{\s*\.\.\.\s*buttonVariant\(|\bdata-exempt\b/.test(tag);
    const otherSpread = [...tag.matchAll(/\{\s*\.\.\.\s*(\w*)/g)].some(
      (s) => s[1] !== "buttonVariant",
    );
    if (!marked || otherSpread) found.push(tag);
  }
  return found;
}

/**
 * The markup files pro-polish creates or restyles (design "New files" and "Changed files").
 * Not listed: `undead-card.tsx` (its card keeps `rounded-2xl` and `rounded-xl`, Out of scope)
 * and `primary-action.tsx` (it keeps its landing-polish classes, design "Button variants").
 */
const RADIUS_FILES = [
  join(SLICE_DIR, "button-variants.ts"),
  join(SLICE_DIR, "chrome", "compact-header.tsx"),
  join(SLICE_DIR, "chrome", "leave-question.tsx"),
  join(SLICE_DIR, "chrome", "footer-tombstone.tsx"),
  join(SLICE_DIR, "statement", "statement-panel.tsx"),
  join(SLICE_DIR, "statement", "grave-art.tsx"),
  join(SLICE_DIR, "statement", "sample-chips.tsx"),
  join(SLICE_DIR, "statement", "statement-disclosure.tsx"),
];
RADIUS_FILES.push(
  join(SLICE_DIR, "graveyard", "ground-line.tsx"),
  join(SLICE_DIR, "slice-page.tsx"),
  join(SLICE_DIR, "site-footer.tsx"),
  join(SLICE_DIR, "drop-zone.tsx"),
  join(SLICE_DIR, "error-view.tsx"),
  join(SLICE_DIR, "no-subscriptions-view.tsx"),
  join(SLICE_DIR, "landing", "own-statement.tsx"),
  join(SLICE_DIR, "landing", "hero.tsx"),
  join(SLICE_DIR, "landing", "brand-mark.tsx"),
);
RADIUS_FILES.push(
  join(SLICE_DIR, "graveyard", "night-scene.tsx"),
  join(SLICE_DIR, "graveyard", "graveyard-backdrop.tsx"),
  join(SLICE_DIR, "graveyard", "burial-stage.tsx"),
  join(SLICE_DIR, "graveyard", "rising-view.tsx"),
  join(SLICE_DIR, "graveyard", "cancel-helper.tsx"),
  join(SLICE_DIR, "graveyard", "graveyard-view.tsx"),
  join(SLICE_DIR, "graveyard", "memory-panel.tsx"),
  join(SLICE_DIR, "graveyard", "share-panel.tsx"),
  join(SLICE_DIR, "graveyard", "savings-counter.tsx"),
);

/**
 * A radius class outside the design tokens: `rounded`, `rounded-sm`, `rounded-lg`, `rounded-xl`
 * or `rounded-2xl`, with or without variant prefixes (`sm:`, `hover:`). The class must end at a
 * space, quote, backtick or line end, so `rounded-control`, `rounded-t-stone` or `rounded-full`
 * do not match, and the start must not follow a letter, digit or `-`.
 */
const OFF_SCALE_RADIUS = /(?<![\w-])(?:[\w-]+:)*rounded(?:-sm|-lg|-xl|-2xl)?(?=$|[\s"'`])/gm;

/** Every off-scale radius class in `text`, with comments removed first. */
function radiusOffences(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(OFF_SCALE_RADIUS)].map((m) => m[0]);
}

describe("static checks", () => {
  it("Radius (design tokens)", () => {
    for (const file of RADIUS_FILES) {
      expect(statSync(file).isFile(), file).toBe(true);
      expect(radiusOffences(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("the radius scan reports off-scale classes and accepts the tokens", () => {
    expect(
      radiusOffences(
        '"rounded p-2" "sm:rounded-lg" `rounded-xl` "a rounded-2xl" "hover:rounded-sm b"',
      ),
    ).toEqual(["rounded", "sm:rounded-lg", "rounded-xl", "rounded-2xl", "hover:rounded-sm"]);
    expect(
      radiusOffences(
        '"rounded-control rounded-card rounded-t-stone rounded-full rounded-pill rounded-small" // a rounded edge\n/* rounded corners */',
      ),
    ).toEqual([]);
  });

  it("Variants (Req 6.3)", () => {
    const files = sliceTsxFiles(SLICE_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(variantOffences(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("the variants scan reports each form and accepts the marked ones", () => {
    expect(variantOffences('<button type="button" onClick={() => go()}>Go</button>')).toHaveLength(
      1,
    );
    expect(variantOffences('<motion.button type="button">Go</motion.button>')).toHaveLength(1);
    expect(variantOffences('<button type="button" {...v}>Go</button>')).toHaveLength(1);
    expect(variantOffences('<a href="#x" className="min-h-11 underline">x</a>')).toHaveLength(1);
    expect(variantOffences('<a href="#x" {...v}>x</a>')).toHaveLength(1);
    expect(variantOffences('<motion.a href="#x" {...props}>x</motion.a>')).toHaveLength(1);
    const clean = [
      '<button type="button" {...buttonVariant("secondary")} onClick={() => go()}>Go</button>',
      '<motion.button type="button" data-variant="primary" className="bg-moss">Go</motion.button>',
      '<button type="button" data-exempt="card">Skip</button>',
      '<a href="#x" className="underline">plain link</a>',
      "<aside>not a control</aside>",
    ].join("\n");
    expect(variantOffences(clean)).toEqual([]);
  });

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
      expect(smallestStopGapMs(keyframes, Math.min(...durations)), name).toBeGreaterThanOrEqual(
        334,
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the stop-gap scan reports stops that are too close", () => {
    const fixture =
      "@keyframes zb-x { 0% { opacity: 0; } 10% { opacity: 1; } 100% { opacity: 0; } }";
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
      expect(rule.declarations, `${rule.selector} has no animation or transition`).not.toMatch(
        motion,
      );
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

  it("Motion (Req 12.7, 12.8)", () => {
    // No endless motion anywhere in the slice: the card sway and the fog drift are finite.
    const sliceFiles = urlSourceFiles(SLICE_DIR).filter((file) => /\.tsx?$/.test(file));
    expect(sliceFiles.length).toBeGreaterThan(0);
    for (const file of sliceFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bInfinity\b/);
    }
    const keyframeHolders = urlSourceFiles(SRC_DIR).filter((file) =>
      /@keyframes/.test(readFileSync(file, "utf8")),
    );
    expect(keyframeHolders).toEqual([MOTION_CSS_PATH]);
    for (const folder of ["chrome", "statement"]) {
      const files = urlSourceFiles(join(SLICE_DIR, folder));
      expect(files.length, folder).toBeGreaterThan(0);
      for (const file of files) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/requestAnimationFrame|setInterval/);
      }
    }
  });

  it("the signature moments animate only x, y, rotate, scaleY and opacity (P7)", () => {
    for (const file of P7_FILES) {
      expect(p7Offences(readFileSync(file, "utf8"), motionValues), file).toEqual([]);
    }
    // The named exception marks exactly the two yearly-cost figures of the undead card.
    for (const file of P7_FILES) {
      const marks = readFileSync(file, "utf8").split(P7_EXCEPTION_MARK).length - 1;
      expect(marks, file).toBe(file === P7_FILES[0] ? 2 : 0);
    }
  });

  it("the P7 exception allows color only on the animate prop of a marked tag", () => {
    const fade = 'animate={{ color: calm ? "var(--bone)" : "var(--blood)" }}';
    // The exempted yearly-cost form passes.
    expect(
      p7Offences(`<motion.p ${P7_EXCEPTION_MARK} initial={false} ${fade} />`, motionValues),
    ).toEqual([]);
    // Color on an unmarked tag fails.
    expect(p7Offences(`<motion.p initial={false} ${fade} />`, motionValues)).toEqual([
      "animate: color",
    ]);
    // Color in some other animate object fails, even next to a marked tag.
    const sibling = `<motion.p ${P7_EXCEPTION_MARK} ${fade}><motion.span animate={{ color: "red" }} /></motion.p>`;
    expect(p7Offences(sibling, motionValues)).toEqual(["animate: color"]);
    // The mark allows color only, and only in animate.
    const wider = `<motion.p ${P7_EXCEPTION_MARK} animate={{ color: "red", scale: 2 }} whileHover={{ color: "red" }} />`;
    expect(p7Offences(wider, motionValues)).toEqual(["animate: scale", "whileHover: color"]);
  });

  it("the P7 scan reads literals, locals and motion helpers, and reports other keys", () => {
    const fixture = [
      "const glow = { opacity: on ? 1 : 0 };",
      "const lift = stoneVariants(reduceMotion);",
      '<motion.div animate={{ rotate: 0, transition: { duration: 0 } }} animate="rest" />',
      "<motion.div animate={glow} variants={lift} animate={VARIANT_FOR_PHASE[phase]} />",
      '<motion.p animate={{ color: "var(--bone)" }} whileHover={{ scale: 1.1 }} />',
      "<motion.div variants={cardVariants(reduceMotion)} />",
    ].join("\n");
    expect(p7Offences(fixture, motionValues)).toEqual(["animate: color", "whileHover: scale"]);
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
    expect(
      previewSvgOffences('<use href="#a" /><rect fill="url(#sky)" stroke="#ece6d6" />'),
    ).toEqual([]);
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
