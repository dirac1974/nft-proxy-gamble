export const colors = {
  // Primary palette
  background: "#0f001a",
  surface: "#1a0033",
  surfaceElevated: "#240047",
  border: "#3d0078",

  // Brand
  purple: "#6B21A8",
  purpleLight: "#9333EA",
  neonGreen: "#00ff9f",
  neonGreenDim: "#00cc7a",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#b39dca",
  textMuted: "#6b5a7a",

  // Semantic
  win: "#00ff9f",
  lose: "#ff4444",
  warning: "#ffbb00",

  // Suits
  hearts: "#ff4d6d",
  diamonds: "#ff4d6d",
  clubs: "#e8e0f0",
  spades: "#e8e0f0",

  // Card face
  cardBackground: "#1e0040",
  cardBorder: "#5b21b6",
  cardHeld: "#00ff9f22",
  cardHeldBorder: "#00ff9f",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  heading1: { fontSize: 28, fontWeight: "700" as const, color: colors.textPrimary },
  heading2: { fontSize: 22, fontWeight: "700" as const, color: colors.textPrimary },
  heading3: { fontSize: 18, fontWeight: "600" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
  bodySmall: { fontSize: 13, fontWeight: "400" as const, color: colors.textSecondary },
  caption: { fontSize: 11, fontWeight: "400" as const, color: colors.textMuted },
  mono: { fontSize: 13, fontFamily: "monospace" as const, color: colors.textSecondary },
  neon: { fontSize: 15, fontWeight: "700" as const, color: colors.neonGreen },
} as const;

export const shadows = {
  neonGreen: {
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  purple: {
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
