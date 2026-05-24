import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  getProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  type ProductPurchase,
  type PurchaseError,
} from "react-native-iap";
import { iapApi } from "./api";
import { useIAPStore, COIN_PRODUCTS, type CoinProduct } from "@/stores/iapStore";
import { useGameStore } from "@/stores/gameStore";

const PRODUCT_IDS = COIN_PRODUCTS.map((p) => p.productId);

let purchaseListener: ReturnType<typeof purchaseUpdatedListener> | null = null;
let errorListener: ReturnType<typeof purchaseErrorListener> | null = null;

export async function initIAP(): Promise<void> {
  try {
    await initConnection();
    await refreshProducts();
    setupListeners();
  } catch (err) {
    // IAP not available on this device (simulator, emulator without Play Services)
    console.warn("[IAP] init failed:", err);
  }
}

async function refreshProducts(): Promise<void> {
  try {
    const skuList = PRODUCT_IDS;
    const items = await getProducts({ skus: skuList });
    const updated: CoinProduct[] = COIN_PRODUCTS.map((p) => {
      const store = items.find((i) => i.productId === p.productId);
      return store
        ? { ...p, localizedPrice: store.localizedPrice ?? p.localizedPrice }
        : p;
    });
    useIAPStore.getState().setProducts(updated);
  } catch {
    // Fall back to default prices — no-op
  }
}

function setupListeners(): void {
  purchaseListener = purchaseUpdatedListener(async (purchase: ProductPurchase) => {
    await handlePurchaseComplete(purchase);
  });

  errorListener = purchaseErrorListener((error: PurchaseError) => {
    const store = useIAPStore.getState();
    // User cancelled is not an error worth surfacing
    if (error.code === "E_USER_CANCELLED") {
      store.reset();
      return;
    }
    store.setPurchaseError(error.message ?? "Purchase failed");
  });
}

async function handlePurchaseComplete(purchase: ProductPurchase): Promise<void> {
  const store = useIAPStore.getState();
  store.setPurchaseStatus("verifying");

  try {
    const platform = Platform.OS === "ios" ? "apple" : "google";
    const receipt =
      Platform.OS === "ios"
        ? (purchase.transactionReceipt ?? "")
        : (purchase.purchaseToken ?? "");

    const { coinsAdded, newBalance } = await iapApi.verify(platform, receipt);

    // Server-authoritative: update balance from backend response only
    useGameStore.getState().setBalance(newBalance);

    const product = COIN_PRODUCTS.find((p) => p.productId === purchase.productId);
    store.addHistory({
      productId: purchase.productId,
      coins: coinsAdded,
      timestamp: Date.now(),
    });

    store.setPurchaseStatus("success");
    store.setPendingProduct(null);

    // Acknowledge to prevent refund loop
    await finishTransaction({ purchase, isConsumable: true });

    // Auto-reset to idle after brief success display
    setTimeout(() => store.reset(), 2500);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Purchase verification failed";
    store.setPurchaseError(msg);
    // Still finish so the purchase isn't stuck pending
    await finishTransaction({ purchase, isConsumable: true }).catch(() => null);
  }
}

export async function purchaseProduct(productId: string): Promise<void> {
  const store = useIAPStore.getState();
  store.setPurchaseStatus("loading");
  store.setPendingProduct(productId);
  store.setPurchaseError(null);

  try {
    await requestPurchase({ sku: productId });
    // Result handled by purchaseUpdatedListener
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Purchase request failed";
    store.setPurchaseError(msg);
  }
}

export function teardownIAP(): void {
  purchaseListener?.remove();
  errorListener?.remove();
  purchaseListener = null;
  errorListener = null;
  endConnection().catch(() => null);
}
