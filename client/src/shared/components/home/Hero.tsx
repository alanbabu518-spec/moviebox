import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Play,
  Plus,
  Star,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  getIndustryTrendingMovies,
  type MovieIndustry,
  type TMDBMovie,
} from "../../services/movie.api";

import { useAuth } from "../../context/AuthContext";
import { useLibraryStore } from "../../../store/library.store";
import { cn } from "../../lib/cn";
import { getStaticHomeData } from "../../services/home-data";
import { readBrowserCache, writeBrowserCache } from "../../utils/browser-cache";

const INDUSTRIES: MovieIndustry[] = [
  "hollywood",
  "bollywood",
  "kollywood",
  "tollywood",
  "mollywood",
  "kdrama",
];

const INDUSTRY_LABELS: Record<MovieIndustry, string> = {
  hollywood: "Hollywood",
  bollywood: "Bollywood",
  kollywood: "Kollywood",
  tollywood: "Tollywood",
  mollywood: "Mollywood",
  kdrama: "K-Drama",
};

const IMG = "https://image.tmdb.org/t/p";

const hasImage = (item: TMDBMovie) =>
  Boolean(item.backdrop_path || item.poster_path);

const pickRandom = <T,>(list: T[]) =>
  list[Math.floor(Math.random() * list.length)];

const backdropOf = (movie: TMDBMovie) =>
  `${IMG}/w1280${movie.backdrop_path ?? movie.poster_path}`;

const ghost =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 text-sm font-semibold text-white backdrop-blur-md transition-[transform,background-color] duration-150 hover:bg-white/20 active:scale-95";

export default function Hero() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Read cached featured movies immediately.
  const [picked, setPicked] = useState<
    Partial<Record<MovieIndustry, TMDBMovie>>
  >(() => {
    const cached: Partial<Record<MovieIndustry, TMDBMovie>> = {};

    for (const industry of INDUSTRIES) {
      const movie = readBrowserCache<TMDBMovie>(`home:hero:${industry}`);

      if (movie) {
        cached[industry] = movie;
      }
    }

    return cached;
  });

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [layers, setLayers] = useState<string[]>([]);

  const [reduceMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const swipeStart = useRef<number | null>(null);

  /*
   * Load static hero movies first.
   * Then refresh all six industries concurrently from the API.
   */
  useEffect(() => {
    let cancelled = false;

    const loadStaticSlides = async () => {
      const data = await getStaticHomeData();

      if (cancelled || !data) return;

      setPicked((current) => {
        const next = { ...current };

        for (const industry of INDUSTRIES) {
          const movie = data.hero[industry];

          if (movie && hasImage(movie)) {
            next[industry] = movie;

            writeBrowserCache(`home:hero:${industry}`, movie);
          }
        }

        return next;
      });
    };

    const refreshSlides = async () => {
      const results = await Promise.allSettled(
        INDUSTRIES.map(async (industry) => {
          const list = (await getIndustryTrendingMovies(industry)).filter(
            hasImage,
          );

          if (list.length === 0) {
            return null;
          }

          const movie = pickRandom(list);

          writeBrowserCache(`home:hero:${industry}`, movie);

          return {
            industry,
            movie,
          };
        }),
      );

      if (cancelled) return;

      setPicked((current) => {
        const next = { ...current };

        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            next[result.value.industry] = result.value.movie;
          }
        }

        return next;
      });
    };

    // Avoid starting the Render requests before the static file is loaded.
    const startLoading = async () => {
      await loadStaticSlides();

      if (!cancelled) {
        void refreshSlides();
      }
    };

    void startLoading();

    return () => {
      cancelled = true;
    };
  }, []);

  const slides = useMemo(
    () =>
      INDUSTRIES.flatMap((industry) =>
        picked[industry]
          ? [{ industry, movie: picked[industry] as TMDBMovie }]
          : [],
      ),
    [picked],
  );

  const safeIndex = slides.length > 0 ? index % slides.length : 0;
  const active = slides[safeIndex];

  const goTo = (next: number) => {
    if (slides.length === 0) {
      return;
    }

    setIndex((next + slides.length) % slides.length);
  };

  const src = active ? backdropOf(active.movie) : null;

  // Preload the image before displaying it.
  useEffect(() => {
    if (!src) {
      return;
    }

    const preload = new Image();

    preload.onload = () =>
      setLayers((current) =>
        current[current.length - 1] === src
          ? current
          : [...current, src].slice(-2),
      );

    preload.src = src;
  }, [src]);

  const inFavorites = useLibraryStore((state) =>
    active ? state.favorites.has(active.movie.id) : false,
  );

  const inWatchlist = useLibraryStore((state) =>
    active ? state.watchlist.has(active.movie.id) : false,
  );

  const requireAuth = (callback: () => void) => {
    if (loading) {
      return;
    }

    if (!user) {
      navigate("/signin");
      return;
    }

    callback();
  };

  if (!active || !src) {
    return (
      <section
        aria-busy="true"
        className="skeleton h-[74svh] min-h-[480px] md:h-[86svh] md:max-h-[820px]"
      />
    );
  }

  const { movie, industry } = active;

  const year = movie.release_date
    ? new Date(movie.release_date).getFullYear()
    : null;

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") {
      swipeStart.current = event.clientX;
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (swipeStart.current === null) {
      return;
    }

    const delta = event.clientX - swipeStart.current;
    swipeStart.current = null;

    if (Math.abs(delta) > 50) {
      goTo(safeIndex + (delta < 0 ? 1 : -1));
    }
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured movies"
      style={{ touchAction: "pan-y" }}
      onPointerEnter={(event) =>
        event.pointerType === "mouse" && setPaused(true)
      }
      onPointerLeave={(event) =>
        event.pointerType === "mouse" && setPaused(false)
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeStart.current = null)}
      className="relative isolate h-[74svh] min-h-[480px] overflow-hidden bg-black md:h-[86svh] md:max-h-[820px]"
    >
      {/* Backdrops */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {layers.map((layer, i) => (
          <img
            key={layer}
            src={layer}
            alt=""
            decoding="async"
            fetchPriority={i === 0 ? "high" : "auto"}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-[center_20%]",
              reduceMotion ? "animate-fade" : "animate-hero-layer",
            )}
          />
        ))}
      </div>

      {/* Gradient overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.55)_38%,rgba(0,0,0,0.1)_75%),linear-gradient(180deg,rgba(0,0,0,0.55)_0%,transparent_26%,transparent_52%,var(--background)_100%)]"
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1400px] items-end justify-between gap-8 px-4 pb-7 sm:px-6 lg:px-8 lg:pb-12">
        <div
          key={movie.id}
          aria-live="polite"
          className="animate-rise max-w-2xl"
        >
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-brand sm:text-sm">
            <span className="h-2 w-2 rounded-full bg-brand" />
            Trending in {INDUSTRY_LABELS[industry]}
          </p>

          <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.02] tracking-tight text-white text-balance sm:text-6xl lg:text-7xl">
            {movie.title}
          </h1>

          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
            {year && <span>{year}</span>}

            {movie.vote_average > 0 && (
              <span className="flex items-center gap-1 font-semibold text-white">
                <Star
                  size={14}
                  fill="currentColor"
                  strokeWidth={0}
                  className="text-gold"
                />
                {movie.vote_average.toFixed(1)}
              </span>
            )}

            {movie.genres?.slice(0, 2).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </p>

          {movie.overview && (
            <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/75 sm:line-clamp-3 sm:text-base">
              {movie.overview}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => requireAuth(() => navigate(`/movie/${movie.id}`))}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_var(--primary)] transition-[transform,background-color] duration-150 hover:bg-brand-hover active:scale-95"
            >
              <Play size={16} fill="currentColor" strokeWidth={0} />
              View details
            </button>

            <button
              type="button"
              aria-pressed={inFavorites}
              aria-label={
                inFavorites ? "Remove from favorites" : "Add to favorites"
              }
              onClick={() =>
                requireAuth(
                  () =>
                    void useLibraryStore
                      .getState()
                      .toggle("favorites", movie.id),
                )
              }
              className={cn(ghost, "w-11 sm:w-auto sm:px-4")}
            >
              <Heart
                size={17}
                className={cn(inFavorites && "fill-brand text-brand")}
              />
              <span className="hidden sm:inline">
                {inFavorites ? "In favorites" : "Add to favorites"}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={inWatchlist}
              onClick={() =>
                requireAuth(
                  () =>
                    void useLibraryStore
                      .getState()
                      .toggle("watchlist", movie.id),
                )
              }
              className={cn(ghost, "px-4")}
            >
              {inWatchlist ? <Check size={17} /> : <Plus size={17} />}
              {inWatchlist ? "In watchlist" : "Watchlist"}
            </button>
          </div>

          {/* Progress indicators */}
          {slides.length > 1 && (
            <div
              role="tablist"
              aria-label="Featured slides"
              className="mt-7 flex items-center gap-2"
            >
              {slides.map((slide, i) => (
                <button
                  key={slide.industry}
                  type="button"
                  role="tab"
                  aria-selected={i === safeIndex}
                  aria-label={`Show ${slide.movie.title}`}
                  onClick={() => setIndex(i)}
                  className="flex h-6 w-9 items-center sm:w-14"
                >
                  <span className="block h-1 w-full overflow-hidden rounded-full bg-white/25">
                    <span
                      onAnimationEnd={() =>
                        !reduceMotion && goTo(safeIndex + 1)
                      }
                      style={{
                        animationPlayState: paused ? "paused" : "running",
                      }}
                      className={cn(
                        "block h-full w-full origin-left rounded-full bg-brand",
                        i < safeIndex || (i === safeIndex && reduceMotion)
                          ? "scale-x-100"
                          : i === safeIndex
                            ? "animate-progress"
                            : "scale-x-0",
                      )}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop poster strip and navigation arrows */}
        {slides.length > 1 && (
          <div className="hidden shrink-0 flex-col items-center gap-3 lg:flex">
            {slides.map((slide, i) => (
              <button
                key={slide.industry}
                type="button"
                aria-label={`Show ${slide.movie.title}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-[84px] w-14 overflow-hidden rounded-lg ring-1 ring-white/25 transition-[transform,opacity] duration-300",
                  i === safeIndex
                    ? "scale-110 opacity-100 ring-2 ring-brand"
                    : "opacity-55 hover:opacity-100",
                )}
              >
                <img
                  src={`${IMG}/w185${slide.movie.poster_path ?? slide.movie.backdrop_path}`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() => goTo(safeIndex - 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/30 text-white transition-transform duration-150 active:scale-90"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                aria-label="Next slide"
                onClick={() => goTo(safeIndex + 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/30 text-white transition-transform duration-150 active:scale-90"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
