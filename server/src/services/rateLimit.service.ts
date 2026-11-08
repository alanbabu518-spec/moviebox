import { redis } from "../config/redis.js";

export type TokenBucketOptions = {
  key: string;
  capacity: number;
  refillRate: number;
  tokens?: number;
};

export type TokenBucketResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

/**
 * Checks and consumes multiple token buckets atomically.
 *
 * All buckets are checked first.
 * Tokens are consumed only when every bucket allows the request.
 */
const TOKEN_BUCKET_SCRIPT = `
local count = #KEYS

local time = redis.call("TIME")
local now = tonumber(time[1]) + (tonumber(time[2]) / 1000000)

local states = {}
local allAllowed = 1
local minRemaining = math.huge
local maxRetryAfter = 0

-- First pass: calculate every bucket without consuming tokens.
for i = 1, count do
  local key = KEYS[i]

  local capacity = tonumber(ARGV[(i - 1) * 3 + 1])
  local refillRate = tonumber(ARGV[(i - 1) * 3 + 2])
  local requested = tonumber(ARGV[(i - 1) * 3 + 3])

  local data = redis.call("HMGET", key, "tokens", "timestamp")

  local tokens = tonumber(data[1])
  local timestamp = tonumber(data[2])

  if tokens == nil then
    tokens = capacity
    timestamp = now
  end

  local elapsed = math.max(0, now - timestamp)

  tokens = math.min(
    capacity,
    tokens + (elapsed * refillRate)
  )

  local allowed = tokens >= requested
  local retryAfter = 0

  if not allowed then
    allAllowed = 0

    local missing = requested - tokens
    retryAfter = math.ceil(missing / refillRate)

    maxRetryAfter = math.max(maxRetryAfter, retryAfter)
  end

  local remaining = tokens

  if allowed then
    remaining = tokens - requested
  end

  minRemaining = math.min(minRemaining, remaining)

  states[i] = {
    tokens = tokens,
    capacity = capacity,
    refillRate = refillRate,
    requested = requested,
    allowed = allowed
  }
end

-- Second pass: update every bucket consistently.
for i = 1, count do
  local key = KEYS[i]
  local state = states[i]

  local tokens = state.tokens

  -- Consume tokens only if every bucket allows the request.
  if allAllowed == 1 then
    tokens = tokens - state.requested
  end

  redis.call(
    "HSET",
    key,
    "tokens", tokens,
    "timestamp", now
  )

  local ttl = math.max(
    1,
    math.ceil(state.capacity / state.refillRate)
  )

  redis.call("EXPIRE", key, ttl)
end

return {
  allAllowed,
  math.floor(minRemaining),
  maxRetryAfter
}
`;

export const consumeTokens = async (
  buckets: TokenBucketOptions[],
): Promise<TokenBucketResult> => {
  if (buckets.length === 0) {
    throw new Error("At least one token bucket is required");
  }

  for (const bucket of buckets) {
    const requested = bucket.tokens ?? 1;

    if (
      !bucket.key ||
      !Number.isFinite(bucket.capacity) ||
      bucket.capacity <= 0 ||
      !Number.isFinite(bucket.refillRate) ||
      bucket.refillRate <= 0 ||
      !Number.isFinite(requested) ||
      requested <= 0 ||
      requested > bucket.capacity
    ) {
      throw new Error("Invalid token bucket configuration");
    }
  }

  const keys = buckets.map((bucket) => bucket.key);

  const args = buckets.flatMap((bucket) => [
    bucket.capacity,
    bucket.refillRate,
    bucket.tokens ?? 1,
  ]);

  const result = (await redis.eval(
    TOKEN_BUCKET_SCRIPT,
    keys.length,
    ...keys,
    ...args,
  )) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    retryAfter: result[2],
  };
};

/**
 * Backward-compatible helper for callers using a single bucket.
 */
export const consumeToken = async (
  bucket: TokenBucketOptions,
): Promise<TokenBucketResult> => {
  return consumeTokens([bucket]);
};
