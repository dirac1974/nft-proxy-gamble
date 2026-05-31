export const colors = {
  // Primary palette — deep violet-black casino backdrop
  background: "#0b0014",
  backgroundDeep: "#060009",
  surface: "#160029",
  surfaceElevated: "#1f0540",
  surfaceGlass: "rgba(40, 8, 78, 0.55)",
  border: "#3d0078",
  borderSubtle: "rgba(124, 58, 237, 0.18)",
  borderStrong: "#5b21b6",

  // Brand
  purple: "#6B21A8",
  purpleLight: "#9333EA",
  purpleGlow: "#a855f7",
  neonGreen: "#00ff9f",
  neonGreenDim: "#00cc7a",

  // Premium accent — gold for wins, jackpots, premium CTAs
  gold: "#ffd24a",
  goldDim: "#d4a017",
  goldGlow: "#ffe08a",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#c4b3da",
  textMuted: "#7a6a8a",

  // Semantic
  win: "#00ff9f",
  lose: "#ff4d6d",
  warning: "#ffbb00",

  // Suits
  hearts: "#ff5277",
  diamonds: "#ff5277",
  clubs: "#1a1030",
  spades: "#1a1030",

  // Card face
  cardBackground: "#fbf7ff",
  cardBorder: "#5b21b6",
  cardFaceShadow: "#2a0a52",
  cardHeld: "#00ff9f22",
  cardHeldBorder: "#00ff9f",
  cardBackPattern: "#2a0a52",
} as const;

/**
 * Gradient stop tuples for `expo-linear-gradient`'s `colors` prop.
 * Each is a readonly tuple so it satisfies the library's `[string, string, ...]` type.
 */
export const gradients = {
  screen: ["#0b0014", "#13002b", "#0b0014"] as const,
  screenWarm: ["#13002b", "#1f0540", "#0b0014"] as const,
  hero: ["#9333EA", "#00ff9f"] as const,
  purple: ["#7c3aed", "#6B21A8"] as const,
  purpleBright: ["#a855f7", "#7c3aed"] as const,
  green: ["#00ff9f", "#00cc7a"] as const,
  gold: ["#ffe08a", "#ffd24a", "#d4a017"] as const,
  danger: ["#ff5277", "#c81e4f"] as const,
  glass: ["rgba(63, 0, 120, 0.42)", "rgba(31, 5, 64, 0.32)"] as const,
  glassHighlight: ["rgba(168, 85, 247, 0.20)", "rgba(31, 5, 64, 0.05)"] as const,
  cardBack: ["#2a0a52", "#1f0540", "#160029"] as const,
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
  pill: 999,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 40, fontWeight: "900" as const, color: colors.textPrimary, letterSpacing: 1 },
  heading1: { fontSize: 28, fontWeight: "800" as const, color: colors.textPrimary },
  heading2: { fontSize: 22, fontWeight: "700" as const, color: colors.textPrimary },
  heading3: { fontSize: 18, fontWeight: "600" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
  bodySmall: { fontSize: 13, fontWeight: "400" as const, color: colors.textSecondary },
  caption: { fontSize: 11, fontWeight: "400" as const, color: colors.textMuted },
  overline: { fontSize: 11, fontWeight: "700" as const, color: colors.textMuted, letterSpacing: 2 },
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
    shadowColor: colors.purpleGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  gold: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
} as const;

/** Shared animation timing + spring presets so motion feels consistent app-wide. */
export const motion = {
  fast: 150,
  base: 220,
  slow: 360,
  springSnappy: { damping: 15, stiffness: 220 },
  springSoft: { damping: 12, stiffness: 140 },
  springBouncy: { damping: 7, stiffness: 180 },
} as const;
