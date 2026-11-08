/**
 * MovieBox Browser Cache
 *
 * Stores public movie catalogue data in localStorage.
 * Uses stale-while-revalidate:
 * 1. Display previously cached data immediately.
 * 2. Fetch fresh data in the background.
 * 3. Update the cache after a successful response.
 *
 * Never store passwords, authentication tokens,
 * favorites, watchlists, or private user data here.
 */

const CACHE_PREFIX = "moviebox:public:v1:";

// Keep cached data for a maximum of 7 days.
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

/**
 * Read cached data.
 */
export function readBrowserCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `${CACHE_PREFIX}${key}`,
    );

    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as CacheEntry<T>;

    if (
      !entry ||
      !("data" in entry) ||
      !Number.isFinite(entry.savedAt)
    ) {
      return null;
    }

    // Reject data older than 7 days.
    if (Date.now() - entry.savedAt > MAX_STALE_MS) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Save data to browser cache.
 */
export function writeBrowserCache<T>(
  key: string,
  data: T,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const entry: CacheEntry<T> = {
      data,
      savedAt: Date.now(),
    };

    window.localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify(entry),
    );
  } catch {
    // Cache failure must never break the application.
  }
}