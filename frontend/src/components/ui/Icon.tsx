/**
 * Icon.
 *
 * The project intentionally ships no icon font (it must run on native, web and
 * inside the Vite bundle without extra assets), so icons are composed from
 * plain views — crisp at any size, monochrome, and tintable through `color`.
 */
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { colors, weight } from "../../theme/tokens";

export type IconName =
  | "search"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "check"
  | "close"
  | "star"
  | "pin"
  | "calendar"
  | "chat"
  | "shield"
  | "clock"
  | "menu"
  | "plus"
  | "sparkle"
  | "user"
  | "arrow-right"
  | "wallet"
  | "grid"
  | "alert"
  | "info"
  | "upload";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Rendered inside a tinted circle. */
  badge?: boolean;
  style?: ViewStyle;
};

const STROKE = 0.11; // stroke width relative to icon size

export default function Icon({ name, size = 20, color = colors.text, badge, style }: Props) {
  const stroke = Math.max(1.6, size * STROKE);
  const content = renderIcon(name, size, color, stroke);

  if (badge) {
    return (
      <View
        style={[
          styles.badge,
          {
            width: size * 2.2,
            height: size * 2.2,
            borderRadius: size * 1.1,
            backgroundColor: `${color}14`,
          },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>{content}</View>
  );
}

function renderIcon(name: IconName, size: number, color: string, stroke: number) {
  switch (name) {
    case "search":
      return (
        <>
          <View
            style={{
              width: size * 0.68,
              height: size * 0.68,
              borderRadius: size * 0.34,
              borderWidth: stroke,
              borderColor: color,
              marginTop: -size * 0.08,
              marginLeft: -size * 0.08,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: size * 0.06,
              bottom: size * 0.12,
              width: size * 0.34,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </>
      );

    case "chevron-left":
    case "chevron-right":
    case "chevron-down":
      return (
        <View
          style={{
            width: size * 0.42,
            height: size * 0.42,
            borderColor: color,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
            transform: [
              {
                rotate:
                  name === "chevron-down" ? "45deg" : name === "chevron-left" ? "135deg" : "-45deg",
              },
            ],
            marginTop: name === "chevron-down" ? 0 : -size * 0.08,
            marginLeft: name === "chevron-left" ? size * 0.1 : name === "chevron-right" ? -size * 0.1 : 0,
          }}
        />
      );

    case "check":
      return (
        <View
          style={{
            width: size * 0.52,
            height: size * 0.3,
            borderColor: color,
            borderLeftWidth: stroke,
            borderBottomWidth: stroke,
            transform: [{ rotate: "-45deg" }],
            marginTop: -size * 0.1,
          }}
        />
      );

    case "close":
      return (
        <>
          <View style={bar(size * 0.8, stroke, color, "45deg")} />
          <View style={bar(size * 0.8, stroke, color, "-45deg")} />
        </>
      );

    case "menu":
      return (
        <View style={{ gap: size * 0.18 }}>
          {[0.9, 0.66, 0.9].map((w, i) => (
            <View key={i} style={bar(size * w, stroke, color, "0deg")} />
          ))}
        </View>
      );

    case "plus":
      return (
        <>
          <View style={bar(size * 0.7, stroke, color, "0deg")} />
          <View style={bar(size * 0.7, stroke, color, "90deg")} />
        </>
      );

    case "star":
      return (
        <Text
          style={{
            color,
            fontSize: size * 0.95,
            lineHeight: size,
            fontWeight: weight.bold,
            marginTop: -size * 0.04,
          }}
        >
          ★
        </Text>
      );

    case "sparkle":
      return (
        <Text style={{ color, fontSize: size * 0.9, lineHeight: size, fontWeight: weight.bold }}>
          ✦
        </Text>
      );

    case "pin":
      return (
        <>
          <View
            style={{
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: size * 0.31,
              borderWidth: stroke,
              borderColor: color,
              marginTop: -size * 0.16,
            }}
          />
          <View style={{ position: "absolute", bottom: size * 0.02, alignItems: "center" }}>
            <View
              style={{
                width: 0,
                height: 0,
                borderTopWidth: size * 0.26,
                borderTopColor: color,
                borderLeftWidth: size * 0.18,
                borderRightWidth: size * 0.18,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
              }}
            />
          </View>
        </>
      );

    case "calendar":
      return (
        <>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.78,
              borderRadius: size * 0.16,
              borderWidth: stroke,
              borderColor: color,
              marginTop: size * 0.08,
              overflow: "hidden",
            }}
          >
            <View style={{ height: stroke * 2.4, backgroundColor: color, opacity: 0.9 }} />
          </View>
          <View style={{ position: "absolute", top: 0, flexDirection: "row", gap: size * 0.3 }}>
            <View style={bar(stroke * 2.2, stroke, color, "0deg")} />
            <View style={bar(stroke * 2.2, stroke, color, "0deg")} />
          </View>
        </>
      );

    case "clock":
      return (
        <>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.86,
              borderRadius: size * 0.43,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: stroke,
              height: size * 0.24,
              backgroundColor: color,
              borderRadius: stroke,
              marginTop: -size * 0.12,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.2,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
              marginLeft: size * 0.1,
            }}
          />
        </>
      );

    case "chat":
      return (
        <>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.72,
              borderRadius: size * 0.22,
              borderWidth: stroke,
              borderColor: color,
              marginTop: -size * 0.08,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: size * 0.04,
              left: size * 0.22,
              width: size * 0.22,
              height: size * 0.22,
              borderLeftWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: color,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        </>
      );

    case "shield":
      return (
        <>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.86,
              borderTopLeftRadius: size * 0.4,
              borderTopRightRadius: size * 0.4,
              borderBottomLeftRadius: size * 0.18,
              borderBottomRightRadius: size * 0.18,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.36,
              height: size * 0.2,
              borderLeftWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: color,
              transform: [{ rotate: "-45deg" }],
              marginTop: -size * 0.06,
            }}
          />
        </>
      );

    case "user":
      return (
        <>
          <View
            style={{
              width: size * 0.42,
              height: size * 0.42,
              borderRadius: size * 0.21,
              borderWidth: stroke,
              borderColor: color,
              marginTop: -size * 0.2,
            }}
          />
          <View
            style={{
              width: size * 0.82,
              height: size * 0.4,
              borderTopLeftRadius: size * 0.41,
              borderTopRightRadius: size * 0.41,
              borderWidth: stroke,
              borderBottomWidth: 0,
              borderColor: color,
            }}
          />
        </>
      );

    case "wallet":
      return (
        <>
          <View
            style={{
              width: size * 0.9,
              height: size * 0.66,
              borderRadius: size * 0.16,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: size * 0.02,
              width: size * 0.3,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </>
      );

    case "grid":
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", width: size * 0.86, gap: size * 0.14 }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: size * 0.36,
                height: size * 0.36,
                borderRadius: size * 0.08,
                borderWidth: stroke * 0.8,
                borderColor: color,
              }}
            />
          ))}
        </View>
      );

    case "alert":
      return (
        <>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.88,
              borderRadius: size * 0.44,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <Text
            style={{
              position: "absolute",
              color,
              fontSize: size * 0.55,
              fontWeight: weight.bold,
              lineHeight: size * 0.6,
              marginTop: -size * 0.02,
            }}
          >
            !
          </Text>
        </>
      );

    case "info":
      return (
        <>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.88,
              borderRadius: size * 0.44,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <Text
            style={{
              position: "absolute",
              color,
              fontSize: size * 0.55,
              fontWeight: weight.bold,
              lineHeight: size * 0.62,
            }}
          >
            i
          </Text>
        </>
      );

    case "upload":
      return (
        <>
          <View style={bar(stroke, size * 0.42, color, "0deg")} />
          <View
            style={{
              width: size * 0.36,
              height: size * 0.36,
              borderLeftWidth: stroke,
              borderTopWidth: stroke,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
              marginTop: -size * 0.06,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: size * 0.12,
              width: size * 0.72,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </>
      );

    case "arrow-right":
    default:
      return (
        <>
          <View style={bar(size * 0.7, stroke, color, "0deg")} />
          <View
            style={{
              position: "absolute",
              right: size * 0.14,
              width: size * 0.28,
              height: size * 0.28,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </>
      );
  }
}

function bar(length: number, thickness: number, color: string, rotate: string): ViewStyle {
  return {
    width: length,
    height: thickness,
    borderRadius: thickness,
    backgroundColor: color,
    transform: [{ rotate }],
  };
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  badge: { alignItems: "center", justifyContent: "center" },
});
