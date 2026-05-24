import { create } from "zustand";

export type PurchaseStatus = "idle" | "loading" | "verifying" | "success" | "failed";

export interface CoinProduct {
  productId: string;
  coins: number;
  /** Display price — populated from IAP SDK after init */
  localizedPrice: string;
  /** Bonus percentage string e.g. "+10% BONUS" */
  bonus?: string;
}

export interface PurchaseRecord {
  productId: string;
  coins: number;
  timestamp: number;
}

// Product definitions — IDs must match App Store / Play Store listings
export const COIN_PRODUCTS: CoinProduct[] = [
  { productId: "nfpg.coins.100",  coins: 100,  localizedPrice: "$0.99"  },
  { productId: "nfpg.coins.550",  coins: 550,  localizedPrice: "$4.99",  bonus: "+10% BONUS" },
  { productId: "nfpg.coins.1200", coins: 1200, localizedPrice: "$9.99",  bonus: "+20% BONUS" },
];

interface IAPState {
  products: CoinProduct[];
  purchaseStatus: PurchaseStatus;
  purchaseError: string | null;
  pendingProductId: string | null;
  history: PurchaseRecord[];

  setProducts: (products: CoinProduct[]) => void;
  setPurchaseStatus: (status: PurchaseStatus) => void;
  setPurchaseError: (error: string | null) => void;
  setPendingProduct: (productId: string | null) => void;
  addHistory: (record: PurchaseRecord) => void;
  reset: () => void;
}

export const useIAPStore = create<IAPState>((set) => ({
  products: COIN_PRODUCTS,
  purchaseStatus: "idle",
  purchaseError: null,
  pendingProductId: null,
  history: [],

  setProducts: (products) => set({ products }),
  setPurchaseStatus: (purchaseStatus) => set({ purchaseStatus }),
  setPurchaseError: (purchaseError) =>
    set({ purchaseError, purchaseStatus: purchaseError ? "failed" : "idle" }),
  setPendingProduct: (pendingProductId) => set({ pendingProductId }),
  addHistory: (record) => set((s) => ({ history: [record, ...s.history].slice(0, 50) })),
  reset: () => set({ purchaseStatus: "idle", purchaseError: null, pendingProductId: null }),
}));
