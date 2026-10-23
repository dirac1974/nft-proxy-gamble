import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@/services/soundService", () => ({ playSound: jest.fn(() => Promise.resolve()) }));
jest.mock("@/services/iapService", () => ({ purchaseProduct: jest.fn(() => Promise.resolve()) }));
const mockAuth = { isAuthenticated: true, jwtToken: "jwt", disconnect: jest.fn() };
jest.mock("@/stores/walletStore", () => {
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(mockAuth) : mockAuth);
  hook.getState = () => mockAuth;
  return { useWalletStore: hook };
});
jest.mock("@/services/api", () => ({
  ...jest.requireActual("@/services/api"),
  rgApi: { get: jest.fn(), setLimits: jest.fn(), coolOff: jest.fn(), selfExclude: jest.fn() },
}));

import { router } from "expo-router";
import { rgApi, type RgStatus } from "@/services/api";
import * as realApi from "@/services/api";
import { ResponsibleGamingSection, pendingNote } from "@/components/shell/ResponsibleGamingSection";
import { IAPSheet } from "@/components/IAPSheet";
import { rgBlockFromError, rgMessage, rgTitle } from "@/components/shell/RgBlockNotice";

const rg = rgApi as jest.Mocked<typeof rgApi>;

function status(over: Partial<RgStatus> = {}): RgStatus {
  return {
    limits: { dailyDepositLimitCoins: null, dailyLossLimitCoins: null },
    pending: null,
    coolOffUntil: null,
    selfExcludedUntil: null,
    selfExclusionPermanent: false,
    today: { depositsCoins: 0, netLossCoins: 0, resetsAt: "2026-10-13T00:00:00.000Z" },
    options: { coolOffHours: [24, 72, 168, 720], selfExcludeMonths: [6, 12, 60] },
    ...over,
  };
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.isAuthenticated = true;
});

describe("rgMessage / rgBlockFromError", () => {
  it("maps RG error codes and ignores others", () => {
    const e = Object.assign(new Error("x"), { code: "RG_COOL_OFF", until: "2026-10-15T10:00:00.000Z" });
    expect(rgBlockFromError(e)).toEqual({ code: "RG_COOL_OFF", until: "2026-10-15T10:00:00.000Z" });
    expect(rgBlockFromError(Object.assign(new Error("x"), { code: "OTHER" }))).toBeNull();
    expect(rgBlockFromError(new Error("plain"))).toBeNull();
  });

  it("writes calm copy that always mentions cash-out for breaks/exclusion", () => {
    expect(rgTitle("RG_LOSS_LIMIT")).toBe("Daily loss limit reached");
    expect(rgMessage("RG_COOL_OFF", "2026-10-15T10:00:00.000Z")).toMatch(/paused until .+cash out/);
    expect(rgMessage("RG_SELF_EXCLUDED", "9999-12-31T00:00:00.000Z")).toMatch(/permanently closed/);
    expect(rgMessage("RG_SELF_EXCLUDED", "2027-04-12T00:00:00.000Z")).toMatch(/closed until .*2027/);
    expect(rgMessage("RG_LOSS_LIMIT")).toMatch(/tomorrow.*in progress can still be finished/);
    expect(rgMessage("RG_DEPOSIT_LIMIT", "2026-10-13T00:00:00.000Z")).toMatch(/deposit limit/);
  });
});

describe("api request errors carry RG fields", () => {
  it("attaches status/code/until without changing the message", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "You're taking a break.", code: "RG_COOL_OFF", until: "2026-10-15T10:00:00.000Z" }),
      }),
    );
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    await expect(realApi.request("/roulette/start-session", { method: "POST" })).rejects.toMatchObject({
      message: "You're taking a break.",
      status: 403,
      code: "RG_COOL_OFF",
      until: "2026-10-15T10:00:00.000Z",
    });
  });
});

describe("ResponsibleGamingSection", () => {
  it("shows a connect prompt and does not fetch when signed out", () => {
    mockAuth.isAuthenticated = false;
    wrap(<ResponsibleGamingSection />);
    expect(screen.getByTestId("rg-limits-signed-out")).toBeTruthy();
    expect(screen.queryByTestId("rg-limits-placeholder")).toBeNull();
    expect(rg.get).not.toHaveBeenCalled();
  });

  it("renders limits, a pending increase with its effective time, and today's totals", async () => {
    rg.get.mockResolvedValue(
      status({
        limits: { dailyDepositLimitCoins: 500, dailyLossLimitCoins: 200 },
        pending: { dailyLossLimitCoins: 1000, effectiveAt: "2026-10-13T15:30:00.000Z" },
        today: { depositsCoins: 100, netLossCoins: 40, resetsAt: "2026-10-13T00:00:00.000Z" },
      }),
    );
    wrap(<ResponsibleGamingSection />);
    expect(await screen.findByText("500 coins")).toBeTruthy();
    expect(screen.getByText("200 coins")).toBeTruthy();
    expect(screen.getByText(/Change to 1,000 · Takes effect/)).toBeTruthy();
    expect(screen.getByTestId("rg-today")).toBeTruthy();
    expect(screen.getByText(/100 coins bought · 40 net loss/)).toBeTruthy();
  });

  it("pendingNote handles removal and unrelated limits", () => {
    const s = status({ pending: { dailyDepositLimitCoins: null, effectiveAt: "2026-10-13T15:30:00.000Z" } });
    expect(pendingNote(s, "dailyDepositLimitCoins")).toMatch(/^Removal · Takes effect/);
    expect(pendingNote(s, "dailyLossLimitCoins")).toBeNull();
  });

  it("saves a deposit limit and confirms a queued increase with its time", async () => {
    rg.get.mockResolvedValue(status({ limits: { dailyDepositLimitCoins: 100, dailyLossLimitCoins: null } }));
    rg.setLimits.mockResolvedValue({
      ...status({
        limits: { dailyDepositLimitCoins: 100, dailyLossLimitCoins: null },
        pending: { dailyDepositLimitCoins: 300, effectiveAt: "2026-10-13T15:30:00.000Z" },
      }),
      applied: [],
      queued: ["dailyDepositLimitCoins"],
    });
    wrap(<ResponsibleGamingSection />);
    await screen.findByTestId("rg-today");
    fireEvent.press(screen.getByTestId("rg-row-dailyDepositLimitCoins"));
    expect(screen.getByText(/Raising or removing it takes effect after 24 hours/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("rg-limit-input"), "300");
    fireEvent.press(screen.getByTestId("rg-limit-save"));
    await waitFor(() => expect(rg.setLimits).toHaveBeenCalledWith({ dailyDepositLimitCoins: 300 }));
    expect(await screen.findByText(/Saved\. Takes effect/)).toBeTruthy();
    expect(screen.getByText(/Change to 300 · Takes effect/)).toBeTruthy();
  });

  it("removes a loss limit (null)", async () => {
    rg.get.mockResolvedValue(status({ limits: { dailyDepositLimitCoins: null, dailyLossLimitCoins: 50 } }));
    rg.setLimits.mockResolvedValue({ ...status(), applied: [], queued: ["dailyLossLimitCoins"] });
    wrap(<ResponsibleGamingSection />);
    await screen.findByTestId("rg-today");
    fireEvent.press(screen.getByTestId("rg-row-dailyLossLimitCoins"));
    fireEvent.press(screen.getByTestId("rg-limit-remove"));
    await waitFor(() => expect(rg.setLimits).toHaveBeenCalledWith({ dailyLossLimitCoins: null }));
  });

  it("starts a cool-off with the chosen period", async () => {
    rg.get.mockResolvedValue(status());
    rg.coolOff.mockResolvedValue(status({ coolOffUntil: "2026-10-15T15:30:00.000Z" }));
    wrap(<ResponsibleGamingSection />);
    await screen.findByTestId("rg-today");
    fireEvent.press(screen.getByTestId("rg-row-cooloff"));
    fireEvent.press(screen.getByTestId("rg-cooloff-72"));
    fireEvent.press(screen.getByTestId("rg-cooloff-confirm"));
    await waitFor(() => expect(rg.coolOff).toHaveBeenCalledWith(72));
    expect(await screen.findByText(/On a break until/)).toBeTruthy();
  });

  it("self-exclusion requires the typed confirmation and spells out the consequences", async () => {
    rg.get.mockResolvedValue(status());
    rg.selfExclude.mockResolvedValue(status({ selfExcludedUntil: "9999-12-31T00:00:00.000Z", selfExclusionPermanent: true }));
    wrap(<ResponsibleGamingSection />);
    await screen.findByTestId("rg-today");
    fireEvent.press(screen.getByTestId("rg-row-selfexclude"));
    expect(screen.getByText(/can't be cancelled or shortened/)).toBeTruthy();
    expect(screen.getByText(/still cash out/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("rg-selfexclude-permanent"));
    const confirm = screen.getByTestId("rg-selfexclude-confirm");
    fireEvent.press(confirm);
    expect(rg.selfExclude).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("rg-selfexclude-input"), "self-exclud");
    fireEvent.press(screen.getByTestId("rg-selfexclude-confirm"));
    expect(rg.selfExclude).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("rg-selfexclude-input"), "SELF-EXCLUDE");
    fireEvent.press(screen.getByTestId("rg-selfexclude-confirm"));
    await waitFor(() => expect(rg.selfExclude).toHaveBeenCalledWith("permanent"));
    expect(await screen.findByText("Permanently self-excluded")).toBeTruthy();
  });
});

describe("IAPSheet deposit limit", () => {
  it("shows usage, disables packs over the remaining limit with an explanation, and links to limits", async () => {
    rg.get.mockResolvedValue(
      status({
        limits: { dailyDepositLimitCoins: 650, dailyLossLimitCoins: null },
        today: { depositsCoins: 500, netLossCoins: 0, resetsAt: "2026-10-13T00:00:00.000Z" },
      }),
    );
    const onClose = jest.fn();
    wrap(<IAPSheet visible onClose={onClose} />);
    expect(await screen.findByText(/Daily deposit limit: 500 of 650 used/)).toBeTruthy();

    const small = screen.getByTestId("coin-pack-100");
    const big = screen.getByTestId("coin-pack-550");
    expect(small.props.accessibilityState.disabled).toBe(false);
    expect(big.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("coin-pack-note-550")).toBeTruthy();
    expect(screen.getAllByText(/Over today's limit — 150 coins left today/)).toHaveLength(2); // 550 + 1200
    expect(screen.queryByTestId("coin-pack-note-100")).toBeNull();

    fireEvent.press(screen.getByTestId("iap-set-limits"));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/profile");
  });

  it("no limit → no usage banner and all packs enabled", async () => {
    rg.get.mockResolvedValue(status());
    wrap(<IAPSheet visible onClose={jest.fn()} />);
    await waitFor(() => expect(rg.get).toHaveBeenCalled());
    expect(screen.queryByTestId("iap-deposit-limit")).toBeNull();
    expect(screen.getByTestId("coin-pack-1200").props.accessibilityState.disabled).toBe(false);
  });

  it("pauses purchases during a break", async () => {
    rg.get.mockResolvedValue(status({ coolOffUntil: "2026-10-15T15:30:00.000Z" }));
    wrap(<IAPSheet visible onClose={jest.fn()} />);
    expect(await screen.findByTestId("iap-rg-paused")).toBeTruthy();
    expect(screen.getByText(/taking a break until/)).toBeTruthy();
    expect(screen.getByTestId("coin-pack-100").props.accessibilityState.disabled).toBe(true);
  });
});
