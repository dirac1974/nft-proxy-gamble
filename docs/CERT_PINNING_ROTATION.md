# Certificate Pinning Rotation Procedure

## How pinning works

iOS: `NSPinnedDomains` in `Info.plist` — enforced by the OS TLS stack before any HTTP traffic.
Android: `network_security_config.xml` — enforced by the Android Network Security framework.

Pinned value: SHA-256 of SubjectPublicKeyInfo (SPKI) — survives cert renewal if the same key pair is kept.

## Generating a new pin

```bash
# From the live server
openssl s_client -connect api.nftproxygamble.com:443 < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | base64

# From a local cert file
openssl x509 -in server.crt -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | base64
```

## Rotation without breaking live users

1. **Generate backup pin** for the new key pair BEFORE switching certs on the server.
2. **Publish app update** with BOTH old pin (primary) and new pin (backup).
3. **Wait for users to update** — use app store review time + 2 weeks of adoption time.
4. **Rotate server cert** to the new key pair.
5. **Publish second app update** demoting new pin to primary, removing old pin.
6. Update `CERT_PIN_EXPIRY` in EAS secrets to match the new cert expiry minus 2 months.

## EAS secrets to set before production build

```
CERT_PIN_PRIMARY    = <base64 SPKI SHA-256 of primary leaf cert>
CERT_PIN_BACKUP     = <base64 SPKI SHA-256 of backup cert or intermediate CA>
CERT_PIN_EXPIRY     = YYYY-MM-DD  (Android pin-set expiration)
API_HOST            = api.nftproxygamble.com
```

Without these values, `app.config.js` disables pinning entirely (placeholder detection).
Pinning is intentionally skipped in local dev / Expo Go builds.

## Monitoring

If a user's pinned cert expires before rotation completes, all network calls will fail silently.
Set a calendar reminder 2 months before `CERT_PIN_EXPIRY`. The Android pin-set `expiration`
attribute lets the OS fall back to normal cert validation after that date (fail-open, not fail-closed).
iOS `NSPinnedDomains` has no expiry — requires a forced app update on cert rotation.
