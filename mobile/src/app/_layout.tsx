// Polyfills first (this module's first line is the @walletconnect/react-native-compat
// import). Importing the AppKit config before anything else guarantees the WalletConnect
// polyfills are installed before React Native initialises.
import { appKit } from "@/config/appKit";

import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { colors } from "@/theme";
import { useWalletStore } from "@/stores/walletStore";
import { AgeGateModal } from "@/components/AgeGateModal";
import { initSounds, unloadSounds } from "@/services/soundService";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 },
  },
});

// appKit is null when createAppKit() failed (see config/appKit.ts). In that case render
// children without the provider so the app still launches — wallet-connect is simply
// unavailable rather than the whole app crashing at startup.
function MaybeAppKitProvider({ children }: { children: React.ReactNode }) {
  if (!appKit) return <>{children}</>;
  return <AppKitProvider instance={appKit}>{children}</AppKitProvider>;
}

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const isAuthenticated = useWalletStore((s) => s.isAuthenticated);
  const ageConfirmed = useWalletStore((s) => s.ageConfirmed);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    initSounds();
    return () => {
      unloadSounds();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MaybeAppKitProvider>
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
            {/* Absolutely-positioned wrapper is the documented Expo Router workaround so
                the AppKit modal renders on Android. box-none lets touches through when closed.
                Only mount <AppKit /> when the provider is present — it throws without it. */}
            {appKit && (
              <View
                style={{ position: "absolute", height: "100%", width: "100%" }}
                pointerEvents="box-none"
              >
                <AppKit />
              </View>
            )}
            <AgeGateModal visible={isAuthenticated && !ageConfirmed} />
          </QueryClientProvider>
        </MaybeAppKitProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
