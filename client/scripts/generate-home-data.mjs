import { mkdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

try {
  loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  // Environment variables may be supplied externally.
}

const baseUrl = process.env.VITE_API_BASE_URL;

if (!baseUrl) {
  throw new Error("VITE_API_BASE_URL is missing from client/.env");
}

const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

const apiBase = cleanBaseUrl.endsWith("/api")
  ? cleanBaseUrl
  : `${cleanBaseUrl}/api`;

const industries = [
  "hollywood",
  "bollywood",
  "kollywood",
  "tollywood",
  "mollywood",
  "kdrama",
];

const TIMEOUT_MS = 300_000;

async function getJson(path) {
  const url = `${apiBase}${path}`;

  console.log(`Fetching: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log(`Success: ${path}`);

    return data;
  } catch (error) {
    console.error(`Failed: ${path}`);
    console.error(error.message);
    throw error;
  }
}

function toTMDBMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.originalTitle,
    overview: movie.overview ?? "",
    poster_path: movie.posterPath ?? null,
    backdrop_path: movie.backdropPath ?? null,
    release_date: movie.releaseDate ?? "",
    vote_average: movie.rating ?? 0,
    vote_count: movie.voteCount ?? 0,
    popularity: movie.popularity ?? 0,
    original_language: movie.originalLanguage ?? "",
    genre_ids: movie.genreIds ?? [],
    genres: movie.genres ?? [],
  };
}

function unwrapMovieList(payload) {
  const movies = payload?.data?.movies ?? payload?.movies;

  if (!Array.isArray(movies)) {
    throw new Error("Unexpected movie API response structure.");
  }

  return movies.map(toTMDBMovie);
}

async function fetchMovieCategory(name, path) {
  try {
    const payload = await getJson(path);

    return {
      name,
      movies: unwrapMovieList(payload),
      success: true,
    };
  } catch {
    return {
      name,
      movies: [],
      success: false,
    };
  }
}

console.log("\nStarting MovieBox homepage data generation...");
console.log(`API base URL: ${apiBase}\n`);

// Fetch core homepage sections independently.
const coreResults = await Promise.all([
  fetchMovieCategory("trending", "/movies/trending"),
  fetchMovieCategory("upcoming", "/movies/upcoming"),
  fetchMovieCategory("popular", "/movies/popular"),
]);

const failedCore = coreResults.filter((result) => !result.success);

if (failedCore.length === coreResults.length) {
  throw new Error(
    "All homepage requests failed. Check whether your backend is running and reachable.",
  );
}

const trending =
  coreResults.find((result) => result.name === "trending")?.movies ?? [];

const upcoming =
  coreResults.find((result) => result.name === "upcoming")?.movies ?? [];

const popular =
  coreResults.find((result) => result.name === "popular")?.movies ?? [];

// Fetch featured movies for all industries.
console.log("\nFetching industry movies...\n");

const industryResults = await Promise.allSettled(
  industries.map((industry) => getJson(`/movies/trending/${industry}`)),
);

const hero = {};

industryResults.forEach((result, index) => {
  const industry = industries[index];

  if (result.status !== "fulfilled") {
    console.warn(`Skipping ${industry}: API request failed.`);
    return;
  }

  try {
    const movies = unwrapMovieList(result.value).filter(
      (movie) => movie.backdrop_path || movie.poster_path,
    );

    if (movies.length > 0) {
      hero[industry] = movies[Math.floor(Math.random() * movies.length)];
    }
  } catch (error) {
    console.warn(`Skipping ${industry}: ${error.message}`);
  }
});

// Create homepage snapshot.
const homeData = {
  generatedAt: new Date().toISOString(),
  trending,
  upcoming,
  popular,
  hero,
};

const outputDirectory = resolve(process.cwd(), "public/data");
const outputFile = resolve(outputDirectory, "home.json");

await mkdir(outputDirectory, { recursive: true });

await writeFile(outputFile, `${JSON.stringify(homeData, null, 2)}\n`, "utf8");

console.log("\nHomepage data generated successfully!");
console.log("--------------------------------");
console.log(`Trending movies: ${trending.length}`);
console.log(`Upcoming movies: ${upcoming.length}`);
console.log(`Popular movies: ${popular.length}`);
console.log(`Hero slides: ${Object.keys(hero).length}`);
console.log(`Saved to: ${outputFile}`);
console.log("--------------------------------");

if (failedCore.length > 0) {
  console.warn(
    "Warning: Some homepage categories failed and were saved as empty arrays.",
  );
}
