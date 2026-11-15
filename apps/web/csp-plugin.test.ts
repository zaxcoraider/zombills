import { describe, expect, it } from "vitest";
import { CSP_POLICY, cspPlugin, injectCsp } from "./csp-plugin";

const VITE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zombills</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("injectCsp", () => {
  it("places the tag right after <meta charset>", () => {
    const out = injectCsp(VITE_HTML);
    const charset = out.indexOf('<meta charset="UTF-8" />');
    const tag = out.indexOf('<meta http-equiv="Content-Security-Policy"');
    expect(charset).toBeGreaterThanOrEqual(0);
    expect(tag).toBe(charset + '<meta charset="UTF-8" />'.length + "\n    ".length);
  });

  it("puts the tag before every <script> and <link>", () => {
    const out = injectCsp(VITE_HTML);
    const tag = out.indexOf('<meta http-equiv="Content-Security-Policy"');
    for (const match of out.matchAll(/<(script|link)\b/g)) {
      expect(tag).toBeLessThan(match.index);
    }
  });

  it("sets content to CSP_POLICY", () => {
    const out = injectCsp(VITE_HTML);
    const doc = new RegExp(
      '<meta http-equiv="Content-Security-Policy" content="([^"]*)"',
    ).exec(out);
    expect(doc?.[1]).toBe(CSP_POLICY);
  });

  it("inserts exactly one tag", () => {
    const out = injectCsp(VITE_HTML);
    expect(out.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it("throws when there is no charset meta", () => {
    expect(() => injectCsp("<html><head><title>x</title></head></html>")).toThrow();
  });
});

describe("cspPlugin", () => {
  it("applies to the build only", () => {
    expect(cspPlugin().apply).toBe("build");
  });

  it("is named zombills-csp and runs after Vite's own HTML transforms", () => {
    const plugin = cspPlugin();
    expect(plugin.name).toBe("zombills-csp");
    expect(plugin.transformIndexHtml).toEqual({ order: "post", handler: injectCsp });
  });
});
