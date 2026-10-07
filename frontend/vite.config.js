import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const BACKEND = process.env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8001";

/**
 * The app is written as a React Native / Expo app. For the browser build the
 * React Native primitives come from `react-native-web` and the few Expo
 * modules that need a native runtime are replaced by small web shims in
 * `src/shims`. The native (Metro) build is untouched by these aliases.
 */
const shims = {
  "react-native": "react-native-web",
  // Browser-only router shim. It must live here (Vite), never in
  // tsconfig.json: Metro (Expo) honours tsconfig `paths`, and mapping
  // `expo-router` there would make the native/Expo build load this shim and
  // call `useNavigate()` outside of a React Router context.
  "expo-router": path.resolve(__dirname, "src/shims/expo-router.tsx"),
  "expo-image": path.resolve(__dirname, "src/shims/expo-image.tsx"),
  "expo-image-picker": path.resolve(__dirname, "src/shims/expo-image-picker.ts"),
  "expo-location": path.resolve(__dirname, "src/shims/expo-location.ts"),
  "expo-constants": path.resolve(__dirname, "src/shims/expo-constants.ts"),
  "expo-file-system/legacy": path.resolve(
    __dirname,
    "src/shims/expo-file-system-legacy.ts"
  ),
  "react-native-safe-area-context": path.resolve(
    __dirname,
    "src/shims/react-native-safe-area-context.tsx"
  ),
  "react-native-reanimated": path.resolve(
    __dirname,
    "src/shims/react-native-reanimated.tsx"
  ),
};

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: [
      ...Object.entries(shims).map(([find, replacement]) => ({
        find: new RegExp(`^${find.replace(/[/.]/g, (m) => `\\${m}`)}$`),
        replacement,
      })),
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    ],
    extensions: [
      ".web.tsx",
      ".web.ts",
      ".web.jsx",
      ".web.js",
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".json",
    ],
  },

  define: {
    // React Native exposes __DEV__ as a global; the browser build needs it too.
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    global: "globalThis",
  },

  optimizeDeps: {
    include: ["react-native-web", "axios", "react-router-dom"],
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // The preview runs inside an iframe on a proxied host, so no host
    // allow-listing and no framing restrictions.
    allowedHosts: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      // The browser talks to the API on the same origin; Vite forwards to Django.
      "/api": { target: BACKEND, changeOrigin: true },
      "/media": { target: BACKEND, changeOrigin: true },
      "/admin": { target: BACKEND, changeOrigin: true },
    },
  },

  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
