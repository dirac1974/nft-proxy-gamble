import React from "react";
import { render, fireEvent, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("@/services/soundService", () => ({
  playSound: jest.fn(),
  initSounds: jest.fn(),
  unloadSounds: jest.fn(),
}));
jest.mock("@/services/api", () => ({
  gameApi: {
    startSession: jest.fn(),
    deal: jest.fn(),
    draw: jest.fn(),
    cashout: jest.fn(),
  },
}));
// ProvablyFairModal pulls in heavier services; stub it (not under test here).
jest.mock("@/components/ProvablyFairModal", () => ({ ProvablyFairModal: () => null }));

import VideoPokerScreen from "@/app/(tabs)/play";
import { gameApi } from "@/services/api";
import { playSound } from "@/services/soundService";
import { useGameStore } from "@/stores/gameStore";
import { useWalletStore } from "@/stores/walletStore";

const SESSION = { sessionId: "s1", serverSeedHash: "h", clientSeed: "c", betAmount: 1 };
const DEALT = { dealtCards: [0, 1, 2, 3, 4], holds: [false, false, false, false, false] };

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VideoPokerScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useWalletStore.setState({ isAuthenticated: true });
  useGameStore.getState().reset();
  useGameStore.setState({ coinBalance: 100 });
});

describe("VideoPokerScreen — classic cabinet", () => {
  it("idle: shows NEW GAME and five face-down backs", () => {
    const { getByText, getAllByTestId } = renderScreen();
    expect(getByText("NEW GAME")).toBeTruthy();
    expect(getAllByTestId(/^card-back-/).length).toBe(5);
  });

  it("matches snapshot in idle phase", () => {
    expect(renderScreen().toJSON()).toMatchSnapshot();
  });

  it("paytable: Royal pays 4000 in the 5-coin column, JoB pays per-coin", () => {
    useGameStore.setState({ betAmount: 5 });
    const { getByTestId } = renderScreen();
    expect(within(getByTestId("payrow-ROYAL_FLUSH")).getByText("4000")).toBeTruthy();
    // Jacks or Better per-coin column: the 5-coin column reads 5.
    expect(within(getByTestId("payrow-JACKS_OR_BETTER")).getByText("5")).toBeTruthy();
  });

  it("dealt: renders five cards, hold hint, and tapping a card holds it + plays hold sound", () => {
    useGameStore.setState({ phase: "dealt", session: SESSION, dealt: { ...DEALT } });
    const { getByText, getByTestId } = renderScreen();
    expect(getByText("DRAW")).toBeTruthy();
    expect(getByText("Tap cards to HOLD")).toBeTruthy();
    fireEvent.press(getByTestId("card-0"));
    expect(useGameStore.getState().dealt?.holds[0]).toBe(true);
    expect(playSound).toHaveBeenCalledWith("hold");
  });

  it("deal: DEAL action sets five cards and plays the deal sound", async () => {
    (gameApi.deal as jest.Mock).mockResolvedValue({ dealtCards: [10, 11, 12, 13, 14] });
    useGameStore.setState({ phase: "session_started", session: SESSION });
    const { getByText, getAllByTestId } = renderScreen();
    fireEvent.press(getByText("DEAL"));
    await waitFor(() => expect(getAllByTestId(/^card-\d$/).length).toBe(5));
    expect(playSound).toHaveBeenCalledWith("deal");
  });

  it("premium win (Four of a Kind): shows WinOverlay, plays bigWin, rolls the meter up to final", async () => {
    (gameApi.draw as jest.Mock).mockResolvedValue({
      drawnCards: [0, 13, 26, 39, 1], rank: "FOUR_OF_A_KIND", payout: 25, serverSeed: "ss", newBalance: 125,
    });
    useGameStore.setState({ phase: "dealt", session: SESSION, dealt: { ...DEALT }, coinBalance: 100 });
    const { getByText, getByTestId } = renderScreen();
    fireEvent.press(getByText("DRAW"));
    await waitFor(() => expect(getByText("+25 coins")).toBeTruthy()); // overlay
    expect(playSound).toHaveBeenCalledWith("bigWin");
    await waitFor(() => expect(getByTestId("meter-credits").props.children).toBe("125"), { timeout: 3000 });
  });

  it("small win (Jacks or Better): no overlay, plays win sound", async () => {
    (gameApi.draw as jest.Mock).mockResolvedValue({
      drawnCards: [9, 22, 35, 48, 0], rank: "JACKS_OR_BETTER", payout: 1, serverSeed: "ss", newBalance: 101,
    });
    useGameStore.setState({ phase: "dealt", session: SESSION, dealt: { ...DEALT }, coinBalance: 100 });
    const { getByText, queryByText } = renderScreen();
    fireEvent.press(getByText("DRAW"));
    await waitFor(() => expect(playSound).toHaveBeenCalledWith("win"));
    expect(queryByText(/\+\d+ coins/)).toBeNull(); // no WinOverlay
  });

  it("losing draw: plays lose sound, no overlay", async () => {
    (gameApi.draw as jest.Mock).mockResolvedValue({
      drawnCards: [0, 2, 4, 6, 8], rank: "LOSE", payout: 0, serverSeed: "ss", newBalance: 100,
    });
    useGameStore.setState({ phase: "dealt", session: SESSION, dealt: { ...DEALT }, coinBalance: 100 });
    const { getByText, queryByText } = renderScreen();
    fireEvent.press(getByText("DRAW"));
    await waitFor(() => expect(playSound).toHaveBeenCalledWith("lose"));
    expect(queryByText(/\+\d+ coins/)).toBeNull();
  });
});
