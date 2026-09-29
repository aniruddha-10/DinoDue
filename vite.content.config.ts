import { defineConfig } from "vite";

// The content script, as a single self-contained IIFE. Runs after the pages
// build, so it must not empty dist/.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      name: "dinodueContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
