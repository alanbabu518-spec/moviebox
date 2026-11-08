import axios from "axios";
import axiosRetry from "axios-retry";

import { tmdbConfig } from "../../config/tmdb";
import { cacheConfig } from "../../config/cache.js";
import { normalizeTMDBMovie } from "../../shared/utils/movieNormalizer";
import type {
  TMDBGenreListResponse,
  TMDBMovieListResponse,
} from "../../shared/types/tmdb";
import { handleTMDBError } from "../../integrations/tmdb/tmdbRequest.service";
import { movieIndustries, type MovieIndustry } from "./industry.js";
import { getCachedJson, setCachedJson } from "../../shared/utils/cache.js";

const TRENDING_MOVIES_CACHE_KEY = "moviebox:cache:movies:trending";
const MOVIE_GENRES_CACHE_KEY = "moviebox:cache:genres:movie";

const MOVIE_GENRES_CACHE_TTL = 86400;
const MOVIE_LIST_CACHE_TTL = 1800;
const MOVIE_SEARCH_CACHE_TTL = 300;

interface CachedMovieList {
  page: number;
  totalPages: number;
  totalResults: number;
  movies: Awaited<ReturnType<typeof normalizeMovieResults>>;
}

export interface MovieFilterParams {
  genre?: string;
  language?: string;
  year?: string;
  yearFrom?: string;
  yearTo?: string;
  minRating?: string;
  sortBy?: "popularity" | "rating" | "release_date";
  page?: number;
}

export const tmdbClient = axios.create({
  baseURL: tmdbConfig.baseUrl,
  params: {
    api_key: tmdbConfig.apiKey,
  },
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "User-Agent": "MovieBox/1.0",
  },
});

axiosRetry(tmdbClient, {
  retries: 3,
  retryDelay: (retryCount, error) => {
    const retryAfter = error.response?.headers?.["retry-after"];

    if (retryAfter) {
      const retryAfterSeconds = Number(retryAfter);

      if (Number.isFinite(retryAfterSeconds)) {
        return Math.min(retryAfterSeconds * 1000, 10000);
      }
    }

    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: (error) => {
    const status = error.response?.status;

    // Retry temporary server failures.
    if (status && [500, 502, 503, 504].includes(status)) {
      return true;
    }

    // Retry rate limits only when the server provides Retry-After.
    if (status === 429) {
      return Boolean(error.response?.headers?.["retry-after"]);
    }

    // Retry network errors and timeouts.
    return axiosRetry.isNetworkError(error);
  },
});

function hasFilters(params: MovieFilterParams): boolean {
  return Boolean(
    params.genre ||
    params.language ||
    params.year ||
    params.yearFrom ||
    params.yearTo ||
    params.minRating ||
    params.sortBy,
  );
}

function buildFilterCacheKey(
  category: string,
  params: MovieFilterParams,
): string {
  const filters = {
    genre: params.genre ?? "",
    language: params.language ?? "",
    year: params.year ?? "",
    yearFrom: params.yearFrom ?? "",
    yearTo: params.yearTo ?? "",
    minRating: params.minRating ?? "",
    sortBy: params.sortBy ?? "",
    page: params.page ?? 1,
  };

  return `moviebox:cache:movies:${category}:${JSON.stringify(filters)}`;
}

function buildDiscoverParams(params: MovieFilterParams) {
  const sortBy = {
    popularity: "popularity.desc",
    rating: "vote_average.desc",
    release_date: "primary_release_date.desc",
  } as const;

  return {
    page: params.page || 1,
    include_adult: false,
    include_video: false,
    with_genres: params.genre || undefined,
    with_original_language: params.language || undefined,
    primary_release_year: params.year || undefined,
    "primary_release_date.gte": params.yearFrom
      ? `${params.yearFrom}-01-01`
      : undefined,
    "primary_release_date.lte": params.yearTo
      ? `${params.yearTo}-12-31`
      : undefined,
    "vote_average.gte": params.minRating || undefined,
    sort_by: params.sortBy ? sortBy[params.sortBy] : "popularity.desc",
  };
}

function logTMDBError(operation: string, error: unknown): void {
  if (axios.isAxiosError(error)) {
    console.error(`TMDB ${operation} request failed`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      params: {
        ...error.config?.params,
        api_key: error.config?.params?.api_key ? "[REDACTED]" : undefined,
      },
    });

    return;
  }

  console.error(`TMDB ${operation} request failed`, {
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

async function getMovieGenreMap(): Promise<Map<number, string>> {
  const cachedGenres = await getCachedJson<{ id: number; name: string }[]>(
    MOVIE_GENRES_CACHE_KEY,
  );

  if (cachedGenres !== null) {
    return new Map(cachedGenres.map((genre) => [genre.id, genre.name]));
  }

  const response = await tmdbClient.get<TMDBGenreListResponse>(
    "/genre/movie/list",
    {
      params: {
        language: "en-US",
      },
    },
  );

  const genres = response.data.genres;

  await setCachedJson(MOVIE_GENRES_CACHE_KEY, genres, MOVIE_GENRES_CACHE_TTL);

  return new Map(genres.map((genre) => [genre.id, genre.name]));
}

async function normalizeMovieResults(
  results: Parameters<typeof normalizeTMDBMovie>[0][],
) {
  const genreMap = await getMovieGenreMap();

  return results.map((movie) => normalizeTMDBMovie(movie, genreMap));
}

export const getTrendingMovies = async (
  params: MovieFilterParams = {},
): Promise<CachedMovieList> => {
  if (!hasFilters(params)) {
    const page = params.page ?? 1;
    const cacheKey =
      page === 1
        ? TRENDING_MOVIES_CACHE_KEY
        : buildFilterCacheKey("trending", { page });

    const cachedMovies = await getCachedJson<CachedMovieList>(cacheKey);

    if (cachedMovies !== null) {
      return cachedMovies;
    }

    try {
      const response = await tmdbClient.get<TMDBMovieListResponse>(
        "/trending/movie/week",
        {
          params: { page },
        },
      );

      const movies = await normalizeMovieResults(response.data.results);
      const result: CachedMovieList = {
        page: response.data.page,
        totalPages: response.data.total_pages,
        totalResults: response.data.total_results,
        movies,
      };

      await setCachedJson(cacheKey, result, cacheConfig.trendingMoviesTtl);

      return result;
    } catch (error) {
      logTMDBError("trending movies", error);
      return handleTMDBError(error) as never;
    }
  }

  const cacheKey = buildFilterCacheKey("trending", params);
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/discover/movie",
      {
        params: buildDiscoverParams(params),
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, cacheConfig.trendingMoviesTtl);

    return result;
  } catch (error) {
    logTMDBError("filtered trending movies", error);
    return handleTMDBError(error) as never;
  }
};

export const getLatestMovies = async (page = 1): Promise<CachedMovieList> => {
  const cacheKey = buildFilterCacheKey("latest", { page });
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/movie/now_playing",
      {
        params: { page },
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);
    return result;
  } catch (error) {
    logTMDBError("latest movies", error);
    return handleTMDBError(error) as never;
  }
};

export const getUpcomingMovies = async (
  params: MovieFilterParams = {},
): Promise<CachedMovieList> => {
  if (!hasFilters(params)) {
    const page = params.page ?? 1;
    const cacheKey = buildFilterCacheKey("upcoming", { page });
    const cached = await getCachedJson<CachedMovieList>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      const response = await tmdbClient.get<TMDBMovieListResponse>(
        "/movie/upcoming",
        {
          params: { page },
        },
      );

      const movies = await normalizeMovieResults(response.data.results);
      const result: CachedMovieList = {
        page: response.data.page,
        totalPages: response.data.total_pages,
        totalResults: response.data.total_results,
        movies,
      };

      await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);

      return result;
    } catch (error) {
      logTMDBError("upcoming movies", error);
      return handleTMDBError(error) as never;
    }
  }

  const cacheKey = buildFilterCacheKey("upcoming", params);
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/discover/movie",
      {
        params: {
          ...buildDiscoverParams(params),
          sort_by: "primary_release_date.asc",
          "primary_release_date.gte": today,
        },
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);

    return result;
  } catch (error) {
    logTMDBError("filtered upcoming movies", error);
    return handleTMDBError(error) as never;
  }
};

export const searchMovies = async (
  query: string,
  page = 1,
): Promise<CachedMovieList> => {
  const normalizedQuery = query.trim().replace(/\\s+/g, " ");

  if (!normalizedQuery) {
    return {
      page: 1,
      totalPages: 0,
      totalResults: 0,
      movies: [],
    };
  }

  const cacheKey = `moviebox:cache:movies:search:${encodeURIComponent(
    normalizedQuery.toLowerCase(),
  )}:page:${page}`;

  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/search/movie",
      {
        params: {
          query: normalizedQuery,
          page,
          include_adult: false,
        },
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_SEARCH_CACHE_TTL);
    return result;
  } catch (error) {
    logTMDBError("movie search", error);
    return handleTMDBError(error) as never;
  }
};

export async function getIndustryTrendingMovies(
  industry: MovieIndustry,
): Promise<CachedMovieList> {
  const config = movieIndustries[industry];
  const cacheKey = `moviebox:cache:movies:trending:${industry}`;
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/discover/movie",
      {
        params: {
          with_original_language: config.language,
          region: config.region,
          sort_by: "popularity.desc",
          include_adult: false,
          include_video: false,
          page: 1,
        },
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);

    return result;
  } catch (error) {
    logTMDBError(`industry ${industry}`, error);
    return handleTMDBError(error) as never;
  }
}

export const getPopularMovies = async (
  params: MovieFilterParams = {},
): Promise<CachedMovieList> => {
  const cacheKey = buildFilterCacheKey("popular", params);
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      hasFilters(params) ? "/discover/movie" : "/movie/popular",
      {
        params: hasFilters(params)
          ? {
              ...buildDiscoverParams(params),
              sort_by: "popularity.desc",
            }
          : {
              page: params.page || 1,
            },
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);

    return result;
  } catch (error) {
    logTMDBError("popular movies", error);
    return handleTMDBError(error) as never;
  }
};

export async function discoverMovies(
  params: MovieFilterParams,
): Promise<CachedMovieList> {
  const cacheKey = buildFilterCacheKey("discover", params);
  const cached = await getCachedJson<CachedMovieList>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const response = await tmdbClient.get<TMDBMovieListResponse>(
      "/discover/movie",
      {
        params: buildDiscoverParams(params),
      },
    );

    const movies = await normalizeMovieResults(response.data.results);
    const result: CachedMovieList = {
      page: response.data.page,
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
      movies,
    };

    await setCachedJson(cacheKey, result, MOVIE_LIST_CACHE_TTL);

    return result;
  } catch (error) {
    logTMDBError("discover movies", error);
    return handleTMDBError(error) as never;
  }
}
