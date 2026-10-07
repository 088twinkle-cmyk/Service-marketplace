/**
 * Browser entry point (Vite).
 *
 * Boots the exact same screens the native app uses, wrapped in the same
 * providers as `app/_layout.tsx`:
 *
 *   SafeAreaProvider > AuthGuard > Navbar + routed screen
 *
 * The native build keeps using Expo Router + Metro; this file is only used by
 * `npm run dev` / `npm run build`.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { View, StyleSheet } from "react-native";
import {
  BrowserRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AppRoutes from "./webRoutes";
import Navbar from "./components/Navbar";
import AuthGuard from "./auth/AuthGuard";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { __setImperativeNavigator } from "expo-router";
import { BACKGROUND } from "./theme/colors";

import "./global.css";
import "./web.css";

function RouterBridge({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    __setImperativeNavigator((to, replace) => navigate(to, { replace }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Scroll back to the top on navigation (native screens do this too).
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return <>{children}</>;
}

function App() {
  return (
    <SafeAreaProvider>
      <AuthGuard>
        <View style={styles.shell}>
          <Navbar />
          <View style={styles.content}>
            <AppRoutes />
          </View>
        </View>
      </AuthGuard>
    </SafeAreaProvider>
  );
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element #root was not found in index.html.");
}

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <RouterBridge>
        <App />
      </RouterBridge>
    </BrowserRouter>
  </React.StrictMode>
);

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: BACKGROUND },
  content: { flex: 1 },
});
