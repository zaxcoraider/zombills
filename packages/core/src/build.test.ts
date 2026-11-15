// Builds the package and loads the result in plain Node, the way the Reaper (outside any bundler) will.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(packageRoot, "..", "..");
const distRoot = join(packageRoot, "dist");
const samplePath = join(repoRoot, "samples", "us-signed.csv");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Runs a script as an ES module in a fresh Node process, with no loader and no bundler. */
function runModule(
  script: string,
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** A script that imports `specifier`, parses the US sample and prints a summary as JSON. */
function parseSampleScript(specifier: string): string {
  return `
    import { readFileSync } from "node:fs";
    import { parseStatement } from ${JSON.stringify(specifier)};
    const result = parseStatement(readFileSync(${JSON.stringify(samplePath)}, "utf8"));
    console.log(JSON.stringify({
      status: result.status,
      transactions: result.transactions.length,
      rowErrors: result.rowErrors.length,
      first: result.transactions[0],
      currency: result.detectedCurrency,
    }));
  `;
}

describe("the built package in plain Node (Req 12.3)", () => {
  // The build and the child processes take a few seconds.
  const TIMEOUT = 120_000;

  rmSync(distRoot, { recursive: true, force: true });
  const build = spawnSync("npm", ["run", "build"], { cwd: packageRoot, encoding: "utf8" });

  it(
    "builds without errors",
    () => {
      expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
      expect(existsSync(join(distRoot, "index.js"))).toBe(true);
      expect(existsSync(join(distRoot, "index.d.ts"))).toBe(true);
    },
    TIMEOUT,
  );

  it("ships no test files and no test helpers", () => {
    const files = filesUnder(distRoot).map((path) => path.slice(distRoot.length));
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((file) => /\.test\.|test-arbitraries/.test(file))).toEqual([]);
  });

  it("writes an explicit .js extension on every relative import and export", () => {
    const relative = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g;
    const scripts = filesUnder(distRoot).filter((file) => file.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(10);
    for (const file of scripts) {
      for (const match of readFileSync(file, "utf8").matchAll(relative)) {
        expect(match[1], `${file}: ${match[0]}`).toMatch(/\.js$/);
      }
    }
  });

  it("points package.json exports at files that exist", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      exports: { ".": { types: string; default: string } };
    };
    expect(existsSync(join(packageRoot, manifest.exports["."].default))).toBe(true);
    expect(existsSync(join(packageRoot, manifest.exports["."].types))).toBe(true);
  });

  it(
    "imports dist/index.js by path and parses a sample, from any working directory",
    () => {
      const entry = pathToFileURL(join(distRoot, "index.js")).href;
      const run = runModule(parseSampleScript(entry), fileURLToPath(new URL("file:///")));
      expect(run.status, run.stderr).toBe(0);
      const summary = JSON.parse(run.stdout) as {
        status: string;
        transactions: number;
        rowErrors: number;
        first: unknown;
        currency: unknown;
      };
      expect(summary.status).toBe("mapped");
      expect(summary.rowErrors).toBe(0);
      expect(summary.transactions).toBe(26);
      expect(summary.currency).toEqual({ code: "USD", source: "default" });
      expect(summary.first).toEqual({
        date: "2026-01-02",
        description: "NETFLIX.COM 866-579-7172 CA",
        amountCents: 1549,
        currency: "USD",
      });
    },
    TIMEOUT,
  );

  it(
    "imports the package by name, through its exports map, and gets the same answer",
    () => {
      const byPath = runModule(
        parseSampleScript(pathToFileURL(join(distRoot, "index.js")).href),
        repoRoot,
      );
      const byName = runModule(parseSampleScript("@zombills/core"), repoRoot);
      expect(byName.status, byName.stderr).toBe(0);
      expect(byName.stdout).toBe(byPath.stdout);
    },
    TIMEOUT,
  );

  it(
    "calls detectSubscriptions from dist/index.js on two Netflix charges a month apart",
    () => {
      const run = runModule(
        `
        const api = await import(${JSON.stringify(pathToFileURL(join(distRoot, "index.js")).href)});
        const rows = ["2026-01-02", "2026-02-02"].map((date) => {
          const merchant = api.normalizeMerchant("NETFLIX.COM 866-579-7172 CA");
          return { date, description: "NETFLIX.COM 866-579-7172 CA", amountCents: 1549, currency: "USD", merchant };
        });
        const result = api.detectSubscriptions(rows);
        console.log(JSON.stringify({
          ids: result.subscriptions.map((sub) => sub.id),
          usage: result.usage.length,
        }));
      `,
        repoRoot,
      );
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({ ids: ["sub:USD:monthly:*:netflix"], usage: 2 });
    },
    TIMEOUT,
  );

  it(
    "exports the public functions and nothing that needs a browser",
    () => {
      const run = runModule(
        `
        const api = await import(${JSON.stringify(pathToFileURL(join(distRoot, "index.js")).href)});
        const identity = api.normalizeMerchant("NETFLIX.COM 866-579-7172 CA");
        console.log(JSON.stringify({
          keys: Object.keys(api),
          window: typeof window,
          document: typeof document,
          key: identity.key,
        }));
      `,
        repoRoot,
      );
      expect(run.status, run.stderr).toBe(0);
      const result = JSON.parse(run.stdout) as { keys: string[] };
      expect({ ...result, keys: [...result.keys].sort() }).toEqual({
        keys: [
          "AMOUNT_HEADERS",
          "CREDIT_HEADERS",
          "DATE_HEADERS",
          "DEBIT_HEADERS",
          "DESCRIPTION_HEADERS",
          "EMPTY_CSV_REASON",
          "KNOWN_SERVICES",
          "NO_CONTENT_ROWS_REASON",
          "detectSubscriptions",
          "getKnownService",
          "normalizeHeader",
          "normalizeMerchant",
          "normalizeTransactions",
          "parseStatement",
        ],
        window: "undefined",
        document: "undefined",
        key: "netflix",
      });
    },
    TIMEOUT,
  );
});
