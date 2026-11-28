import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import balanceRoutes from "./routes/balance.js";
import iapRoutes from "./routes/iap.js";
import gameRoutes from "./routes/game.js";
import rouletteRoutes from "./routes/roulette.js";
import kenoRoutes from "./routes/keno.js";
import slotsRoutes from "./routes/slots.js";
import attestationRoutes from "./routes/attestation.js";
import blackjackRoutes from "./routes/blackjack.js";
import nftRoutes from "./routes/nfts.js";
import walletRoutes from "./routes/wallet.js";
import adminRoutes from "./routes/admin.js";
import rgRoutes from "./routes/rg.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { config } from "./config/index.js";
import { getPendingBatchSize } from "./services/purchaseCommitmentService.js";
import { userOrIpKey } from "./middleware/attestationRateLimit.js";

export function createApp(): express.Application {
  const app = express();

  // Rate limiters and req.ip must see the real client IP, not the edge/LB IP.
  // TRUST_PROXY = number of proxy hops in front of the app (default 1 in
  // production). Never "true": that trusts a client-supplied X-Forwarded-For.
  app.set("trust proxy", config.TRUST_PROXY);

  app.use(helmet());
  // CORS allowlist (CORS_ORIGINS). Production default: no browser origin is
  // allowed. Native mobile apps send no Origin header and are unaffected.
  // Outside production with CORS_ORIGINS unset, any origin is allowed (dev).
  const corsOrigin: cors.CorsOptions["origin"] =
    config.CORS_ORIGINS_SET || config.NODE_ENV === "production" ? config.CORS_ORIGINS : true;
  app.use(cors({ origin: corsOrigin }));
  // Bound request bodies (FABLE-2026-07 M-4). Apple receipts are the largest
  // legitimate payload and sit well under this; the cap prevents large-payload
  // memory-pressure DoS on the unauthenticated-ish JSON parser.
  app.use(express.json({ limit: "256kb" }));

  const skipInTest = () => config.NODE_ENV === "test";
  const authLimiter = rateLimit({ windowMs: 60_000, max: 10, skip: skipInTest, standardHeaders: true, legacyHeaders: false });
  // Keyed per authenticated user (fallback IP) so NAT/shared-IP users do not
  // share one budget and an abuser cannot dodge it by rotating IPs.
  const gameLimiter = rateLimit({ windowMs: 60_000, max: 60, keyGenerator: userOrIpKey, skip: skipInTest, standardHeaders: true, legacyHeaders: false });

  // /health is the canonical liveness probe. Now also surfaces internal
  // backlog metrics so monitoring (per docs/MONITORING_ALERTS_SPEC.md) can
  // alert on a growing commitPurchase batch without needing direct process
  // access. Keep additions to this endpoint cheap — no DB calls, no network.
  app.get("/health", (_req, res) => res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    pendingCommitBatch: getPendingBatchSize(),
  }));

  app.use("/auth", authLimiter, authRoutes);
  app.use("/balance", gameLimiter, balanceRoutes);
  app.use("/iap", gameLimiter, iapRoutes);
  app.use("/game", gameLimiter, gameRoutes);
  app.use("/roulette", gameLimiter, rouletteRoutes);
  app.use("/keno", gameLimiter, kenoRoutes);
  app.use("/slots", gameLimiter, slotsRoutes);
  app.use("/attestation", gameLimiter, attestationRoutes);
  app.use("/blackjack", gameLimiter, blackjackRoutes);
  app.use("/nfts", gameLimiter, nftRoutes);
  app.use("/wallet", gameLimiter, walletRoutes);
  app.use("/admin", gameLimiter, adminRoutes);
  app.use("/rg", gameLimiter, rgRoutes);

  app.use(errorHandler);

  return app;
}
