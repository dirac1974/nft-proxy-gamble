import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useWalletStore } from "@/stores/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { CHAIN } from "@/services/walletService";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Shown at the top of any screen when the connected wallet is on the wrong network.
 * Offers a one-tap "Switch" button that calls wallet_switchEthereumChain.
 * Renders nothing when the network is correct or no wallet is connected.
 */
export function NetworkBanner() {
  const networkMismatch = useWalletStore((s) => s.networkMismatch);
  const connectionError = useWalletStore((s) => s.connectionError);
  const { switchNetwork, isBusy } = useWalletConnect();

  // Show on network mismatch, or if error contains "Wrong network"
  const showNetworkError =
    networkMismatch ||
    (connectionError?.toLowerCase().includes("wrong network") ?? false) ||
    (connectionError?.toLowerCase().includes("chain") ?? false);

  if (!showNetworkError) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessible>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="access-point-network-off" size={15} color={colors.warning} />
      </View>
      <Text style={styles.message} numberOfLines={1}>
        Wrong network — switch to {CHAIN.name}
      </Text>
      {isBusy ? (
        <ActivityIndicator color={colors.warning} size="small" style={styles.spinner} />
      ) : (
        <Pressable
          onPress={switchNetwork}
          accessibilityRole="button"
          accessibilityLabel={`Switch wallet to ${CHAIN.name}`}
          style={({ pressed }) => [styles.switchButton, pressed && styles.switchButtonPressed]}
        >
          <Ionicons name="swap-horizontal" size={12} color={colors.background} />
          <Text style={styles.switchText}>Switch</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.warning}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.warning}35`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: `${colors.warning}20`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
    flexShrink: 0,
  },
  message: {
    ...typography.bodySmall,
    color: colors.warning,
    flex: 1,
  },
  spinner: { marginHorizontal: spacing.xs },
  switchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    flexShrink: 0,
  },
  switchButtonPressed: { opacity: 0.8 },
  switchText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: "800",
  },
});
