import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { NeonButton } from "@/components/ui";
import { colors, gradients, radius, shadows, spacing, typography } from "@/theme";
import { authApi } from "@/services/api";
import { useWalletStore } from "@/stores/walletStore";

interface AgeGateModalProps {
  visible: boolean;
}

export function AgeGateModal({ visible }: AgeGateModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAgeConfirmed = useWalletStore((s) => s.setAgeConfirmed);

  const handleConfirm = async () => {
    setIsPending(true);
    setError(null);
    try {
      await authApi.confirmAge();
      setAgeConfirmed();
    } catch (err) {
      setError((err as Error).message ?? "Failed to confirm age. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Gradient header band */}
          <LinearGradient
            colors={["rgba(107, 33, 168, 0.6)", "rgba(11, 0, 20, 0.0)"]}
            style={styles.cardGlow}
            pointerEvents="none"
          />

          {/* Age badge */}
          <View style={styles.ageBadge}>
            <LinearGradient
              colors={gradients.purpleBright}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ageBadgeGradient}
            >
              <Text style={styles.ageBadgeText}>18+</Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>Age Verification</Text>
          <Text style={styles.body}>
            This app contains gambling features. You must be 18 years or older to play.
          </Text>
          <Text style={styles.body}>
            By tapping Confirm, you declare that you are 18 or older and that online gambling
            is legal in your jurisdiction.
          </Text>

          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={15} color={colors.lose} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <NeonButton
            label="I am 18 or older — Confirm"
            onPress={handleConfirm}
            variant="primary"
            size="lg"
            fullWidth
            loading={isPending}
            haptics="heavy"
            accessibilityLabel="Confirm I am 18 or older"
          />

          {/* Responsible gambling disclaimer */}
          <View style={styles.disclaimer}>
            <MaterialCommunityIcons name="hand-heart-outline" size={12} color={colors.textMuted} />
            <Text style={styles.disclaimerText}>
              If you are under 18, please close this app. Gambling can be addictive — play
              responsibly. For help, visit{" "}
              <Text style={styles.link}>begambleaware.org</Text>
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 400,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.purple,
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xl,
  },

  ageBadge: {
    alignSelf: "center",
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.purple,
  },
  ageBadgeGradient: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ageBadgeText: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.textPrimary,
    letterSpacing: 2,
  },

  title: { ...typography.heading2, textAlign: "center" },
  body: { ...typography.body, textAlign: "center", color: colors.textSecondary },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.lose}12`,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.lose}28`,
  },
  errorText: { ...typography.bodySmall, color: colors.lose, flex: 1 },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  disclaimerText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  link: { color: colors.purpleLight, textDecorationLine: "underline" },
});
