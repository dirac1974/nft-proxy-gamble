import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { fonts, palette, spacing } from "@/theme";
import { AppText } from "./AppText";
import { BalancePill } from "./BalancePill";
import { haptic } from "./haptics";

interface GameHeaderProps {
  title: string;
  subtitle?: string;
  balance: number;
  onAddCoins?: () => void;
  onInfo?: () => void;
  onBack?: () => void;
  right?: React.ReactNode;
}

// Top bar for game screens: back · title · balance · rules.
export function GameHeader({ title, subtitle, balance, onAddCoins, onInfo, onBack, right }: GameHeaderProps) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => {
          haptic("light");
          if (onBack) onBack();
          else if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to lobby"
        hitSlop={8}
        testID="game-back"
      >
        <Ionicons name="chevron-back" size={22} color={palette.text} />
      </Pressable>
      <View style={styles.titleWrap}>
        <AppText style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      <BalancePill amount={balance} onAdd={onAddCoins} />
      {onInfo && (
        <Pressable
          onPress={() => {
            haptic("light");
            onInfo();
          }}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Rules and payouts"
          hitSlop={8}
          testID="game-info"
        >
          <Ionicons name="information-circle-outline" size={22} color={palette.gold} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 18, color: palette.text, letterSpacing: 0.5 },
  subtitle: { color: palette.goldLight, opacity: 0.8 },
});
