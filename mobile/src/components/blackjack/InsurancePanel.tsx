import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { radius, spacing } from "@/theme";
import { AppText, Button } from "@/components/ui";

interface InsurancePanelProps {
  cost: number;
  balance: number;
  busy: boolean;
  reduceMotion: boolean;
  onDecide: (take: boolean) => void;
}

// Inline offer shown when the dealer's upcard is an ace.
export function InsurancePanel({ cost, balance, busy, reduceMotion, onDecide }: InsurancePanelProps) {
  const canTake = cost >= 1 && balance >= cost;
  const note =
    cost < 1 ? "This bet is too small to insure." : balance < cost ? "Not enough coins to insure this hand." : null;
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(220)}
      style={styles.panel}
      testID="bj-insurance-panel"
    >
      <View style={styles.copy}>
        <AppText variant="overline" tone="gold">
          Insurance
        </AppText>
        <AppText variant="bodyStrong">Dealer shows an ace.</AppText>
        <AppText variant="bodySmall">
          {note ?? `Insure for ${cost} coins. Pays 2 to 1 if the dealer has blackjack.`}
        </AppText>
      </View>
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button
            label="No thanks"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => onDecide(false)}
            testID="bj-insurance-no"
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Insure"
            sublabel={cost >= 1 ? `+${cost}` : undefined}
            variant="primary"
            fullWidth
            disabled={busy || !canTake}
            onPress={() => onDecide(true)}
            testID="bj-insurance-yes"
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(7,9,15,0.82)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.45)",
    padding: spacing.md,
    gap: spacing.s12,
  },
  copy: { gap: spacing.xs },
  buttons: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
});
