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

  // SECURITY (RT-MED-2): bind the receipt to OUR app. Apple returns status 0
  // for any valid receipt from any app. Without a bundle_id check, an attacker
  // could buy a product with the same productId string in a different (cheap or
  // free) app and redeem it here. Only enforce when the expected bundle id is
  // configured so dev/sandbox without the env var still works.
  const expectedBundleId = config.APPLE_APP_ATTEST_BUNDLE_ID;
  if (expectedBundleId && json.receipt?.bundle_id && json.receipt.bundle_id !== expectedBundleId) {
    return { valid: false, productId: "", coinsGranted: 0, receiptHash: hashReceipt(receiptData) };
  }

  const latestReceipt = json.latest_receipt_info?.[0] ?? json.receipt?.in_app?.[0];
  if (!latestReceipt) {
    return { valid: false, productId: "", coinsGranted: 0, receiptHash: hashReceipt(receiptData) };
  }

  const productId = latestReceipt.product_id;
  const coinsGranted = lookupCoinsForProduct(productId);
  return {
    valid: coinsGranted > 0,
    productId,
    coinsGranted,
    receiptHash: hashReceipt(receiptData),
  };
}

export async function verifyGoogleReceipt(
  purchaseToken: string,
  productId: string,
): Promise<IAPVerifyResult> {
  // Phase 4 will wire the real Google Play Developer API (requires service account OAuth).
  // For now, validate format and trust in dev/test; reject in production.
  if (config.NODE_ENV === "production") {
    throw new Error("Google Play verification not yet configured for production");
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

interface AppleReceiptResponse {
  status: number;
  receipt?: { bundle_id?: string; in_app?: Array<{ product_id: string }> };
  latest_receipt_info?: Array<{ product_id: string }>;
}
