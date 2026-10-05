import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter, usePathname, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuth, logout } from "../auth/auth";
import { PRIMARY, NAV_DARK } from "../theme/colors";
import { userApi } from "../services/api/userApi";
import { resolveMediaUrl } from "../config/api";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const { token, role: r, username: uname } = await getAuth();

    setIsLoggedIn(!!token);
    setRole(r || "");
    setUsername(uname || "");

    if (token) {
      try {
        const me = await userApi.me();
        setAvatarUri(me.profile_photo || null);
      } catch {
        // Token may be stale/invalid; clearing is handled in axios interceptors.
        setAvatarUri(null);
      }
    } else {
      setAvatarUri(null);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [pathname, loadSession]);

  // Normalize the role so both "provider" and "PROVIDER"
  // and both "freelancer" and "FREELANCER" work.
  const normalizedRole = role.trim().toLowerCase();

  const isProvider =
    normalizedRole === "provider" ||
    normalizedRole === "freelancer";

  // Refresh avatar whenever any screen gains focus.
  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;

      let cancelled = false;

      userApi
        .me()
        .then((me) => {
          if (!cancelled) {
            setAvatarUri(me.profile_photo || null);
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [isLoggedIn])
  );

  // Keep navbar avatar in sync after profile uploads.
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const me = await userApi.me();

        if (!cancelled) {
          setAvatarUri(me.profile_photo || null);
        }
      } catch {
        if (!cancelled) {
          setAvatarUri(null);
        }
      }
    };

    const id = setInterval(tick, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoggedIn]);

  const handleLogout = async () => {
    await logout();
    setIsLoggedIn(false);
    setRole("");
    setUsername("");
    setAvatarUri(null);

    router.replace("/");
  };

  const goExpert = () => {
    router.push("/register");
  };

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {/* Logo */}
        <TouchableOpacity
          onPress={() => router.push("/")}
          style={styles.logoWrap}
        >
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>S</Text>
          </View>

          <Text style={styles.logoText}>
            Service Marketplace
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          {/* Avatar */}
          {isLoggedIn ? (
            <TouchableOpacity
              onPress={() =>
                router.replace(
                  isProvider
                    ? "/provider-home"
                    : "/dashboard"
                )
              }
              style={styles.avatarBtn}
            >
              {avatarUri ? (
                <Image
                  source={{
                    uri: resolveMediaUrl(avatarUri),
                  }}
                  style={styles.avatarImg}
                  key={avatarUri}
                  cachePolicy="memory-disk"
                  transition={150}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarLetter}>
                    {username?.charAt(0)?.toUpperCase() || "U"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : null}

          {/* Provider / Freelancer navigation */}
          {isLoggedIn && isProvider ? (
            <>
              <TouchableOpacity
                onPress={() => router.push("/provider-home")}
                style={styles.outlineBtn}
              >
                <Text style={styles.outlineBtnText}>
                  Dashboard
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/dashboard")}
                style={styles.outlineBtn}
              >
                <Text style={styles.outlineBtnText}>
                  Account
                </Text>
              </TouchableOpacity>
            </>
          ) : isLoggedIn ? (
            /* Customer navigation */
            <TouchableOpacity
              onPress={() => router.push("/dashboard")}
              style={styles.outlineBtn}
            >
              <Text style={styles.outlineBtnText}>
                My Account
              </Text>
            </TouchableOpacity>
          ) : (
            /* Logged-out navigation */
            <TouchableOpacity
              onPress={goExpert}
              style={styles.outlineBtn}
            >
              <Text style={styles.outlineBtnText}>
                Become an Expert
              </Text>
            </TouchableOpacity>
          )}

          {/* Sign In / Logout */}
          {!isLoggedIn ? (
            <TouchableOpacity
              onPress={() => router.push("/login")}
              style={styles.signInBtn}
            >
              <Text style={styles.signInText}>
                Sign In
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.signInBtn}
            >
              <Text style={styles.signInText}>
                Logout
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: NAV_DARK,
  },

  bar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  logoLetter: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  logoText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    flexShrink: 1,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  avatarBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 15,
  },

  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarLetter: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },

  outlineBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },

  outlineBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },

  signInBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 3,
  },

  signInText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  divider: {
    height: 0,
  },
});