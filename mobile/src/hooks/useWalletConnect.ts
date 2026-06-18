import { useCallback, useEffect, useRef } from "react";
import { useAppKit, useAccount, useProvider } from "@reown/appkit-react-native";
import { useWalletStore } from "@/stores/walletStore";
import {
  setWalletClient,
  clearWalletClient,
  signAndAuthenticate,
  switchToRequiredNetwork,
  isOnRequiredNetwork,
  CHAIN,
} from "@/services/walletService";
import type { Address } from "viem";

export interface UseWalletConnectReturn {
  openModal: () => void;
  disconnect: () => Promise<void>;
  retryAuth: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  shortAddress: string | null;
  isBusy: boolean;
}

export function useWalletConnect(): UseWalletConnectReturn {
  // Reown AppKit replaces the deprecated @walletconnect/modal-react-native.
  const { open, disconnect: appKitDisconnect } = useAppKit();
  const { address, isConnected } = useAccount();
  const { provider } = useProvider();

  const {
    isAuthenticated,
    connectionStatus,
    disconnect: storeDisconnect,
    setStatus,
    setConnectionError,
    setNetworkMismatch,
  } = useWalletStore();

  const lastAuthAddress = useRef<string | null>(null);

  const runAuth = useCallback(
    async (addr: string, wcProvider: unknown) => {
      if (lastAuthAddress.current === addr) return;
      lastAuthAddress.current = addr;

      setConnectionError(null);
      setStatus("connecting");

      try {
        setWalletClient(wcProvider);

        const onChain = await isOnRequiredNetwork();
        if (!onChain) {
          setNetworkMismatch(true);
          setStatus("connected");
          return;
        }

        await signAndAuthenticate(addr as Address);
      } catch (err: unknown) {
        lastAuthAddress.current = null;
        const message = err instanceof Error ? err.message : "Authentication failed";
        setConnectionError(message);
      }
    },
    [setConnectionError, setNetworkMismatch, setStatus]
  );

  useEffect(() => {
    if (isConnected && provider && address && !isAuthenticated) {
      void runAuth(address, provider);
    }
  }, [isConnected, provider, address, isAuthenticated, runAuth]);

  useEffect(() => {
    if (!isConnected) {
      lastAuthAddress.current = null;
      clearWalletClient();
      setNetworkMismatch(false);
    }
  }, [isConnected, setNetworkMismatch]);

  const disconnect = useCallback(async () => {
    lastAuthAddress.current = null;
    clearWalletClient();
    try {
      await appKitDisconnect();
    } catch {
      // ignore — still clear local session below
    }
    await storeDisconnect();
  }, [appKitDisconnect, storeDisconnect]);

  const retryAuth = useCallback(async () => {
    if (!address || !provider) return;
    lastAuthAddress.current = null;
    await runAuth(address, provider);
  }, [address, provider, runAuth]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToRequiredNetwork();
      if (address && provider && !isAuthenticated) {
        await retryAuth();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Switch to ${CHAIN.name} failed`;
      setConnectionError(message);
    }
  }, [address, provider, isAuthenticated, retryAuth, setConnectionError]);

  const openModal = useCallback(() => {
    open();
  }, [open]);

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const isBusy =
    connectionStatus === "connecting" || connectionStatus === "authenticating";

  return { openModal, disconnect, retryAuth, switchNetwork, shortAddress, isBusy };
}
