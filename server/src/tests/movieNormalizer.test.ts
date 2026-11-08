import { describe, expect, it } from "vitest";
import { normalizeTMDBMovie } from "../shared/utils/movieNormalizer";

describe("movie normalizer", () => {
  it("normalizes a TMDB movie", () => {
    const movie = normalizeTMDBMovie({
      id: 101,
      title: "Test Movie",
      original_title: "Test Movie",
      overview: "Test overview",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      release_date: "2026-01-01",
      vote_average: 8.5,
      vote_count: 100,
      popularity: 50,
      original_language: "en",
    });

    expect(movie).toEqual({
      id: 101,
      title: "Test Movie",
      overview: "A test movie",
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
      releaseDate: "2026-01-15",
      rating: 8.4,
      voteCount: 1200,
      popularity: 350,
      originalLanguage: "en",
      genreIds: [],
      genres: [],
    });
  });

  it("converts an empty release date to null", () => {
    const movie = normalizeTMDBMovie({
      id: 101,
      title: "Test Movie",
      original_title: "Test Movie",
      overview: "Test overview",
      poster_path: null,
      backdrop_path: null,
      release_date: "2026-01-01",
      vote_average: 8.5,
      vote_count: 100,
      popularity: 50,
      original_language: "en",
    });

    expect(movie.releaseDate).toBeNull();
    expect(movie.posterPath).toBeNull();
    expect(movie.backdropPath).toBeNull();
    expect(movie.genreIds).toEqual([]);
    expect(movie.genres).toEqual([]);
  });
});
