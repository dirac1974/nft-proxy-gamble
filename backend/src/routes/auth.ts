import { Router } from "express";
import { randomBytes } from "crypto";
import { getAddress, verifyMessage } from "ethers";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { config } from "../config/index.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { freshChainInit } from "../services/serverSeedChain.js";
import { SIWE_STATEMENT, formatSiweMessage, parseSiweMessage } from "../services/siwe.js";

const router = Router();

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

// Legacy clients sign the bare `nonce` string instead of the EIP-4361 message.
// Accepted ONLY outside production, as a transition while mobile moves to
// signing `message`. Production requires the SIWE message.
function legacyNonceSigningAllowed(): boolean {
  return config.NODE_ENV !== "production";
}

// GET /auth/nonce?address=0x...
// Response: { nonce, message, expiresAt }. Clients sign `message` (EIP-191
// personal_sign) and POST it back to /auth/verify with the signature.
router.get("/nonce", async (req, res, next) => {
  let address: string;
  try {
    address = getAddress(addressSchema.parse(req.query.address));
  } catch {
    next(new AppError(400, "address must be a valid Ethereum address"));
    return;
  }
  try {
    // CSPRNG, alphanumeric (EIP-4361 nonce grammar), 128 bits.
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + config.SIWE_NONCE_TTL_SECONDS * 1000);
    const message = formatSiweMessage({
      domain: config.SIWE_DOMAIN,
      address,
      statement: SIWE_STATEMENT,
      uri: config.SIWE_URI,
      version: "1",
      chainId: config.SIWE_CHAIN_ID,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expirationTime: expiresAt.toISOString(),
    });
    // Keyed by nonce: requesting a nonce for someone else's address no longer
    // overwrites (and so invalidates) theirs. Expired rows are purged lazily.
    await prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60_000) } } });
    await prisma.authNonce.create({
      data: { nonce, address: address.toLowerCase(), message, expiresAt },
    });
    res.json({ nonce, message, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /auth/verify  { address, signature, message? }
const verifySchema = z.object({
  address: addressSchema,
  signature: z.string().min(130).max(200),
  message: z.string().min(1).max(2000).optional(),
});

const authFailed = () => new AppError(401, "Nonce expired or not found. Request a new nonce.");

async function consumeNonce(nonce: string): Promise<boolean> {
  const r = await prisma.authNonce.updateMany({
    where: { nonce, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return r.count === 1;
}

router.post("/verify", async (req, res, next) => {
  try {
    const { address, signature, message } = verifySchema.parse(req.body);
    const lower = address.toLowerCase();

    if (message !== undefined) {
      const fields = parseSiweMessage(message);
      if (!fields) throw new AppError(401, "Malformed sign-in message");
      const row = await prisma.authNonce.findUnique({ where: { nonce: fields.nonce } });
      // The stored message is the one we issued; exact match pins domain, uri,
      // chainId, address, issuedAt and expiry to server-chosen values.
      if (!row || row.message !== message || row.address !== lower || fields.address.toLowerCase() !== lower) {
        throw authFailed();
      }
      if (row.consumedAt || row.expiresAt.getTime() <= Date.now()) throw authFailed();
      if (fields.domain !== config.SIWE_DOMAIN || fields.chainId !== config.SIWE_CHAIN_ID) throw authFailed();
      let recovered: string;
      try {
        recovered = verifyMessage(message, signature);
      } catch {
        throw new AppError(401, "Signature verification failed");
      }
      if (recovered.toLowerCase() !== lower) throw new AppError(401, "Signature verification failed");
      if (!(await consumeNonce(row.nonce))) throw authFailed();
    } else {
      if (!legacyNonceSigningAllowed()) throw new AppError(401, "Sign the EIP-4361 `message` returned by /auth/nonce");
      // Legacy (non-production only): signature over the bare nonce string. Try
      // this address's live nonces, newest first.
      const rows = await prisma.authNonce.findMany({
        where: { address: lower, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      if (rows.length === 0) throw authFailed();
      const match = rows.find((r) => {
        try {
          return verifyMessage(r.nonce, signature).toLowerCase() === lower;
        } catch {
          return false;
        }
      });
      if (!match) throw new AppError(401, "Signature verification failed");
      if (!(await consumeNonce(match.nonce))) throw authFailed();
    }

    // Initialize the provably-fair server-seed chain (FABLE-2026-07 H-2) on
    // account creation so a new user's very first session already consumes a
    // pre-committed seed (no bootstrap grinding gap).
    const user = await prisma.user.upsert({
      where: { walletAddress: lower },
      create: { walletAddress: lower, ...freshChainInit() },
      update: {},
    });

    const token = signToken({ userId: user.id, walletAddress: lower });
    res.json({
      token,
      userId: user.id,
      ageConfirmed: user.ageConfirmed,
      // Commitment for the next server seed, so the client can verify chain
      // continuity from its first session (null for pre-H-2 accounts until
      // their next session initializes the chain).
      serverSeedChainHash: user.nextServerSeedHash,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — revokes the presented token (M-7) until its expiry.
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const { jti, exp, userId } = req.user!;
    if (jti) {
      const expiresAt = new Date((exp ?? Math.floor(Date.now() / 1000) + 86_400) * 1000);
      await prisma.revokedToken.upsert({
        where: { jti },
        create: { jti, userId, expiresAt },
        update: {},
      });
      await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    }
    res.json({ loggedOut: true, revoked: Boolean(jti) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/confirm-age — called once after user accepts 18+ modal
router.post("/confirm-age", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    await prisma.user.update({
      where: { id: userId },
      data: { ageConfirmed: true },
    });
    res.json({ ageConfirmed: true });
  } catch (err) {
    next(err);
  }
});

export default router;
