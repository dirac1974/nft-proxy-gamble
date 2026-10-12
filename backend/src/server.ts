import "./config/index.js"; // crash-fast env validation
import { config } from "./config/index.js";
import { createApp } from "./app.js";
import { prisma } from "./db/client.js";
import { startChainWorker } from "./services/chainWorker.js";

const app = createApp();
let stopChainWorker: (() => void) | null = null;

const server = app.listen(config.PORT, async () => {
  await prisma.$connect();
  console.log(`NFT Proxy Gamble backend listening on port ${config.PORT}`);
  // Mint + purchase-commitment worker: reconciles on boot, then on an interval.
  stopChainWorker = startChainWorker();
});

const shutdown = async () => {
  // Jobs are durable DB rows (NFTVoucher / IAPReceipt); nothing to flush.
  stopChainWorker?.();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
