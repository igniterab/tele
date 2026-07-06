import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    // Emit straight into the web app's public/ dir so Vite's dev server (and
    // the production web build) serve /tele-widget.js with zero extra wiring —
    // the loader script is meant to be fetched from the same host as the
    // dashboard/widget-frame, not published as a separate static site.
    outDir: resolve(__dirname, "../web/public"),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/loader.ts"),
      name: "TeleWidgetLoader",
      formats: ["iife"],
      fileName: () => "tele-widget.js",
    },
    minify: true,
  },
});
