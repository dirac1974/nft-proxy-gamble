import { useCallback, useEffect, useRef } from "react";
import { useWalletConnectModal } from "@walletconnect/modal-react-native";
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
  /** Open the WalletConnect modal to initiate connection */
  openModal: () => void;
  /** Disconnect the wallet and clear all session state */
  disconnect: () => Promise<void>;
  /** Manually retry the auth flow (e.g. after fixing network) */
  retryAuth: () => Promise<void>;
  /** Attempt to switch to the required network via wallet prompt */
  switchNetwork: () => Promise<void>;
  /** Formatted address: "0xAbcd…1234" */
  shortAddress: string | null;
  /** Whether a connection + auth operation is in progress */
  isBusy: boolean;
}

export function useWalletConnect(): UseWalletConnectReturn {
  const { address, isConnected, provider, open } = useWalletConnectModal();
  const {
    isAuthenticated,
    connectionStatus,
    networkMismatch,
    disconnect: storeDisconnect,
    setStatus,
    setConnectionError,
    setNetworkMismatch,
  } = useWalletStore();

  // Track the address we last ran auth for so we don't fire twice on re-renders
  const lastAuthAddress = useRef<string | null>(null);

  const runAuth = useCallback(
    async (addr: string, wcProvider: unknown) => {
      if (lastAuthAddress.current === addr) return;
      lastAuthAddress.current = addr;

      setConnectionError(null);
      setStatus("connecting");

      try {
        setWalletClient(wcProvider);

        // Check network before auth
        const onChain = await isOnRequiredNetwork();
        if (!onChain) {
          setNetworkMismatch(true);
          setStatus("connected");
          // Don't throw — just surface the banner; user must switch manually
          return;
        }

        await signAndAuthenticate(addr as Address);
      } catch (err: unknown) {
        lastAuthAddress.current = null; // allow retry
        const message = err instanceof Error ? err.message : "Authentication failed";
        setConnectionError(message);
      }
    },
    [setConnectionError, setNetworkMismatch, setStatus]
  );

  // Run auth when WalletConnect reports a new connection
  useEffect(() => {
    if (isConnected && provider && address && !isAuthenticated) {
      void runAuth(address, provider);
    }
  }, [isConnected, provider, address, isAuthenticated, runAuth]);

  // Clear wallet client on disconnect
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
    await storeDisconnect();
  }, [storeDisconnect]);

  const retryAuth = useCallback(async () => {
    if (!address || !provider) return;
    lastAuthAddress.current = null; // force re-run
    await runAuth(address, provider);
  }, [address, provider, runAuth]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToRequiredNetwork();
      // After switch, retry auth if connected but not authenticated
      if (address && provider && !isAuthenticated) {
        await retryAuth();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Switch to ${CHAIN.name} failed`;
      setConnectionError(message);
    }
  }, [address, provider, isAuthenticated, retryAuth, setConnectionError]);

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const isBusy =
    connectionStatus === "connecting" || connectionStatus === "authenticating";

  return {
    openModal: open,
    disconnect,
    retryAuth,
    switchNetwork,
    shortAddress,
    isBusy,
  };
}
