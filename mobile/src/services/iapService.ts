import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  ErrorCode,
  type Purchase,
} from "expo-iap";
import type { PurchaseError } from "expo-iap/build/utils/errorMapping";
import { iapApi } from "./api";
import { useIAPStore, COIN_PRODUCTS, type CoinProduct } from "@/stores/iapStore";
import { useGameStore } from "@/stores/gameStore";

const PRODUCT_IDS = COIN_PRODUCTS.map((p) => p.productId);

let purchaseListener: { remove: () => void } | null = null;
let errorListener: { remove: () => void } | null = null;

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
    const items = await fetchProducts({ skus: PRODUCT_IDS, type: "in-app" });
    const products = Array.isArray(items) ? items : [];
    const updated: CoinProduct[] = COIN_PRODUCTS.map((p) => {
      const store = products.find(
        (i: { id?: string; productId?: string; displayPrice?: string; localizedPrice?: string }) =>
          (i.id ?? i.productId) === p.productId,
      );
      return store
        ? {
            ...p,
            localizedPrice:
              (store as { displayPrice?: string; localizedPrice?: string }).displayPrice ??
              (store as { localizedPrice?: string }).localizedPrice ??
              p.localizedPrice,
          }
        : p;
    });
    useIAPStore.getState().setProducts(updated);
  } catch {
    // Fall back to default prices — no-op
  }
}

function setupListeners(): void {
  purchaseListener = purchaseUpdatedListener(async (purchase: Purchase) => {
    await handlePurchaseComplete(purchase);
  });

  errorListener = purchaseErrorListener((error: PurchaseError) => {
    const store = useIAPStore.getState();
    // User cancelled is not an error worth surfacing
    if (error.code === ErrorCode.UserCancelled) {
      store.reset();
      return;
    }
    store.setPurchaseError(error.message ?? "Purchase failed");
  });
}

async function handlePurchaseComplete(purchase: Purchase): Promise<void> {
  const store = useIAPStore.getState();
  store.setPurchaseStatus("verifying");

  try {
    const platform = Platform.OS === "ios" ? "apple" : "google";
    // expo-iap exposes a unified `purchaseToken` (iOS JWS / Android purchaseToken)
    const receipt = purchase.purchaseToken ?? "";

    const { coinsGranted, newBalance } = await iapApi.verify(platform, receipt);

    // Server-authoritative: update balance from backend response only
    useGameStore.getState().setBalance(newBalance);

    store.addHistory({
      productId: purchase.productId,
      coins: coinsGranted,
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
    await requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: "in-app",
    });
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
