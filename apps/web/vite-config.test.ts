import { describe, expect, it } from "vitest";
import config from "./vite.config";

describe("vite config build settings", () => {
  it("never inlines assets", () => {
    expect(config.build?.assetsInlineLimit).toBe(0);
  });

  it("turns the module-preload polyfill off", () => {
    const preload = config.build?.modulePreload;
    expect(typeof preload).toBe("object");
    expect(preload !== false && preload !== true && preload?.polyfill).toBe(false);
  });
});
