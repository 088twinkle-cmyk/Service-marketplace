/**
 * Web shim for `expo-image`.
 *
 * Renders a plain <img> through react-native-web's Image so the component
 * accepts the same props (`source={{ uri }}`, `style`, `contentFit`).
 */
import React from "react";
import { Image as RNImage, type ImageStyle, type StyleProp } from "react-native";

export type ImageSource = { uri?: string } | string;

type Props = {
  source?: ImageSource;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  placeholder?: string | ImageSource;
  transition?: number;
  onLoad?: () => void;
  onError?: () => void;
  accessibilityLabel?: string;
  [key: string]: unknown;
};

function resolveUri(source?: ImageSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === "string") return source;
  return source.uri;
}

export function Image({
  source,
  style,
  contentFit = "cover",
  onLoad,
  onError,
  accessibilityLabel,
  placeholder: _placeholder,
  transition: _transition,
  ...rest
}: Props) {
  const uri = resolveUri(source);

  if (!uri) {
    // expo-image renders nothing for an empty source; keep that behaviour.
    return null;
  }

  return (
    <RNImage
      source={{ uri }}
      style={style}
      resizeMode={contentFit === "scale-down" ? "contain" : (contentFit as never)}
      onLoad={onLoad}
      onError={onError}
      accessibilityLabel={accessibilityLabel}
      {...(rest as object)}
    />
  );
}

export default { Image };
