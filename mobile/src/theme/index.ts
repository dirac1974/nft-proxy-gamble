// "Midnight felt + gold" design system. All screens pull from these tokens —
// never hard-code hex values in components.

export const palette = {
  bg: "#07090F",
  bgRaised: "#0E1320",
  surface: "#151B2C",
  surfaceHi: "#1E2639",
  hairline: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.14)",

  gold: "#E9C46A",
  goldLight: "#F8E3A3",
  goldDeep: "#A97C2F",
  goldInk: "#2A1A00",

  feltLight: "#14634A",
  felt: "#0F4D3A",
  feltDark: "#08291F",
  feltLine: "rgba(248,227,163,0.35)",

  ruby: "#C2283B",
  rubyLight: "#E0475A",
  rubyDeep: "#8E1A29",
  emerald: "#2BD48F",
  danger: "#E5484D",
  warn: "#F5A524",

  text: "#F5F1E8",
  textDim: "#A8B0C2",
  textFaint: "#6B7387",

  ivory: "#FBF8F1",
  ink: "#1A1A1A",
  cardBack: "#14203A",
  black: "#000000",
} as const;

export const colors = {
  ...palette,

  // Legacy aliases — retuned to the new palette so un-migrated code stays on-brand.
  background: palette.bg,
  surfaceElevated: palette.surfaceHi,
  border: palette.hairlineStrong,
  purple: palette.surfaceHi,
  purpleLight: palette.gold,
  neonGreen: palette.gold,
  neonGreenDim: palette.goldDeep,
  textPrimary: palette.text,
  textSecondary: palette.textDim,
  textMuted: palette.textFaint,
  win: palette.emerald,
  lose: palette.danger,
  warning: palette.warn,
  hearts: palette.ruby,
  diamonds: palette.ruby,
  clubs: palette.ink,
  spades: palette.ink,
  cardBackground: palette.ivory,
  cardBorder: "rgba(0,0,0,0.12)",
  cardHeld: palette.ivory,
  cardHeldBorder: palette.gold,
} as const;

export const gradients = {
  screen: [palette.bgRaised, palette.bg] as const,
  felt: [palette.feltLight, palette.felt, palette.feltDark] as const,
  gold: [palette.goldLight, palette.gold, palette.goldDeep] as const,
  ruby: [palette.rubyLight, palette.ruby, palette.rubyDeep] as const,
  surface: [palette.surfaceHi, palette.surface] as const,
  scrim: ["rgba(7,9,15,0)", "rgba(7,9,15,0.92)"] as const,
};

export const fonts = {
  display: "Cinzel_700Bold",
  displayBlack: "Cinzel_900Black",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  heavy: "Inter_800ExtraBold",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  s12: 12,
  s20: 20,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  full: 9999,
  pill: 9999,
} as const;

export const typography = {
  display: { fontFamily: fonts.displayBlack, fontSize: 40, lineHeight: 48, color: palette.gold, letterSpacing: 1 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: palette.text, letterSpacing: 0.5 },
  heading1: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 30, color: palette.text },
  heading2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: palette.text },
  heading3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: palette.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: palette.text },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: palette.textDim },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, color: palette.textFaint },
  overline: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: palette.textDim, letterSpacing: 1.6, textTransform: "uppercase" as const },
  button: { fontFamily: fonts.heavy, fontSize: 15, letterSpacing: 1.2, textTransform: "uppercase" as const },
  money: { fontFamily: fonts.heavy, fontSize: 17, color: palette.text, fontVariant: ["tabular-nums" as const] },
  mono: { fontFamily: "monospace" as const, fontSize: 12, color: palette.textDim },
  neon: { fontFamily: fonts.bold, fontSize: 15, color: palette.gold },
} as const;

export const shadows = {
  e1: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  e2: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 8 },
  e3: { shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.55, shadowRadius: 32, elevation: 16 },
  goldGlow: { shadowColor: palette.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
  winGlow: { shadowColor: palette.emerald, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 12 },
  card: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  // Legacy aliases
  neonGreen: { shadowColor: palette.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  purple: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 8 },
} as const;

// Timings from the game-feel spec (ms).
export const motion = {
  fast: 120,
  base: 200,
  slow: 350,
  dealTravel: 180,
  dealStagger: 70,
  flip: 220,
  flipStagger: 80,
  drawStagger: 90,
  holdLift: 120,
  bjCardInterval: 250,
  bjDealerDraw: 600,
  bjRevealDelay: 400,
  rouletteSpin: 3500,
  countSmall: 400,
  countMedium: 900,
  countBig: 2000,
  springSnappy: { damping: 15, stiffness: 260, mass: 0.7 },
  springSoft: { damping: 18, stiffness: 140 },
} as const;
