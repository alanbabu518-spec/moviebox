import crypto from "node:crypto";

import { redis } from "../../config/redis.js";

const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const MAGIC_LINK_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const hashMagicLinkToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const getMagicLinkKey = (tokenHash: string): string =>
  `moviebox:magic-link:${tokenHash}`;

export const createMagicLinkToken = async (email: string): Promise<string> => {
  const normalizedEmail = email.trim().toLowerCase();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashMagicLinkToken(token);

  const result = await redis.set(
    getMagicLinkKey(tokenHash),
    JSON.stringify({ email: normalizedEmail }),
    "EX",
    MAGIC_LINK_TTL_SECONDS,
    "NX",
  );

  if (result !== "OK") {
    throw new Error("Unable to create a unique magic-link token");
  }

  // Return the original token only to the email service.
  // Redis stores only its SHA-256 hash.
  return token;
};

export const consumeMagicLinkToken = async (
  token: string,
): Promise<{ email: string } | null> => {
  // Reject malformed tokens before querying Redis.
  if (typeof token !== "string" || !MAGIC_LINK_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const tokenHash = hashMagicLinkToken(token);

  // GETDEL atomically retrieves and deletes the token.
  const data = (await redis.call("GETDEL", getMagicLinkKey(tokenHash))) as
    | string
    | null;

  if (!data) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("email" in parsed) ||
      typeof parsed.email !== "string"
    ) {
      return null;
    }

    const email = parsed.email.trim().toLowerCase();

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
};
