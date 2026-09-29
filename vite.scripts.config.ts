import { defineConfig } from "vite";

// The content script and the background worker, each as one self-contained
// IIFE file. Pick one with --mode content or --mode background. Runs after the
// pages build, so it must not empty dist/.
const ENTRIES: Record<string, { entry: string; file: string }> = {
  content: { entry: "src/content/index.ts", file: "content.js" },
  background: { entry: "src/background/index.ts", file: "background.js" },
};

export default defineConfig(({ mode }) => {
  const target = ENTRIES[mode];
  if (!target) throw new Error(`Unknown mode "${mode}". Use --mode content or --mode background.`);
  return {
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: target.entry,
        name: `dinodue_${mode}`,
        formats: ["iife"],
        fileName: () => target.file,
      },
    },
  };
});
