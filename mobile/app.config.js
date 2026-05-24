const API_HOST = process.env.API_HOST ?? "api.nftproxygamble.com";
const PRIMARY_PIN = process.env.CERT_PIN_PRIMARY ?? "PLACEHOLDER_PRIMARY_SPKI_SHA256_BASE64";
const BACKUP_PIN = process.env.CERT_PIN_BACKUP ?? "PLACEHOLDER_BACKUP_SPKI_SHA256_BASE64";

// Cert pinning is only enabled in production EAS builds where real pins are configured.
// In dev (Expo Go / local), pins are placeholders — pinning is skipped at OS level when
// the pin value is "PLACEHOLDER_*" because they won't match any real cert fingerprint.
// This is intentional: dev builds should not be blocked by pinning.
const PINNING_ENABLED =
  !PRIMARY_PIN.startsWith("PLACEHOLDER") && !BACKUP_PIN.startsWith("PLACEHOLDER");

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: "NFT Proxy Gamble",
    slug: "nft-proxy-gamble",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "nftproxygamble",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1a0033",
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
        backgroundColor: "#1a0033",
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
      [
        "react-native-iap",
        {
          paymentProvider: "both",
        },
      ],
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
