import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/avant-web/";

export default defineConfig({
  base: BASE,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Solo CoC6 AI GM",
        short_name: "CoC6 Solo",
        description:
          "クトゥルフ神話TRPG第6版準拠のソロ専用AIゲームマスター。制約付きシナリオ生成と対話進行。",
        lang: "ja",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        theme_color: "#030306",
        background_color: "#030306",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,webp,woff2,webmanifest}"],
        navigateFallback: `${BASE}index.html`,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
