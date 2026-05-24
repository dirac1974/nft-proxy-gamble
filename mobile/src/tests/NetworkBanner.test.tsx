import React from "react";
import { render } from "@testing-library/react-native";
import { useWalletStore } from "@/stores/walletStore";
import { NetworkBanner } from "@/components/NetworkBanner";

// Mock useWalletConnect so we don't need a WalletConnect provider
jest.mock("@/hooks/useWalletConnect", () => ({
  useWalletConnect: () => ({
    openModal: jest.fn(),
    disconnect: jest.fn(),
    retryAuth: jest.fn(),
    switchNetwork: jest.fn(),
    shortAddress: null,
    isBusy: false,
  }),
}));

// Mock walletService CHAIN export
jest.mock("@/services/walletService", () => ({
  CHAIN: { id: 80002, name: "Polygon Amoy" },
  REQUIRED_CHAIN_ID: 80002,
  setWalletClient: jest.fn(),
  clearWalletClient: jest.fn(),
  signAndAuthenticate: jest.fn(),
  switchToRequiredNetwork: jest.fn(),
  isOnRequiredNetwork: jest.fn(),
  decodeCard: jest.fn(),
}));

beforeEach(() => {
  useWalletStore.setState({
    address: null,
    jwtToken: null,
    connectionStatus: "idle",
    connectionError: null,
    networkMismatch: false,
    isAuthenticated: false,
  });
});

describe("NetworkBanner", () => {
  it("renders nothing when no mismatch or error", () => {
    const { toJSON } = render(<NetworkBanner />);
    expect(toJSON()).toBeNull();
  });

  it("renders when networkMismatch=true", () => {
    useWalletStore.setState({ networkMismatch: true });
    const { getByText } = render(<NetworkBanner />);
    expect(getByText(/Wrong network/i)).toBeTruthy();
    expect(getByText("Switch")).toBeTruthy();
  });

  it("renders when connectionError contains 'Wrong network'", () => {
    useWalletStore.setState({ connectionError: "Wrong network. Please switch." });
    const { getByText } = render(<NetworkBanner />);
    expect(getByText(/Wrong network/i)).toBeTruthy();
  });

  it("renders when connectionError contains 'chain'", () => {
    useWalletStore.setState({ connectionError: "Wrong chain ID detected" });
    const { getByText } = render(<NetworkBanner />);
    expect(getByText(/Wrong network/i)).toBeTruthy();
  });

  it("has accessibilityRole alert", () => {
    useWalletStore.setState({ networkMismatch: true });
    const { getByRole } = render(<NetworkBanner />);
    expect(getByRole("alert")).toBeTruthy();
  });
});
