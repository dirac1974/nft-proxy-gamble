import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/stores/settingsStore";

export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "select";

/** Rapid keno balls / reel stops would otherwise buzz continuously. */
export const LIGHT_HAPTIC_MIN_MS = 60;
const THROTTLED = new Set<HapticKind>(["light", "select"]);
let lastLight = -Infinity;

/** Test hook: forget the last light impact time. */
export function resetHapticThrottle(): void {
  lastLight = -Infinity;
}

/**
 * Fire-and-forget haptic feedback. No-ops on web and swallows any platform
 * error so callers never need to guard. Safe to call from press handlers.
 */
export function haptic(kind: HapticKind = "light"): void {
  if (Platform.OS === "web" || !useSettingsStore.getState().hapticsOn) return;
  if (THROTTLED.has(kind)) {
    const t = Date.now();
    if (t - lastLight < LIGHT_HAPTIC_MIN_MS) return;
    lastLight = t;
  }
  try {
    switch (kind) {
      case "light":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "select":
        void Haptics.selectionAsync();
        break;
    }
  } catch {
    // Haptics unavailable on this device/platform — ignore.
  }
}
