import { act } from "@testing-library/react-native";
import { useIAPStore, COIN_PRODUCTS } from "@/stores/iapStore";

beforeEach(() => {
  useIAPStore.setState({
    products: COIN_PRODUCTS,
    purchaseStatus: "idle",
    purchaseError: null,
    pendingProductId: null,
    history: [],
  });
});

describe("iapStore", () => {
  it("initialises with 3 default products", () => {
    const { products } = useIAPStore.getState();
    expect(products).toHaveLength(3);
    expect(products[0].productId).toBe("nfpg.coins.100");
    expect(products[1].productId).toBe("nfpg.coins.550");
    expect(products[2].productId).toBe("nfpg.coins.1200");
  });

  it("starts in idle with no error or pending product", () => {
    const s = useIAPStore.getState();
    expect(s.purchaseStatus).toBe("idle");
    expect(s.purchaseError).toBeNull();
    expect(s.pendingProductId).toBeNull();
  });

  it("setPurchaseStatus updates status", () => {
    act(() => useIAPStore.getState().setPurchaseStatus("loading"));
    expect(useIAPStore.getState().purchaseStatus).toBe("loading");

    act(() => useIAPStore.getState().setPurchaseStatus("verifying"));
    expect(useIAPStore.getState().purchaseStatus).toBe("verifying");

    act(() => useIAPStore.getState().setPurchaseStatus("success"));
    expect(useIAPStore.getState().purchaseStatus).toBe("success");
  });

  it("setPurchaseError sets error and transitions to failed", () => {
    act(() => useIAPStore.getState().setPurchaseError("network error"));
    const s = useIAPStore.getState();
    expect(s.purchaseError).toBe("network error");
    expect(s.purchaseStatus).toBe("failed");
  });

  it("setPurchaseError(null) transitions to idle", () => {
    act(() => useIAPStore.getState().setPurchaseError("some error"));
    act(() => useIAPStore.getState().setPurchaseError(null));
    const s = useIAPStore.getState();
    expect(s.purchaseError).toBeNull();
    expect(s.purchaseStatus).toBe("idle");
  });

  it("setPendingProduct tracks which product is in-flight", () => {
    act(() => useIAPStore.getState().setPendingProduct("nfpg.coins.550"));
    expect(useIAPStore.getState().pendingProductId).toBe("nfpg.coins.550");
  });

  it("addHistory prepends record and caps at 50", () => {
    // Add 52 records
    for (let i = 0; i < 52; i++) {
      act(() => useIAPStore.getState().addHistory({ productId: "nfpg.coins.100", coins: 100, timestamp: i }));
    }
    const { history } = useIAPStore.getState();
    expect(history).toHaveLength(50);
    // Most recent is first
    expect(history[0].timestamp).toBe(51);
  });

  it("reset returns to idle state", () => {
    act(() => useIAPStore.getState().setPurchaseStatus("verifying"));
    act(() => useIAPStore.getState().setPendingProduct("nfpg.coins.1200"));
    act(() => useIAPStore.getState().setPurchaseError("fail"));
    act(() => useIAPStore.getState().reset());
    const s = useIAPStore.getState();
    expect(s.purchaseStatus).toBe("idle");
    expect(s.pendingProductId).toBeNull();
    expect(s.purchaseError).toBeNull();
  });

  it("setProducts updates displayed prices from store", () => {
    const updated = COIN_PRODUCTS.map((p) => ({ ...p, localizedPrice: "$99.99" }));
    act(() => useIAPStore.getState().setProducts(updated));
    expect(useIAPStore.getState().products[0].localizedPrice).toBe("$99.99");
  });
});
