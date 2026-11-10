import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Plain Vite + TanStack Start config. Nitro is build-only and produces a Node server
// in .output/ (run with `node .output/server/index.mjs`). Pick another preset with
// NITRO_PRESET (e.g. NITRO_PRESET=vercel) when the hosting target is decided.
export default defineConfig(({ command }) => ({
  server: { port: 5173 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts wraps the default SSR entry with an error page.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
  ],
}));
