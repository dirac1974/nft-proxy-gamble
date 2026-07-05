import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import balanceRoutes from "./routes/balance.js";
import iapRoutes from "./routes/iap.js";
import gameRoutes from "./routes/game.js";
import nftRoutes from "./routes/nfts.js";
import adminRoutes from "./routes/admin.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { config } from "./config/index.js";
import { getPendingBatchSize } from "./services/purchaseCommitmentService.js";

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  // Bound request bodies (FABLE-2026-07 M-4). Apple receipts are the largest
  // legitimate payload and sit well under this; the cap prevents large-payload
  // memory-pressure DoS on the unauthenticated-ish JSON parser.
  app.use(express.json({ limit: "256kb" }));

  const skipInTest = () => config.NODE_ENV === "test";
  const authLimiter = rateLimit({ windowMs: 60_000, max: 10, skip: skipInTest, standardHeaders: true, legacyHeaders: false });
  const gameLimiter = rateLimit({ windowMs: 60_000, max: 60, skip: skipInTest, standardHeaders: true, legacyHeaders: false });

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
  app.use("/nfts", gameLimiter, nftRoutes);
  app.use("/admin", gameLimiter, adminRoutes);

  app.use(errorHandler);

  return app;
}
