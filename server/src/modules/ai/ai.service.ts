import { AppError } from "../../shared/utils/appError.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const REQUEST_TIMEOUT_MS = 15_000;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const getGeminiModels = (): string[] => {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS?.trim();

  const fallbacks = configuredFallbacks
    ? configuredFallbacks
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    : DEFAULT_GEMINI_FALLBACK_MODELS;

  // Set removes duplicate model IDs while preserving their order.
  return [...new Set([primary, ...fallbacks])];
};

const createChatCompletion = async (
  messages: ChatMessage[],
  options: { temperature: number; maxTokens: number },
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new AppError(
      "MovieBox AI is not configured. Set GEMINI_API_KEY in the server environment.",
      503,
    );
  }

  const models = getGeminiModels();
  const systemMessage = messages.find((message) => message.role === "system");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  if (contents.length === 0) {
    throw new AppError("A user message is required for MovieBox AI.", 400);
  }

  let lastErrorMessage = "No Gemini model returned a response.";

  for (const model of models) {
    const url =
      `${GEMINI_API_BASE_URL}/models/` +
      `${encodeURIComponent(model)}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.info("MovieBox Gemini: trying model", { model });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          ...(systemMessage
            ? {
                systemInstruction: {
                  parts: [{ text: systemMessage.content }],
                },
              }
            : {}),
          contents,
          generationConfig: {
            // Gemini 3.8 recommends omitting temperature/topP/topK.
            // maxOutputTokens is supported and keeps the existing limits.
            maxOutputTokens: options.maxTokens,
          },
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as GeminiGenerateContentResponse | null;

      if (!response.ok) {
        const providerMessage =
          payload?.error?.message ||
          `Gemini API returned HTTP ${response.status}.`;

        console.error("MovieBox Gemini model failed:", {
          model,
          status: response.status,
          providerStatus: payload?.error?.status,
          message: providerMessage,
        });

        if (response.status === 401 || response.status === 403) {
          throw new AppError(
            "Gemini rejected the API key. Check GEMINI_API_KEY in the server environment.",
            502,
          );
        }

        // These errors are generally request/configuration errors.
        // Trying another model will not fix the same malformed request.
        if (
          response.status === 400 ||
          response.status === 405 ||
          response.status === 413
        ) {
          throw new AppError(
            "Gemini rejected the request. Check the request payload and model configuration.",
            502,
          );
        }

        // Model not found, rate limits, temporary overload, and provider
        // errors can be recovered by trying the next configured model.
        lastErrorMessage = providerMessage;
        continue;
      }

      const content = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!content) {
        lastErrorMessage =
          payload?.candidates?.[0]?.finishReason ||
          payload?.promptFeedback?.blockReason ||
          "Gemini returned an empty response.";

        console.warn("MovieBox Gemini returned no text:", {
          model,
          reason: lastErrorMessage,
        });

        continue;
      }

      console.info("MovieBox Gemini: response generated", { model });
      return content;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }

      lastErrorMessage =
        error instanceof Error ? error.message : "Unknown network error";

      if (
        error instanceof Error &&
        (error.name === "AbortError" || controller.signal.aborted)
      ) {
        console.warn("MovieBox Gemini model timed out; trying fallback:", {
          model,
        });
      } else {
        console.error("MovieBox Gemini request failed; trying fallback:", {
          model,
          message: lastErrorMessage,
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  console.error("All MovieBox Gemini models failed:", {
    models,
    lastError: lastErrorMessage,
  });

  throw new AppError(
    "MovieBox AI is temporarily unavailable. All configured Gemini models failed. Please try again shortly.",
    503,
  );
};

export type MovieAIRequest = {
  movieTitle: string;
  overview: string;
  question: string;
};

export type MovieAIResponse = {
  answer: string;
};

export type AISearchRequest = {
  query: string;
};

export type AISearchIntent = {
  searchQuery: string;
  genre: string | null;
  language: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  sortBy: "popularity" | "rating" | "release_date" | null;
};

export type AIRecommendationRequest = {
  movies: Array<{
    tmdbId: number;
    title: string;
    overview: string | null;
    releaseDate: string | null;
  }>;
  favorites: Array<{
    tmdbId: number;
    title: string;
  }>;
  watchlist: Array<{
    tmdbId: number;
    title: string;
  }>;
};

export type AIRecommendation = {
  tmdbId: number;
  reason: string;
};

export type AIRecommendationResponse = {
  recommendations: AIRecommendation[];
};

export interface MovieAIChatRequest {
  message: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

const extractJson = <T>(content: string): T => {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("Gemini did not return valid JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
};

export const askMovieAI = async (
  request: MovieAIRequest,
): Promise<MovieAIResponse> => {
  const content = await createChatCompletion(
    [
      {
        role: "system",
        content:
          "You are MovieBox AI, the movie assistant inside the MovieBox application. Keep every response concise, natural, and easy to scan. Never use Markdown tables. Avoid long introductions. Prefer short paragraphs or simple bullet points. When discussing multiple movies, mention the title followed by one short sentence. Do not invent movie titles, ratings, release dates, cast, directors, or other specific facts. Only provide specific movie facts when they are supported by the context provided to you. If the user asks for movie recommendations, give a short list and briefly explain the type of movie they may enjoy. End with a short follow-up question only when it is useful.",
      },
      {
        role: "user",
        content: `
Movie title:
${request.movieTitle}

Movie overview:
${request.overview}

User question:
${request.question}
`,
      },
    ],
    { temperature: 0.5, maxTokens: 350 },
  );

  const answer = content.trim();

  if (!answer) {
    throw new AppError("Gemini returned an empty answer.", 502);
  }

  return { answer };
};

export const extractAISearchIntent = async (
  request: AISearchRequest,
): Promise<AISearchIntent> => {
  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `
You are the MovieBox AI search intent engine.

Convert the user's natural-language movie search into structured JSON.

Rules:
- Do not recommend movies.
- Do not invent movie titles.
- Extract only information explicitly implied by the request.
- searchQuery should contain the main movie/person/topic search text.
- genre should be a simple genre such as action, comedy, drama, horror, romance, thriller, sci-fi, animation, or null.
- language should use a common language name such as English, Malayalam, Hindi, Tamil, Telugu, Korean, or null.
- yearFrom and yearTo must be numbers or null.
- sortBy must be popularity, rating, release_date, or null.

Return only valid JSON.
`,
      },
      {
        role: "user",
        content: request.query,
      },
    ],
    { temperature: 0, maxTokens: 300 },
  );

  try {
    const intent = extractJson<AISearchIntent>(content);

    return {
      searchQuery: intent.searchQuery || request.query,
      genre: intent.genre ?? null,
      language: intent.language ?? null,
      yearFrom: intent.yearFrom ?? null,
      yearTo: intent.yearTo ?? null,
      sortBy: intent.sortBy ?? null,
    };
  } catch {
    return {
      searchQuery: request.query,
      genre: null,
      language: null,
      yearFrom: null,
      yearTo: null,
      sortBy: null,
    };
  }
};

export const generateRecommendations = async (
  request: AIRecommendationRequest,
): Promise<AIRecommendationResponse> => {
  if (request.movies.length === 0) {
    return {
      recommendations: [],
    };
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `
You are MovieBox AI's recommendation engine.

Recommend movies only from the candidate movie list provided by MovieBox.

Use the user's favorites and watchlist as preference signals.

Rules:
- Never invent a movie.
- Every recommended tmdbId must exist in the candidate list.
- Return at most 15 recommendations.
- Do not recommend a movie already in favorites or watchlist.
- Give a short reason for every recommendation.
- Return only valid JSON.

Expected format:
{
  "recommendations": [
    {
      "tmdbId": 123,
      "reason": "Short explanation"
    }
  ]
}
`,
      },
      {
        role: "user",
        content: JSON.stringify({
          favorites: request.favorites,
          watchlist: request.watchlist,
          candidates: request.movies,
        }),
      },
    ],
    { temperature: 0.3, maxTokens: 1500 },
  );

  try {
    const result = extractJson<AIRecommendationResponse>(content);

    const candidateIds = new Set(request.movies.map((movie) => movie.tmdbId));

    const excludedIds = new Set([
      ...request.favorites.map((movie) => movie.tmdbId),
      ...request.watchlist.map((movie) => movie.tmdbId),
    ]);

    const recommendations = result.recommendations
      .filter((recommendation) => candidateIds.has(recommendation.tmdbId))
      .filter((recommendation) => !excludedIds.has(recommendation.tmdbId))
      .slice(0, 15);

    return {
      recommendations,
    };
  } catch {
    return {
      recommendations: [],
    };
  }
};

export const chatWithMovieAI = async ({
  message,
  conversation = [],
}: MovieAIChatRequest): Promise<MovieAIResponse> => {
  const messages = [
    {
      role: "system" as const,
      content:
        "You are MovieBox AI, a knowledgeable, friendly assistant focused on movies and cinema. You can answer movie-related questions about plots, themes, endings, genres, directors, actors, franchises, comparisons, filmmaking, and recommendations. Keep answers concise, natural, and easy to scan. Never use Markdown tables. Prefer short paragraphs or simple bullets. When mentioning multiple movies, list at most 5 unless the user asks for more. Use your general knowledge to answer common film questions, but be transparent when a detail is uncertain or may be outdated. Never fabricate exact ratings, release dates, cast credits, awards, streaming availability, or claims that you searched MovieBox/TMDB. When verified MovieBox/TMDB results are included in the user's message, prioritize those results for titles and metadata. If no verified context is supplied and you are unsure of a specific fact, say so briefly rather than guessing. For recommendations, explain in one short phrase why each title fits. Stay focused on the user's actual question and do not refuse ordinary movie questions merely because no database context was supplied. End with a follow-up question only when it is genuinely useful.",
    },
    ...conversation.slice(-10).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user" as const,
      content: message,
    },
  ];

  const content = await createChatCompletion(messages, {
    temperature: 0.5,
    maxTokens: 800,
  });

  const answer = content.trim();

  if (!answer) {
    throw new AppError("AI could not generate a response", 500);
  }

  return {
    answer,
  };
};
