import { defineConfig } from "vitest/config";

// Content scripts can't be ES modules, so the content script is built as a
// single self-contained IIFE. The popup and forecast pages will get their own
// entries when the UI is added.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/content/index.ts",
      name: "dinodueContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
  test: {
    environment: "node",
  },
});
