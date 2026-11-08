import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/auth.js";
import { AppError } from "../../shared/utils/appError.js";

import {
  askMovieAI,
  chatWithMovieAI,
  extractAISearchIntent,
} from "./ai.service.js";

import {
  discoverMovies,
  searchMovies,
} from "../../integrations/tmdb/tmdb.service.js";

import { getMovieDetails } from "../movies/movieDetails.service.js";
import { getAIRecommendations } from "./ai.recommendation.service.js";

type Movie = Awaited<ReturnType<typeof searchMovies>>["movies"][number];

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIIntent = Awaited<ReturnType<typeof extractAISearchIntent>>;

const genreMap: Record<string, string> = {
  action: "28",
  adventure: "12",
  animation: "16",
  comedy: "35",
  crime: "80",
  documentary: "99",
  drama: "18",
  family: "10751",
  fantasy: "14",
  history: "36",
  horror: "27",
  music: "10402",
  mystery: "9648",
  romance: "10749",
  "science fiction": "878",
  "sci-fi": "878",
  thriller: "53",
  war: "10752",
  western: "37",
};

const languageMap: Record<string, string> = {
  english: "en",
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  malayalam: "ml",
  kannada: "kn",
  korean: "ko",
  japanese: "ja",
  spanish: "es",
  french: "fr",
  german: "de",
  chinese: "zh",
};

const normalizeGenre = (genre: string | null) => {
  if (!genre) return undefined;

  return genreMap[genre.trim().toLowerCase()] ?? undefined;
};

const normalizeLanguage = (language: string | null) => {
  if (!language) return undefined;

  return languageMap[language.trim().toLowerCase()] ?? undefined;
};

const buildMovieFilters = (intent: AIIntent) => {
  const filters: {
    genre?: string;
    language?: string;
    yearFrom?: string;
    yearTo?: string;
    page?: number;
    sortBy?: "popularity" | "rating" | "release_date";
  } = {
    page: 1,
  };

  const genre = normalizeGenre(intent.genre);
  const language = normalizeLanguage(intent.language);

  if (genre) filters.genre = genre;
  if (language) filters.language = language;

  if (intent.yearFrom !== null) {
    filters.yearFrom = String(intent.yearFrom);
  }

  if (intent.yearTo !== null) {
    filters.yearTo = String(intent.yearTo);
  }

  if (intent.sortBy !== null) {
    filters.sortBy = intent.sortBy;
  }

  return filters;
};

/**
 * Detect movie discovery requests before calling Gemini intent extraction.
 * Ordinary conversations go directly to chatWithMovieAI.
 */
const isMovieDiscoveryRequest = (message: string): boolean => {
  const discoveryPatterns = [
    /\b(recommend|recommendations|suggest|suggestions)\b/i,
    /\b(find|show|discover|search for)\s+(me\s+)?(some\s+)?(movies|films)\b/i,
    /\b(looking for|movies like|similar to|watch next)\b/i,
    /\b(what should i watch|what movie should i watch)\b/i,
    /\b(best|top|underrated|hidden gems)\s+.{0,40}\b(movies|films)\b/i,
    /\b(movies|films)\s+(about|in|from|released in)\b/i,
    /\b\d{4}\s+(movies|films)\b/i,
    /\b(in the \w+ genre|\w+ movies|\w+ films|movies in \w+)\b/i,
  ];

  return discoveryPatterns.some((pattern) => pattern.test(message));
};

const isConversationMessage = (
  value: unknown,
): value is ConversationMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    role?: unknown;
    content?: unknown;
  };

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
};

/**
 * Shared response helper for normal chat and discovery fallbacks.
 */
const sendChatResponse = async (
  res: Response,
  message: string,
  conversation: ConversationMessage[],
  movies: Movie[] = [],
) => {
  const response = await chatWithMovieAI({
    message,
    conversation,
  });

  return res.status(200).json({
    success: true,
    data: {
      answer: response.answer,
      movies,
    },
  });
};

export const askMovieAssistant = async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  const tmdbId = Number(req.params.tmdbId);

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new AppError("Invalid movie ID", 400);
  }

  const question =
    typeof req.body?.question === "string"
      ? req.body.question.trim()
      : "";

  if (!question) {
    throw new AppError("Question is required", 400);
  }

  const movie = await getMovieDetails(tmdbId);

  const response = await askMovieAI({
    movieTitle: movie.title,
    overview: movie.overview,
    question,
  });

  return res.status(200).json({
    success: true,
    data: response,
  });
};

export const searchWithAI = async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  const query =
    typeof req.body?.query === "string"
      ? req.body.query.trim()
      : "";

  if (!query) {
    throw new AppError("Search query is required", 400);
  }

  const intent = await extractAISearchIntent({ query });

  const hasFilters =
    intent.genre !== null ||
    intent.language !== null ||
    intent.yearFrom !== null ||
    intent.yearTo !== null ||
    intent.sortBy !== null;

  if (!hasFilters) {
    const movies = await searchMovies(intent.searchQuery, 1);

    return res.status(200).json({
      success: true,
      data: {
        intent,
        movies,
      },
    });
  }

  const filters = buildMovieFilters(intent);
  const movies = await discoverMovies(filters);

  return res.status(200).json({
    success: true,
    data: {
      intent,
      movies,
    },
  });
};

export const getAIRecommendationResults = async (
  req: Request,
  res: Response,
) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  const recommendations = await getAIRecommendations(userId);

  return res.status(200).json({
    success: true,
    data: recommendations,
  });
};

export const chatWithMovieAssistant = async (
  req: Request,
  res: Response,
) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  const message =
    typeof req.body?.message === "string"
      ? req.body.message.trim()
      : "";

  if (!message) {
    throw new AppError("Message is required", 400);
  }

  if (message.length > 2000) {
    throw new AppError("Message must be 2000 characters or fewer", 400);
  }

  // Only retain the most recent ten messages from the request.
  const rawConversation: unknown[] = Array.isArray(req.body?.conversation)
    ? req.body.conversation.slice(-10)
    : [];

  const conversation: ConversationMessage[] = rawConversation
    .filter(isConversationMessage)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 4000),
    }));

  // Ordinary chat goes directly to Gemini without intent extraction or TMDB.
  if (!isMovieDiscoveryRequest(message)) {
    return sendChatResponse(res, message, conversation);
  }

  let intent: AIIntent;

  try {
    intent = await extractAISearchIntent({ query: message });
  } catch (error: unknown) {
    console.warn(
      "MovieBox AI intent extraction failed; using chat fallback.",
      {
        message:
          error instanceof Error ? error.message : "Unknown error",
      },
    );

    return sendChatResponse(res, message, conversation);
  }

  let movies: Movie[] = [];

  const hasFilters =
    intent.genre !== null ||
    intent.language !== null ||
    intent.yearFrom !== null ||
    intent.yearTo !== null ||
    intent.sortBy !== null;

  try {
    if (hasFilters) {
      const result = await discoverMovies(buildMovieFilters(intent));
      movies = result.movies.slice(0, 10);
    } else {
      const query = intent.searchQuery.trim() || message;
      const result = await searchMovies(query, 1);
      movies = result.movies.slice(0, 10);
    }
  } catch (error: unknown) {
    console.warn(
      "MovieBox AI could not retrieve TMDB results; using chat fallback.",
      {
        message:
          error instanceof Error ? error.message : "Unknown error",
      },
    );

    return sendChatResponse(res, message, conversation);
  }

  // Send only verified TMDB data to Gemini as movie context.
  const movieContext = movies.map((movie: Movie) => ({
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    releaseDate: movie.releaseDate,
    rating: movie.rating,
    genres: movie.genres,
  }));

  const contextualMessage = [
    `User request: ${message}`,
    "",
    "Verified MovieBox/TMDB results:",
    JSON.stringify(movieContext),
    "",
    "Answer the user's request naturally.",
    "If results are present, briefly explain why they fit.",
    "Use only the exact titles and facts provided for movie cards.",
    "Do not claim a movie is in the results if it is not listed.",
    "Do not invent ratings, release dates, cast, or credits.",
    "If no results were found, say so honestly and offer a useful next step.",
  ].join("\n");

  return sendChatResponse(
    res,
    contextualMessage,
    conversation,
    movies,
  );
};
