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
import devRouter from "./routes/dev.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { config } from "./config/index.js";

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  const skipInTest = () => config.NODE_ENV === "test";
  const authLimiter = rateLimit({ windowMs: 60_000, max: 10, skip: skipInTest, standardHeaders: true, legacyHeaders: false });
  const gameLimiter = rateLimit({ windowMs: 60_000, max: 60, skip: skipInTest, standardHeaders: true, legacyHeaders: false });

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use("/auth", authLimiter, authRoutes);
  app.use("/balance", gameLimiter, balanceRoutes);
  app.use("/iap", gameLimiter, iapRoutes);
  app.use("/game", gameLimiter, gameRoutes);
  app.use("/nfts", gameLimiter, nftRoutes);
  app.use("/admin", gameLimiter, adminRoutes);

  if (process.env.NODE_ENV !== "production") {
    app.use("/dev", devRouter);
  }

  app.use(errorHandler);

  return app;
}
