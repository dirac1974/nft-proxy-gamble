import React from "react";
import { StyleSheet, View } from "react-native";
import { PlayingCard, CARD_RATIO } from "@/components/ui";
import { faceOf } from "./bjLogic";

export interface FanCard {
  key: string;
  card?: number;
  faceDown?: boolean;
}

interface CardFanProps {
  cards: FanCard[];
  width: number;
  maxWidth: number;
  reduceMotion: boolean;
  dimmed?: boolean;
  testID?: string;
}

// Overlapping hand that keeps every corner index visible and never overflows.
export function CardFan({ cards, width, maxWidth, reduceMotion, dimmed = false, testID }: CardFanProps) {
  const n = cards.length;
  const ideal = width * 0.46;
  const offset = n > 1 ? Math.max(width * 0.3, Math.min(ideal, (maxWidth - width) / (n - 1))) : 0;
  const total = n > 0 ? width + offset * (n - 1) : width;
  return (
    <View style={{ width: total, height: width * CARD_RATIO }} testID={testID}>
      {cards.map((c, i) => (
        <View key={c.key} style={[styles.slot, { left: i * offset, zIndex: i }]}>
          <PlayingCard
            cardIndex={c.card === undefined ? undefined : faceOf(c.card)}
            faceDown={c.faceDown}
            width={width}
            dealIndex={reduceMotion ? undefined : 0}
            dimmed={dimmed}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", top: 0 },
});
