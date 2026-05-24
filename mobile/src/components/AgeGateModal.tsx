import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "@/theme";
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
          <Text style={styles.emoji}>18+</Text>
          <Text style={styles.title}>Age Verification</Text>
          <Text style={styles.body}>
            This app contains gambling features. You must be 18 years or older to play.
          </Text>
          <Text style={styles.body}>
            By tapping Confirm, you declare that you are 18 or older and that online gambling
            is legal in your jurisdiction.
          </Text>

          {error && (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          )}

          <Pressable
            style={[styles.confirmButton, isPending && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Confirm I am 18 or older"
          >
            {isPending ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.confirmText}>I am 18 or older — Confirm</Text>
            )}
          </Pressable>

          <Text style={styles.disclaimer}>
            If you are under 18, please close this app. Gambling can be addictive — play
            responsibly. For help, visit{" "}
            <Text style={styles.link}>begambleaware.org</Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
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
  },
  emoji: { fontSize: 48, textAlign: "center" },
  title: { ...typography.heading2, textAlign: "center" },
  body: { ...typography.body, textAlign: "center", color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.lose, textAlign: "center" },
  confirmButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  confirmText: { ...typography.body, fontWeight: "700" },
  buttonDisabled: { opacity: 0.5 },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
  link: { color: colors.purple, textDecorationLine: "underline" },
});
