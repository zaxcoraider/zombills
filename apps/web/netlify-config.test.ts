/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOML = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const LINES = TOML.split(/\r?\n/).map((line) => line.trim());

describe("netlify.toml", () => {
  it("has a [build] table", () => {
    expect(LINES).toContain("[build]");
  });

  it("builds with npm run build", () => {
    expect(LINES).toContain('command = "npm run build"');
  });

  it("publishes apps/web/dist", () => {
    expect(LINES).toContain('publish = "apps/web/dist"');
  });

  it("pins the Node version", () => {
    expect(LINES).toContain("[build.environment]");
    expect(LINES).toContain('NODE_VERSION = "24"');
  });

  it.each(["[[redirects]]", "[functions]", "[[edge_functions]]", "[[headers]]"])(
    "has no %s table",
    (table) => {
      expect(LINES).not.toContain(table);
    },
  );
});
