import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import type { JwtPayload } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    // SECURITY (RT-LOW-1): pin the algorithm to HS256. Without an explicit
    // allowlist, jsonwebtoken will accept any algorithm the token header
    // declares, opening the door to algorithm-confusion attacks (e.g. a token
    // forged with "none", or RS256 verified against our symmetric secret as a
    // public key). We only ever issue HS256 tokens, so reject everything else.
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: config.JWT_EXPIRY,
  } as jwt.SignOptions);
}
