import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, spacing } from "@/theme";
import { AppText } from "./AppText";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  cta?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
}

export function EmptyState({ icon, title, body, cta, testID }: EmptyStateProps) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.medallion}>
        <View style={styles.medallionInner}>
          <Ionicons name={icon} size={30} color={palette.gold} />
        </View>
      </View>
      <AppText variant="heading2" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="bodySmall" align="center" style={styles.body}>
          {body}
        </AppText>
      ) : null}
      {cta ? <Button label={cta.label} onPress={cta.onPress} testID={cta.testID} style={styles.cta} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  medallion: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  medallionInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "rgba(233,196,106,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { maxWidth: 300 },
  cta: { marginTop: spacing.md, minWidth: 200 },
});
