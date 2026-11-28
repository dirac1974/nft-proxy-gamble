import React from "react";
import { View } from "react-native";
import type { CardStyle } from "./kenoModel";

interface CardGlyphProps {
  glyph: CardStyle["glyph"];
  color: string;
  size: number;
  outline?: string;
}

// Shape cue per card (● ■ ▲ ◆) drawn with plain Views — cheap enough for 80 cells.
export function CardGlyph({ glyph, color, size, outline }: CardGlyphProps) {
  const border = outline ? { borderWidth: 1, borderColor: outline } : null;
  switch (glyph) {
    case "circle":
      return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, border]} />;
    case "square":
      return <View style={[{ width: size, height: size, borderRadius: 1, backgroundColor: color }, border]} />;
    case "diamond": {
      const s = size * 0.75;
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <View style={[{ width: s, height: s, backgroundColor: color, transform: [{ rotate: "45deg" }] }, border]} />
        </View>
      );
    }
    case "triangle": {
      const tri = (c: string, w: number, bottom: number) => (
        <View
          style={{
            position: "absolute",
            bottom,
            width: 0,
            height: 0,
            borderLeftWidth: w / 2,
            borderRightWidth: w / 2,
            borderBottomWidth: w * 0.9,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: c,
          }}
        />
      );
      return (
        <View style={{ width: size + 2, height: size, alignItems: "center" }}>
          {outline ? tri(outline, size + 2, 0) : null}
          {tri(color, outline ? size - 1 : size + 1, outline ? 0.8 : 0)}
        </View>
      );
    }
  }
}
