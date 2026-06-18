import { renderHook, act, waitFor } from "@testing-library/react-native";

const mockOpen = jest.fn();
const mockAppKitDisconnect = jest.fn().mockResolvedValue(undefined);
let mockAccountState: { address?: string; isConnected: boolean };
let mockProviderState: { provider: unknown };

jest.mock("@reown/appkit-react-native", () => ({
  useAppKit: () => ({ open: mockOpen, disconnect: mockAppKitDisconnect }),
  useAccount: () => mockAccountState,
  useProvider: () => mockProviderState,
}));

jest.mock("@/services/walletService", () => ({
  CHAIN: { id: 80002, name: "Polygon Amoy" },
  REQUIRED_CHAIN_ID: 80002,
  setWalletClient: jest.fn(),
  clearWalletClient: jest.fn(),
  signAndAuthenticate: jest.fn().mockResolvedValue(undefined),
  switchToRequiredNetwork: jest.fn().mockResolvedValue(undefined),
  isOnRequiredNetwork: jest.fn().mockResolvedValue(true),
}));

import { useWalletConnect } from "@/hooks/useWalletConnect";
import * as walletService from "@/services/walletService";
import { useWalletStore } from "@/stores/walletStore";

const ADDR = "0x1234567890abcdef1234567890abcdef12345678";

beforeEach(() => {
  jest.clearAllMocks();
  mockAccountState = { address: undefined, isConnected: false };
  mockProviderState = { provider: undefined };
  (walletService.isOnRequiredNetwork as jest.Mock).mockResolvedValue(true);
  useWalletStore.setState({
    address: null,
    jwtToken: null,
    connectionStatus: "idle",
    connectionError: null,
    networkMismatch: false,
    isAuthenticated: false,
  });
});

describe("useWalletConnect (Reown AppKit)", () => {
  it("openModal opens the AppKit modal", () => {
    const { result } = renderHook(() => useWalletConnect());
    act(() => result.current.openModal());
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("formats shortAddress when an account is present", () => {
    mockAccountState = { address: ADDR, isConnected: true };
    const { result } = renderHook(() => useWalletConnect());
    expect(result.current.shortAddress).toBe("0x1234…5678");
  });

  it("runs auth when connected on the right network", async () => {
    mockAccountState = { address: ADDR, isConnected: true };
    mockProviderState = { provider: { request: jest.fn() } };
    renderHook(() => useWalletConnect());
    await waitFor(() => {
      expect(walletService.setWalletClient).toHaveBeenCalledWith(mockProviderState.provider);
      expect(walletService.signAndAuthenticate).toHaveBeenCalledWith(ADDR);
    });
  });

  it("surfaces a network mismatch instead of authing on the wrong network", async () => {
    (walletService.isOnRequiredNetwork as jest.Mock).mockResolvedValue(false);
    mockAccountState = { address: ADDR, isConnected: true };
    mockProviderState = { provider: { request: jest.fn() } };
    renderHook(() => useWalletConnect());
    await waitFor(() => {
      expect(useWalletStore.getState().networkMismatch).toBe(true);
    });
    expect(walletService.signAndAuthenticate).not.toHaveBeenCalled();
  });

  it("disconnect tears down both the AppKit session and local state", async () => {
    useWalletStore.setState({ isAuthenticated: true, address: ADDR });
    const { result } = renderHook(() => useWalletConnect());
    await act(async () => {
      await result.current.disconnect();
    });
    expect(walletService.clearWalletClient).toHaveBeenCalled();
    expect(mockAppKitDisconnect).toHaveBeenCalled();
    expect(useWalletStore.getState().isAuthenticated).toBe(false);
  });
});
