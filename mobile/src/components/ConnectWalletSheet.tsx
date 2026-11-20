import React, { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { CHAIN, E2E_WALLET_ENABLED, connectE2EWallet } from "@/services/walletService";
import { AppText, Button, Sheet } from "@/components/ui";
import { palette, radius, spacing } from "@/theme";

interface ConnectWalletSheetProps {
  visible: boolean;
  onClose: () => void;
}

const METAMASK_URL = "https://metamask.io/download/";
const RAINBOW_URL = "https://rainbow.me/";

function friendlyConnectError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
    return "Sign-in was cancelled in your wallet app. Try again when you're ready.";
  }
  if (msg.includes("network request failed") || msg.includes("failed to fetch") || msg.includes("timeout")) {
    return "We can't reach the server right now. Check your connection and try again.";
  }
  if (msg.includes("wrong network") || msg.includes("chain")) {
    return `Your wallet is on the wrong network. Switch to ${CHAIN.name} to continue.`;
  }
  return "We couldn't sign you in. Check your wallet app and try again.";
}

export function isWrongNetwork(networkMismatch: boolean, connectionError: string | null): boolean {
  const msg = connectionError?.toLowerCase() ?? "";
  return networkMismatch || msg.includes("wrong network") || msg.includes("chain");
}

export function ConnectWalletSheet({ visible, onClose }: ConnectWalletSheetProps) {
  const { openModal, retryAuth, switchNetwork, isBusy } = useWalletConnect();
  const networkMismatch = useWalletStore((s) => s.networkMismatch);
  const [switching, setSwitching] = useState(false);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const connectionError = useWalletStore((s) => s.connectionError);
  const setConnectionError = useWalletStore((s) => s.setConnectionError);
  const setConnectPending = useUiStore((s) => s.setConnectPending);
  const closeAll = useUiStore((s) => s.closeAll);

  const busyLabel =
    connectionStatus === "authenticating" ? "Approve the sign-in in your wallet app…" : "Connecting to your wallet…";

  const handleConnect = () => {
    // Close our sheet first: two native modals can't be presented at once on iOS.
    // Clearing the stale error keeps the sheet hidden until there's new progress.
    setConnectionError(null);
    closeAll();
    setConnectPending(true);
    setTimeout(openModal, 350);
  };

  const wrongNetwork = isWrongNetwork(networkMismatch, connectionError);

  const handleSwitch = () => {
    setSwitching(true);
    switchNetwork().finally(() => setSwitching(false));
  };

  const handleE2EConnect = () => {
    setConnectionError(null);
    connectE2EWallet()
      .then(closeAll)
      .catch((e: unknown) => {
        if (__DEV__) console.warn("[e2e-wallet]", e instanceof Error ? e.message : e);
        setConnectionError(e instanceof Error ? e.message : "Test wallet failed");
      });
  };

  return (
    <Sheet visible={visible} onClose={onClose} dismissable={!isBusy} testID="connect-sheet">
      <View style={styles.hero}>
        <View style={styles.emblem}>
          <Ionicons name="wallet" size={30} color={palette.gold} />
        </View>
        <AppText variant="heading2" align="center">
          Connect your wallet
        </AppText>
        <AppText variant="body" tone="dim" align="center">
          Connect a crypto wallet to save your coins and cash out to USDC.
        </AppText>
      </View>

      {wrongNetwork && !isBusy && (
        <View style={styles.warn} accessibilityRole="alert" testID="connect-wrong-network">
          <Ionicons name="swap-horizontal" size={18} color={palette.warn} />
          <AppText variant="bodySmall" style={styles.errorText}>
            Your wallet is connected to a different network. Switch to {CHAIN.name} to sign in — your wallet app will
            ask you to approve it.
          </AppText>
        </View>
      )}

      {connectionError && !isBusy && !wrongNetwork && (
        <View style={styles.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={palette.danger} />
          <AppText variant="bodySmall" style={styles.errorText}>
            {friendlyConnectError(connectionError)}
          </AppText>
        </View>
      )}

      {isBusy ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.gold} />
          <AppText variant="bodyStrong" align="center">
            {busyLabel}
          </AppText>
        </View>
      ) : wrongNetwork ? (
        <View style={styles.actions}>
          <Button
            label={`Switch to ${CHAIN.name}`}
            icon="swap-horizontal"
            onPress={handleSwitch}
            loading={switching}
            fullWidth
            size="lg"
            testID="connect-switch-network"
          />
          <Button label="Use a different wallet" variant="ghost" onPress={handleConnect} fullWidth />
        </View>
      ) : connectionError ? (
        <View style={styles.actions}>
          <Button label="Try again" onPress={() => void retryAuth()} fullWidth testID="connect-retry" />
          <Button label="Use a different wallet" variant="ghost" onPress={handleConnect} fullWidth />
        </View>
      ) : (
        <Button
          label="Connect wallet"
          icon="link"
          onPress={handleConnect}
          fullWidth
          size="lg"
          testID="connect-wallet-button"
          accessibilityLabel="Connect wallet"
        />
      )}
      {E2E_WALLET_ENABLED && (
        <Button
          label="Use test wallet (debug build)"
          variant="secondary"
          onPress={handleE2EConnect}
          fullWidth
          testID="connect-e2e-wallet"
        />
      )}

      <AppText variant="bodySmall" align="center">
        Don't have one?{" "}
        <AppText
          variant="bodySmall"
          tone="gold"
          onPress={() => void Linking.openURL(METAMASK_URL)}
          accessibilityRole="link"
        >
          MetaMask
        </AppText>{" "}
        or{" "}
        <AppText
          variant="bodySmall"
          tone="gold"
          onPress={() => void Linking.openURL(RAINBOW_URL)}
          accessibilityRole="link"
        >
          Rainbow
        </AppText>{" "}
        work great.
      </AppText>

      {/* TODO(legal): link "Terms of Service" once a published terms URL exists. */}
      <AppText variant="caption" align="center" style={styles.legal}>
        By connecting, you confirm you are 18+ and agree to our Terms of Service.
      </AppText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm },
  emblem: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(233,196,106,0.4)",
    backgroundColor: "rgba(233,196,106,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(229,72,77,0.1)",
    borderWidth: 1,
    borderColor: "rgba(229,72,77,0.35)",
  },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.s12,
    borderRadius: radius.md,
    backgroundColor: "rgba(245,165,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,165,36,0.35)",
  },
  errorText: { flex: 1, color: palette.text },
  busy: { alignItems: "center", gap: spacing.s12, paddingVertical: spacing.md },
  actions: { gap: spacing.xs },
  legal: { paddingHorizontal: spacing.md },
});
