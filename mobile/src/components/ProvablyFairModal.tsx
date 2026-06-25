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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";
import { NeonButton } from "@/components/ui";
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

  const allPass = verification.seedHashMatches && verification.deckMatches;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={["rgba(40, 8, 78, 0.98)", "rgba(11, 0, 20, 0.99)"]}
          style={styles.sheet}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <MaterialCommunityIcons name="shield-check" size={20} color={colors.purpleGlow} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Provably Fair</Text>
              <Text style={styles.subtitle}>Cryptographic hand verification</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close provably fair verification"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Pass / Fail result banner */}
          <View style={[styles.resultBanner, allPass ? styles.resultPass : styles.resultFail]}>
            {allPass
              ? <Ionicons name="checkmark-circle" size={20} color={colors.win} />
              : <Ionicons name="close-circle" size={20} color={colors.lose} />
            }
            <Text style={[styles.resultText, allPass ? styles.resultTextPass : styles.resultTextFail]}>
              {allPass
                ? "Hand verified — this deal was fair"
                : "Verification failed — contact support"}
            </Text>
          </View>

          {/* Check rows */}
          <View style={styles.checksContainer}>
            <CheckRow
              label="Seed hash match"
              pass={verification.seedHashMatches}
            />
            <CheckRow
              label="Deck match"
              pass={verification.deckMatches}
            />
          </View>

          {/* Seed data */}
          <ScrollView style={styles.seedScroll} showsVerticalScrollIndicator={false}>
            <SeedField
              label="Server seed hash (shown before deal)"
              value={session.serverSeedHash}
            />
            <SeedField
              label="Server seed (revealed after draw)"
              value={result.serverSeed}
            />
            <SeedField
              label="Client seed"
              value={session.clientSeed}
            />
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footerActions}>
            <Pressable
              style={styles.verifyLink}
              onPress={() => Linking.openURL(VERIFY_URL)}
              accessibilityRole="link"
              accessibilityLabel="Open provably fair documentation"
            >
              <MaterialCommunityIcons name="open-in-new" size={13} color={colors.purpleLight} />
              <Text style={styles.verifyLinkText}>How to verify independently</Text>
            </Pressable>

            <NeonButton
              label="Close"
              onPress={onClose}
              variant="ghost"
              size="md"
              fullWidth
              accessibilityLabel="Close provably fair verification"
            />
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function CheckRow({ label, pass }: { label: string; pass: boolean }) {
  return (
    <View style={checkStyles.row}>
      <Text style={checkStyles.label}>{label}</Text>
      <View style={[checkStyles.badge, pass ? checkStyles.badgePass : checkStyles.badgeFail]}>
        <Ionicons
          name={pass ? "checkmark" : "close"}
          size={11}
          color={pass ? colors.win : colors.lose}
        />
        <Text style={[checkStyles.badgeText, pass ? checkStyles.textPass : checkStyles.textFail]}>
          {pass ? "Pass" : "FAIL"}
        </Text>
      </View>
    </View>
  );
}

function SeedField({ label, value }: { label: string; value: string }) {
  return (
    <View style={seedStyles.field}>
      <Text style={seedStyles.label}>{label}</Text>
      <View style={seedStyles.valueWrap}>
        <Text style={seedStyles.mono} selectable>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    maxHeight: "80%",
    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: `${colors.purpleGlow}15`,
    borderWidth: 1,
    borderColor: `${colors.purpleGlow}30`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.heading3 },
  subtitle: { ...typography.bodySmall },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },

  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  resultPass: {
    backgroundColor: `${colors.neonGreen}0e`,
    borderColor: `${colors.neonGreen}30`,
  },
  resultFail: {
    backgroundColor: `${colors.lose}0e`,
    borderColor: `${colors.lose}30`,
  },
  resultText: { ...typography.bodySmall, fontWeight: "700", flex: 1 },
  resultTextPass: { color: colors.win },
  resultTextFail: { color: colors.lose },

  checksContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: "hidden",
  },

  seedScroll: {
    maxHeight: 190,
    marginTop: spacing.md,
  },

  footerActions: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  verifyLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  verifyLinkText: {
    ...typography.caption,
    color: colors.purpleLight,
    textDecorationLine: "underline",
  },
});

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  label: { ...typography.bodySmall },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgePass: {
    backgroundColor: `${colors.win}12`,
    borderColor: `${colors.win}30`,
  },
  badgeFail: {
    backgroundColor: `${colors.lose}12`,
    borderColor: `${colors.lose}30`,
  },
  badgeText: { ...typography.caption, fontWeight: "700" },
  textPass: { color: colors.win },
  textFail: { color: colors.lose },
});

const seedStyles = StyleSheet.create({
  field: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4,
  },
  label: { ...typography.caption, color: colors.textMuted },
  valueWrap: {
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  mono: {
    ...typography.mono,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
