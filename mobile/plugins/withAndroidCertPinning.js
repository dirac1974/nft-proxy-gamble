const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const API_HOST = process.env.API_HOST ?? "api.nftproxygamble.com";
// SHA-256 of SubjectPublicKeyInfo (base64). Get with:
//   openssl s_client -connect <host>:443 < /dev/null 2>/dev/null \
//     | openssl x509 -pubkey -noout \
//     | openssl pkey -pubin -outform DER \
//     | openssl dgst -sha256 -binary | base64
const PRIMARY_PIN = process.env.CERT_PIN_PRIMARY ?? "PLACEHOLDER_PRIMARY_SPKI_SHA256_BASE64";
const BACKUP_PIN = process.env.CERT_PIN_BACKUP ?? "PLACEHOLDER_BACKUP_SPKI_SHA256_BASE64";
// Expiry: set to ~2 years out; update before it expires during cert rotation
const PIN_EXPIRY = process.env.CERT_PIN_EXPIRY ?? "2028-01-01";

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">${API_HOST}</domain>
    <pin-set expiration="${PIN_EXPIRY}">
      <pin digest="SHA-256">${PRIMARY_PIN}</pin>
      <pin digest="SHA-256">${BACKUP_PIN}</pin>
    </pin-set>
  </domain-config>
  <debug-overrides>
    <!-- Allow cleartext and skip pinning in debug builds -->
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>
`;

function withAndroidCertPinning(config) {
  // Step 1: Write network_security_config.xml to res/xml/
  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const resXmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(resXmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG,
      );
      return modConfig;
    },
  ]);

  // Step 2: Reference the file in AndroidManifest.xml
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;
    const app = manifest.manifest.application?.[0];
    if (app) {
      app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }
    return modConfig;
  });

  return config;
}

module.exports = withAndroidCertPinning;
