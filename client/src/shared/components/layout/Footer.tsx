import { ArrowUp, ArrowUpRight, Moon, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useThemeStore } from "../../../store/theme.store";
import { cn } from "../../lib/cn";
import Logo from "./Logo";

interface FooterLink {
  label: string;
  to: string;
  auth?: boolean;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Discover",
    links: [
      { label: "Popular", to: "/movies?category=popular", auth: true },
      { label: "Trending", to: "/movies?category=trending", auth: true },
      { label: "Upcoming", to: "/movies?category=upcoming", auth: true },
      { label: "AI Search", to: "/ai/search", auth: true },
    ],
  },
  {
    title: "Your library",
    links: [
      { label: "Favorites", to: "/favorites", auth: true },
      { label: "Watchlist", to: "/watchlist", auth: true },
      { label: "Profile", to: "/profile", auth: true },
    ],
  },
];

const GENRES = [
  { id: "28", label: "Action" },
  { id: "12", label: "Adventure" },
  { id: "16", label: "Animation" },
  { id: "35", label: "Comedy" },
  { id: "80", label: "Crime" },
  { id: "99", label: "Documentary" },
  { id: "18", label: "Drama" },
  { id: "14", label: "Fantasy" },
  { id: "27", label: "Horror" },
  { id: "9648", label: "Mystery" },
  { id: "10749", label: "Romance" },
  { id: "878", label: "Sci-Fi" },
  { id: "53", label: "Thriller" },
];

const linkClass =
  "inline-flex min-h-10 items-center text-sm text-muted transition-colors duration-150 hover:text-ink active:opacity-60 md:min-h-8";

export default function Footer() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const gate = (event: React.MouseEvent, auth?: boolean) => {
    if (!auth) {
      return;
    }

    if (loading) {
      event.preventDefault();
      return;
    }

    if (!user) {
      event.preventDefault();
      navigate("/signin");
    }
  };

  const backToTop = () => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const isDark = theme === "dark";

  return (
    <footer className="relative mt-10 overflow-hidden">
      {/* hairline of light along the top edge */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-linear-to-r from-transparent via-brand/60 to-transparent"
      />

      <div className="mx-auto grid max-w-[1400px] gap-x-10 gap-y-10 px-4 pb-10 pt-12 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr] lg:grid-cols-[1.3fr_0.8fr_0.8fr_1.5fr] lg:px-8">
        {/* Brand */}
        <div className="md:col-span-3 lg:col-span-1">
          <Link
            to="/"
            aria-label="MovieBox home"
            className="inline-block active:opacity-60"
          >
            <Logo size={44} />
          </Link>

          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Find what to watch next, save it for later, and keep track of the
            movies you love.
          </p>
        </div>

        {/* Link columns: two-up on phones, no accordions to tap through */}
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
              {column.title}
            </h3>

            <ul className="mt-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    onClick={(event) => gate(event, link.auth)}
                    className={linkClass}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {/* Genres */}
        <nav
          aria-label="Browse by genre"
          className="col-span-2 md:col-span-3 lg:col-span-1"
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            Browse by genre
          </h3>

          <ul className="mt-4 flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <li key={genre.id}>
                <Link
                  to={`/movies?category=popular&genre=${genre.id}`}
                  onClick={(event) => gate(event, true)}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-white/4 px-3.5 text-[13px] font-medium text-muted transition-[transform,background-color,color,border-color] duration-150 hover:border-brand/50 hover:bg-brand/10 hover:text-ink active:scale-95"
                >
                  {genre.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Utility row */}
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 border-t border-line px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="space-y-1.5 text-xs leading-relaxed text-muted">
          <p>© {new Date().getFullYear()} MovieBox. All rights reserved.</p>

          <p className="max-w-xl">
            This product uses the{" "}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-ink underline-offset-4 hover:underline"
            >
              TMDB API
              <ArrowUpRight size={12} />
            </a>{" "}
            but is not endorsed or certified by TMDB.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 md:justify-end">
          {/* Segmented theme control: the pill slides with a transform */}
          <div
            role="group"
            aria-label="Theme"
            className="relative grid h-10 w-[148px] grid-cols-2 rounded-full border border-line bg-white/4 p-1"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-elevated shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                isDark ? "translate-x-0" : "translate-x-full",
              )}
            />

            {(
              [
                ["dark", Moon, "Dark"],
                ["light", Sun, "Light"],
              ] as const
            ).map(([value, Icon, label]) => {
              const active = (value === "dark") === isDark;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && toggleTheme()}
                  className={cn(
                    "relative z-10 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors duration-200 active:opacity-70",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={backToTop}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white/4 px-4 text-xs font-semibold text-muted transition-[transform,color,border-color] duration-150 hover:border-brand/50 hover:text-ink active:scale-95"
          >
            Back to top
            <ArrowUp size={14} />
          </button>
        </div>
      </div>

      {/* Oversized wordmark: static, purely decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden px-4 sm:px-6 lg:px-8"
      >
        <p className="mx-auto max-w-[1400px] bg-linear-to-b from-ink/12 to-transparent bg-clip-text text-center font-display text-[21vw] font-extrabold leading-[0.8] tracking-[-0.05em] text-transparent md:text-[15vw] xl:text-[13.5rem]">
          MovieBox
        </p>
      </div>
    </footer>
  );
}
