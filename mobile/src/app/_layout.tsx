import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WalletConnectModal } from "@walletconnect/modal-react-native";
import { colors } from "@/theme";
import { useWalletStore } from "@/stores/walletStore";
import { AgeGateModal } from "@/components/AgeGateModal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 },
  },
});

// Project ID from WalletConnect Cloud (set via app.config.js extra.walletConnectProjectId)
const PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID ?? "demo_project_id";

const SESSION_PARAMS = {
  namespaces: {
    eip155: {
      methods: ["eth_sign", "personal_sign"],
      chains: ["eip155:80002"], // Polygon Amoy; switch to eip155:137 for mainnet
      events: ["accountsChanged", "chainChanged"],
    },
  },
};

const PROVIDER_METADATA = {
  name: "NFT Proxy Gamble",
  description: "Provably fair video poker on Polygon",
  url: "https://nft-proxy-gamble.app",
  icons: ["https://nft-proxy-gamble.app/icon.png"],
  redirect: { native: "nfpg://", universal: "" },
};

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const ageConfirmed = useWalletStore((s) => s.ageConfirmed);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" backgroundColor={colors.background} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.textPrimary,
              contentStyle: { backgroundColor: colors.background },
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <WalletConnectModal
            projectId={PROJECT_ID}
            sessionParams={SESSION_PARAMS}
            providerMetadata={PROVIDER_METADATA}
          />
          <AgeGateModal visible={isAuthenticated && !ageConfirmed} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
