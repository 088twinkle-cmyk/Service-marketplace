/// <reference types="vite/client" />

/**
 * Browser-build type shims.
 *
 * The app is authored as an Expo/React Native project. `npm run typecheck`
 * runs with these files included so the web entry points, the Expo web shims
 * and the CSS imports are typed exactly like the Vite build resolves them.
 */
declare module "*.css";
declare module "*.png";
declare module "*.jpg";
declare module "*.svg";

declare const __DEV__: boolean;
