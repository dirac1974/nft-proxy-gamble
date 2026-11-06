import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "../db/client.js";
import type { JwtPayload } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

// Pin the algorithm allowlist (FABLE-2026-07 H-3, defense-in-depth): never let a
// token dictate its own verification algorithm (e.g. "none", or an RS/HS
// confusion if the key handling ever changes). Only HS256 is issued below.
function verifyJwt(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload !== "object" || typeof payload.userId !== "string") return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

// Signature/expiry check only (no revocation lookup). Used to key rate limiters
// per user before the route's requireAuth runs; never use it to authorize.
export function userIdFromRequest(req: Request): string | null {
  if (req.user?.userId) return req.user.userId;
  const token = bearer(req);
  return token ? verifyJwt(token)?.userId ?? null : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // M-7: logged-out tokens are rejected until they expire. Tokens minted before
  // jti existed carry none and stay valid until their (<= JWT_EXPIRY) expiry.
  if (payload.jti) {
    try {
      const revoked = await prisma.revokedToken.findUnique({ where: { jti: payload.jti }, select: { jti: true } });
      if (revoked) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
    } catch (err) {
      next(err);
      return;
    }
  }
  req.user = payload;
  next();
}

export function signToken(payload: Pick<JwtPayload, "userId" | "walletAddress">): string {
  return jwt.sign({ userId: payload.userId, walletAddress: payload.walletAddress }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRY,
    algorithm: "HS256",
    jwtid: randomUUID(),
  } as jwt.SignOptions);
}
