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
      <Text style={styles.message}>
        Wrong network — switch to {CHAIN.name}
      </Text>
      {isBusy ? (
        <ActivityIndicator color={colors.warning} size="small" />
      ) : (
        <Pressable
          onPress={switchNetwork}
          accessibilityRole="button"
          accessibilityLabel={`Switch wallet to ${CHAIN.name}`}
          style={styles.switchButton}
        >
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
    backgroundColor: `${colors.warning}22`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.warning}44`,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  message: {
    ...typography.bodySmall,
    color: colors.warning,
    flex: 1,
  },
  switchButton: {
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  switchText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: "700",
  },
});
