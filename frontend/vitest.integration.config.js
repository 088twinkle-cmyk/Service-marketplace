import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

import baseConfig from "./vite.config.js";

/**
 * Live integration tests.
 *
 * These tests talk to a real Django server (started with `manage.py runserver
 * 0.0.0.0:8001`) plus a seeded development database. jsdom is pinned to the
 * backend origin so relative `/api/...` URLs resolve exactly like they do
 * behind the Vite proxy in a browser.
 *
 *   npm run test:integration
 */
export default defineConfig({
  ...baseConfig,
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.itest.tsx"],
    css: false,
    testTimeout: 30000,
    environmentOptions: {
      jsdom: {
        url: process.env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8001/",
      },
    },
    server: {
      deps: {
        inline: ["react-native-web"],
      },
    },
  },
  resolve: {
    ...baseConfig.resolve,
    alias: [
      ...baseConfig.resolve.alias,
      { find: /^@test\/(.*)$/, replacement: path.resolve(__dirname, "src/test/$1") },
    ],
  },
});
