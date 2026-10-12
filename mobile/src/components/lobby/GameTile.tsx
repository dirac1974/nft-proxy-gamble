import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Badge, haptic } from "@/components/ui";
import { gradients, motion, palette, radius, shadows, spacing } from "@/theme";
import { GameArt } from "./GameArt";
import type { GameInfo } from "./games";

const ART = 112;

interface GameTileProps {
  game: GameInfo;
  onPress: () => void;
}

export function GameTile({ game, onPress }: GameTileProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.wrap, anim]}>
      <Pressable
        testID={`tile-${game.id}`}
        onPress={() => {
          haptic("light");
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.97, motion.springSnappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.springSnappy);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${game.title}. ${game.description} ${game.betRange}.`}
        style={styles.tile}
      >
        <LinearGradient colors={gradients.felt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
          <GameArt game={game.id} size={ART} />
        </LinearGradient>
        <View style={styles.info}>
          <AppText variant="heading3">{game.title}</AppText>
          <AppText variant="bodySmall" numberOfLines={2}>
            {game.description}
          </AppText>
          <View style={styles.badges}>
            <Badge label={game.rtp} tone="gold" />
            <Badge label={game.betRange} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.textFaint} style={styles.chevron} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...shadows.e1 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: "hidden",
    minHeight: ART,
  },
  art: { width: ART, alignSelf: "stretch", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  info: { flex: 1, paddingVertical: spacing.s12, paddingLeft: spacing.md, gap: spacing.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chevron: { marginHorizontal: spacing.s12 },
});
