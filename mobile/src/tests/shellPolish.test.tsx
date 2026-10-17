import React from "react";
import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
}));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@/services/soundService", () => ({ playSound: jest.fn(() => Promise.resolve()) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
const mockSwitchNetwork = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({
    openModal: jest.fn(),
    disconnect: jest.fn(),
    retryAuth: jest.fn(),
    switchNetwork: mockSwitchNetwork,
    shortAddress: null,
    isBusy: false,
  }),
}));
jest.mock("@/services/walletService", () => ({
  CHAIN: { id: 80002, name: "Polygon Amoy" },
  E2E_WALLET_ENABLED: false,
  connectE2EWallet: jest.fn(),
  setWalletClient: jest.fn(),
  clearWalletClient: jest.fn(),
  signAndAuthenticate: jest.fn(),
  switchToRequiredNetwork: jest.fn(),
  isOnRequiredNetwork: jest.fn(),
}));

import { Button } from "@/components/ui/Button";
import { BalancePill } from "@/components/ui/BalancePill";
import { GameHeader } from "@/components/ui/GameHeader";
import { BalanceHero } from "@/components/wallet/BalanceHero";
import { ConnectWalletSheet, isWrongNetwork } from "@/components/ConnectWalletSheet";
import { RealityCheckSheet, formatNet } from "@/components/shell/RealityCheckSheet";
import { formatDuration, sessionNet, useSessionStore } from "@/components/shell/sessionStore";
import { migrateSettings } from "@/stores/settingsStore";
import { useWalletStore } from "@/stores/walletStore";

const metrics = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe("Button disabled look", () => {
  it.each(["primary", "danger", "felt"] as const)("%s uses a solid surface instead of fading", (variant) => {
    wrap(<Button label="Go" variant={variant} disabled testID="b" />);
    const btn = screen.getByTestId("b");
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
    const inner = screen.getByText("Go");
    expect(StyleSheet.flatten(inner.props.style).color).toBe("#6B7387");
    // No opacity fade on the outer wrapper.
    const flat = JSON.stringify(screen.toJSON());
    expect(flat).toContain("rgba(233,196,106,0.25)");
    expect(flat).not.toContain('"opacity":0.4');
  });
});

describe("BalancePill", () => {
  it("+ button meets the 48dp target (32 + 2x10 slop)", () => {
    wrap(<BalancePill amount={1234} onAdd={jest.fn()} />);
    const add = screen.getByTestId("buy-coins-button");
    const style = StyleSheet.flatten(add.props.style);
    expect(style.width).toBe(32);
    expect(add.props.hitSlop).toBe(10);
  });

  it("GameHeader renders a compact pill and auto-fits the title", () => {
    wrap(<GameHeader title="European Roulette" subtitle="Single zero" balance={500} onAddCoins={jest.fn()} />);
    const title = screen.getByTestId("game-title");
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    expect(title.props.minimumFontScale).toBe(0.7);
    expect(title.props.numberOfLines).toBe(1);
    expect(screen.getByText("Single zero")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("balance-amount").props.style).fontSize).toBe(13);
  });
});

describe("BalanceHero low balance", () => {
  it("makes Buy coins primary and disables Cash out under 100 coins", () => {
    const onCashOut = jest.fn();
    wrap(<BalanceHero balance={40} onCashOut={onCashOut} onBuy={jest.fn()} />);
    expect(screen.getByTestId("cashout-button").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/Cash out from 100 coins \(\$1/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("cashout-button"));
    expect(onCashOut).not.toHaveBeenCalled();
  });

  it("enables Cash out from 100 coins", () => {
    wrap(<BalanceHero balance={100} onCashOut={jest.fn()} onBuy={jest.fn()} />);
    expect(screen.getByTestId("cashout-button").props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByTestId("cashout-min-helper")).toBeNull();
  });
});

describe("ConnectWalletSheet wrong network", () => {
  beforeEach(() => {
    mockSwitchNetwork.mockClear();
    useWalletStore.setState({ connectionStatus: "connected", connectionError: null, networkMismatch: true, isAuthenticated: false });
  });

  it("detects wrong network from flag or error", () => {
    expect(isWrongNetwork(true, null)).toBe(true);
    expect(isWrongNetwork(false, "Wrong network")).toBe(true);
    expect(isWrongNetwork(false, "User rejected")).toBe(false);
  });

  it("offers an in-sheet switch button that calls switchNetwork", async () => {
    wrap(<ConnectWalletSheet visible onClose={jest.fn()} />);
    expect(screen.queryByText(/banner/i)).toBeNull();
    const btn = screen.getByTestId("connect-switch-network");
    expect(screen.getByText("Switch to Polygon Amoy")).toBeTruthy();
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(mockSwitchNetwork).toHaveBeenCalledTimes(1);
  });
});

describe("session store + reality check", () => {
  beforeEach(() => useSessionStore.getState().reset());

  it("net excludes purchases and adds back cash-outs", () => {
    const s = useSessionStore.getState();
    s.observeBalance(1000);
    s.observeBalance(5000); // baseline only taken once
    s.recordPurchase(500);
    s.recordCashOut(200);
    const st = useSessionStore.getState();
    // 1000 start, +500 bought, lost 300 playing, cashed out 200 → 1000
    expect(sessionNet(1000, st)).toBe(-300);
  });

  it("net is unknown before a baseline exists", () => {
    expect(sessionNet(100, useSessionStore.getState())).toBeNull();
  });

  it("formats duration and net", () => {
    expect(formatDuration(31 * 60_000)).toBe("31 min");
    expect(formatDuration(90 * 60_000)).toBe("1 h 30 min");
    expect(formatNet(-250)).toMatch(/^−250 coins/);
    expect(formatNet(0)).toBe("Even");
  });

  it("sheet shows time, net and both actions", () => {
    const keep = jest.fn();
    const brk = jest.fn();
    wrap(<RealityCheckSheet visible sessionMs={30 * 60_000} net={-120} onKeepPlaying={keep} onTakeBreak={brk} />);
    expect(screen.getByText("30 min")).toBeTruthy();
    expect(screen.getByTestId("reality-check-net")).toBeTruthy();
    fireEvent.press(screen.getByTestId("reality-keep-playing"));
    fireEvent.press(screen.getByTestId("reality-take-break"));
    expect(keep).toHaveBeenCalled();
    expect(brk).toHaveBeenCalled();
  });

  it("omits net when unknown", () => {
    wrap(<RealityCheckSheet visible sessionMs={0} net={null} onKeepPlaying={jest.fn()} onTakeBreak={jest.fn()} />);
    expect(screen.queryByTestId("reality-check-net")).toBeNull();
  });
});

describe("settings migration", () => {
  it("defaults new installs to 30 min", () => {
    expect(migrateSettings({}).sessionReminderMin).toBe(30);
  });
  it("moves the untouched legacy 60 default to 30", () => {
    expect(migrateSettings({ sessionReminderMin: 60 }).sessionReminderMin).toBe(30);
  });
  it("keeps a legacy non-default choice", () => {
    const m = migrateSettings({ sessionReminderMin: 120 });
    expect(m.sessionReminderMin).toBe(120);
    expect(m.sessionReminderCustom).toBe(true);
  });
  it("keeps an explicit choice of 60", () => {
    expect(migrateSettings({ sessionReminderMin: 60, sessionReminderCustom: true }).sessionReminderMin).toBe(60);
  });
  it("keeps Off", () => {
    expect(migrateSettings({ sessionReminderMin: 0 }).sessionReminderMin).toBe(0);
  });
});
