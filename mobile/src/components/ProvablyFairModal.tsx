import React, { useMemo } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "@/theme";
import { verifyHand } from "@/services/provablyFair";
import type { DrawResult } from "@/stores/gameStore";
import type { GameSession, DealtState } from "@/stores/gameStore";

interface ProvablyFairModalProps {
  visible: boolean;
  onClose: () => void;
  session: GameSession;
  dealt: DealtState;
  result: DrawResult;
}

const VERIFY_URL = "https://docs.nftproxygamble.com/provably-fair";

export function ProvablyFairModal({
  visible,
  onClose,
  session,
  dealt,
  result,
}: ProvablyFairModalProps) {
  const verification = useMemo(
    () =>
      verifyHand(
        result.serverSeed,
        session.serverSeedHash,
        session.clientSeed,
        0, // handNumber; first hand in session
        dealt.dealtCards,
        result.drawnCards,
        dealt.holds,
      ),
    [result, session, dealt],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Provably Fair Verification</Text>

          <View style={[styles.result, verification.seedHashMatches && verification.deckMatches
            ? styles.resultPass : styles.resultFail]}>
            <Text style={styles.resultText}>
              {verification.seedHashMatches && verification.deckMatches
                ? "✓ Hand verified — this deal was fair"
                : "✗ Verification failed — contact support"}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Seed hash match</Text>
            <Text style={[styles.value, verification.seedHashMatches ? styles.pass : styles.fail]}>
              {verification.seedHashMatches ? "Pass" : "FAIL"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Deck match</Text>
            <Text style={[styles.value, verification.deckMatches ? styles.pass : styles.fail]}>
              {verification.deckMatches ? "Pass" : "FAIL"}
            </Text>
          </View>

          <ScrollView style={styles.seedScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Server seed hash (shown before deal)</Text>
            <Text style={styles.mono}>{session.serverSeedHash}</Text>

            <Text style={[styles.label, styles.spacing]}>Server seed (revealed after draw)</Text>
            <Text style={styles.mono}>{result.serverSeed}</Text>

            <Text style={[styles.label, styles.spacing]}>Client seed</Text>
            <Text style={styles.mono}>{session.clientSeed}</Text>
          </ScrollView>

          <Pressable
            style={styles.verifyLink}
            onPress={() => Linking.openURL(VERIFY_URL)}
          >
            <Text style={styles.verifyLinkText}>How to verify independently ↗</Text>
          </Pressable>

          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: "80%",
  },
  title: { ...typography.heading3, textAlign: "center" },

  result: {
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
  },
  resultPass: {
    backgroundColor: `${colors.neonGreen}22`,
    borderColor: `${colors.neonGreen}44`,
  },
  resultFail: {
    backgroundColor: `${colors.lose}22`,
    borderColor: `${colors.lose}44`,
  },
  resultText: { ...typography.bodySmall, fontWeight: "700" },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.bodySmall, fontWeight: "700" },
  pass: { color: colors.neonGreen },
  fail: { color: colors.lose },

  seedScroll: { maxHeight: 180 },
  mono: { ...typography.mono, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  spacing: { marginTop: spacing.md },

  verifyLink: { alignItems: "center" },
  verifyLinkText: { ...typography.caption, color: colors.purple, textDecorationLine: "underline" },

  closeButton: {
    backgroundColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  closeText: { ...typography.body, color: colors.textSecondary },
});
