import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icon-192.png",
        "icon-512.png"
      ],
      manifest: {
        name: "Project Orion",
        short_name: "Orion",
        description: "Top-down action RPG mech shooter.",
        theme_color: "#00ff00",
        background_color: "#0a0a0a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "/index.html"
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    sourcemap: false
  }
});
