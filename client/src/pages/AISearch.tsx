import { useState } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  searchWithAI,
  type AISearchMovie,
  type AISearchIntent,
} from "../shared/services/ai.api";

const imageBaseUrl = "https://image.tmdb.org/t/p/w500";

function getErrorMessage(error: unknown): string {
  const apiError = error as {
    response?: {
      status?: number;
      data?: {
        message?: string;
      };
    };
  };

  const status = apiError.response?.status;
  const message = apiError.response?.data?.message;

  if (status === 429 || status === 503) {
    return message || "MovieBox AI is busy. Please try again shortly.";
  }

  if (status === 504) {
    return "MovieBox AI took too long to respond. Please try again.";
  }

  if (status === 401 || status === 403) {
    return "AI service authentication failed. Please contact support.";
  }

  if (message) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to search movies right now. Please try again.";
}

const AISearch = () => {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<AISearchMovie[]>([]);
  const [intent, setIntent] = useState<AISearchIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError("Enter a description of the movies you want to find.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMovies([]);
      setIntent(null);

      const result = await searchWithAI(trimmedQuery);

      setMovies(result.movies);
      setIntent(result.intent);
    } catch (error: unknown) {
      console.error("AI movie search failed:", error);

      setError(getErrorMessage(error));
      setMovies([]);
      setIntent(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-[#e50914]">
            <Sparkles size={20} aria-hidden="true" />
            <span className="text-sm font-medium">MovieBox AI</span>
          </div>

          <h1 className="text-3xl font-semibold sm:text-4xl">
            Find movies naturally
          </h1>

          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            Tell MovieBox what you want to watch.
          </p>

          <form onSubmit={handleSearch} className="mt-8">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#111111] p-2">
              <Search
                size={20}
                aria-hidden="true"
                className="ml-2 shrink-0 text-zinc-500"
              />

              <input
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Try: Malayalam action movies after 2020"
                aria-label="Describe the movies you want to find"
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />

              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-[#e50914] px-5 py-3 text-sm font-medium transition hover:bg-[#c70812] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </form>
        </div>

        {intent && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {intent.genre && (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                {intent.genre}
              </span>
            )}

            {intent.language && (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                {intent.language}
              </span>
            )}

            {intent.yearFrom && (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                {intent.yearFrom}
                {intent.yearTo ? ` - ${intent.yearTo}` : "+"}
              </span>
            )}

            {intent.sortBy && (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                {intent.sortBy.replace("_", " ")}
              </span>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-auto mt-8 max-w-xl rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center"
          >
            <p className="text-sm text-red-400">{error}</p>

            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget
                  .closest("main")
                  ?.querySelector("form");
                form?.requestSubmit();
              }}
              disabled={loading || !query.trim()}
              className="mt-3 text-sm font-medium text-white underline underline-offset-4 disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        )}

        {loading && (
          <section
            aria-label="Loading search results"
            aria-live="polite"
            className="mt-12"
          >
            <div className="mb-6 h-6 w-48 animate-pulse rounded bg-zinc-800" />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-[2/3] rounded-lg bg-zinc-900" />
                  <div className="mt-3 h-4 rounded bg-zinc-900" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-zinc-900" />
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && !error && movies.length === 0 && intent && (
          <p className="mt-12 text-center text-zinc-500">
            No movies found. Try describing your preferences differently.
          </p>
        )}

        {!loading && movies.length > 0 && (
          <section className="mt-12">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">AI Search Results</h2>

              <p className="mt-1 text-sm text-zinc-500">
                {movies.length} {movies.length === 1 ? "movie" : "movies"} found
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {movies.map((movie) => (
                <button
                  key={movie.id}
                  type="button"
                  onClick={() => navigate(`/movie/${movie.id}`)}
                  aria-label={`View details for ${movie.title}`}
                  className="group min-w-0 text-left"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900">
                    {movie.posterPath ? (
                      <img
                        src={`${imageBaseUrl}${movie.posterPath}`}
                        alt={`${movie.title} poster`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-sm text-zinc-500">
                        No Poster Available
                      </div>
                    )}
                  </div>

                  <h3 className="mt-3 line-clamp-1 text-sm font-medium">
                    {movie.title}
                  </h3>

                  {movie.releaseDate && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {movie.releaseDate.slice(0, 4)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default AISearch;
