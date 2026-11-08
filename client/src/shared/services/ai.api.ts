import api from "./api";

/* Shared movie response shape used by AI search and chat. */
export interface AIMovie {
  id: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage?: number | null;
}

export type AISearchMovie = AIMovie;
export type AIAssistantMovie = AIMovie;

export interface AISearchIntent {
  searchQuery: string;
  genre: string | null;
  language: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  sortBy: "popularity" | "rating" | "release_date" | null;
}

export interface AISearchResponse {
  intent: AISearchIntent;
  movies: AISearchMovie[];
}

export interface AIRecommendation {
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  reason: string;
}

export interface AIRecommendationsResponse {
  personalized: boolean;
  recommendations: AIRecommendation[];
}

export interface AIAssistantResponse {
  answer: string;
  movies?: AIAssistantMovie[];
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => {
  if (!body || body.success !== true || body.data === undefined) {
    throw new Error("The AI service returned an unexpected response.");
  }

  return body.data;
};

const validateAssistantResponse = (
  data: AIAssistantResponse,
): AIAssistantResponse => {
  if (!data || typeof data.answer !== "string" || !data.answer.trim()) {
    throw new Error("MovieBox AI returned an empty answer. Please try again.");
  }

  return {
    answer: data.answer.trim(),
    movies: Array.isArray(data.movies) ? data.movies : [],
  };
};

export const searchWithAI = async (
  query: string,
  signal?: AbortSignal,
): Promise<AISearchResponse> => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Please enter a search query.");
  }

  const response = await api.post<ApiEnvelope<AISearchResponse>>(
    "/ai/search",
    { query: normalizedQuery },
    { signal },
  );

  const data = unwrap(response.data);

  if (!Array.isArray(data.movies)) {
    throw new Error("Movie search returned an invalid response.");
  }

  return data;
};

export const getAIRecommendations = async (
  signal?: AbortSignal,
): Promise<AIRecommendationsResponse> => {
  const response = await api.get<ApiEnvelope<AIRecommendationsResponse>>(
    "/ai/recommendations",
    { signal },
  );

  const data = unwrap(response.data);

  if (!Array.isArray(data.recommendations)) {
    throw new Error("AI recommendations returned an invalid response.");
  }

  return data;
};

export const askMovieAssistant = async (
  tmdbId: number,
  question: string,
  signal?: AbortSignal,
): Promise<AIAssistantResponse> => {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new Error("Invalid movie ID.");
  }

  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new Error("Please enter a question.");
  }

  const response = await api.post<ApiEnvelope<AIAssistantResponse>>(
    `/ai/${tmdbId}/ai`,
    { question: normalizedQuestion },
    { signal },
  );

  return validateAssistantResponse(unwrap(response.data));
};

export const chatWithMovieAI = async (
  message: string,
  conversation: AIChatMessage[] = [],
  signal?: AbortSignal,
): Promise<AIAssistantResponse> => {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    throw new Error("Please enter a message.");
  }

  const safeConversation = conversation
    .filter(
      (item) =>
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim().length > 0,
    )
    .slice(-12)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 4000),
    }));

  const response = await api.post<ApiEnvelope<AIAssistantResponse>>(
    "/ai/chat",
    {
      message: normalizedMessage,
      conversation: safeConversation,
    },
    { signal },
  );

  return validateAssistantResponse(unwrap(response.data));
};
