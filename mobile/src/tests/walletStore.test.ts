import { act } from "@testing-library/react-native";
import { useWalletStore } from "@/stores/walletStore";

// Reset zustand state between tests
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

describe("walletStore — connection status machine", () => {
  it("starts in idle with no address or token", () => {
    const s = useWalletStore.getState();
    expect(s.connectionStatus).toBe("idle");
    expect(s.address).toBeNull();
    expect(s.jwtToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });

  it("setStatus updates connectionStatus", () => {
    act(() => useWalletStore.getState().setStatus("connecting"));
    expect(useWalletStore.getState().connectionStatus).toBe("connecting");

    act(() => useWalletStore.getState().setStatus("authenticating"));
    expect(useWalletStore.getState().connectionStatus).toBe("authenticating");
  });

  it("connect sets address and transitions to connected", () => {
    act(() => useWalletStore.getState().connect("0xABCD1234"));
    const s = useWalletStore.getState();
    expect(s.address).toBe("0xABCD1234");
    expect(s.connectionStatus).toBe("connected");
    expect(s.isAuthenticated).toBe(false);
  });

  it("setJwt sets token, isAuthenticated=true, status=authenticated", () => {
    act(() => useWalletStore.getState().setJwt("jwt_token_abc"));
    const s = useWalletStore.getState();
    expect(s.jwtToken).toBe("jwt_token_abc");
    expect(s.isAuthenticated).toBe(true);
    expect(s.connectionStatus).toBe("authenticated");
  });

  it("setConnectionError sets error and transitions to error", () => {
    act(() => useWalletStore.getState().setConnectionError("auth failed"));
    const s = useWalletStore.getState();
    expect(s.connectionError).toBe("auth failed");
    expect(s.connectionStatus).toBe("error");
  });

  it("setConnectionError(null) clears error and transitions to idle", () => {
    act(() => useWalletStore.getState().setConnectionError("some error"));
    act(() => useWalletStore.getState().setConnectionError(null));
    const s = useWalletStore.getState();
    expect(s.connectionError).toBeNull();
    expect(s.connectionStatus).toBe("idle");
  });

  it("setNetworkMismatch sets flag", () => {
    act(() => useWalletStore.getState().setNetworkMismatch(true));
    expect(useWalletStore.getState().networkMismatch).toBe(true);
    act(() => useWalletStore.getState().setNetworkMismatch(false));
    expect(useWalletStore.getState().networkMismatch).toBe(false);
  });

  it("disconnect resets all state to idle defaults", async () => {
    // Set up an authenticated state first
    act(() => useWalletStore.getState().connect("0xABCD"));
    act(() => useWalletStore.getState().setJwt("jwt_abc"));
    act(() => useWalletStore.getState().setNetworkMismatch(true));
    act(() => useWalletStore.getState().setConnectionError("old error"));

    await useWalletStore.getState().disconnect();

    const s = useWalletStore.getState();
    expect(s.address).toBeNull();
    expect(s.jwtToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.connectionStatus).toBe("idle");
    expect(s.connectionError).toBeNull();
    expect(s.networkMismatch).toBe(false);
  });

  it("full auth lifecycle: idle → connecting → authenticated", () => {
    act(() => useWalletStore.getState().setStatus("connecting"));
    expect(useWalletStore.getState().connectionStatus).toBe("connecting");

    act(() => useWalletStore.getState().connect("0x1234"));
    expect(useWalletStore.getState().connectionStatus).toBe("connected");

    act(() => useWalletStore.getState().setStatus("authenticating"));
    expect(useWalletStore.getState().connectionStatus).toBe("authenticating");

    act(() => useWalletStore.getState().setJwt("final_jwt"));
    expect(useWalletStore.getState().connectionStatus).toBe("authenticated");
    expect(useWalletStore.getState().isAuthenticated).toBe(true);
  });
});
