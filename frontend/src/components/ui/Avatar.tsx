/**
 * Avatar — provider / customer image with an initials fallback and an optional
 * "verified" seal. The initials tint is derived from the name, so list rows
 * stay visually varied without inventing data.
 */
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Image } from "expo-image";

import { resolveMediaUrl } from "../../config/api";
import { colors, weight } from "../../theme/tokens";

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  verified?: boolean;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TINTS = [
  { bg: "#EEF2FF", fg: "#4338CA" },
  { bg: "#ECFDF5", fg: "#047857" },
  { bg: "#FFF7ED", fg: "#B45309" },
  { bg: "#F0F9FF", fg: "#0369A1" },
  { bg: "#FDF2F8", fg: "#A21CAF" },
  { bg: "#F5F3FF", fg: "#6D28D9" },
];

function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return TINTS[hash % TINTS.length];
}

export default function Avatar({
  uri,
  name,
  size = 44,
  verified,
  ring = true,
  style,
}: Props) {
  const tint = tintFor(String(name ?? "user"));
  // Callers may pass a raw backend URL; normalise it so avatars also load
  // behind a proxy / on another device.
  const photo = resolveMediaUrl(uri);
  const fontSize = Math.round(size * (initials(name).length > 1 ? 0.36 : 0.42));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tint.bg,
          },
          ring ? styles.ring : null,
        ]}
      >
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Text style={{ color: tint.fg, fontSize, fontWeight: weight.bold }}>
            {initials(name)}
          </Text>
        )}
      </View>

      {verified ? (
        <View
          style={[
            styles.seal,
            {
              width: size * 0.42,
              height: size * 0.42,
              borderRadius: size * 0.21,
              borderWidth: Math.max(1.5, size * 0.05),
            },
          ]}
        >
          <Text style={{ color: colors.textInverse, fontSize: size * 0.2, fontWeight: weight.bold }}>
            ✓
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ring: { borderWidth: 1, borderColor: colors.border },
  seal: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: colors.success,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
