import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, spacing } from "@/theme";
import { AppText } from "./AppText";

export function ListSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? (
        <AppText variant="overline" style={styles.sectionTitle}>
          {title}
        </AppText>
      ) : null}
      <View style={styles.group}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.divider} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  detail?: string;
  onPress?: () => void;
  chevron?: boolean;
  tone?: "default" | "danger";
  right?: React.ReactNode;
  testID?: string;
}

export function ListRow({ icon, label, value, detail, onPress, chevron, tone = "default", right, testID }: ListRowProps) {
  const color = tone === "danger" ? palette.danger : palette.text;
  const inner = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconWrap, tone === "danger" && styles.iconDanger]}>
          <Ionicons name={icon} size={17} color={tone === "danger" ? palette.danger : palette.gold} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={{ color }}>
          {label}
        </AppText>
        {detail ? <AppText variant="caption">{detail}</AppText> : null}
      </View>
      {value ? (
        <AppText variant="bodySmall" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {right}
      {(chevron ?? !!onPress) && <Ionicons name="chevron-forward" size={16} color={palette.textFaint} />}
    </View>
  );
  if (!onPress) return <View testID={testID}>{inner}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { marginLeft: spacing.xs },
  group: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.hairlineStrong, marginLeft: 56 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.s12, paddingHorizontal: spacing.md, minHeight: 54, paddingVertical: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(233,196,106,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconDanger: { backgroundColor: "rgba(229,72,77,0.12)" },
  flex: { flex: 1 },
  value: { maxWidth: 150 },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
});
