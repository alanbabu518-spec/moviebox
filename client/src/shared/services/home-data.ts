
import type { MovieIndustry, TMDBMovie } from "./movie.api";

/** Public, non-personalized data generated for the MovieBox homepage. */
export interface StaticHomeData {
  generatedAt: string;
  trending: TMDBMovie[];
  upcoming: TMDBMovie[];
  popular: TMDBMovie[];
  hero: Partial<Record<MovieIndustry, TMDBMovie>>;
}

let homeDataPromise: Promise<StaticHomeData | null> | null = null;

/**
 * Fetch the static homepage snapshot from the frontend's own origin.
 * A shared promise prevents Home and Hero from requesting it separately.
 */
export function getStaticHomeData(): Promise<StaticHomeData | null> {
  if (!homeDataPromise) {
    homeDataPromise = fetch("/data/home.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) return null;

        const data = (await response.json()) as StaticHomeData;

        if (
          !data ||
          !Array.isArray(data.trending) ||
          !Array.isArray(data.upcoming) ||
          !Array.isArray(data.popular) ||
          !data.hero
        ) {
          return null;
        }

        return data;
      })
      .catch(() => null);
  }

  return homeDataPromise;
}
