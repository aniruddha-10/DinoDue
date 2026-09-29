import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Extension pages: the popup and the forecast page. The content
// script is built separately by vite.content.config.ts, because content
// scripts can't be ES modules.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: "popup.html", forecast: "forecast.html" },
    },
  },
  test: {
    environment: "node",
    env: { TZ: "America/Edmonton" }, // Calgary time, so date tests are stable
  },
});
