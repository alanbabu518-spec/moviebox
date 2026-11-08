import crypto from "node:crypto";
import type { Request } from "express";

import { tokenBucket } from "./tokenBucket.js";

const getIp = (req: Request): string => req.ip ?? "unknown";

const getEmail = (req: Request): string => {
  const email = req.body?.email;

  return typeof email === "string"
    ? email.trim().toLowerCase().slice(0, 254)
    : "unknown";
};

const getTokenFingerprint = (req: Request): string => {
  const token = req.query.token;

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return "invalid";
  }

  // Store only a SHA-256 fingerprint, never the raw authentication token.
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Limits magic-link requests by both IP address and normalized email.
 * Capacity: 5 requests; refills at approximately 1 request per minute.
 */
export const emailLoginRateLimiter = tokenBucket({
  keyPrefix: "auth-email",
  capacity: 5,
  refillRate: 1 / 60,
  getKeys: (req) => [`ip:${getIp(req)}`, `email:${getEmail(req)}`],
});

/**
 * Limits magic-link verification attempts by IP and token fingerprint.
 * Capacity: 10 attempts; refills at approximately 1 attempt per 30 seconds.
 */
export const magicLinkVerifyRateLimiter = tokenBucket({
  keyPrefix: "auth-verify",
  capacity: 10,
  refillRate: 1 / 30,
  getKeys: (req) => [`ip:${getIp(req)}`, `token:${getTokenFingerprint(req)}`],
});

/**
 * Limits Google OAuth start and callback requests by IP address.
 * Capacity: 10 requests; refills at approximately 1 request per 30 seconds.
 */
export const googleOAuthRateLimiter = tokenBucket({
  keyPrefix: "auth-google",
  capacity: 10,
  refillRate: 1 / 30,
  getKeys: (req) => [`ip:${getIp(req)}`],
});
