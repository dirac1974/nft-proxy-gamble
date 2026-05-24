import "./config/index.js"; // crash-fast env validation
import { config } from "./config/index.js";
import { createApp } from "./app.js";
import { prisma } from "./db/client.js";

const app = createApp();

const server = app.listen(config.PORT, async () => {
  await prisma.$connect();
  console.log(`NFT Proxy Gamble backend listening on port ${config.PORT}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
