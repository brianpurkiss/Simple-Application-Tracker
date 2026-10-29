import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DEMO_BASE } from "./demo/config.ts";

// VITE_DEMO=1 builds the static public demo (see scripts/build-demo.ts): served under the GitHub Pages path, with the
// API snapshot bundled in. Normal builds point the snapshot import at an empty stub.
const demo = process.env.VITE_DEMO === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: demo ? DEMO_BASE : "/",
  build: { outDir: demo ? "dist-demo" : "dist" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@demo-snapshot": path.resolve(import.meta.dirname, demo ? "demo/.snapshot/api.json" : "demo/empty-snapshot.json"),
    },
  },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3001}` } },
});
