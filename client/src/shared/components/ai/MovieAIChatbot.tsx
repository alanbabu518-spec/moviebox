import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Film,
  Plus,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  chatWithMovieAI,
  searchWithAI,
  type AIChatMessage,
  type AIAssistantMovie,
} from "../../services/ai.api";

import { normalizeApiError } from "../../services/api";

import { cn } from "../../lib/cn";
import AiAvatar, { type AvatarStatus } from "./ai-avatar";

type Layout = "list" | "single";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  /* list   → numbered poster cards only, no text bubbles
     single → big movie image + Explanation + View details
     none   → plain text bubble (no poster to show) */
  layout?: Layout;
  movies?: AIAssistantMovie[];
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    content:
      "Hi, I'm Momo! I can help you discover movies, find similar ones, and answer anything about what to watch.",
  },
];

const suggestions = [
  "Recommend a movie for me",
  "Movies like Interstellar",
  "Best Malayalam thrillers",
  "Something light for tonight",
];

const TMDB_POSTER_URL = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP_URL = "https://image.tmdb.org/t/p/w780";

/* Only the last N turns are sent back to the API */
const MAX_HISTORY = 12;

/* Controls: instant taps, no text selection on long-press */
const tap = "touch-manipulation select-none";

/* The chat survives closing the panel, navigating (e.g. "View details") and
   refreshing. sessionStorage is cleared when the browser tab/window closes. */
const STORAGE_KEY = "momo-chat-v2";
const MAX_STORED = 40;

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    if (!Array.isArray(parsed)) {
      return initialMessages;
    }

    const valid = parsed.filter(
      (item): item is ChatMessage =>
        !!item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string",
    );

    return valid.length > 0 ? valid : initialMessages;
  } catch {
    return initialMessages;
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(messages.slice(-MAX_STORED)),
    );
  } catch {
    /* storage blocked or full: the chat still works, it just won't persist */
  }
}

/* ---------- Text helpers ---------- */

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const getReleaseYear = (releaseDate: string | null | undefined) =>
  releaseDate ? releaseDate.slice(0, 4) : null;

const getRating = (movie: AIAssistantMovie) =>
  typeof movie.voteAverage === "number" && movie.voteAverage > 0
    ? movie.voteAverage.toFixed(1)
    : null;

/* Question types */
const SUMMARY_INTENT =
  /\b(summary|summari[sz]e|explain|explanation|plot|storyline|story|what happens|ending|about|review)\b/i;
const LIST_INTENT =
  /\b(movies|films|recommend|suggest|similar|like|best|top|list|some|any)\b/i;

/* ---------- Movie matching ---------- */

/* Movies the answer actually names, in the order it names them.
   Bold names (**Title**) win; otherwise whole-word matches in the text.
   Strict: returns [] when nothing is named. */
function mentionedMovies(
  content: string,
  movies: AIAssistantMovie[],
): AIAssistantMovie[] {
  const bold = [...content.matchAll(/\*\*(.+?)\*\*/g)].map((m) => norm(m[1]));
  const text = ` ${norm(content)} `;

  const scored = movies.map((movie) => {
    const title = norm(movie.title);

    return {
      movie,
      bold: title ? bold.indexOf(title) : -1,
      pos: title ? text.indexOf(` ${title} `) : -1,
    };
  });

  const anyBold = scored.some((item) => item.bold >= 0);

  const hits = scored
    .filter((item) => (anyBold ? item.bold >= 0 : item.pos >= 0))
    .sort((a, b) => (anyBold ? a.bold - b.bold : a.pos - b.pos))
    .map((item) => item.movie);

  return [...new Map(hits.map((m) => [m.id, m])).values()];
}

/* Until the backend sends voteAverage, read it from the answer text,
   e.g. "(2026, rating 8.634)". */
function withRatings(
  content: string,
  movies: AIAssistantMovie[],
): AIAssistantMovie[] {
  const lines = content
    .split("\n")
    .map((raw) => ({ raw, text: ` ${norm(raw)} ` }));

  return movies.map((movie) => {
    if (typeof movie.voteAverage === "number" && movie.voteAverage > 0) {
      return movie;
    }

    const title = norm(movie.title);
    const line = title
      ? lines.find((item) => item.text.includes(` ${title} `))
      : undefined;
    const match = line?.raw.match(/rating\D{0,3}(\d+(?:\.\d+)?)/i);

    return match ? { ...movie, voteAverage: parseFloat(match[1]) } : movie;
  });
}

/* Card description fallback: the movie's line from the answer text,
   cleaned of bullet, bold title and "(2026, rating 8.6)". */
function blurbFor(content: string, title: string) {
  const t = norm(title);

  if (!t) {
    return null;
  }

  const line = content
    .split("\n")
    .find((item) => ` ${norm(item)} `.includes(` ${t} `));

  if (!line) {
    return null;
  }

  const text = line
    .replace(BULLET, "")
    .replace(/\*\*[^*]+\*\*/, "")
    .replace(/^[\s—–:-]+/, "")
    .replace(/\*?\([^)]*\)\*?\s*$/, "")
    .replace(/\*/g, "")
    .trim();

  return text.length > 20 ? text : null;
}

/* Best guess at the title a summary question is about */
function guessTitle(question: string, answer: string) {
  const bold = answer.match(/\*\*(.+?)\*\*/)?.[1];

  if (bold) {
    return bold.trim();
  }

  const match = question.match(
    /(?:summary|summari[sz]e|explain|explanation|plot|story|ending|about|review)(?:\s+(?:of|for|on|the))*\s+(.+?)[?.!]*$/i,
  );

  return (
    match?.[1].replace(/^(?:the\s+)?(?:movie|film)\s+/i, "").trim() || null
  );
}

/* Decide how a reply is shown.
   list   → 2+ movies named in a recommendation answer
   single → one movie (summary / explanation / "tell me about")
   none   → no poster to show */
async function resolveReply(
  question: string,
  answer: string,
  candidates: AIAssistantMovie[],
): Promise<{ layout?: Layout; movies: AIAssistantMovie[] }> {
  const mentioned = mentionedMovies(answer, candidates);
  const wantsSummary = SUMMARY_INTENT.test(question);
  const wantsList = LIST_INTENT.test(question);

  if (mentioned.length >= 2 && !(wantsSummary && !wantsList)) {
    return { layout: "list", movies: withRatings(answer, mentioned) };
  }

  /* One movie: the one the question names, else the one the answer names */
  const q = ` ${norm(question)} `;
  const asked = candidates.find((movie) => {
    const title = norm(movie.title);
    return title && q.includes(` ${title} `);
  });

  const hero =
    asked ??
    mentioned[0] ??
    (candidates.length === 1 ? candidates[0] : undefined);

  if (hero) {
    return { layout: "single", movies: withRatings(answer, [hero]) };
  }

  /* The backend sent no matching movie for a summary question:
     look the title up so the image still shows. */
  if (wantsSummary) {
    const title = guessTitle(question, answer);

    if (title) {
      try {
        const found = await searchWithAI(title);
        const target = norm(title);
        const match =
          found.movies.find((movie) => norm(movie.title) === target) ??
          found.movies[0];

        if (match) {
          return { layout: "single", movies: withRatings(answer, [match]) };
        }
      } catch {
        /* no image: fall back to the plain answer */
      }
    }
  }

  return { movies: [] };
}

/* **bold** and *italic* only. Enough for Momo's replies, no library needed. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }

        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }

        return part;
      })}
    </>
  );
}

/* ---------- Reply pieces ---------- */

function MessageBubble({
  content,
  label,
}: {
  content: string;
  label?: string;
}) {
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 text-sm leading-7 text-ink">
      {label && (
        <p className="mb-1 text-[11px] font-bold tracking-[0.08em] text-brand uppercase">
          {label}
        </p>
      )}

      <div className="space-y-2">
        {lines.map((line, index) =>
          BULLET.test(line) ? (
            <p key={index} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>
                <Inline text={line.replace(BULLET, "")} />
              </span>
            </p>
          ) : (
            <p key={index}>
              <Inline text={line} />
            </p>
          ),
        )}
      </div>
    </div>
  );
}

function Rating({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-amber-400">
      <Star size={12} className="fill-current" aria-hidden="true" />
      {value}
    </span>
  );
}

/* Recommendation row: poster left, plot + rating right, View details below */
function MovieRow({
  movie,
  index,
  blurb,
  onOpen,
}: {
  movie: AIAssistantMovie;
  index: number;
  blurb: string | null;
  onOpen: (movieId: number) => void;
}) {
  const year = getReleaseYear(movie.releaseDate);
  const rating = getRating(movie);

  return (
    <li
      className="animate-rise flex gap-2 [animation-fill-mode:backwards]"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span
        aria-hidden="true"
        className="w-4 shrink-0 pt-2.5 text-sm font-bold text-brand"
      >
        {index + 1}
      </span>

      <article className="flex min-w-0 flex-1 gap-3 rounded-2xl border border-line bg-card p-2.5">
        <div className="aspect-2/3 w-21 shrink-0 overflow-hidden rounded-xl bg-elevated">
          {movie.posterPath ? (
            <img
              src={`${TMDB_POSTER_URL}${movie.posterPath}`}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-muted">
              No poster
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-[15px] font-bold">{movie.title}</h3>

          <div className="flex items-center gap-2 text-xs text-muted">
            {year && <span>{year}</span>}
            {rating && <Rating value={rating} />}
          </div>

          {blurb && (
            <p className="line-clamp-3 text-[13px] leading-[17px] text-muted">
              {blurb}
            </p>
          )}

          <button
            type="button"
            onClick={() => onOpen(movie.id)}
            aria-label={`View details for ${movie.title}`}
            className={cn(
              tap,
              "-ml-2 mt-auto inline-flex min-h-11 items-center gap-0.5 self-start px-2 text-[13px] font-semibold text-brand transition-opacity duration-150 active:opacity-60",
            )}
          >
            View details
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </article>
    </li>
  );
}

/* Summary / explanation: big movie image with title, year and rating */
function MovieHero({ movie }: { movie: AIAssistantMovie }) {
  const year = getReleaseYear(movie.releaseDate);
  const rating = getRating(movie);

  const image = movie.backdropPath
    ? `${TMDB_BACKDROP_URL}${movie.backdropPath}`
    : movie.posterPath
      ? `${TMDB_POSTER_URL}${movie.posterPath}`
      : null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-elevated">
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-linear-to-br from-brand/25 to-elevated text-muted">
          <Film size={34} aria-hidden="true" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent px-3.5 pt-10 pb-3">
        <p className="text-lg font-bold text-white">{movie.title}</p>

        <div className="mt-0.5 flex items-center gap-2 text-xs text-white/80">
          {year && <span>{year}</span>}
          {rating && <Rating value={rating} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Chatbot ---------- */

export default function MovieAIChatbot() {
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [speakingId, setSpeakingId] = useState<number | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lastAssistantId = [...messages]
    .reverse()
    .find((item) => item.role === "assistant")?.id;

  const momoStatus: AvatarStatus = loading
    ? "thinking"
    : speakingId !== null
      ? "speaking"
      : "idle";

  /* Save after every change */
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  /* Keep the newest message in view */
  useEffect(() => {
    const node = scroller.current;

    if (isOpen && node) {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      node.scrollTo({
        top: node.scrollHeight,
        behavior: reduce ? "auto" : "smooth",
      });
    }
  }, [messages, loading, isOpen]);

  /* Esc closes the panel and hands focus back to the launcher */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        fabRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  /* Focus the input on open, but only with a precise pointer.
     On phones, auto-focus would pop the keyboard over the conversation. */
  useEffect(() => {
    if (!isOpen || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    const timer = setTimeout(
      () => inputRef.current?.focus({ preventScroll: true }),
      320,
    );

    return () => clearTimeout(timer);
  }, [isOpen]);

  /* Phone sheet: track the visual viewport so the composer rides above the
     software keyboard (iOS ignores dvh for the keyboard), and lock page scroll.
     Writes straight to the element, so there is no re-render. */
  useEffect(() => {
    const panel = panelRef.current;

    if (!isOpen || !panel) {
      return;
    }

    const vv = window.visualViewport;
    const mobile = window.matchMedia("(max-width: 767px)");
    const previousOverflow = document.body.style.overflow;

    const sync = () => {
      if (mobile.matches && vv) {
        panel.style.height = `${vv.height}px`;
        panel.style.top = `${vv.offsetTop}px`;
        document.body.style.overflow = "hidden";
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
      } else {
        panel.style.removeProperty("height");
        panel.style.removeProperty("top");
        document.body.style.overflow = previousOverflow;
      }
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    mobile.addEventListener("change", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      mobile.removeEventListener("change", sync);
      panel.style.removeProperty("height");
      panel.style.removeProperty("top");
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /* Unmount: stop timers and any request still in flight */
  useEffect(
    () => () => {
      if (speakTimer.current) {
        clearTimeout(speakTimer.current);
      }

      abortRef.current?.abort();
    },
    [],
  );

  const sendMessage = async (text: string = message) => {
    const trimmedMessage = text.trim();

    if (!trimmedMessage || loading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: trimmedMessage,
    };

    const conversation: AIChatMessage[] = messages
      .slice(-MAX_HISTORY)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setSpeakingId(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const replyId = Date.now() + 1;

    try {
      const result = await chatWithMovieAI(
        trimmedMessage,
        conversation,
        controller.signal,
      );

      const resolved = await resolveReply(
        trimmedMessage,
        result.answer,
        result.movies ?? [],
      );

      if (controller.signal.aborted) {
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: replyId,
          role: "assistant",
          content: result.answer,
          layout: resolved.layout,
          movies: resolved.movies,
        },
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      console.error("Failed to chat with Momo:", error);

      const normalizedError = normalizeApiError(error);

      setMessages((current) => [
        ...current,
        {
          id: replyId,
          role: "assistant",
          content: normalizedError.message,
        },
      ]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);

        /* Momo "talks" for a moment when the reply lands */
        setSpeakingId(replyId);

        if (speakTimer.current) {
          clearTimeout(speakTimer.current);
        }

        speakTimer.current = setTimeout(() => setSpeakingId(null), 2200);
      }
    }
  };

  /* New chat: cancel any reply in flight, clear everything */
  const resetChat = () => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages(initialMessages);
    setMessage("");
    setSpeakingId(null);

    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  /* "View details" → the app's movie details page */
  const handleMovieClick = (movieId: number) => {
    setIsOpen(false);
    navigate(`/movie/${movieId}`);
  };

  return (
    <>
      {/* Full-screen sheet on phones, floating card on desktop.
          Stays mounted so open/close animates transform + opacity only. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Chat with Momo"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "fixed z-60 flex origin-bottom-right flex-col overflow-hidden overscroll-contain bg-surface shadow-2xl",
          "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity",
          "inset-x-0 top-0 h-dvh",
          "md:inset-x-auto md:bottom-24 md:right-6 md:top-auto md:h-[min(680px,calc(100dvh-8rem))] md:w-[420px] md:rounded-3xl md:border md:border-line",
          isOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0 max-md:translate-y-10 max-md:scale-100",
        )}
      >
        <div className="flex items-center justify-between border-b border-line bg-card px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] md:px-5 md:py-4">
          <div className="flex items-center gap-3">
            <AiAvatar
              color="red"
              size="md"
              status={momoStatus}
              blinking={isOpen}
              lookAt={isOpen}
              entrance={false}
            />

            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold">Momo</h2>
                <Sparkles size={15} className="text-brand" />
              </div>

              <p className="text-xs text-muted" aria-live="polite">
                {loading
                  ? "Thinking…"
                  : speakingId !== null
                    ? "Here you go"
                    : "Your movie sidekick"}
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <button
              type="button"
              onClick={resetChat}
              disabled={messages.length <= 1 && !loading}
              title="New chat"
              className={cn(
                tap,
                "grid h-11 w-11 place-items-center rounded-full text-muted transition-[transform,background-color,opacity] duration-150 hover:bg-white/10 hover:text-ink active:scale-90 disabled:opacity-40",
              )}
              aria-label="New chat"
            >
              <Plus size={21} />
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={cn(
                tap,
                "grid h-11 w-11 place-items-center rounded-full text-muted transition-[transform,background-color] duration-150 hover:bg-white/10 active:scale-90",
              )}
              aria-label="Close chat with Momo"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="flex-1 overflow-y-auto overscroll-contain bg-canvas px-4 py-5"
        >
          <div className="space-y-5">
            {messages.map((chatMessage) => {
              const isUser = chatMessage.role === "user";
              const isLatest = chatMessage.id === lastAssistantId;
              const movies = chatMessage.movies ?? [];

              const showList =
                chatMessage.layout === "list" && movies.length > 0;
              const showSingle =
                chatMessage.layout === "single" && movies.length > 0;

              return (
                <div
                  key={chatMessage.id}
                  className={cn(
                    "animate-rise flex",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  {isUser ? (
                    <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand px-4 py-3 text-sm leading-7 text-white">
                      {chatMessage.content}
                    </div>
                  ) : (
                    <div className="flex w-full items-start gap-2.5">
                      {/* Only the latest reply keeps Momo "alive" */}
                      <AiAvatar
                        color="red"
                        size="sm"
                        blinking={isLatest}
                        lookAt={false}
                        entrance={isLatest}
                        status={
                          chatMessage.id === speakingId ? "speaking" : "idle"
                        }
                        className="mt-0.5"
                      />

                      <div className="min-w-0 flex-1 space-y-3">
                        {/* 1 · Recommendations: poster cards only */}
                        {showList && (
                          <ol role="list" className="space-y-2.5">
                            {movies.map((movie, index) => (
                              <MovieRow
                                key={movie.id}
                                movie={movie}
                                index={index}
                                blurb={
                                  movie.overview ||
                                  blurbFor(chatMessage.content, movie.title)
                                }
                                onOpen={handleMovieClick}
                              />
                            ))}
                          </ol>
                        )}

                        {/* 2 · Summary / explanation: image + text + button */}
                        {showSingle && (
                          <>
                            <MovieHero movie={movies[0]} />

                            <MessageBubble
                              content={chatMessage.content}
                              label="Explanation"
                            />

                            <button
                              type="button"
                              onClick={() => handleMovieClick(movies[0].id)}
                              className={cn(
                                tap,
                                "flex min-h-12 w-full items-center justify-center gap-1 rounded-2xl bg-brand text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]",
                              )}
                            >
                              View details
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          </>
                        )}

                        {/* 3 · No poster to show: plain text answer */}
                        {!showList && !showSingle && (
                          <MessageBubble content={chatMessage.content} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div
                className="animate-rise flex items-center gap-2.5"
                role="status"
              >
                <AiAvatar
                  color="red"
                  size="sm"
                  status="thinking"
                  lookAt={false}
                />

                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3.5">
                  <span className="sr-only">Momo is thinking</span>

                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      aria-hidden="true"
                      style={{ animationDelay: `${delay}ms` }}
                      className="h-2 w-2 rounded-full bg-muted motion-safe:animate-bounce"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {messages.length === 1 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-medium text-muted">
                Try asking Momo
              </p>

              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className={cn(
                      tap,
                      "rounded-full border border-line bg-white/5 px-3.5 py-2.5 text-xs font-medium text-muted transition-[transform,color] duration-150 hover:text-ink active:scale-95",
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas pl-4 pr-1.5 focus-within:border-brand/70">
            {/* 16px text: anything smaller makes iOS Safari zoom on focus.
                Not disabled while loading: disabling would drop focus and
                close the keyboard mid-conversation. */}
            <input
              ref={inputRef}
              type="text"
              enterKeyHint="send"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Momo…"
              aria-label="Message Momo"
              aria-busy={loading}
              className="min-w-0 flex-1 bg-transparent py-3 text-base text-ink outline-none placeholder:text-muted"
            />

            <button
              type="button"
              /* keep the keyboard open: don't let the button steal focus */
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void sendMessage()}
              disabled={loading || !message.trim()}
              className={cn(
                tap,
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition-[transform,opacity] duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40",
              )}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Launcher: Momo himself. Crossfades to an X while the card is open. */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close chat with Momo" : "Chat with Momo"}
        className={cn(
          tap,
          "fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-60 h-16 w-16 rounded-full transition-transform duration-200 active:scale-90 md:bottom-5 md:right-6 md:hover:scale-105",
          isOpen && "max-md:hidden",
        )}
      >
        <span
          className={cn(
            "absolute inset-0 transition-[transform,opacity] duration-200",
            isOpen ? "scale-50 opacity-0" : "scale-100 opacity-100",
          )}
        >
          <AiAvatar
            color="red"
            size="lg"
            status={loading ? "thinking" : "idle"}
            blinking={!isOpen}
            lookAt={!isOpen}
            className="pointer-events-none"
          />
        </span>

        <span
          className={cn(
            "absolute inset-0 grid place-items-center rounded-full bg-brand text-white shadow-[0_12px_32px_-8px_var(--primary)] transition-[transform,opacity] duration-200",
            isOpen ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        >
          <X size={22} />
        </span>
      </button>
    </>
  );
}
