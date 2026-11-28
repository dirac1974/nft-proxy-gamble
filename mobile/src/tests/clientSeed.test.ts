import { newClientSeed, assertClientSeedEcho } from "@/services/clientSeed";
import { gameApi, rouletteApi, blackjackApi, resolveApiBaseUrl } from "@/services/api";
import { kenoApi } from "@/services/kenoApi";
import { slotApi } from "@/services/slotApi";

jest.mock("@/stores/walletStore", () => ({
  useWalletStore: { getState: () => ({ jwtToken: "jwt", userId: "u1", disconnect: jest.fn() }) },
}));
jest.mock("@/services/deviceAttestationService", () => ({ getAttestationHeaders: jest.fn(async () => ({})) }));

type Body = Record<string, unknown>;
const fetchMock = jest.fn();
let echo: (body: Body) => unknown = (b) => b.clientSeed;

beforeEach(() => {
  echo = (b) => b.clientSeed;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Body;
    return {
      ok: true,
      status: 201,
      json: async () => ({ sessionId: "s1", gameType: "g", serverSeedHash: "0xabc", clientSeed: echo(body) }),
    };
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

function sentBody(): Body {
  return JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as Body;
}

describe("newClientSeed", () => {
  it("returns 32 lowercase hex chars accepted by the backend regex", () => {
    const s = newClientSeed();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(s).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("is unique across calls", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newClientSeed()));
    expect(seen.size).toBe(200);
  });

  it("uses crypto.getRandomValues", () => {
    const spy = jest.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((a: Uint8Array) => a.fill(0xab)) as never);
    expect(newClientSeed()).toBe("ab".repeat(16));
    spy.mockRestore();
  });

  it("throws instead of falling back to Math.random when no CSPRNG is available", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(() => newClientSeed()).toThrow(/Secure random source unavailable/);
    } finally {
      if (desc) Object.defineProperty(globalThis, "crypto", desc);
    }
  });
});

describe("assertClientSeedEcho", () => {
  it("passes on exact echo and throws otherwise", () => {
    expect(() => assertClientSeedEcho("a1", "a1", "X")).not.toThrow();
    expect(() => assertClientSeedEcho("a1", "server-picked", "X")).toThrow(/did not honour the client seed/);
    expect(() => assertClientSeedEcho("a1", undefined, "X")).toThrow(/did not honour/);
  });
});

const starters: [string, string, () => Promise<{ clientSeed: string }>, (seed: string) => Promise<{ clientSeed: string }>][] = [
  ["video poker", "/game/start-session", () => gameApi.startSession(10), (s) => gameApi.startSession(10, "jacks-or-better", s)],
  ["roulette", "/roulette/start-session", () => rouletteApi.startSession(), (s) => rouletteApi.startSession(s)],
  ["blackjack", "/blackjack/start-session", () => blackjackApi.startSession(), (s) => blackjackApi.startSession(s)],
  ["keno", "/keno/start-session", () => kenoApi.startSession("single"), (s) => kenoApi.startSession("single", s)],
  ["slots", "/slots/start-session", () => slotApi.startSession(), (s) => slotApi.startSession(s)],
];

describe.each(starters)("%s startSession", (_name, path, startDefault, startWith) => {
  it("generates and sends a device client seed when the caller passes none", async () => {
    const resp = await startDefault();
    expect(String(fetchMock.mock.calls[0]![0])).toContain(path);
    const body = sentBody();
    expect(body.clientSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(resp.clientSeed).toBe(body.clientSeed);
  });

  it("sends the caller's seed unchanged", async () => {
    const resp = await startWith("player_seed-1");
    expect(sentBody().clientSeed).toBe("player_seed-1");
    expect(resp.clientSeed).toBe("player_seed-1");
  });

  it("rejects a session whose clientSeed was replaced by the server", async () => {
    echo = () => "deadbeefdeadbeefdeadbeefdeadbeef";
    await expect(startDefault()).rejects.toThrow(/did not honour the client seed/);
  });

  it("rejects a session that omits clientSeed", async () => {
    echo = () => undefined;
    await expect(startDefault()).rejects.toThrow(/did not honour the client seed/);
  });
});

describe("resolveApiBaseUrl (M2)", () => {
  it("dev: falls back to localhost and allows http", () => {
    expect(resolveApiBaseUrl(undefined, undefined, true)).toBe("http://localhost:3000");
    expect(resolveApiBaseUrl("http://10.0.2.2:3000/", undefined, true)).toBe("http://10.0.2.2:3000");
  });

  it("release: requires a configured URL", () => {
    expect(() => resolveApiBaseUrl(undefined, undefined, false)).toThrow(/not configured/);
  });

  it("release: rejects http and non-allow-listed hosts", () => {
    expect(() => resolveApiBaseUrl("http://api.nftproxygamble.com", undefined, false)).toThrow(/https/);
    expect(() => resolveApiBaseUrl("https://evil.example.com", undefined, false)).toThrow(/not allow-listed/);
    expect(() => resolveApiBaseUrl("https://api.nftproxygamble.com.evil.io", undefined, false)).toThrow(/not allow-listed/);
    expect(() => resolveApiBaseUrl("https://user@evil.io/api.nftproxygamble.com", undefined, false)).toThrow();
  });

  it("release: accepts allow-listed hosts and an https host from app.config extra", () => {
    expect(resolveApiBaseUrl("https://api.nftproxygamble.com/", undefined, false)).toBe("https://api.nftproxygamble.com");
    expect(resolveApiBaseUrl("https://api-staging.nftproxygamble.com", undefined, false)).toBe(
      "https://api-staging.nftproxygamble.com",
    );
    expect(resolveApiBaseUrl(undefined, "https://api.partner.io", false)).toBe("https://api.partner.io");
    expect(() => resolveApiBaseUrl(undefined, "http://api.partner.io", false)).toThrow(/https/);
  });
});
