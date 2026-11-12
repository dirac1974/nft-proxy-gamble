// Single source for jurisdiction-driven play restrictions (UKGC-style).
// When true: no turbo/instant/slam-stop/skip, no slot anticipation teasers,
// minimum 2.5 s game cycle. Default false until jurisdiction config is wired
// (EXPO_PUBLIC_RESTRICTED_PLAY=1 forces it on for testing/compliance builds).
export const RESTRICTED_PLAY: boolean = process.env.EXPO_PUBLIC_RESTRICTED_PLAY === "1";
export const MIN_CYCLE_MS = 2500;
