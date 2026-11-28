// H1: the client seed must come from the player's device, never the server.
// A server-chosen clientSeed lets the house grind serverSeed/clientSeed pairs
// until the outcome favours it, which voids the provably-fair commitment.
// Backend accepts /^[A-Za-z0-9_-]{1,64}$/ — 32 lowercase hex chars fits.

const HEX = "0123456789abcdef";

export function newClientSeed(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c || typeof c.getRandomValues !== "function") {
    // Never fall back to Math.random — a guessable seed is as bad as a server-chosen one.
    throw new Error("Secure random source unavailable (react-native-get-random-values not loaded)");
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

export function assertClientSeedEcho(sent: string, received: unknown, game: string): void {
  if (received !== sent) {
    throw new Error(
      `${game}: server did not honour the client seed (sent ${sent}, got ${String(received)}). ` +
        "Session rejected — outcomes would not be provably fair.",
    );
  }
}

/** Generates a seed when the caller passes none, POSTs it, and verifies the echo. */
export async function withClientSeed<T extends { clientSeed?: unknown }>(
  game: string,
  clientSeed: string | undefined,
  call: (seed: string) => Promise<T>,
): Promise<T> {
  const seed = clientSeed ?? newClientSeed();
  const resp = await call(seed);
  assertClientSeedEcho(seed, resp?.clientSeed, game);
  return resp;
}
