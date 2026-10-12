import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BlackjackScreen from "@/app/games/blackjack";
import { useWalletStore } from "@/stores/walletStore";
import { useUiStore } from "@/stores/uiStore";
import { blackjackApi } from "@/services/api";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("@/services/soundService", () => ({
  playSound: jest.fn(() => Promise.resolve()),
  playVoice: jest.fn(() => Promise.resolve()),
  winSoundFor: jest.fn(() => "win_small"),
}));
jest.mock("@/services/api", () => ({
  balanceApi: { get: jest.fn(() => Promise.resolve(1000)) },
  blackjackApi: {
    startSession: jest.fn(() =>
      Promise.resolve({
        sessionId: "s1",
        gameType: "blackjack-6deck-h17-1-0",
        serverSeedHash: "0xhash",
        clientSeed: "cli",
        numDecks: 6,
        dealerHitsSoft17: true,
      }),
    ),
    deal: jest.fn(),
    action: jest.fn(),
    insurance: jest.fn(),
  },
}));

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <BlackjackScreen />
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

describe("BlackjackScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("asks a signed-out player to connect a wallet", () => {
    useWalletStore.setState({ isAuthenticated: false });
    const openConnect = jest.fn();
    useUiStore.setState({ openConnect });
    const { getByText, getByTestId } = renderScreen();
    expect(getByText("Connect your wallet to start playing")).toBeTruthy();
    fireEvent.press(getByTestId("bj-connect"));
    expect(openConnect).toHaveBeenCalled();
  });

  it("adds chips to the bet, doubles, clears, and deals the bet", async () => {
    useWalletStore.setState({ isAuthenticated: true });
    (blackjackApi.deal as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { getByTestId, findByText, findByLabelText } = renderScreen();
    await findByLabelText("Balance 1,000 coins");
    await waitFor(() => expect(blackjackApi.startSession).toHaveBeenCalledTimes(1));

    fireEvent.press(getByTestId("chip-25"));
    fireEvent.press(getByTestId("chip-5"));
    expect(getByTestId("bj-bet-amount").props.children).toBe("30");
    fireEvent.press(getByTestId("bj-2x"));
    expect(getByTestId("bj-bet-amount").props.children).toBe("60");
    fireEvent.press(getByTestId("bj-clear"));
    fireEvent.press(getByTestId("chip-100"));

    await act(async () => {
      fireEvent.press(getByTestId("bj-deal"));
    });
    expect(blackjackApi.deal).toHaveBeenCalledWith("s1", 100);
  });

  it("refuses a bet above the 500 table maximum", async () => {
    useWalletStore.setState({ isAuthenticated: true });
    const { getByTestId, findByText, findByLabelText } = renderScreen();
    await findByLabelText("Balance 1,000 coins");
    fireEvent.press(getByTestId("chip-250"));
    fireEvent.press(getByTestId("chip-250"));
    fireEvent.press(getByTestId("chip-5"));
    expect(getByTestId("bj-bet-amount").props.children).toBe("500");
    expect(await findByText(/table maximum is 500/)).toBeTruthy();
  });
});

describe("Blackjack table polish", () => {
  const { fitOnArc, TablePrint } = require("@/components/blackjack/TablePrint");
  const { ActionBar } = require("@/components/blackjack/ActionBar");
  const { blackjackCardWidth } = require("@/app/games/blackjack");

  it("fits felt text inside its arc and centres it with a px offset", () => {
    const f = fitOnArc(49, 290, 10, 1.8);
    expect(f.length).toBeLessThanOrEqual(290 * 0.9 + 0.001);
    expect(f.fontSize).toBeLessThan(10);
    expect(f.startOffset).toBeCloseTo((290 - f.length) / 2);
    const roomy = fitOnArc(10, 400, 15, 2, 120);
    expect(roomy.fontSize).toBe(15);
    expect(roomy.length).toBe(120);
    expect(roomy.startOffset).toBe(140);
  });

  it("prints every regulatory string in full", () => {
    const { getByTestId } = render(<TablePrint width={360} dealerHitsSoft17 />);
    expect(getByTestId("bj-table-print").props.accessibilityLabel).toBe(
      "blackjack pays 3 to 2. dealer must hit soft 17. insurance pays 2 to 1",
    );
  });

  it("scales cards with table height, clamped", () => {
    expect(blackjackCardWidth(null, false)).toBe(64);
    expect(blackjackCardWidth(580, false)).toBeGreaterThanOrEqual(80);
    expect(blackjackCardWidth(2000, false)).toBe(88);
    expect(blackjackCardWidth(300, true)).toBe(52);
  });

  it("action bar keeps full labels and the +bet sublabel", () => {
    const onAction = jest.fn();
    const { getByText, getAllByText, getByTestId } = render(
      <ActionBar legal={["hit", "stand", "double"]} enabled extraCost={25} balance={100} onAction={onAction} />,
    );
    expect(getByText("STAND")).toBeTruthy();
    expect(getByText("DOUBLE")).toBeTruthy();
    expect(getAllByText("+25")).toHaveLength(2);
    fireEvent.press(getByTestId("bj-double"));
    expect(onAction).toHaveBeenCalledWith("double");
    fireEvent.press(getByTestId("bj-split"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
