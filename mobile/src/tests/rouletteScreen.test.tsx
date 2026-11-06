import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@/services/soundService", () => ({
  preloadGroup: jest.fn(() => Promise.resolve()),
  preloadRouletteNumber: jest.fn(() => Promise.resolve()),
  playSound: jest.fn(() => Promise.resolve()),
  playVoice: jest.fn(() => Promise.resolve()),
  playRouletteNumber: jest.fn(() => Promise.resolve()),
  winSoundFor: jest.fn(() => "lose"),
}));
jest.mock("@/services/api", () => ({
  balanceApi: { get: jest.fn(() => Promise.resolve(500)) },
  rouletteApi: {
    startSession: jest.fn(() => Promise.resolve({ sessionId: "s1", gameType: "roulette", serverSeedHash: "0xabc", clientSeed: "c" })),
    spin: jest.fn(),
  },
}));
const auth = { isAuthenticated: true };
jest.mock("@/stores/walletStore", () => ({
  useWalletStore: (sel?: (s: unknown) => unknown) => (sel ? sel(auth) : auth),
}));

import RouletteScreen from "@/app/games/roulette";
import { rouletteApi } from "@/services/api";

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <RouletteScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, qc };
}

describe("Roulette screen", () => {
  it("places merged bets, shows the total on SPIN, and undo/clear work", async () => {
    const { getByTestId, queryByTestId, getByText, unmount, qc } = renderScreen();
    await waitFor(() => expect(rouletteApi.startSession).toHaveBeenCalled());
    // give the board a size
    act(() => {
      fireEvent(getByTestId("roulette-root"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 351, height: 700 } },
      });
    });
    await waitFor(() => expect(queryByTestId("bet-red")).toBeTruthy());
    fireEvent.press(getByTestId("bet-red"));
    fireEvent.press(getByTestId("bet-red"));
    fireEvent.press(getByTestId("bet-number-17"));
    expect(getByText("Spin · 15")).toBeTruthy();
    expect(getByText("2/20 bets")).toBeTruthy();
    fireEvent.press(getByTestId("roulette-undo"));
    expect(getByText("Spin · 10")).toBeTruthy();
    fireEvent.press(getByTestId("roulette-clear"));
    expect(getByText("0/20 bets")).toBeTruthy();
    unmount();
    qc.clear();
  });
});

describe("roulette settle timing", () => {
  it("holds the reveal for the full presentation (and min cycle when restricted)", () => {
    const { rouletteSettleDelay } = require("@/app/games/roulette");
    expect(rouletteSettleDelay(0, 10_000, false)).toBe(1700);
    expect(rouletteSettleDelay(0, 10_000, true)).toBe(900);
    expect(rouletteSettleDelay(10_000, 10_100, true)).toBeGreaterThanOrEqual(900);
  });
});
