import { Router } from "express";
import { verifyMessage } from "ethers";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { signToken } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

// In-memory nonce store: address → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL_MS = 60_000;

// GET /auth/nonce?address=0x...
router.get("/nonce", (req, res, next) => {
  try {
    const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(req.query.address);
    const nonce = `Sign this message to authenticate with NFT Proxy Gamble: ${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

    const user = await prisma.user.upsert({
      where: { walletAddress: lower },
      create: { walletAddress: lower },
      update: {},
    });

    const token = signToken({ userId: user.id, walletAddress: lower });
    res.json({ token, userId: user.id, ageConfirmed: user.ageConfirmed });
  } catch (err) {
    next(err);
  }
});

// POST /auth/confirm-age — called once after user accepts 18+ modal
router.post("/confirm-age", async (req, res, next) => {
  // Requires auth header but not walletStore — anyone with a valid JWT can confirm
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const jwt = await import("jsonwebtoken");
    const { config } = await import("../config/index.js");
    const payload = jwt.default.verify(header.slice(7), config.JWT_SECRET) as { userId: string };
    await prisma.user.update({
      where: { id: payload.userId },
      data: { ageConfirmed: true },
    });
    res.json({ ageConfirmed: true });
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
});

export default router;
