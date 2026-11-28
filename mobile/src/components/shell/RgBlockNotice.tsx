import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Sheet } from "@/components/ui";
import { palette, spacing } from "@/theme";

export type RgCode = "RG_COOL_OFF" | "RG_SELF_EXCLUDED" | "RG_LOSS_LIMIT" | "RG_DEPOSIT_LIMIT";
export interface RgBlock {
  code: RgCode;
  until?: string;
}

const RG_CODES: readonly string[] = ["RG_COOL_OFF", "RG_SELF_EXCLUDED", "RG_LOSS_LIMIT", "RG_DEPOSIT_LIMIT"];
export const PROFILE_ROUTE = "/profile";

export function isPermanentUntil(until?: string | null): boolean {
  return !!until && new Date(until).getUTCFullYear() >= 9999;
}

export function formatRgTime(until: string): string {
  return new Date(until).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRgDate(until: string): string {
  return new Date(until).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function rgBlockFromError(e: unknown): RgBlock | null {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !RG_CODES.includes(code)) return null;
  const until = (e as { until?: unknown }).until;
  return { code: code as RgCode, ...(typeof until === "string" ? { until } : {}) };
}

export function rgTitle(code: RgCode): string {
  switch (code) {
    case "RG_COOL_OFF":
      return "You're taking a break";
    case "RG_SELF_EXCLUDED":
      return "You've self-excluded";
    case "RG_LOSS_LIMIT":
      return "Daily loss limit reached";
    case "RG_DEPOSIT_LIMIT":
      return "Daily deposit limit reached";
  }
}

const CASH_OUT_NOTE = "You can still cash out your balance anytime from Wallet.";

export function rgMessage(code: RgCode, until?: string): string {
  const when = until ? formatRgTime(until) : null;
  switch (code) {
    case "RG_COOL_OFF":
      return `Games and coin purchases are paused${when ? ` until ${when}` : ""}. ${CASH_OUT_NOTE}`;
    case "RG_SELF_EXCLUDED":
      return isPermanentUntil(until)
        ? `Games and coin purchases are permanently closed on this account. ${CASH_OUT_NOTE}`
        : `Games and coin purchases are closed${until ? ` until ${formatRgDate(until)}` : ""}. ${CASH_OUT_NOTE}`;
    case "RG_LOSS_LIMIT":
      return `You've reached the daily loss limit you set. New rounds open again${when ? ` ${when}` : " tomorrow"}. A round already in progress can still be finished.`;
    case "RG_DEPOSIT_LIMIT":
      return `This would go over the daily deposit limit you set. Purchases open again${when ? ` ${when}` : " tomorrow"}.`;
  }
}

const ICON: Record<RgCode, keyof typeof Ionicons.glyphMap> = {
  RG_COOL_OFF: "cafe-outline",
  RG_SELF_EXCLUDED: "hand-left-outline",
  RG_LOSS_LIMIT: "shield-checkmark-outline",
  RG_DEPOSIT_LIMIT: "shield-checkmark-outline",
};

// Calm, near-full-screen notice for a responsible-gaming refusal (403 RG_*).
export function RgBlockNotice({ block, onClose }: { block: RgBlock | null; onClose: () => void }) {
  if (!block) return null;
  return (
    <Sheet visible onClose={onClose} testID="rg-block-notice">
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name={ICON[block.code]} size={34} color={palette.gold} />
        </View>
        <AppText variant="heading2" align="center">
          {rgTitle(block.code)}
        </AppText>
        <AppText variant="body" align="center" style={styles.message} testID="rg-block-message">
          {rgMessage(block.code, block.until)}
        </AppText>
      </View>
      <Button label="OK" onPress={onClose} fullWidth testID="rg-block-ok" />
      <Button
        label="Responsible gaming settings"
        variant="ghost"
        onPress={() => {
          onClose();
          router.push(PROFILE_ROUTE);
        }}
        fullWidth
        testID="rg-block-settings"
      />
    </Sheet>
  );
}

// Game-screen hook: `if (rg.intercept(e)) return;` before the usual error
// toast, and render `rg.notice` once in the screen.
export function useRgBlock(): { intercept: (e: unknown) => boolean; notice: React.ReactElement | null } {
  const [block, setBlock] = useState<RgBlock | null>(null);
  const clear = useCallback(() => setBlock(null), []);
  const intercept = useCallback((e: unknown) => {
    const b = rgBlockFromError(e);
    if (b) setBlock(b);
    return !!b;
  }, []);
  return { intercept, notice: block ? <RgBlockNotice block={block} onClose={clear} /> : null };
}

const styles = StyleSheet.create({
  body: { alignItems: "center", gap: spacing.s12, paddingVertical: spacing.lg },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(233,196,106,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  message: { color: palette.textDim },
});
