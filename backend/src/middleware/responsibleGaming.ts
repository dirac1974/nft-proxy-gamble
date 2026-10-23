import type { Request, Response, NextFunction } from "express";
import { rgError, wagerBlockFor } from "../services/responsibleGaming.js";

// Gate for routes that START a new wagered round (start-session, and the
// debit points deal/spin/play). Refuses with 403 {code: RG_COOL_OFF |
// RG_SELF_EXCLUDED | RG_LOSS_LIMIT, until} while the player is on a break,
// self-excluded, or has hit today's loss limit.
//
// Deliberately NOT applied to routes that settle a round already in progress
// (/game/draw, /blackjack/action, /blackjack/insurance, /slots/feature): the
// stake is already debited, so blocking them would trap the player's funds in
// an unfinished round. Cash-out routes are never gated by RG either.
export async function requireCanWager(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const block = await wagerBlockFor(req.user!.userId, new Date());
    next(block ? rgError(block) : undefined);
  } catch (err) {
    next(err);
  }
}
