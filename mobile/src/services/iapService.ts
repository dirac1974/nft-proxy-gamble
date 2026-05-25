// TEMPORARY STUB — react-native-iap v12 is incompatible with RN 0.81 (Expo SDK 54).
// Real IAP requires Google Play services + a real device anyway, so dev builds on
// the emulator stub the calls. To restore: migrate to expo-iap@4.3.1 (Expo's
// official wrapper, same dooboolab authors) and reimplement against its API.

export async function initIAP(): Promise<void> {
  console.warn("[IAP] stub: initIAP() — IAP disabled in this build");
}

export async function purchaseProduct(productId: string): Promise<void> {
  console.warn(`[IAP] stub: purchaseProduct(${productId}) — IAP disabled in this build`);
}

export function teardownIAP(): void {
  // no-op
}
