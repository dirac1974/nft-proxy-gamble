import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { palette, typography } from "@/theme";

export type TextVariant = keyof typeof typography;
export type TextTone = "default" | "dim" | "faint" | "gold" | "win" | "danger" | "ink";

const TONES: Record<TextTone, string> = {
  default: palette.text,
  dim: palette.textDim,
  faint: palette.textFaint,
  gold: palette.gold,
  win: palette.emerald,
  danger: palette.danger,
  ink: palette.goldInk,
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle["textAlign"];
}

export function AppText({ variant = "body", tone, align, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[typography[variant] as TextStyle, tone && { color: TONES[tone] }, align && { textAlign: align }, style]}
    />
  );
}
