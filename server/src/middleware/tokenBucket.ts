import type { Request, Response, NextFunction } from "express";

import { consumeTokens } from "../services/rateLimit.service.js";

type TokenBucketMiddlewareOptions = {
  keyPrefix: string;
  capacity: number;
  refillRate: number;
  getKeys?: (req: Request) => string[];
};

export const tokenBucket = ({
  keyPrefix,
  capacity,
  refillRate,
  getKeys = (req) => [req.ip ?? "unknown"],
}: TokenBucketMiddlewareOptions) => {
  if (
    !keyPrefix ||
    !Number.isFinite(capacity) ||
    capacity <= 0 ||
    !Number.isFinite(refillRate) ||
    refillRate <= 0
  ) {
    throw new Error("Invalid token bucket middleware configuration");
  }

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const identifiers = [
        ...new Set(
          getKeys(req).filter(
            (identifier) =>
              typeof identifier === "string" && identifier.length > 0,
          ),
        ),
      ];

      if (identifiers.length === 0) {
        next(new Error("No rate-limit identifiers available"));
        return;
      }

      const result = await consumeTokens(
        identifiers.map((identifier) => ({
          key: `moviebox:rate-limit:${keyPrefix}:${identifier}`,
          capacity,
          refillRate,
        })),
      );

      res.setHeader("X-RateLimit-Limit", capacity.toString());

      res.setHeader("X-RateLimit-Remaining", result.remaining.toString());

      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfter.toString());

        res.status(429).json({
          success: false,
          message: "Too many requests. Please try again later.",
          retryAfter: result.retryAfter,
        });

        return;
      }

      next();
    } catch (error) {
      // Fail closed if Redis rate limiting is unavailable.
      next(error);
    }
  };
};
