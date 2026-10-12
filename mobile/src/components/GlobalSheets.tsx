import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IAPSheet } from "@/components/IAPSheet";
import { CashOutSheet } from "@/components/CashOutSheet";
import { ConnectWalletSheet } from "@/components/ConnectWalletSheet";
import { Toast } from "@/components/ui";
import { useUiStore } from "@/stores/uiStore";
import { useWalletStore } from "@/stores/walletStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatCoins } from "@/config/brand";

// Reality check: after `sessionReminderMin` minutes of foreground time, a calm
// reminder with no pressure either way. 0 disables it.
function useSessionReminder() {
  const minutes = useSettingsStore((s) => s.sessionReminderMin);
  const activeMs = useRef(0);
  const resumedAt = useRef<number | null>(Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        resumedAt.current = Date.now();
      } else if (resumedAt.current !== null) {
        activeMs.current += Date.now() - resumedAt.current;
        resumedAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!minutes) return;
    const limit = minutes * 60_000;
    const id = setInterval(() => {
      const total = activeMs.current + (resumedAt.current !== null ? Date.now() - resumedAt.current : 0);
      if (total < limit) return;
      activeMs.current = 0;
      resumedAt.current = Date.now();
      Alert.alert(
        "Time check",
        `You've been playing for ${minutes} minutes. Take a break whenever you like. Your coins will be here.`,
        [{ text: "OK" }],
      );
    }, 30_000);
    return () => clearInterval(id);
  }, [minutes]);
}

// Mounts app-wide sheets driven by uiStore.
export function GlobalSheets() {
  const iapOpen = useUiStore((s) => s.iapOpen);
  const cashOutOpen = useUiStore((s) => s.cashOutOpen);
  const connectOpen = useUiStore((s) => s.connectOpen);
  const connectPending = useUiStore((s) => s.connectPending);
  const setConnectPending = useUiStore((s) => s.setConnectPending);
  const closeAll = useUiStore((s) => s.closeAll);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const connectionError = useWalletStore((s) => s.connectionError);
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);

  useSessionReminder();

  useEffect(() => {
    if (isAuthenticated && connectPending) setConnectPending(false);
    if (isAuthenticated && connectOpen) closeAll();
  }, [isAuthenticated, connectPending, connectOpen, setConnectPending, closeAll]);

  // Re-surface the connect sheet with progress or errors after the WalletConnect
  // modal hands back, if the user started connecting from it.
  const connectBusy = connectionStatus === "connecting" || connectionStatus === "authenticating";
  const connectVisible =
    !isAuthenticated && (connectOpen || (connectPending && (connectBusy || !!connectionError)));

  const closeConnect = useCallback(() => {
    setConnectPending(false);
    closeAll();
  }, [setConnectPending, closeAll]);

  const onPurchased = useCallback((coins: number) => {
    setToast(coins > 0 ? `${formatCoins(coins)} coins added` : "Coins added");
  }, []);
  const hideToast = useCallback(() => setToast(null), []);

  return (
    <>
      <IAPSheet visible={iapOpen} onClose={closeAll} onPurchased={onPurchased} />
      <CashOutSheet visible={cashOutOpen} onClose={closeAll} />
      <ConnectWalletSheet visible={connectVisible} onClose={closeConnect} />
      <View pointerEvents="box-none" style={[styles.toastLayer, { top: insets.top }]}>
        <Toast message={toast} tone="success" onHide={hideToast} testID="global-toast" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  toastLayer: { position: "absolute", left: 0, right: 0, height: 96, zIndex: 90 },
});
