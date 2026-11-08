import type { ReactNode } from "react";
import { Film } from "lucide-react";
import Logo from "./Logo";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

const TRAILER_ID = "X1aFkAkFASk";

function AppleLogo() {
  return (
    <svg
      width="17"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C4.74 13.34 5.44 4.6 10.67 4.28c1.27.07 2.16.7 2.92.76 1.13-.23 2.21-.87 3.42-.81 1.45.12 2.55.69 3.25 1.7-2.99 1.79-2.28 5.72.46 6.82-.55 1.45-1.26 2.88-2.01 4.25ZM13.49 4.23C13.64 2.05 15.12.26 17.16.14c.28 2.52-2.28 4.38-3.67 4.09Z" />
    </svg>
  );
}

export default function AuthLayout({
  children,
  title,
  description,
}: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-black">
      <div className="relative min-h-screen overflow-hidden lg:grid lg:grid-cols-[1.15fr_0.85fr]">
        <section className="absolute inset-0 lg:relative lg:min-h-screen">
          <div className="absolute inset-0 hidden overflow-hidden lg:block">
            <iframe
              src={`https://www.youtube.com/embed/${TRAILER_ID}?autoplay=1&mute=1&controls=0&loop=1&playlist=${TRAILER_ID}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1`}
              title="MovieBox trailer"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 scale-[1.08]"
              allow="autoplay; encrypted-media"
            />
          </div>

          <div className="absolute inset-0 bg-black/35" />

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.9) 100%)",
            }}
          />

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)",
            }}
          />

          <div className="absolute left-7 top-5 z-10 hidden sm:left-10 sm:top-7 lg:block">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: "var(--primary)",
                }}
              >
                <Film size={20} strokeWidth={2.2} className="text-white" />
              </div>

              <span className="font-display text-xl font-bold tracking-tight text-white">
                MOVIE<span style={{ color: "var(--primary)" }}>BOX</span>
              </span>
            </div>
          </div>

          <div className="absolute bottom-16 left-7 z-10 hidden max-w-xl sm:left-10 lg:block">
            <Logo tone="dark" className="mb-5 h-10" />

            <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl xl:text-5xl">
              Movies worth watching.
              <br />
              Stories worth remembering.
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-6 text-white/60">
              Discover movies, build your watchlist and find your next favorite.
            </p>
          </div>
        </section>

        <section className="relative z-20 flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:bg-black/20 lg:px-12">
          <div className="w-full max-w-110">
            <div
              className="rounded-2xl border p-6 shadow-2xl backdrop-blur-xl sm:p-8"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--surface) 94%, transparent)",
                borderColor: "var(--border)",
                boxShadow: "0 25px 80px rgba(0,0,0,0.45)",
              }}
            >
              <div className="mb-7">
                <h2
                  className="font-display text-3xl font-bold tracking-tight"
                  style={{
                    color: "var(--text-primary)",
                  }}
                >
                  {title}
                </h2>

                <p
                  className="mt-2 text-sm leading-6"
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {description}
                </p>
              </div>

              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export { AppleLogo };
