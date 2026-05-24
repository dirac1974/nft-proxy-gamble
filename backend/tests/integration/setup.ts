import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();

export async function setupTestDb(): Promise<void> {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env },
    stdio: "pipe",
  });
}

export async function teardownTestDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Transaction", "NFTVoucher", "IAPReceipt", "GameSession", "User" CASCADE');
  await prisma.$disconnect();
}

export { prisma };
