import "./config/index.js"; // crash-fast env validation
import { config } from "./config/index.js";
import { createApp } from "./app.js";
import { prisma } from "./db/client.js";
import { flushPendingCommitments } from "./services/purchaseCommitmentService.js";

const app = createApp();

const server = app.listen(config.PORT, async () => {
  await prisma.$connect();
  console.log(`NFT Proxy Gamble backend listening on port ${config.PORT}`);
});

const shutdown = async () => {
  console.log("[shutdown] Flushing pending purchase commitments…");
  await flushPendingCommitments().catch((err) =>
    console.error("[shutdown] commitment flush error:", err),
  );
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
