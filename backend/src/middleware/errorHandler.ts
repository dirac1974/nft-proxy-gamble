import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // Request-body validation failure (schema.parse in a route). A client error,
  // not a server fault: 400 with a fixed message — never echo Zod issues, which
  // reveal schema internals (field names, bounds, enum values).
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  // Prisma unique constraint violation
  if ((err as NodeJS.ErrnoException).code === "P2002") {
    res.status(409).json({ error: "Duplicate record" });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
}
