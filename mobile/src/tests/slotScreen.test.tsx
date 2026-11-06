import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
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
  playLoop: jest.fn(() => Promise.resolve()),
  stopLoop: jest.fn(() => Promise.resolve()),
  stopSound: jest.fn(() => Promise.resolve()),
  duckLoops: jest.fn(),
}));
jest.mock("@/services/api", () => ({
  balanceApi: { get: jest.fn(() => Promise.resolve(5000)) },
  request: jest.fn(),
  extractVerifiedBalance: jest.fn(),
}));
jest.mock("@/services/slotApi", () => {
  const actual = jest.requireActual("@/services/slotApi");
  return {
    ...actual,
    slotApi: {
      startSession: jest.fn(() => Promise.resolve({ sessionId: "s1", gameType: "slots-lantern-night-1-0", serverSeedHash: "0xabc", clientSeed: "c" })),
      paytable: jest.fn(() => Promise.resolve(actual.FALLBACK_PAYTABLE)),
      spin: jest.fn(),
      feature: jest.fn(),
    },
  };
});
const auth = { isAuthenticated: true };
jest.mock("@/stores/walletStore", () => ({
  useWalletStore: (sel?: (s: unknown) => unknown) => (sel ? sel(auth) : auth),
}));

import SlotScreen from "@/app/games/slot";
import { FEATURE_OPTIONS, gridFromStops } from "@/components/slot/slotMath";
import { slotApi } from "@/services/slotApi";

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <SlotScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, qc };
}

describe("Slot screen", () => {
  afterEach(() => {
    auth.isAuthenticated = true;
  });

  it("shows the connect EmptyState when not connected", () => {
    auth.isAuthenticated = false;
    const { getByTestId, getByText, unmount, qc } = renderScreen();
    expect(getByText("Connect to play")).toBeTruthy();
    expect(getByTestId("slot-connect")).toBeTruthy();
    expect(slotApi.startSession).not.toHaveBeenCalled();
    unmount();
    qc.clear();
  });

  it("bet stepper walks the bet ladder and stops at both ends", async () => {
    const { getByTestId, unmount, qc } = renderScreen();
    await waitFor(() => expect(slotApi.startSession).toHaveBeenCalled());
    const value = () => getByTestId("slot-bet-value").props.children;
    expect(value()).toBe("25");
    expect(getByTestId("slot-bet-minus").props.accessibilityState.disabled).toBe(true);
    const seen = [value()];
    for (let i = 0; i < 6; i++) {
      fireEvent.press(getByTestId("slot-bet-plus"));
      seen.push(value());
    }
    expect(seen).toEqual(["25", "50", "125", "250", "500", "500", "500"]);
    expect(getByTestId("slot-bet-plus").props.accessibilityState.disabled).toBe(true);
    expect(getByTestId("slot-bet-total").props.children).toBe("500");
    fireEvent.press(getByTestId("slot-bet-minus"));
    expect(value()).toBe("250");
    unmount();
    qc.clear();
  });

  it("never prefetches a new session while a feature is pending (start-session would auto-resolve it)", async () => {
    const stops = [0, 0, 0, 0, 0];
    const spin = (nonce: number) => ({
      nonce,
      stops,
      grid: gridFromStops(stops),
      multiplier: nonce > 0 ? 3 : null,
      wins: [],
      scatter: { count: nonce ? 0 : 3, payout: 0, positions: [] },
      anticipation: null,
      retrigger: null,
    });
    (slotApi.startSession as jest.Mock).mockClear();
    (slotApi.spin as jest.Mock).mockResolvedValueOnce({
      sessionId: "s1",
      betLevel: 1,
      spin: spin(0),
      totalWagered: 25,
      totalReturn: 0,
      feature: { triggered: true, scatterCount: 3, options: FEATURE_OPTIONS.map((o) => ({ ...o })) },
      serverSeed: null,
      serverSeedHash: "0xabc",
      clientSeed: "c",
      newBalance: 4975,
    });
    let resolveFeature: (v: unknown) => void = () => undefined;
    (slotApi.feature as jest.Mock).mockImplementationOnce(() => new Promise((r) => (resolveFeature = r)));

    const { getByTestId, findByTestId, unmount, qc } = renderScreen();
    await waitFor(() => expect(slotApi.startSession).toHaveBeenCalledTimes(1));
    fireEvent(getByTestId("slot-root"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 359, height: 700 } } });
    await waitFor(() => expect(getByTestId("slot-spin").props.accessibilityState?.disabled).not.toBe(true));
    fireEvent.press(getByTestId("slot-spin"));
    await waitFor(() => expect(slotApi.spin).toHaveBeenCalledWith("s1", 1));

    // Trigger → intro → picker; still exactly one start-session.
    const pick = await findByTestId("slot-option-ruby", {}, { timeout: 10000 });
    expect(slotApi.startSession).toHaveBeenCalledTimes(1);
    fireEvent.press(pick);
    await waitFor(() => expect(slotApi.feature).toHaveBeenCalledWith("s1", "ruby"));
    await new Promise((r) => setTimeout(r, 300));
    expect(slotApi.startSession).toHaveBeenCalledTimes(1); // /feature in flight

    resolveFeature({
      spins: [spin(1)],
      feature: { option: "ruby", awarded: 15, retriggers: 0, played: 1, totalWin: 0, capped: false },
      totalReturn: 0,
      totalWagered: 25,
      serverSeed: "seed",
      serverSeedHash: "0xabc",
      clientSeed: "c",
      newBalance: 4975,
    });
    // Next commit only after the round fully completes.
    await waitFor(() => expect(slotApi.startSession).toHaveBeenCalledTimes(2), { timeout: 10000 });
    unmount();
    qc.clear();
  }, 30000);
});
