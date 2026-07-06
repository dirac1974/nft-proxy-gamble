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
    // Pin the algorithm allowlist (FABLE-2026-07 H-3, defense-in-depth): never let a
    // token dictate its own verification algorithm (e.g. "none", or an RS/HS
    // confusion if the key handling ever changes). Only HS256 is issued below.
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRY,
    algorithm: "HS256",
  } as jwt.SignOptions);
}
