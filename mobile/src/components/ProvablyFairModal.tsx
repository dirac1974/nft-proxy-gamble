import React, { useMemo, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, spacing, typography } from "@/theme";
import { AppText, Button, Sheet, haptic } from "@/components/ui";
import { VerificationBadge } from "@/components/videopoker/VerificationBadge";
import { verifyHand, type VerificationResult } from "@/services/provablyFair";
import type { DealtState, DrawResult, GameSession } from "@/stores/gameStore";

interface ProvablyFairModalProps {
  visible: boolean;
  onClose: () => void;
  session: GameSession;
  dealt: DealtState;
  result: DrawResult;
}

const VERIFY_URL = "https://docs.nftproxygamble.com/provably-fair";
// One hand per session (backend enforces it), so the hand number is always 0.
const HAND_NUMBER = 0;

export function verifyVideoPokerHand(session: GameSession, dealt: DealtState, result: DrawResult): VerificationResult {
  return verifyHand(
    result.serverSeed,
    session.serverSeedHash,
    session.clientSeed,
    HAND_NUMBER,
    dealt.dealtCards,
    result.drawnCards,
    dealt.holds,
  );
}

export function isVerified(v: Pick<VerificationResult, "seedHashMatches" | "deckMatches">): boolean {
  return v.seedHashMatches && v.deckMatches;
}

function SeedRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.seedRow}>
      <View style={styles.seedHead}>
        <AppText variant="overline">{label}</AppText>
        <Pressable
          onPress={() => {
            haptic("light");
            void Share.share({ message: value });
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${label}`}
          testID={testID ? `${testID}-copy` : undefined}
        >
          <Ionicons name="copy-outline" size={16} color={palette.gold} />
        </Pressable>
      </View>
      <AppText selectable style={styles.mono} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.checkRow}>
      <AppText variant="bodySmall" style={styles.flex}>
        {label}
      </AppText>
      <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={18} color={ok ? palette.emerald : palette.danger} />
      <AppText style={[styles.checkValue, { color: ok ? palette.emerald : palette.danger }]}>{ok ? "Match" : "Mismatch"}</AppText>
    </View>
  );
}

export function ProvablyFairModal({ visible, onClose, session, dealt, result }: ProvablyFairModalProps) {
  const [showTech, setShowTech] = useState(false);
  const verification = useMemo(() => verifyVideoPokerHand(session, dealt, result), [session, dealt, result]);
  const passed = isVerified(verification);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Fairness check"
      subtitle="Checked on your device, not by our server"
      testID="fairness-sheet"
      footer={<Button label="Done" variant="secondary" onPress={onClose} fullWidth testID="fairness-done" />}
    >
      <VerificationBadge passed={passed} />

      <View style={styles.explain}>
        <AppText variant="bodyStrong">How this works</AppText>
        <AppText variant="bodySmall">
          Before the deal, the server locked in a secret seed and showed you its fingerprint. After the draw it
          revealed that seed. Your phone then reshuffled the deck from the server seed and your own client seed, and
          checked that every card you saw came from that exact deck.
        </AppText>
        {!passed && (
          <AppText variant="bodySmall" tone="danger">
            If this keeps happening, contact support with the technical details below.
          </AppText>
        )}
      </View>

      <Pressable
        onPress={() => {
          haptic("select");
          setShowTech((s) => !s);
        }}
        style={styles.disclosure}
        accessibilityRole="button"
        accessibilityState={{ expanded: showTech }}
        accessibilityLabel="Technical details"
        testID="fairness-technical-toggle"
      >
        <AppText variant="bodyStrong" style={styles.flex}>
          Technical details
        </AppText>
        <Ionicons name={showTech ? "chevron-up" : "chevron-down"} size={18} color={palette.textDim} />
      </Pressable>

      {showTech && (
        <View style={styles.tech} testID="fairness-technical">
          <CheckRow label="Seed matches its fingerprint" ok={verification.seedHashMatches} />
          <CheckRow label="Cards match the shuffled deck" ok={verification.deckMatches} />
          <SeedRow label="Server seed hash (before deal)" value={session.serverSeedHash} testID="seed-hash" />
          <SeedRow label="Server seed (revealed)" value={result.serverSeed} testID="seed-server" />
          <SeedRow label="Client seed" value={session.clientSeed} testID="seed-client" />
          <Pressable
            onPress={() => void Linking.openURL(VERIFY_URL)}
            accessibilityRole="link"
            accessibilityLabel="How to verify independently"
            style={styles.link}
          >
            <AppText variant="bodySmall" tone="gold">
              How to verify independently
            </AppText>
            <Ionicons name="open-outline" size={14} color={palette.gold} />
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  explain: { gap: spacing.xs },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  tech: { gap: spacing.s12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  checkValue: { fontFamily: fonts.bold, fontSize: 12 },
  seedRow: {
    gap: spacing.xs,
    padding: spacing.s12,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  seedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mono: { ...typography.mono, fontSize: 11, lineHeight: 16 },
  link: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "center", paddingVertical: spacing.xs },
});
