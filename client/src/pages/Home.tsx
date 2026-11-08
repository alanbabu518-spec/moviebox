import { useEffect, useState } from "react";

import Hero from "../shared/components/home/Hero";
import GenreTiles from "../shared/components/home/GenreTiles";
import CommunityBuzz from "../shared/components/home/Communitybuzz";
import MovieSection from "../shared/components/home/MovieSection";
import Navbar from "../shared/components/layout/Navbar";
import Footer from "../shared/components/layout/Footer";
import ProfileSetupModal from "../shared/components/auth/ProfileSetupModal";

import type { Movie } from "../shared/types/movie";
import {
  readBrowserCache,
  writeBrowserCache,
} from "../shared/utils/browser-cache";

import { getStaticHomeData } from "../shared/services/home-data";

import {
  getPopularMovies,
  getTrendingMovies,
  getUpcomingMovies,
} from "../shared/services/movie.api";

function mapMovies(
  movies: Awaited<ReturnType<typeof getTrendingMovies>>["movies"],
): Movie[] {
  return movies
    .filter((movie) => movie.poster_path)
    .map((movie) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: movie.release_date || null,
      rating: movie.vote_average,
      voteCount: 0,
      popularity: 0,
      originalLanguage: "",
      genreIds: movie.genre_ids ?? [],
      genres: movie.genres ?? [],
    }));
}

function RailSkeleton() {
  return (
    <div aria-hidden="true" className="mb-10">
      <div className="skeleton mb-4 h-6 w-44 rounded-md" />

      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="skeleton aspect-2/3 w-[34vw] max-w-[190px] min-w-[116px] flex-none rounded-xl sm:w-[172px] lg:w-[188px]"
          />
        ))}
      </div>
    </div>
  );
}

function Home() {
  // Load previously cached public catalogue data immediately.
  const [trending, setTrending] = useState<Movie[]>(
    () => readBrowserCache<Movie[]>("home:trending") ?? [],
  );

  const [upcoming, setUpcoming] = useState<Movie[]>(
    () => readBrowserCache<Movie[]>("home:upcoming") ?? [],
  );

  const [popular, setPopular] = useState<Movie[]>(
    () => readBrowserCache<Movie[]>("home:popular") ?? [],
  );

  const [loading, setLoading] = useState(
    () =>
      !["home:trending", "home:upcoming", "home:popular"].some(
        (key) => readBrowserCache<Movie[]>(key)?.length,
      ),
  );

  useEffect(() => {
    let mounted = true;

    // Load the static Vercel snapshot first.
    const loadStaticSnapshot = async () => {
      const data = await getStaticHomeData();

      if (!mounted || !data) return;

      const staticTrending = mapMovies(data.trending);
      const staticUpcoming = mapMovies(data.upcoming);
      const staticPopular = mapMovies(data.popular);

      if (staticTrending.length > 0) {
        setTrending(staticTrending);
        writeBrowserCache("home:trending", staticTrending);
      }

      if (staticUpcoming.length > 0) {
        setUpcoming(staticUpcoming);
        writeBrowserCache("home:upcoming", staticUpcoming);
      }

      if (staticPopular.length > 0) {
        setPopular(staticPopular);
        writeBrowserCache("home:popular", staticPopular);
      }

      if (
        staticTrending.length > 0 ||
        staticUpcoming.length > 0 ||
        staticPopular.length > 0
      ) {
        setLoading(false);
      }
    };

    // Refresh from the API in the background.
    const refreshFromApi = async () => {
      const [trendingResult, upcomingResult, popularResult] =
        await Promise.allSettled([
          getTrendingMovies(),
          getUpcomingMovies(),
          getPopularMovies(),
        ]);

      if (!mounted) return;

      if (trendingResult.status === "fulfilled") {
        const movies = mapMovies(trendingResult.value.movies);
        setTrending(movies);
        writeBrowserCache("home:trending", movies);
      }

      if (upcomingResult.status === "fulfilled") {
        const movies = mapMovies(upcomingResult.value.movies);
        setUpcoming(movies);
        writeBrowserCache("home:upcoming", movies);
      }

      if (popularResult.status === "fulfilled") {
        const movies = mapMovies(popularResult.value.movies);
        setPopular(movies);
        writeBrowserCache("home:popular", movies);
      }

      setLoading(false);
    };

    // Load static data before starting the potentially sleeping Render API.
    const startLoading = async () => {
      await loadStaticSnapshot();

      if (mounted) {
        void refreshFromApi();
      }
    };

    void startLoading();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar overlay />

      <main>
        <Hero />

        <div className="mx-auto w-full max-w-[1400px] px-4 pb-6 pt-8 sm:px-6 lg:px-8">
          {loading ? (
            <>
              <RailSkeleton />
              <RailSkeleton />
            </>
          ) : (
            <>
              <MovieSection
                title="Trending Now"
                movies={trending}
                viewAllPath="/movies?category=trending"
              />

              <GenreTiles />

              <MovieSection
                title="Upcoming"
                movies={upcoming}
                viewAllPath="/movies?category=upcoming"
              />

              <MovieSection
                title="Popular Movies"
                movies={popular}
                viewAllPath="/movies?category=popular"
              />

              <CommunityBuzz />
            </>
          )}
        </div>
      </main>

      <Footer />

      <ProfileSetupModal />
    </div>
  );
}

export default Home;
