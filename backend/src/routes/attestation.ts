import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config/index.js";
import { issueChallenge, encodeChallenge } from "../services/deviceAttest/challenge.js";

const router = Router();

// POST /attestation/challenge — issue a fresh single-use challenge that the
// client must bind into its App Attest / Play Integrity proof and echo back in
// the `x-attestation-challenge` header on the next money-path request. Stateless
// (HMAC over JWT_SECRET) + short TTL; see services/deviceAttest/challenge.ts.
router.post("/challenge", requireAuth, (req, res) => {
  const challenge = issueChallenge(config.JWT_SECRET);
  res.json({
    challenge: encodeChallenge(challenge),
    nonce: challenge.nonce, // what the client embeds (clientDataHash / Play Integrity nonce)
    expiresAt: challenge.expiresAt,
  });
});

export default router;
