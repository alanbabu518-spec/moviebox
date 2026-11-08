import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { AppError } from "../shared/utils/appError.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const trustedOrigin = new URL(env.clientUrl).origin;

/**
 * Protects browser requests against Cross-Site Request Forgery.
 *
 * All methods except GET, HEAD, and OPTIONS must provide
 * the exact trusted Origin.
 */
export const csrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not modify application state.
  if (safeMethods.has(method)) {
    next();
    return;
  }

  const origin = req.get("origin");

  // Reject requests without an Origin header.
  if (!origin) {
    next(new AppError("Origin header is required for this request", 403));
    return;
  }

  // Reject requests from any origin other than the configured frontend.
  if (origin !== trustedOrigin) {
    next(new AppError("Invalid request origin", 403));
    return;
  }

  next();
};
