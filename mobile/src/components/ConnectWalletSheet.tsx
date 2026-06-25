import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWalletStore } from "@/stores/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/ui/NeonButton";
import { colors, gradients, radius, spacing, typography } from "@/theme";

interface ConnectWalletSheetProps {
  title?: string;
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
      {/* Wallet icon header */}
      <View style={styles.iconWrapper}>
        <LinearGradient
          colors={gradients.purpleBright}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <MaterialCommunityIcons name="wallet" size={32} color={colors.textPrimary} />
        </LinearGradient>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {connectionError && (
        <View style={styles.errorRow} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.lose} />
          <Text style={styles.errorText}>{connectionError}</Text>
          <NeonButton
            label="Retry"
            onPress={retryAuth}
            variant="danger"
            size="sm"
            disabled={isBusy}
            haptics="light"
            accessibilityLabel="Retry authentication"
          />
        </View>
      )}

      {isBusy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.neonGreen} size="small" />
          <Text style={styles.busyText}>{statusLabel}</Text>
        </View>
      ) : (
        <NeonButton
          label="Connect Wallet"
          onPress={openModal}
          variant="primary"
          size="md"
          fullWidth
          haptics="medium"
          accessibilityLabel="Connect wallet via WalletConnect"
          icon={<MaterialCommunityIcons name="link-variant" size={18} color={colors.textPrimary} />}
        />
      )}

      <Text style={styles.legal}>
        By connecting, you confirm you are 18+ and agree to our Terms of Service.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },

  iconWrapper: {
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    ...typography.heading3,
    textAlign: "center",
  },
  subtitle: {
    ...typography.bodySmall,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.lose}1a`,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.lose}44`,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.lose,
    flex: 1,
  },

  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: `${colors.neonGreen}0d`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.neonGreen}22`,
  },
  busyText: {
    ...typography.bodySmall,
    color: colors.neonGreen,
    fontWeight: "600",
  },

  legal: {
    ...typography.caption,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
    color: colors.textMuted,
  },
});
