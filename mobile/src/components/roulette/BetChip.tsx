import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChipGraphic } from "@/components/ui";
import { AppText } from "@/components/ui/AppText";
import { fonts, motion, palette } from "@/theme";
import { chipStack, formatChipLabel } from "./rouletteModel";

export type ChipState = "live" | "won" | "lost";

interface BetChipProps {
  amount: number;
  x: number;
  y: number;
  size: number;
  state: ChipState;
  profit?: number;
  reduceMotion?: boolean;
  testID?: string;
}

const STACK_STEP = 2.5;

export const BetChip = memo(function BetChip({ amount, x, y, size, state, profit, reduceMotion, testID }: BetChipProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    if (state === "lost") {
      opacity.value = withDelay(220, withTiming(0, { duration: 480 }));
      lift.value = withDelay(220, withTiming(-size * 0.9, { duration: 480 }));
      scale.value = withDelay(220, withTiming(0.7, { duration: 480 }));
    } else if (state === "won") {
      opacity.value = 1;
      lift.value = 0;
      scale.value = reduceMotion
        ? 1.08
        : withRepeat(withSequence(withTiming(1.16, { duration: 280 }), withTiming(1, { duration: 280 })), 4, false);
    } else {
      opacity.value = 1;
      lift.value = 0;
      scale.value = reduceMotion ? 1 : withSequence(withTiming(1.14, { duration: 80 }), withSpring(1, motion.springSnappy));
    }
  }, [state, amount, size, reduceMotion, scale, opacity, lift]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));

  const layers = chipStack(amount);
  const depth = Math.min(layers.length, 3) - 1;
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[styles.wrap, { left: x - size / 2, top: y - size / 2 - depth * STACK_STEP, width: size, height: size + depth * STACK_STEP }, style]}
    >
      {layers
        .slice(0, depth)
        .reverse()
        .map((v, i) => (
          <View key={i} style={[styles.layer, { top: (depth - i) * STACK_STEP }]}>
            <ChipGraphic value={v} size={size} label="" />
          </View>
        ))}
      <View style={[styles.layer, { top: 0 }, state === "won" && styles.wonRing, state === "won" && { borderRadius: size / 2 }]}>
        <ChipGraphic value={amount} size={size} label={formatChipLabel(amount)} />
      </View>
      {state === "won" && profit !== undefined && profit > 0 ? (
        <View style={[styles.tag, { bottom: size + depth * STACK_STEP + 1 }]}>
          <AppText style={styles.tagText}>+{formatChipLabel(profit)}</AppText>
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: "absolute", alignItems: "center" },
  layer: {
    position: "absolute",
    left: 0,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 3,
  },
  wonRing: {
    shadowColor: palette.gold,
    shadowOpacity: 0.95,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 1.5,
    borderColor: palette.goldLight,
  },
  tag: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "rgba(7,9,15,0.85)",
    borderWidth: 1,
    borderColor: "rgba(43,212,143,0.6)",
  },
  tagText: { fontFamily: fonts.heavy, fontSize: 10, color: palette.emerald, fontVariant: ["tabular-nums"] },
});
