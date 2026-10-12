import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, spacing, typography } from "@/theme";
import { AppText, Sheet } from "@/components/ui";
import { BRAND } from "@/config/brand";

export type FairStatus = "sealed" | "verified" | "failed";

export interface FairDetails {
  serverSeedHash: string;
  clientSeed: string;
  serverSeed?: string;
  numDecks?: number;
}

export function fairPillLabel(status: FairStatus): string {
  return status === "verified" ? "Fair deal" : status === "failed" ? "Check fairness" : "Deal sealed";
}

interface FairPillProps {
  status: FairStatus;
  onPress: () => void;
}

// Small control on the felt; the full story lives in the sheet.
export function FairPill({ status, onPress }: FairPillProps) {
  const color = status === "verified" ? palette.emerald : status === "failed" ? palette.warn : palette.goldLight;
  const icon = status === "verified" ? "shield-checkmark" : status === "failed" ? "alert-circle" : "lock-closed";
  return (
    <Pressable
      onPress={onPress}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel={`${fairPillLabel(status)}. Check fairness`}
      hitSlop={8}
      testID="bj-fair"
    >
      <Ionicons name={icon} size={13} color={color} />
      <AppText style={[styles.pillText, { color }]}>{fairPillLabel(status)}</AppText>
      <Ionicons name="chevron-forward" size={12} color={palette.textDim} />
    </Pressable>
  );
}

interface FairnessSheetProps {
  visible: boolean;
  onClose: () => void;
  status: FairStatus;
  details: FairDetails | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption">{label}</AppText>
      <AppText style={styles.mono} selectable>
        {value}
      </AppText>
    </View>
  );
}

export function FairnessSheet({ visible, onClose, status, details }: FairnessSheetProps) {
  const [open, setOpen] = useState(false);
  const headline =
    status === "verified"
      ? "This hand was dealt fairly."
      : status === "failed"
        ? "We couldn't confirm this hand was fair. Please contact support."
        : "This hand's shuffle is sealed.";
  const body =
    status === "verified"
      ? "Before you bet, the shoe's shuffle was locked with a digital fingerprint. When the hand ended we revealed the key, your phone re-shuffled the shoe itself, and every opening card matched."
      : status === "failed"
        ? `Your phone re-shuffled the shoe from the revealed key and the result did not match. Contact ${BRAND.supportEmail} and include the details below.`
        : "The shuffle was locked with a digital fingerprint before you bet. The key is revealed when the hand ends so your phone can check every opening card.";
  const icon = status === "verified" ? "shield-checkmark" : status === "failed" ? "alert-circle" : "lock-closed";
  const color = status === "verified" ? palette.emerald : status === "failed" ? palette.warn : palette.gold;

  return (
    <Sheet visible={visible} onClose={onClose} title="Fair play" testID="bj-fair-sheet">
      <View style={styles.hero}>
        <View style={[styles.medal, { borderColor: color }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading3" testID="bj-fair-headline">
            {headline}
          </AppText>
        </View>
      </View>
      <AppText variant="bodySmall">{body}</AppText>

      {details && (
        <View style={styles.details}>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            testID="bj-fair-details-toggle"
          >
            <AppText variant="bodyStrong" style={styles.flex}>
              Technical details
            </AppText>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={palette.textDim} />
          </Pressable>
          {open && (
            <View style={styles.rows}>
              <Row label="Server seed hash (committed before your bet)" value={details.serverSeedHash} />
              <Row label="Server seed (revealed after the hand)" value={details.serverSeed ?? "Revealed when the hand ends"} />
              <Row label="Client seed" value={details.clientSeed} />
              {details.numDecks ? <Row label="Decks in shoe" value={String(details.numDecks)} /> : null}
              <AppText variant="caption">
                Press and hold a value to copy it. Shoe order: keccak256 Fisher-Yates over serverSeed:clientSeed.
              </AppText>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.s12,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(248,227,163,0.2)",
  },
  pillText: { ...typography.caption, fontSize: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.s12 },
  medal: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  flex: { flex: 1 },
  details: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  toggle: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  rows: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.s12 },
  row: { gap: spacing.xs },
  mono: { ...typography.mono, color: palette.text },
});
