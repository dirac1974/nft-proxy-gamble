import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@/services/soundService", () => ({ playSound: jest.fn(() => Promise.resolve()) }));
jest.mock("@/services/deviceAttestationService", () => ({
  getAttestationHeaders: jest.fn(() => Promise.resolve({ "x-attestation-platform": "ios" })),
}));
const mockWalletState = { isAuthenticated: true, jwtToken: "jwt", userId: "u1", disconnect: jest.fn() };
jest.mock("@/stores/walletStore", () => {
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(mockWalletState) : mockWalletState);
  hook.getState = () => mockWalletState;
  return { useWalletStore: hook };
});

import * as api from "@/services/api";
import { CashOutSheet } from "@/components/CashOutSheet";
import { useGameStore } from "@/stores/gameStore";

const fetchMock = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

function okJson(body: unknown, status = 202) {
  return Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.restoreAllMocks();
});

describe("walletApi.cashout", () => {
  it("POSTs /wallet/cashout with attestation headers and verifies the signed balance", async () => {
    fetchMock.mockReturnValueOnce(
      okJson({ voucherId: "v1", mintStatus: "PENDING", coinBalance: 700, balanceSig: "sig", sigTimestamp: 1 }),
    );
    const verify = jest.spyOn(api, "extractVerifiedBalance");
    const r = await api.walletApi.cashout(300, "key-12345678");
    expect(r).toEqual({ voucherId: "v1", mintStatus: "PENDING", newBalance: 700 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/wallet\/cashout$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ coinsToCashout: 300, idempotencyKey: "key-12345678" });
    expect(init.headers["x-attestation-platform"]).toBe("ios");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(verify).toBeDefined();
  });

  it("throws when the balance signature fails verification", async () => {
    fetchMock.mockReturnValueOnce(okJson({ voucherId: "v1", mintStatus: "PENDING", coinBalance: 1, balanceSig: "x", sigTimestamp: 1 }));
    const bv = require("@/services/balanceVerification");
    jest.spyOn(bv, "verifyAndExtractBalance").mockReturnValueOnce(null);
    await expect(api.walletApi.cashout(100)).rejects.toThrow(/signature verification failed/i);
  });

  it("newIdempotencyKey matches the server pattern and is unique", () => {
    const a = api.newIdempotencyKey();
    const b = api.newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("CashOutSheet", () => {
  function renderSheet() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <QueryClientProvider client={qc}>
          <CashOutSheet visible onClose={jest.fn()} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  }

  jest.setTimeout(60_000);

  it("cashes out via /wallet/cashout (no roulette session) and reuses the idempotency key on retry", async () => {
    useGameStore.getState().setBalance(1_000);
    const startRoulette = jest.spyOn(api.rouletteApi, "startSession");
    const cashout = jest
      .spyOn(api.walletApi, "cashout")
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ voucherId: "v1", mintStatus: "PENDING", newBalance: 0 });

    const screen = renderSheet();
    fireEvent.press(screen.getByTestId("cashout-confirm"));
    await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await waitFor(() => expect(screen.getByText(/didn't go through/i)).toBeTruthy(), { timeout: 10_000 });
    fireEvent.press(screen.getByTestId("cashout-confirm"));
    await waitFor(() => expect(cashout).toHaveBeenCalledTimes(2), { timeout: 10_000 });

    expect(cashout.mock.calls[0][0]).toBe(1_000);
    expect(cashout.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(cashout.mock.calls[1][1]).toBe(cashout.mock.calls[0][1]);
    expect(startRoulette).not.toHaveBeenCalled();
    await waitFor(() => expect(useGameStore.getState().coinBalance).toBe(0), { timeout: 10_000 });
  });

  it("caps the amount at the per-voucher maximum", () => {
    useGameStore.getState().setBalance(250_000);
    const screen = renderSheet();
    expect(screen.getByTestId("cashout-amount").props.children).toBe("100,000");
  });
});
