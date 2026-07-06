import { Router } from "express";
import { randomBytes } from "crypto";
import { verifyMessage } from "ethers";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { freshChainInit } from "../services/serverSeedChain.js";

const router = Router();

// In-memory nonce store: address → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL_MS = 60_000;

// GET /auth/nonce?address=0x...
router.get("/nonce", (req, res, next) => {
  try {
    const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(req.query.address);
    // Use a CSPRNG for the challenge (FABLE-2026-07 L-1). Math.random() is not
    // cryptographically secure; a security challenge that gates wallet auth should
    // be unpredictable.
    const nonce = `Sign this message to authenticate with NFT Proxy Gamble: ${Date.now()}-${randomBytes(16).toString("hex")}`;
    nonceStore.set(address.toLowerCase(), { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
    res.json({ nonce });
  } catch {
    next(new AppError(400, "address must be a valid Ethereum address"));
  }
});

// POST /auth/verify
const verifySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().min(130),
});

router.post("/verify", async (req, res, next) => {
  try {
    const { address, signature } = verifySchema.parse(req.body);
    const lower = address.toLowerCase();
    const entry = nonceStore.get(lower);

    if (!entry || Date.now() > entry.expiresAt) {
      throw new AppError(401, "Nonce expired or not found. Request a new nonce.");
    }

    const recovered = verifyMessage(entry.nonce, signature);
    if (recovered.toLowerCase() !== lower) {
      throw new AppError(401, "Signature verification failed");
    }

    nonceStore.delete(lower);

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
