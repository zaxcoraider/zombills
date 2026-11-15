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
});
