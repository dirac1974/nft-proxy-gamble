import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// TODO (Claude Phase 2): Add routes, middleware (helmet, rate-limit, cors), auth
// Mount /auth, /iap, /game, /nfts, /balance

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example stub for video poker deal
app.post('/game/video-poker/start', async (req, res) => {
  // TODO: Implement full provably fair deal using crypto + keccak
  // Validate bet, create session in DB, return initialCards + seeds hash
  res.json({ message: 'Stub - implement in Phase 2', sessionId: 'sess_123' });
});

app.listen(PORT, () => {
  console.log(`NFT Proxy Gamble Backend running on port ${PORT}`);
});