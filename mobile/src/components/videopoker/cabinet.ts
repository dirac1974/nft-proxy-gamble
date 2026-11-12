import type { TextStyle } from "react-native";
import { fonts } from "@/theme";

// Classic single-line cabinet palette (genre convention only; original styling).
export const cab = {
  screenTop: "#0A1A8C",
  screenBottom: "#06106A",
  panel: "#081470",
  rule: "rgba(255,225,58,0.45)",
  ruleFaint: "rgba(255,225,58,0.18)",
  yellow: "#FFE13A",
  yellowDeep: "#E0B800",
  yellowInk: "#2A1F00",
  red: "#C8102E",
  redLit: "#FF2A3D",
  amber: "#FFB000",
  amberGlow: "rgba(255,176,0,0.55)",
  white: "#FFFFFF",
  dimWhite: "rgba(255,255,255,0.7)",
  meterBg: "#04082E",
  bezel: "#020414",
} as const;

export const cabText: Record<"pay" | "banner" | "led", TextStyle> = {
  pay: { fontFamily: fonts.heavy, color: cab.yellow, fontVariant: ["tabular-nums"] },
  banner: { fontFamily: fonts.heavy, color: cab.yellow, letterSpacing: 1.5, textTransform: "uppercase" },
  led: { fontFamily: fonts.heavy, color: cab.amber, fontVariant: ["tabular-nums"] },
};

// Genre timing (ms).
export const cabTiming = {
  dealStep: 80,
  drawStep: 90,
  blink: 200,
  blinkCycles: 3,
  rackNormalMs: 1500,
  rackPremiumMs: 3000,
  rackMaxSteps: 30,
  rackPremiumSteps: 60,
} as const;
