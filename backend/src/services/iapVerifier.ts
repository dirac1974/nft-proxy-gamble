import { createHash } from "crypto";
import type { IAPVerifyResult } from "../types/index.js";
import { IAP_PRODUCTS } from "../types/index.js";
import { config } from "../config/index.js";

export function hashReceipt(receiptData: string): string {
  return createHash("sha256").update(receiptData).digest("hex");
}

// Safe lookup that avoids matching Object.prototype properties (e.g. a malicious
// productId like "constructor" or "__proto__" would otherwise resolve to a
// function reference, which `?? 0` doesn't guard against because the value is
// truthy, just not a number).
function lookupCoinsForProduct(productId: string): number {
  if (!Object.prototype.hasOwnProperty.call(IAP_PRODUCTS, productId)) return 0;
  const value = IAP_PRODUCTS[productId];
  return typeof value === "number" && value > 0 ? value : 0;
}

export async function verifyAppleReceipt(receiptData: string): Promise<IAPVerifyResult> {
  const url =
    config.NODE_ENV === "production"
      ? "https://buy.itunes.apple.com/verifyReceipt"
      : "https://sandbox.itunes.apple.com/verifyReceipt";

  const body = JSON.stringify({
    "receipt-data": receiptData,
    password: config.APPLE_SHARED_SECRET ?? "",
    "exclude-old-transactions": true,
  });

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!resp.ok) throw new Error(`Apple IAP server error: ${resp.status}`);
  const json = (await resp.json()) as AppleReceiptResponse;

  if (json.status !== 0) {
    return { valid: false, productId: "", coinsGranted: 0, receiptHash: hashReceipt(receiptData) };
  }

  const latestReceipt = json.latest_receipt_info?.[0] ?? json.receipt?.in_app?.[0];
  if (!latestReceipt) {
    return { valid: false, productId: "", coinsGranted: 0, receiptHash: hashReceipt(receiptData) };
  }

  const productId = latestReceipt.product_id;
  const coinsGranted = lookupCoinsForProduct(productId);

  // SECURITY (FABLE-2026-07 H-1): dedup on Apple's stable transaction identifier,
  // NOT the hash of the client-supplied receipt bytes. A StoreKit receipt blob is
  // re-fetchable and re-encodable, so the same purchase can be presented with
  // different bytes -> different sha256 -> the @unique(receiptHash) constraint is
  // bypassed and the same real-money purchase is credited multiple times. The
  // (original_)transaction_id is Apple's per-purchase primary key and is stable
  // across re-fetches, so hashing it gives one idempotency key per actual purchase.
  const txnKey = latestReceipt.transaction_id ?? latestReceipt.original_transaction_id;
  const receiptHash = txnKey ? hashReceipt(`apple:${txnKey}`) : hashReceipt(receiptData);

  return {
    valid: coinsGranted > 0,
    productId,
    coinsGranted,
    receiptHash,
  };
}

export async function verifyGoogleReceipt(
  purchaseToken: string,
  productId: string,
): Promise<IAPVerifyResult> {
  // Phase 4 will wire the real Google Play Developer API (requires service account OAuth).
  // SECURITY (FABLE-2026-07 C-2): the format-only stub below trusts a client-supplied
  // productId and any >10-char purchaseToken, minting free coins. It must ONLY be
  // reachable from the automated test harness. Previously this was gated on
  // `NODE_ENV === "production"`, but the deployed config ships NODE_ENV=development
  // (backend/.env), so a real deployment fell through to the stub and any client
  // could mint unlimited coins -> cash out to real USDC. Fail closed everywhere
  // except the test runner until real Play Integrity verification lands.
  if (config.NODE_ENV !== "test") {
    return { valid: false, productId, coinsGranted: 0, receiptHash: hashReceipt(`${productId}:${purchaseToken}`) };
  }

  const coinsGranted = lookupCoinsForProduct(productId);
  return {
    valid: coinsGranted > 0 && purchaseToken.length > 10,
    productId,
    coinsGranted,
    receiptHash: hashReceipt(`${productId}:${purchaseToken}`),
  };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface AppleInAppTxn {
  product_id: string;
  transaction_id?: string;
  original_transaction_id?: string;
}

interface AppleReceiptResponse {
  status: number;
  receipt?: { in_app?: AppleInAppTxn[] };
  latest_receipt_info?: AppleInAppTxn[];
}
