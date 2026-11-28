import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/theme";
import { CabinetButton } from "./CabinetButton";
import { MAX_BET } from "./pokerData";

interface ControlDeckProps {
  bet: number;
  mode: "deal" | "draw";
  busy: boolean;
  betLocked: boolean;
  heldCount: number;
  onSeePays: () => void;
  onBetOne: () => void;
  onBetMax: () => void;
  onPrimary: () => void;
}

// Cabinet button deck: SEE PAYS · BET ONE · BET MAX · DEAL/DRAW.
export function ControlDeck({ bet, mode, busy, betLocked, heldCount, onSeePays, onBetOne, onBetMax, onPrimary }: ControlDeckProps) {
  const isDraw = mode === "draw";
  const coins = `${bet} credit${bet === 1 ? "" : "s"}`;
  const betDisabled = betLocked || busy;
  return (
    <View style={styles.row}>
      <CabinetButton
        label={"See\npays"}
        onPress={onSeePays}
        tone="blue"
        disabled={busy}
        style={styles.side}
        testID="see-pays"
        accessibilityLabel="See pays"
      />
      <CabinetButton
        label={"Bet\none"}
        onPress={onBetOne}
        tone="red"
        disabled={betDisabled}
        haptic="select"
        style={styles.side}
        testID="bet-one"
        accessibilityLabel={`Bet one. Current bet ${coins}`}
      />
      <CabinetButton
        label={"Bet\nmax"}
        onPress={onBetMax}
        tone="red"
        disabled={betDisabled}
        haptic="medium"
        style={styles.side}
        testID="bet-max"
        accessibilityLabel={`Bet max: bet ${MAX_BET} credits and deal`}
      />
      <CabinetButton
        label={isDraw ? "Draw" : "Deal"}
        onPress={onPrimary}
        tone="yellow"
        loading={busy}
        haptic="medium"
        fontSize={20}
        style={styles.main}
        testID={isDraw ? "draw-button" : "deal-button"}
        accessibilityLabel={isDraw ? `Draw, holding ${heldCount} cards` : `Deal, betting ${coins}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  side: { flex: 1 },
  main: { flex: 1.7 },
});
