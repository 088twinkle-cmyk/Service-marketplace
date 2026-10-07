import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

import baseConfig from "./vite.config.js";

/**
 * Reuses the same aliases as the app build so tests exercise the modules the
 * browser actually loads (react-native-web + the Expo web shims).
 */
export default defineConfig({
  ...baseConfig,
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    css: false,
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
