import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IAPSheet } from "@/components/IAPSheet";
import { CashOutSheet } from "@/components/CashOutSheet";
import { ConnectWalletSheet } from "@/components/ConnectWalletSheet";
import { Toast } from "@/components/ui";
import { useUiStore } from "@/stores/uiStore";
import { useWalletStore } from "@/stores/walletStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { formatCoins } from "@/config/brand";
import { RealityCheckSheet } from "@/components/shell/RealityCheckSheet";
import { sessionNet, useSessionStore } from "@/components/shell/sessionStore";

// Reality check: after `sessionReminderMin` minutes of foreground play, pause with session time and net
// result. 0 disables it. Session time counts foreground time only.
function useSessionClock(minutes: number, blocked: boolean) {
  const activeMs = useRef(0);
  const resumedAt = useRef<number | null>(Date.now());
  const sinceLast = useRef(0);
  const [due, setDue] = useState(false);

  const totalActive = useCallback(
    () => activeMs.current + (resumedAt.current !== null ? Date.now() - resumedAt.current : 0),
    [],
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (resumedAt.current === null) resumedAt.current = Date.now();
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
      if (due || blocked) return;
      if (totalActive() - sinceLast.current >= limit) setDue(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [minutes, due, blocked, totalActive]);

  const acknowledge = useCallback(() => {
    sinceLast.current = totalActive();
    setDue(false);
  }, [totalActive]);

  const restart = useCallback(() => {
    activeMs.current = 0;
    resumedAt.current = AppState.currentState === "active" ? Date.now() : null;
    sinceLast.current = 0;
    setDue(false);
  }, []);

  return { due: due && !!minutes, totalActive, acknowledge, restart };
}

// Session baseline: first server balance seen after sign-in; reset on sign-out.
function useSessionBaseline(isAuthenticated: boolean, onSignOut: () => void) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isAuthenticated) {
      useSessionStore.getState().reset();
      onSignOut();
      return;
    }
    const check = () => {
      const data = qc.getQueryData(["balance"]);
      if (typeof data === "number") useSessionStore.getState().observeBalance(data);
    };
    check();
    return qc.getQueryCache().subscribe(check);
  }, [isAuthenticated, qc, onSignOut]);
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
  const networkMismatch = useWalletStore((s) => s.networkMismatch);
  const reminderMin = useSettingsStore((s) => s.sessionReminderMin);
  const coinBalance = useGameStore((s) => s.coinBalance);
  const session = useSessionStore();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && connectPending) setConnectPending(false);
    if (isAuthenticated && connectOpen) closeAll();
  }, [isAuthenticated, connectPending, connectOpen, setConnectPending, closeAll]);

  // Re-surface the connect sheet with progress or errors after the WalletConnect
  // modal hands back, if the user started connecting from it.
  const connectBusy = connectionStatus === "connecting" || connectionStatus === "authenticating";
  const connectVisible =
    !isAuthenticated && (connectOpen || (connectPending && (connectBusy || !!connectionError || networkMismatch)));

  // Never stack the reality check on top of another sheet; it waits until they close.
  const clock = useSessionClock(reminderMin, iapOpen || cashOutOpen || connectVisible);
  useSessionBaseline(isAuthenticated, clock.restart);

  const keepPlaying = clock.acknowledge;
  const takeBreak = useCallback(() => {
    clock.acknowledge();
    closeAll();
    if (router.canDismiss()) router.dismissAll();
    router.navigate("/");
  }, [clock, closeAll]);

  const closeConnect = useCallback(() => {
    setConnectPending(false);
    closeAll();
  }, [setConnectPending, closeAll]);

  const onPurchased = useCallback((coins: number) => {
    useSessionStore.getState().recordPurchase(coins);
    setToast(coins > 0 ? `${formatCoins(coins)} coins added` : "Coins added");
  }, []);
  const hideToast = useCallback(() => setToast(null), []);

  return (
    <>
      <IAPSheet visible={iapOpen} onClose={closeAll} onPurchased={onPurchased} />
      <CashOutSheet visible={cashOutOpen} onClose={closeAll} />
      <ConnectWalletSheet visible={connectVisible} onClose={closeConnect} />
      <RealityCheckSheet
        visible={clock.due}
        sessionMs={clock.due ? clock.totalActive() : 0}
        net={isAuthenticated ? sessionNet(coinBalance, session) : null}
        onKeepPlaying={keepPlaying}
        onTakeBreak={takeBreak}
      />
      <View pointerEvents="box-none" style={[styles.toastLayer, { top: insets.top }]}>
        <Toast message={toast} tone="success" onHide={hideToast} testID="global-toast" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  toastLayer: { position: "absolute", left: 0, right: 0, height: 96, zIndex: 90 },
});
