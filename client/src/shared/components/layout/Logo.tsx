import { cn } from "../../lib/cn";

interface LogoProps {
  /** "full" = tile + MovieBox wordmark, "icon" = tile only */
  variant?: "full" | "icon";
  /** Tile size in px. The wordmark scales with it. */
  size?: number;
  /** "dark" = always white "Movie" + gold "Box" (navbar, auth screen, error page).
   *  "auto" = follows the app theme (footer, anything on the page background). */
  tone?: "auto" | "dark";
  className?: string;
}

export default function Logo({
  variant = "full",
  size = 36,
  tone = "auto",
  className,
}: LogoProps) {
  const isDark = tone === "dark";

  return (
    <span
      className={cn("inline-flex select-none items-center", className)}
      style={{ gap: size * 0.3 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="mb-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B1B23" />
            <stop offset="1" stopColor="#08080B" />
          </linearGradient>
          <linearGradient id="mb-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F7E6B0" />
            <stop offset="1" stopColor="#C69A47" />
          </linearGradient>
        </defs>

        <rect width="64" height="64" rx="15" fill="url(#mb-tile)" />
        <rect
          x=".5"
          y=".5"
          width="63"
          height="63"
          rx="14.5"
          fill="none"
          stroke="#C69A47"
          strokeOpacity=".35"
        />

        <g transform="translate(32 33) scale(0.23) translate(-132 -141.5)">
          <path
            d="M50 212V112A41 41 0 0 1 132 112V212M132 112A41 41 0 0 1 214 112V212"
            fill="none"
            stroke="url(#mb-gold)"
            strokeWidth="24"
            strokeLinejoin="round"
          />
          <path
            d="M163 138L187 158L163 178Z"
            fill="#E50914"
            stroke="#E50914"
            strokeWidth="6"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      {variant === "full" && (
        <span
          className="font-display font-extrabold leading-none tracking-tight"
          style={{ fontSize: size * 0.56 }}
        >
          <span className={isDark ? "text-white" : "text-ink"}>Movie</span>
          <span
            className={cn(
              isDark
                ? "bg-linear-to-br from-[#F7E6B0] to-[#C69A47] bg-clip-text text-transparent"
                : "text-[#A30310] dark:bg-linear-to-br dark:from-[#F7E6B0] dark:to-[#C69A47] dark:bg-clip-text dark:text-transparent",
            )}
          >
            Box
          </span>
        </span>
      )}
    </span>
  );
}
