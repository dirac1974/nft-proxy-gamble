import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useWalletStore } from "@/stores/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { GlassCard } from "@/components/GlassCard";
import { colors, radius, shadows, spacing, typography } from "@/theme";

interface ConnectWalletSheetProps {
  /** Shown above the connect prompt — defaults to "Connect Your Wallet" */
  title?: string;
  /** Shown below the title — defaults to generic copy */
  subtitle?: string;
}

export function ConnectWalletSheet({
  title = "Connect Your Wallet",
  subtitle = "Link your Polygon wallet to save progress and cash out NFT vouchers.",
}: ConnectWalletSheetProps) {
  const { openModal, retryAuth, isBusy } = useWalletConnect();
  const { connectionStatus, connectionError } = useWalletStore();

  const statusLabel =
    connectionStatus === "connecting"
      ? "Connecting…"
      : connectionStatus === "authenticating"
      ? "Signing in…"
      : null;

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {connectionError && (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Text style={styles.errorText}>{connectionError}</Text>
          <Pressable
            onPress={retryAuth}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Retry authentication"
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {isBusy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.neonGreen} size="small" />
          <Text style={styles.busyText}>{statusLabel}</Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          onPress={openModal}
          accessibilityRole="button"
          accessibilityLabel="Connect wallet via WalletConnect"
          accessibilityState={{ busy: isBusy }}
        >
          <Text style={styles.primaryButtonText}>Connect Wallet</Text>
        </Pressable>
      )}

      <Text style={styles.legal}>
        By connecting, you confirm you are 18+ and agree to our Terms of Service.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },

  title: { ...typography.heading3 },
  subtitle: { ...typography.bodySmall },

  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.lose}22`,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.lose}44`,
  },
  errorText: { ...typography.bodySmall, color: colors.lose, flex: 1 },
  retryButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: `${colors.lose}33`,
    borderRadius: radius.sm,
  },
  retryText: { ...typography.caption, color: colors.lose, fontWeight: "700" },

  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  busyText: { ...typography.bodySmall, color: colors.neonGreen },

  primaryButton: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadows.purple,
  },
  primaryButtonPressed: { opacity: 0.8 },
  primaryButtonText: { ...typography.body, fontWeight: "700" },

  legal: {
    ...typography.caption,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
});
