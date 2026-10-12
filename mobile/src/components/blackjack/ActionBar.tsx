import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/theme";
import { Button } from "@/components/ui";
import type { BlackjackActionName } from "@/services/api";

interface ActionBarProps {
  legal: BlackjackActionName[];
  enabled: boolean;
  extraCost: number;
  balance: number;
  onAction: (a: BlackjackActionName) => void;
}

const SLOTS: { action: BlackjackActionName; label: string; variant: "secondary" | "primary" | "felt" }[] = [
  { action: "hit", label: "Hit", variant: "secondary" },
  { action: "stand", label: "Stand", variant: "primary" },
  { action: "double", label: "Double", variant: "felt" },
  { action: "split", label: "Split", variant: "felt" },
];

// Four fixed slots — buttons never move or disappear, illegal ones are disabled.
export function ActionBar({ legal, enabled, extraCost, balance, onAction }: ActionBarProps) {
  const affordable = balance >= extraCost;
  return (
    <View style={styles.row}>
      {SLOTS.map(({ action, label, variant }) => {
        const costs = action === "double" || action === "split";
        const ok = enabled && legal.includes(action) && (!costs || affordable);
        return (
          <View key={action} style={styles.slot}>
            <Button
              label={label}
              variant={variant}
              size="md"
              fullWidth
              disabled={!ok}
              haptic={costs ? "medium" : "light"}
              sublabel={costs ? `+${extraCost}` : undefined}
              onPress={() => onAction(action)}
              testID={`bj-${action}`}
              accessibilityLabel={costs ? `${label}, adds ${extraCost} coins` : label}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  slot: { flex: 1 },
});
