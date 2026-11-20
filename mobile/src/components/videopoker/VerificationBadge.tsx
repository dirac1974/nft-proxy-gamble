import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, spacing } from "@/theme";
import { AppText } from "@/components/ui";

interface VerificationBadgeProps {
  passed: boolean;
  testID?: string;
}

export function VerificationBadge({ passed, testID = "verification-badge" }: VerificationBadgeProps) {
  const color = passed ? palette.emerald : palette.danger;
  return (
    <View
      style={[styles.wrap, passed ? styles.pass : styles.fail]}
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={passed ? "Verified fair" : "Verification failed"}
    >
      <View style={[styles.ring, { borderColor: color }]}>
        <Ionicons name={passed ? "shield-checkmark" : "shield-outline"} size={36} color={color} />
      </View>
      <AppText style={[styles.title, { color }]}>{passed ? "Verified fair" : "Verification failed"}</AppText>
      <AppText variant="bodySmall" align="center">
        {passed ? "This hand matches the deck the server committed to." : "This hand does not match the committed deck."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pass: { backgroundColor: "rgba(43,212,143,0.08)", borderColor: "rgba(43,212,143,0.35)" },
  fail: { backgroundColor: "rgba(229,72,77,0.08)", borderColor: "rgba(229,72,77,0.35)" },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  title: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.5 },
});
