import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
const params: { mode?: string } = {};
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => params,
}));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@/services/soundService", () => ({
  playSound: jest.fn(() => Promise.resolve()),
  winSoundFor: jest.fn(() => "lose"),
}));
jest.mock("@/services/api", () => ({
  balanceApi: { get: jest.fn(() => Promise.resolve(1000)) },
}));
jest.mock("@/services/kenoApi", () => ({
  kenoApi: {
    startSession: jest.fn(() =>
      Promise.resolve({ sessionId: "k1", gameType: "keno-80-20-1-0", serverSeedHash: "0xabc", clientSeed: "c" }),
    ),
    play: jest.fn(),
  },
}));
const auth = { isAuthenticated: true };
jest.mock("@/stores/walletStore", () => ({
  useWalletStore: (sel?: (s: unknown) => unknown) => (sel ? sel(auth) : auth),
}));

import KenoScreen from "@/app/games/keno";
import { kenoApi } from "@/services/kenoApi";
import { hashServerSeed } from "@/services/provablyFair";
import { useSettingsStore } from "@/stores/settingsStore";

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <KenoScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, qc };
}

jest.setTimeout(60000);

afterEach(() => {
  auth.isAuthenticated = true;
  delete params.mode;
});

describe("Keno screen", () => {
  it("shows the connect EmptyState when not connected", () => {
    auth.isAuthenticated = false;
    const { getByTestId, getByText, unmount, qc } = renderScreen();
    expect(getByTestId("keno-locked")).toBeTruthy();
    expect(getByText("Connect to play")).toBeTruthy();
    expect(getByTestId("keno-connect")).toBeTruthy();
    unmount();
    qc.clear();
  });

  it("marks numbers, caps at 10 spots and shows the PLAY total (single)", async () => {
    const { getByTestId, getByText, queryByTestId, unmount, qc } = renderScreen();
    await waitFor(() => expect(kenoApi.startSession).toHaveBeenCalledWith("single"));
    if (queryByTestId("keno-coach-skip")) fireEvent.press(getByTestId("keno-coach-skip"));
    expect(getByText("Pick numbers")).toBeTruthy();
    fireEvent.press(getByTestId("keno-cell-17"));
    fireEvent.press(getByTestId("keno-cell-42"));
    expect(getByText("PLAY · 20")).toBeTruthy();
    expect(getByTestId("keno-cell-17").props.accessibilityLabel).toBe("17, marked");
    fireEvent.press(getByTestId("keno-cell-42"));
    expect(getByTestId("keno-cell-42").props.accessibilityLabel).toBe("42");
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) fireEvent.press(getByTestId(`keno-cell-${n}`));
    expect(getByText("Max 10 spots per card")).toBeTruthy();
    expect(getByTestId("keno-cell-9").props.accessibilityLabel).toBe("9, marked");
    expect(getByTestId("keno-cell-10").props.accessibilityLabel).toBe("10");
    unmount();
    qc.clear();
  });

  it("totals played cards in quad mode and blocks identical cards", async () => {
    params.mode = "quad";
    const { getByTestId, getByText, queryByTestId, unmount, qc } = renderScreen();
    await waitFor(() => expect(kenoApi.startSession).toHaveBeenCalledWith("quad"));
    if (queryByTestId("keno-coach-skip")) fireEvent.press(getByTestId("keno-coach-skip"));
    fireEvent.press(getByTestId("keno-cell-5"));
    act(() => fireEvent.press(getByTestId("keno-tab-B")));
    fireEvent.press(getByTestId("keno-cell-6"));
    act(() => fireEvent.press(getByTestId("keno-tab-C")));
    fireEvent.press(getByTestId("keno-cell-7"));
    expect(getByText("PLAY · 3×20 = 60")).toBeTruthy();
    expect(getByTestId("keno-cell-6").props.accessibilityLabel).toBe("6, marked card B");
    fireEvent.press(getByTestId("keno-cell-7"));
    fireEvent.press(getByTestId("keno-cell-5"));
    expect(getByText("Cards A & C match")).toBeTruthy();
    unmount();
    qc.clear();
  });

  it("plays, animates instantly under reduceMotion and settles with neutral push copy", async () => {
    useSettingsStore.setState({ reduceMotion: true });
    const seed = "a".repeat(64);
    const drawn = [51, 15, 17, 37, 65, 57, 78, 8, 4, 16, 41, 79, 36, 56, 23, 21, 73, 35, 71, 43];
    (kenoApi.play as jest.Mock).mockResolvedValueOnce({
      drawn,
      results: [{ cardIndex: 0, spots: [1, 2, 15, 51], hits: [15, 51], catches: 2, multiplier: 1, bet: 20, payout: 20 }],
      totalWagered: 20,
      totalReturn: 20,
      netProfit: 0,
      capped: false,
      serverSeed: seed,
      serverSeedHash: hashServerSeed(seed),
      clientSeed: "client",
      nonce: 0,
      newBalance: 1000,
    });
    const { getByTestId, getByText, queryByTestId, findByText, unmount, qc } = renderScreen();
    await waitFor(() => expect(kenoApi.startSession).toHaveBeenCalled());
    if (queryByTestId("keno-coach-skip")) fireEvent.press(getByTestId("keno-coach-skip"));
    await waitFor(() => expect(getByTestId("balance-amount").props.children).toBe("1,000"));
    for (const n of [1, 2, 15, 51]) fireEvent.press(getByTestId(`keno-cell-${n}`));
    await act(async () => {
      fireEvent.press(getByText("PLAY · 20"));
    });
    expect(kenoApi.play).toHaveBeenCalledWith("k1", [{ spots: [1, 2, 15, 51], bet: 20 }]);
    expect(await findByText("Bet returned", {}, { timeout: 3000 })).toBeTruthy();
    expect(getByText("Catch 2 of 4 · pays 20")).toBeTruthy();
    expect(getByText("Fair draw ✓")).toBeTruthy();
    expect(getByTestId("keno-cell-51").props.accessibilityLabel).toBe("51, marked, drawn, hit");
    expect(getByTestId("keno-cell-17").props.accessibilityLabel).toBe("17, drawn");
    unmount();
    qc.clear();
    useSettingsStore.setState({ reduceMotion: false });
  });
});
