import { resolveChainId, isLoopbackRpc, e2eAllowed, E2E_CHAIN_ID } from "@/services/walletService";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require("../../app.config.js") as { assertBuildEnv: (env: Record<string, string | undefined>, now?: number) => void };
const { assertBuildEnv } = appConfig;

const NOW = Date.parse("2026-10-12T00:00:00Z");
const PIN_A = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
const PIN_B = "2Fu7fwbMQZ+Kzp4ITlnRoCVtfuMoYZHdmTE9JKSnDgM=";

const goodProd = (): Record<string, string | undefined> => ({
  EAS_BUILD_PROFILE: "production",
  CERT_PIN_PRIMARY: PIN_A,
  CERT_PIN_BACKUP: PIN_B,
  CERT_PIN_EXPIRY: "2027-06-01",
  EXPO_PUBLIC_API_URL: "https://api.nftproxygamble.com",
  EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY: "ab".repeat(32),
  EXPO_PUBLIC_CHAIN_ID: "137",
});

describe("app.config assertBuildEnv", () => {
  it("is a no-op outside EAS builds", () => {
    expect(() => assertBuildEnv({ EXPO_PUBLIC_E2E_WALLET_PK: "0x1" }, NOW)).not.toThrow();
  });

  it("accepts a fully configured production build", () => {
    expect(() => assertBuildEnv(goodProd(), NOW)).not.toThrow();
  });

  it.each([
    ["missing primary pin", { CERT_PIN_PRIMARY: undefined }, /CERT_PIN_PRIMARY/],
    ["placeholder backup pin", { CERT_PIN_BACKUP: "PLACEHOLDER_BACKUP_SPKI_SHA256_BASE64" }, /CERT_PIN_BACKUP/],
    ["identical pins", { CERT_PIN_BACKUP: PIN_A }, /must differ/],
    ["missing expiry", { CERT_PIN_EXPIRY: undefined }, /CERT_PIN_EXPIRY/],
    ["expiry < 90 days", { CERT_PIN_EXPIRY: "2026-12-01" }, /less than 90 days/],
    ["http api url", { EXPO_PUBLIC_API_URL: "http://api.nftproxygamble.com" }, /https/],
    ["api host != pinned host", { EXPO_PUBLIC_API_URL: "https://api-staging.nftproxygamble.com" }, /must match/],
    ["missing balance pubkey", { EXPO_PUBLIC_BALANCE_VERIFY_PUBKEY: undefined }, /BALANCE_VERIFY_PUBKEY/],
    ["legacy hmac key bundled", { EXPO_PUBLIC_BALANCE_VERIFY_KEY: "aa".repeat(32) }, /legacy HMAC/],
    ["testnet chain in prod", { EXPO_PUBLIC_CHAIN_ID: "80002" }, /CHAIN_ID=137/],
    ["e2e var in prod", { EXPO_PUBLIC_E2E_CHAIN_RPC: "http://10.0.2.2:8545" }, /EXPO_PUBLIC_E2E_/],
  ])("production rejects %s", (_n, patch, msg) => {
    expect(() => assertBuildEnv({ ...goodProd(), ...patch }, NOW)).toThrow(msg);
  });

  it.each(["development", "testnet", "preview-sim"])("forbids EXPO_PUBLIC_E2E_* for EAS profile %s", (profile) => {
    expect(() =>
      assertBuildEnv({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_CHAIN_ID: "80002", EXPO_PUBLIC_E2E_WALLET_PK: "0x01" }, NOW),
    ).toThrow(/EXPO_PUBLIC_E2E_WALLET_PK/);
  });

  it("requires an explicit chain id for non-production EAS profiles", () => {
    expect(() => assertBuildEnv({ EAS_BUILD_PROFILE: "testnet" }, NOW)).toThrow(/EXPO_PUBLIC_CHAIN_ID/);
    expect(() => assertBuildEnv({ EAS_BUILD_PROFILE: "testnet", EXPO_PUBLIC_CHAIN_ID: "80002" }, NOW)).not.toThrow();
  });
});

describe("resolveChainId (M4)", () => {
  it("defaults to Amoy only in dev", () => {
    expect(resolveChainId(undefined, true)).toBe(80002);
    expect(() => resolveChainId(undefined, false)).toThrow(/not set/);
  });

  it("accepts 80002 / 137 and rejects anything else", () => {
    expect(resolveChainId("80002", false)).toBe(80002);
    expect(resolveChainId("137", false)).toBe(137);
    expect(() => resolveChainId("1", false)).toThrow(/must be one of/);
    expect(() => resolveChainId("31337", true)).toThrow(/must be one of/);
  });
});

describe("E2E wallet guard (M1)", () => {
  const PK = "0x" + "11".repeat(32);

  it("only treats loopback / emulator hosts as local", () => {
    expect(isLoopbackRpc("http://127.0.0.1:8545")).toBe(true);
    expect(isLoopbackRpc("http://localhost:8545")).toBe(true);
    expect(isLoopbackRpc("http://10.0.2.2:8545/")).toBe(true);
    expect(isLoopbackRpc("https://polygon-rpc.com")).toBe(false);
    expect(isLoopbackRpc("http://localhost.evil.io:8545")).toBe(false);
    expect(isLoopbackRpc("http://127.0.0.1@evil.io")).toBe(false);
    expect(isLoopbackRpc(undefined)).toBe(false);
  });

  it("requires dev + key + loopback rpc + chain id 31337", () => {
    expect(E2E_CHAIN_ID).toBe(31337);
    expect(e2eAllowed(true, "http://10.0.2.2:8545", PK, "31337")).toBe(true);
    expect(e2eAllowed(false, "http://10.0.2.2:8545", PK, "31337")).toBe(false);
    expect(e2eAllowed(true, "http://10.0.2.2:8545", PK, undefined)).toBe(false);
    expect(e2eAllowed(true, "http://10.0.2.2:8545", PK, "137")).toBe(false);
    expect(e2eAllowed(true, "https://rpc.ankr.com/polygon", PK, "31337")).toBe(false);
    expect(e2eAllowed(true, "http://10.0.2.2:8545", undefined, "31337")).toBe(false);
  });
});
