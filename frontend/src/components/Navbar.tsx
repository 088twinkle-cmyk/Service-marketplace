/**
 * Navbar — the global header.
 *
 * Same behaviour as before (logo → home, avatar → account/dashboard, Become an
 * Expert, Sign In, Logout, provider/customer role detection), redesigned into a
 * white sticky bar with a real desktop navigation row and a mobile menu that
 * never overlaps or clips.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useRouter, usePathname, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getAuth, logout } from "../auth/auth";
import { resolveMediaUrl } from "../config/api";
import { userApi } from "../services/api/userApi";
import { colors, layout, radius, shadows, spacing, typography, weight } from "../theme/tokens";
import { useResponsive } from "../theme/responsive";
import Avatar from "./ui/Avatar";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Icon, { type IconName } from "./ui/Icon";

type NavLink = { label: string; href: string; icon: IconName; match: string[] };

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isMobile, isDesktop } = useResponsive();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Normalize the role so both "provider" and "PROVIDER",
  // and both "freelancer" and "FREELANCER" work.
  const normalizedRole = role.trim().toLowerCase();

  const isProvider = normalizedRole === "provider" || normalizedRole === "freelancer";

  // Refresh avatar whenever any screen gains focus.
  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;

      let cancelled = false;

      userApi
        .me()
        .then((me) => {
          if (!cancelled) setAvatarUri(me.profile_photo || null);
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
        if (!cancelled) setAvatarUri(me.profile_photo || null);
      } catch {
        if (!cancelled) setAvatarUri(null);
      }
    };

    const id = setInterval(tick, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoggedIn]);

  // Close the mobile menu when the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    setIsLoggedIn(false);
    setRole("");
    setUsername("");
    setAvatarUri(null);
    setMenuOpen(false);
    router.replace("/");
  };

  const goExpert = () => router.push("/register");
  const accountHref = isProvider ? "/provider-home" : "/dashboard";

  const links: NavLink[] = [
    { label: "Home", href: "/", icon: "sparkle", match: ["/", "/home"] },
    { label: "Browse services", href: "/search", icon: "search", match: ["/search", "/service"] },
  ];

  if (isLoggedIn) {
    links.push({ label: "Messages", href: "/chat", icon: "chat", match: ["/chat"] });
  }

  if (isLoggedIn && isProvider) {
    links.push(
      { label: "Dashboard", href: "/provider-home", icon: "grid", match: ["/provider-home"] },
      { label: "My services", href: "/provider-services", icon: "sparkle", match: ["/provider-services"] },
      { label: "Bookings", href: "/provider-bookings", icon: "calendar", match: ["/provider-bookings"] }
    );
  }

  if (isLoggedIn && !isProvider) {
    links.push({ label: "My account", href: "/dashboard", icon: "user", match: ["/dashboard"] });
  }

  const isActive = (link: NavLink) =>
    link.match.some((m) =>
      m === "/" ? pathname === "/" || pathname === "/home" : pathname.startsWith(m)
    );

  const renderLink = (link: NavLink, onNavigate?: () => void) => (
    <Pressable
      key={link.href}
      accessibilityRole="link"
      accessibilityState={{ selected: isActive(link) }}
      accessibilityLabel={link.label}
      onPress={() => {
        onNavigate?.();
        router.push(link.href as never);
      }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.link,
        hovered ? styles.linkHover : null,
        isActive(link) ? styles.linkActive : null,
        pressed ? styles.linkPressed : null,
      ]}
    >
      <Text style={[styles.linkText, isActive(link) ? styles.linkTextActive : null]}>
        {link.label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={[styles.bar, isMobile ? styles.barMobile : null]}>
        {/* Logo */}
        <Pressable
          onPress={() => router.push("/")}
          accessibilityRole="link"
          accessibilityLabel="Service Marketplace home"
          style={({ pressed }: { pressed: boolean }) => [styles.logoWrap, pressed && styles.linkPressed]}
        >
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>S</Text>
          </View>
          <View style={styles.logoTextWrap}>
            <Text style={styles.logoText} numberOfLines={1}>
              Service Marketplace
            </Text>
            {!isMobile ? (
              <Text style={styles.logoTagline} numberOfLines={1}>
                Trusted local professionals
              </Text>
            ) : null}
          </View>
        </Pressable>

        {/* Desktop navigation */}
        {isDesktop ? (
          <View style={styles.links}>{links.map((link) => renderLink(link))}</View>
        ) : (
          <View style={styles.spacer} />
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isMobile && isLoggedIn ? (
            <Pressable
              onPress={() => router.push(accountHref as never)}
              accessibilityRole="button"
              accessibilityLabel="Account"
              style={styles.avatarBtn}
            >
              <Avatar uri={avatarUri ? resolveMediaUrl(avatarUri) : undefined} name={username} size={32} />
            </Pressable>
          ) : null}

          {isMobile ? (
            <Pressable
              onPress={() => setMenuOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={menuOpen ? "Close menu" : "Open menu"}
              accessibilityState={{ expanded: menuOpen }}
              style={({ pressed }: { pressed: boolean }) => [styles.menuBtn, pressed && styles.linkPressed]}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={18} color={colors.text} />
            </Pressable>
          ) : (
            <>
              {isLoggedIn ? (
                <>
                  <Button
                    label="Account"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push("/dashboard")}
                  />
                  {isProvider ? (
                    <Button
                      label="Dashboard"
                      variant="secondary"
                      size="sm"
                      icon="grid"
                      onPress={() => router.push("/provider-home")}
                    />
                  ) : null}

                  <Pressable
                    onPress={() => router.push(accountHref as never)}
                    accessibilityRole="button"
                    accessibilityLabel="Your account"
                    style={({ pressed }: { pressed: boolean }) => [styles.avatarBtn, pressed && styles.linkPressed]}
                  >
                    <Avatar
                      uri={avatarUri ? resolveMediaUrl(avatarUri) : undefined}
                      name={username}
                      size={36}
                    />
                  </Pressable>

                  <Button label="Log out" variant="outline" size="sm" onPress={handleLogout} />
                </>
              ) : (
                <>
                  <Button
                    label="Become an Expert"
                    variant="outline"
                    size="sm"
                    icon="sparkle"
                    onPress={goExpert}
                  />
                  <Button label="Sign In" size="sm" onPress={() => router.push("/login")} />
                </>
              )}
            </>
          )}
        </View>
      </View>

      {/* Mobile menu */}
      {isMobile && menuOpen ? (
        <View style={styles.mobileMenu}>
          {links.map((link) => (
            <Pressable
              key={link.href}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => {
                setMenuOpen(false);
                router.push(link.href as never);
              }}
              style={({ pressed }: { pressed: boolean }) => [
                styles.mobileLink,
                isActive(link) ? styles.mobileLinkActive : null,
                pressed ? styles.linkPressed : null,
              ]}
            >
              <Icon
                name={link.icon}
                size={16}
                color={isActive(link) ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.mobileLinkText, isActive(link) ? styles.mobileLinkTextActive : null]}
              >
                {link.label}
              </Text>
              <Icon name="chevron-right" size={13} color={colors.textSubtle} />
            </Pressable>
          ))}

          <View style={styles.mobileActions}>
            {isLoggedIn ? (
              <>
                {isProvider ? (
                  <Badge label="Provider account" tone="primary" icon="shield" />
                ) : (
                  <Badge label="Customer account" tone="primary" icon="user" />
                )}
                <Button label="Log out" variant="outline" size="md" fullWidth onPress={handleLogout} />
              </>
            ) : (
              <>
                <Button
                  label="Become an Expert"
                  variant="outline"
                  size="md"
                  fullWidth
                  icon="sparkle"
                  onPress={() => {
                    setMenuOpen(false);
                    goExpert();
                  }}
                />
                <Button
                  label="Sign In"
                  size="md"
                  fullWidth
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/login");
                  }}
                />
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 40,
    // Sticky header on web; native ignores unsupported values gracefully.
    position: "sticky" as never,
    top: 0,
    ...shadows.xs,
  },
  bar: {
    minHeight: layout.navbarHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.maxContentWidth + 64,
  },
  barMobile: { paddingHorizontal: spacing.lg, minHeight: 60 },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, flexShrink: 1 },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.primary,
  },
  logoLetter: { color: colors.textInverse, fontWeight: weight.extrabold, fontSize: 19 },
  logoTextWrap: { flexShrink: 1 },
  logoText: { fontSize: 15.5, fontWeight: weight.extrabold, color: colors.text, letterSpacing: -0.2 },
  logoTagline: { fontSize: 11, color: colors.textSubtle, fontWeight: weight.medium },

  links: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  spacer: { flex: 1 },
  link: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  linkHover: { backgroundColor: colors.surfaceAlt },
  linkActive: { backgroundColor: colors.primarySoft },
  linkPressed: { opacity: 0.75 },
  linkText: { fontSize: 14, fontWeight: weight.semibold, color: colors.textMuted },
  linkTextActive: { color: colors.primaryDark },

  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatarBtn: { borderRadius: radius.pill },

  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },

  mobileMenu: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  mobileLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  mobileLinkActive: { backgroundColor: colors.primarySoft },
  mobileLinkText: { flex: 1, fontSize: 15, fontWeight: weight.semibold, color: colors.text },
  mobileLinkTextActive: { color: colors.primaryDark },
  mobileActions: { gap: spacing.sm, marginTop: spacing.md, alignItems: "stretch" },
});
