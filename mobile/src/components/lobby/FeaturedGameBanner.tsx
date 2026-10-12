import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText, Button } from "@/components/ui";
import { gradients, palette, radius, shadows, spacing } from "@/theme";
import { GameArt } from "./GameArt";
import type { GameInfo } from "./games";

const ART_SIZE = 128;

interface FeaturedGameBannerProps {
  game: GameInfo;
  onPress: () => void;
}

export function FeaturedGameBanner({ game, onPress }: FeaturedGameBannerProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${game.title}. ${game.description}`}
      testID={`featured-${game.id}`}
      style={styles.shadow}
    >
      <LinearGradient colors={gradients.felt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <LinearGradient
          colors={["rgba(233,196,106,0.18)", "rgba(233,196,106,0)"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.feltLine} pointerEvents="none" />
        <View style={styles.copy}>
          <AppText variant="overline" tone="gold">
            Featured
          </AppText>
          <AppText variant="title" style={styles.title}>
            {game.title}
          </AppText>
          <AppText variant="bodySmall" style={styles.desc}>
            {game.description}
          </AppText>
          <Button label="Play now" size="sm" onPress={onPress} style={styles.cta} />
        </View>
        <View style={styles.art}>
          <GameArt game={game.id} size={ART_SIZE} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { ...shadows.e2, borderRadius: radius.xl },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.35)",
    overflow: "hidden",
    minHeight: 180,
    paddingLeft: spacing.lg,
  },
  feltLine: {
    ...StyleSheet.absoluteFillObject,
    margin: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.feltLine,
    opacity: 0.5,
  },
  copy: { flex: 1, gap: spacing.xs, paddingVertical: spacing.lg },
  title: { color: palette.text },
  desc: { color: "rgba(245,241,232,0.8)" },
  cta: { alignSelf: "flex-start", marginTop: spacing.sm },
  art: { width: ART_SIZE + spacing.md * 2, height: 180, alignItems: "center", justifyContent: "center" },
});
