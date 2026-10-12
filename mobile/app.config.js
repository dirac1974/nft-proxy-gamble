const API_HOST = process.env.API_HOST ?? "api.nftproxygamble.com";
const PRIMARY_PIN = process.env.CERT_PIN_PRIMARY ?? "PLACEHOLDER_PRIMARY_SPKI_SHA256_BASE64";
const BACKUP_PIN = process.env.CERT_PIN_BACKUP ?? "PLACEHOLDER_BACKUP_SPKI_SHA256_BASE64";

// Cert pinning is only enabled where real pins are configured. Local / dev builds
// use placeholders and skip pinning; production EAS builds are refused below
// unless real pins are present (H3), so pinning can never be silently off there.
const PINNING_ENABLED =
  !PRIMARY_PIN.startsWith("PLACEHOLDER") && !BACKUP_PIN.startsWith("PLACEHOLDER");

const MIN_PIN_VALIDITY_DAYS = 90;
const SPKI_PIN_RE = /^[A-Za-z0-9+/]{43}=$/; // base64 SHA-256
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

function assertBuildEnv(env, now = Date.now()) {
  const profile = env.EAS_BUILD_PROFILE;
  if (!profile) return; // local `expo start` / `expo export` — guarded by __DEV__ + CI bundle scan
  const errors = [];

  // M1: E2E hooks (local test chain + raw private key) only ever run locally.
  const e2eVars = Object.keys(env).filter((k) => k.startsWith("EXPO_PUBLIC_E2E_") && env[k]);
  if (e2eVars.length) errors.push(`EXPO_PUBLIC_E2E_* must never be set for EAS builds (found: ${e2eVars.join(", ")})`);

  if (profile === "production") {
    // H3: pinning must be on, with distinct real pins and >= 90 days of validity left.
    const primary = env.CERT_PIN_PRIMARY;
    const backup = env.CERT_PIN_BACKUP;
    for (const [name, v] of [["CERT_PIN_PRIMARY", primary], ["CERT_PIN_BACKUP", backup]]) {
      if (!v || /PLACEHOLDER|^A+=?$/i.test(v) || !SPKI_PIN_RE.test(v)) errors.push(`${name} missing or placeholder`);
    }
    if (primary && primary === backup) errors.push("CERT_PIN_BACKUP must differ from CERT_PIN_PRIMARY");
    const expiryRaw = env.CERT_PIN_EXPIRY;
    const expiry = expiryRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? Date.parse(`${expiryRaw}T00:00:00Z`) : NaN;
    if (Number.isNaN(expiry)) errors.push("CERT_PIN_EXPIRY missing or not YYYY-MM-DD");
    else if (expiry - now < MIN_PIN_VALIDITY_DAYS * 86_400_000)
      errors.push(`CERT_PIN_EXPIRY ${expiryRaw} is less than ${MIN_PIN_VALIDITY_DAYS} days away — rotate pins`);
    const apiUrl = env.EXPO_PUBLIC_API_URL ?? "";
    const apiHost = (/^https:\/\/([^/:?#]+)/i.exec(apiUrl) || [])[1];
    if (!apiHost) errors.push("EXPO_PUBLIC_API_URL must be https:// in production");
    else if (apiHost.toLowerCase() !== (env.API_HOST ?? "api.nftproxygamble.com").toLowerCase())
      errors.push(`API_HOST (${env.API_HOST ?? "api.nftproxygamble.com"}) must match the pinned EXPO_PUBLIC_API_URL host (${apiHost})`);

    // H2: production verifies balances with the Ed25519 public key only. The legacy
    // HMAC key is a forgeable shared secret and must not be bundled.
    if (!HEX64_RE.test(env.EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY ?? ""))
      errors.push("EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY (32-byte hex) is required for production");
    if (env.EXPO_PUBLIC_BALANCE_VERIFY_KEY)
      errors.push("EXPO_PUBLIC_BALANCE_VERIFY_KEY (legacy HMAC secret) must not be set for production");
  }

  // M4: chain is explicit for every EAS build.
  if (!["80002", "137"].includes(env.EXPO_PUBLIC_CHAIN_ID ?? ""))
    errors.push("EXPO_PUBLIC_CHAIN_ID must be 80002 (Amoy) or 137 (Polygon) for EAS builds");
  if (profile === "production" && env.EXPO_PUBLIC_CHAIN_ID !== "137")
    errors.push("production builds must use EXPO_PUBLIC_CHAIN_ID=137");

  if (errors.length) {
    throw new Error(`[app.config] refusing EAS build "${profile}":\n  - ${errors.join("\n  - ")}`);
  }
}

assertBuildEnv(process.env);

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: "Aurum",
    slug: "nft-proxy-gamble",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "nftproxygamble",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#07090F",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.nftproxygamble.app",
      infoPlist: {
        NSCameraUsageDescription: "Used for QR code scanning to connect wallet.",
        ITSAppUsesNonExemptEncryption: false,
        ...(PINNING_ENABLED
          ? {
              NSAppTransportSecurity: {
                NSPinnedDomains: {
                  [API_HOST]: {
                    NSIncludesSubdomains: true,
                    NSPinnedLeafIdentities: [
                      { "SPKI-SHA256-BASE64": PRIMARY_PIN },
                      { "SPKI-SHA256-BASE64": BACKUP_PIN },
                    ],
                  },
                },
              },
            }
          : {}),
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#07090F",
      },
      package: "com.nftproxygamble.app",
    },
    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-iap",
      "./plugins/withNdkVersion",
      ...(PINNING_ENABLED ? ["./plugins/withAndroidCertPinning"] : []),
    ],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      contractAddress: process.env.EXPO_PUBLIC_CONTRACT_ADDRESS,
    },
    experiments: {
      typedRoutes: true,
    },
  },
};

// Non-enumerable so Expo does not treat it as a config field; used by tests.
Object.defineProperty(module.exports, "assertBuildEnv", { value: assertBuildEnv, enumerable: false });
