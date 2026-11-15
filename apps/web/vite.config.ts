import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { cspPlugin } from "./csp-plugin.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: { assetsInlineLimit: 0, modulePreload: { polyfill: false } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
