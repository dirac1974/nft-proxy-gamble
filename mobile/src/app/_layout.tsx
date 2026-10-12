// MUST be the very first import — installs URL, crypto, AsyncStorage, btoa/atob
// polyfills that the WalletConnect modal's native side reaches for at init.
// Without this, iOS throws an uncaught NSException → abort() within ~1s of launch.
import "@walletconnect/react-native-compat";
import React, { useEffect } from "react";
import { AppState, LogBox, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Cinzel_700Bold, Cinzel_900Black } from "@expo-google-fonts/cinzel";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WalletConnectModal } from "@walletconnect/modal-react-native";
import { colors } from "@/theme";
import { useWalletStore } from "@/stores/walletStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { initSounds } from "@/services/soundService";
import { FirstRunFlow } from "@/components/FirstRunFlow";
import { GlobalSheets } from "@/components/GlobalSheets";
import { AgeGateModal } from "@/components/AgeGateModal";
import { NetworkBanner } from "@/components/NetworkBanner";
import { BRAND } from "@/config/brand";
import { E2E_WALLET_ENABLED } from "@/services/walletService";

SplashScreen.preventAutoHideAsync().catch(() => null);
// Debug E2E runs only: dev warning toasts would cover on-screen controls.
if (E2E_WALLET_ENABLED) LogBox.ignoreAllLogs(true);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 },
  },
});
// Balance is money: never serve it from cache, and refetch when the app returns to the foreground.
queryClient.setQueryDefaults(["balance"], { staleTime: 0, refetchOnWindowFocus: true });
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => sub.remove();
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
  name: BRAND.name,
  description: BRAND.tagline,
  url: "https://nft-proxy-gamble.app",
  icons: ["https://nft-proxy-gamble.app/icon.png"],
  redirect: { native: "nfpg://", universal: "" },
};

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const ageConfirmed = useWalletStore((s) => s.ageConfirmed);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);

  const [fontsLoaded, fontError] = useFonts({
    Cinzel_700Bold,
    Cinzel_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const ready = (fontsLoaded || !!fontError) && settingsHydrated;

  useEffect(() => {
    hydrate();
    void hydrateSettings();
    void initSounds();
  }, [hydrate, hydrateSettings]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => null);
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

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
            <Stack.Screen name="games/video-poker" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="games/blackjack" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="games/roulette" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="games/keno" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="games/slot" options={{ animation: "slide_from_right" }} />
          </Stack>
          <NetworkBanner />
          <WalletConnectModal
            projectId={PROJECT_ID}
            sessionParams={SESSION_PARAMS}
            providerMetadata={PROVIDER_METADATA}
          />
          <AgeGateModal visible={isAuthenticated && !ageConfirmed} />
          <GlobalSheets />
          <FirstRunFlow />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
