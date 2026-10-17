import React from "react";
import { PlayingCard } from "@/components/ui";
import { spokenCard } from "@/components/videopoker/pokerData";

interface CardProps {
  cardIndex: number;
  held: boolean;
  onToggleHold: () => void;
  disabled?: boolean;
  dealIndex?: number;
  testID?: string;
  faceDown?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  width?: number;
  flipDelay?: number;
}

// Compatibility wrapper: older call sites use Card; the art lives in ui/PlayingCard.
export function Card({
  cardIndex,
  held,
  onToggleHold,
  disabled = false,
  dealIndex,
  testID,
  faceDown,
  dimmed,
  highlighted,
  width,
  flipDelay,
}: CardProps) {
  const label = faceDown ? "Face-down card" : `${spokenCard(cardIndex)}${held ? ", held" : ""}`;
  return (
    <PlayingCard
      cardIndex={cardIndex}
      held={held}
      onPress={() => {
        if (!disabled) onToggleHold();
      }}
      disabled={disabled}
      dealIndex={dealIndex}
      testID={testID}
      faceDown={faceDown}
      dimmed={dimmed}
      highlighted={highlighted}
      width={width}
      flipDelay={flipDelay}
      accessibilityLabel={label}
    />
  );
}
