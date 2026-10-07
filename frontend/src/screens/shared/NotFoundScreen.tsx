import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { BACKGROUND, CARD, TEXT, TEXT_MUTED, PRIMARY, BORDER } from "../../theme/colors";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.body}>
          The page you were looking for does not exist or has moved.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Back to marketplace</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: BACKGROUND,
  },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 32,
    maxWidth: 420,
    width: "100%",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: TEXT_MUTED,
    lineHeight: 22,
    marginBottom: 20,
    textAlign: "center",
  },
  button: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
