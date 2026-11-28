import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius } from "@/theme";
import { formatCoins } from "@/config/brand";
import { AppText } from "./AppText";
import { CoinIcon } from "./CoinIcon";
import { haptic } from "./haptics";

interface BalancePillProps {
  amount: number;
  onAdd?: () => void;
  testID?: string;
  /** Smaller pill for crowded game headers: coin + number, tighter font. */
  compact?: boolean;
}

// Balance that rolls to its new value instead of jumping.
export function BalancePill({ amount, onAdd, testID = "balance-pill", compact = false }: BalancePillProps) {
  const shown = useRollingNumber(amount);
  return (
    <View
      style={[styles.pill, compact && styles.pillCompact]}
      testID={testID}
      accessibilityLabel={`Balance ${formatCoins(amount)} coins`}
    >
      <CoinIcon size={compact ? 15 : 18} />
      <AppText
        variant="money"
        style={[styles.amount, compact && styles.amountCompact]}
        numberOfLines={1}
        testID="balance-amount"
      >
        {formatCoins(shown)}
      </AppText>
      {onAdd && (
        <Pressable
          onPress={() => {
            haptic("light");
            onAdd();
          }}
          style={styles.add}
          accessibilityRole="button"
          accessibilityLabel="Buy coins"
          // 32px button + 10 slop on every side = 52dp effective target (>= 48dp).
          hitSlop={10}
          testID="buy-coins-button"
        >
          <Ionicons name="add" size={compact ? 16 : 18} color={palette.goldInk} />
        </Pressable>
      )}
    </View>
  );
}

export function useRollingNumber(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const valueRef = useRef(target);
  valueRef.current = value;

  useEffect(() => {
    fromRef.current = valueRef.current;
    if (fromRef.current === target) return;
    const start = Date.now();
    let frame: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.35)",
    borderRadius: radius.pill,
    paddingLeft: 8,
    paddingRight: 3,
    height: 38,
  },
  pillCompact: { height: 36, gap: 4, paddingLeft: 6, paddingRight: 2 },
  amount: { fontSize: 15, marginRight: 4, minWidth: 24 },
  amountCompact: { fontSize: 13, marginRight: 2, minWidth: 0 },
  add: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.gold,
    alignItems: "center",
    justifyContent: "center",
  },
});
