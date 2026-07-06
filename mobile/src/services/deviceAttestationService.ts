import { Platform } from "react-native";
import Constants from "expo-constants";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// Shadow-mode client attestation.
// Sends a platform tag + HMAC of installationId+timestamp so the backend can
// track attestation call rates.
//
// The BACKEND now performs REAL App Attest / Play Integrity verification
// (backend/src/services/deviceAttest/*) and, under enforcement, requires a
// server-issued challenge echoed in the `x-attestation-challenge` header. To
// switch this client to real attestation:
//   1. POST /attestation/challenge → { challenge, nonce }.
//   2. iOS:     DCAppAttestService.attestKey(keyId, SHA256(nonce)); send token =
//               base64url(JSON({ keyId, attestation })) + the challenge header.
//      Android: IntegrityManager token request with nonce; send the token +
//               the challenge header.
//   3. Requires a NATIVE module (App Attest / Play Integrity are unavailable in
//      pure-JS Expo) — add via a dev/EAS build, e.g. an app-attest native module.
// Until then this stays in shadow mode (backend allows unverified in non-prod).

function getInstallationId(): string {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.projectId ??
    "unknown-installation"
  );
}

function buildShadowToken(installationId: string): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  // Key is static per-build — just a shadow mode identifier, not a real secret
  const key = new TextEncoder().encode("nfpg_attest_shadow_v1");
  const payload = new TextEncoder().encode(`${installationId}:${ts}`);
  const mac = bytesToHex(hmac(sha256, key, payload));
  return Buffer.from(JSON.stringify({ ts, mac, installationId })).toString("base64");
}

export interface AttestationHeaders {
  "x-attestation-platform": "ios" | "android";
  "x-attestation-token": string;
  [key: string]: string;
}

// Returns headers to include with cashout and IAP requests.
// In shadow mode: sends a lightweight HMAC token.
// TODO: Replace with real App Attest (iOS) / Play Integrity (Android) when enforced.
export async function getAttestationHeaders(): Promise<AttestationHeaders> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const installationId = getInstallationId();
  const token = buildShadowToken(installationId);
  return { "x-attestation-platform": platform, "x-attestation-token": token };
}
