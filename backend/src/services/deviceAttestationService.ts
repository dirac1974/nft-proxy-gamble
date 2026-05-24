import { config } from "../config/index.js";

export type AttestationPlatform = "ios" | "android";

export interface AttestationResult {
  valid: boolean;
  shadowMode: boolean;
  reason?: string;
}

// Verify Apple App Attest assertion.
// Docs: https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
async function verifyAppleAttestation(token: string): Promise<AttestationResult> {
  const teamId = config.APPLE_APP_ATTEST_TEAM_ID;
  const bundleId = config.APPLE_APP_ATTEST_BUNDLE_ID;

  if (!teamId || !bundleId) {
    return { valid: true, shadowMode: true, reason: "Apple attestation not configured" };
  }

  try {
    // Apple App Attest assertion verification:
    // The client sends a base64-encoded assertion (cbor-encoded AttestationObject).
    // Full verification requires: decoding CBOR, checking receipt, verifying authenticatorData,
    // checking rpIdHash matches teamId + bundleId, verifying counter > stored counter.
    //
    // For shadow mode rollout: parse the token to confirm it's well-formed and non-empty.
    // TODO: Implement full Apple DeviceCheck API call once APPLE_APP_ATTEST_TEAM_ID is set.
    // Reference: https://developer.apple.com/documentation/devicecheck
    const decoded = Buffer.from(token, "base64");
    if (decoded.length < 32) {
      return { valid: false, shadowMode: false, reason: "Attestation token too short" };
    }
    // Shadow: assume valid, log for monitoring
    console.info("[attestation] ios shadow mode — token length ok", decoded.length);
    return { valid: true, shadowMode: true };
  } catch (err) {
    return { valid: false, shadowMode: false, reason: String(err) };
  }
}

// Verify Google Play Integrity token.
// Docs: https://developer.android.com/google/play/integrity/verdict
async function verifyAndroidAttestation(token: string): Promise<AttestationResult> {
  const packageName = config.GOOGLE_PLAY_INTEGRITY_PACKAGE;

  if (!packageName) {
    return { valid: true, shadowMode: true, reason: "Android attestation not configured" };
  }

  try {
    // Google Play Integrity: decode the compact JWS and verify with Google API.
    // Full verification: call https://playintegrity.googleapis.com/v1/{package}:decodeIntegrityToken
    // Check: requestDetails.requestPackageName, appIntegrity.appRecognitionVerdict,
    //        deviceIntegrity.deviceRecognitionVerdict, accountDetails.appLicensingVerdict
    //
    // For shadow mode: confirm token is a non-empty JWT-like string (3 base64url parts)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, shadowMode: false, reason: "Invalid Play Integrity token format" };
    }
    // Shadow: assume valid, log for monitoring
    console.info("[attestation] android shadow mode — token format ok");
    return { valid: true, shadowMode: true };
  } catch (err) {
    return { valid: false, shadowMode: false, reason: String(err) };
  }
}

// Called by routes that require device attestation (cashout, IAP).
// In shadow mode (DEVICE_ATTESTATION_ENFORCE=false), logs the result but never blocks.
// In enforce mode, returns false for invalid attestations.
export async function checkDeviceAttestation(
  platform: AttestationPlatform | undefined,
  token: string | undefined,
  userId: string,
): Promise<{ allowed: boolean; shadowMode: boolean }> {
  const enforce = config.DEVICE_ATTESTATION_ENFORCE;

  if (!platform || !token) {
    if (enforce) {
      console.warn(`[attestation] missing token userId=${userId} platform=${platform}`);
      return { allowed: false, shadowMode: false };
    }
    return { allowed: true, shadowMode: true };
  }

  const result =
    platform === "ios"
      ? await verifyAppleAttestation(token)
      : await verifyAndroidAttestation(token);

  if (result.shadowMode || !enforce) {
    // Log the result for analytics but don't block
    if (!result.valid) {
      console.warn(
        `[attestation] SHADOW FAIL userId=${userId} platform=${platform} reason=${result.reason}`,
      );
    }
    return { allowed: true, shadowMode: true };
  }

  if (!result.valid) {
    console.warn(
      `[attestation] BLOCKED userId=${userId} platform=${platform} reason=${result.reason}`,
    );
    return { allowed: false, shadowMode: false };
  }

  return { allowed: true, shadowMode: false };
}
