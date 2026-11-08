import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";
import Logo from "../layout/Logo";

interface ErrorPageProps {
  statusCode?: number;
  title?: string;
  message?: string;
}

interface ErrorContent {
  title: string;
  message: string;
}

const errorContent: Record<number, ErrorContent> = {
  400: {
    title: "Invalid Request!",
    message: "Something went wrong with your request.",
  },
  401: {
    title: "Sign in required!",
    message: "Please sign in to continue your journey.",
  },
  403: {
    title: "Access denied!",
    message: "You don't have permission to visit this page.",
  },
  404: {
    title: "Boo! Page missing!",
    message: "Whoops! This page must be a ghost — it's not here!",
  },
  408: {
    title: "Request timed out!",
    message: "The request took too long. Please try again.",
  },
  429: {
    title: "Slow down!",
    message: "Too many requests. Give us a moment and try again.",
  },
  500: {
    title: "Something went wrong!",
    message: "Our servers encountered an unexpected problem.",
  },
  502: {
    title: "Bad gateway!",
    message: "MovieBox received an unexpected response. Please try again.",
  },
  503: {
    title: "Temporarily unavailable!",
    message: "MovieBox is taking a little break. Try again soon.",
  },
  504: {
    title: "Gateway timed out!",
    message: "The service took too long to respond. Please try again.",
  },
};

const easing = [0.43, 0.13, 0.23, 0.96] as const;

const containerVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: easing,
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easing,
    },
  },
};

const numberVariants: Variants = {
  hidden: (direction: number) => ({
    opacity: 0,
    x: direction * 40,
    y: 15,
    rotate: direction * 5,
  }),
  visible: {
    opacity: 0.75,
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.8,
      ease: easing,
    },
  },
};

const ghostVariants: Variants = {
  hidden: {
    scale: 0.8,
    opacity: 0,
    y: 15,
    rotate: -5,
  },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.6,
      ease: easing,
    },
  },
  hover: {
    scale: 1.1,
    y: -10,
    rotate: [0, -5, 5, -5, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      rotate: {
        duration: 2,
        ease: "linear",
        repeat: Infinity,
        repeatType: "reverse",
      },
    },
  },
};

export default function ErrorPage({
  statusCode = 404,
  title,
  message,
}: ErrorPageProps) {
  const defaults = errorContent[statusCode] ?? {
    title: "Something went wrong!",
    message: "We couldn't complete your request. Please try again.",
  };

  const isNotFound = statusCode === 404;

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#09090b] px-4 py-12 text-white">
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/[0.06] blur-[120px]"
      />

      <AnimatePresence mode="wait">
        <motion.section
          key={`${statusCode}-${title ?? ""}`}
          className="relative z-10 mx-auto w-full max-w-2xl text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Error code and ghost */}
          <div
            className="mb-8 flex items-center justify-center gap-2 sm:mb-10 sm:gap-5"
            aria-label={`Error ${statusCode}`}
          >
            {isNotFound ? (
              <>
                <motion.span
                  custom={-1}
                  variants={numberVariants}
                  className="select-none text-[100px] font-bold leading-none tracking-tighter text-white/70 sm:text-[150px] md:text-[180px]"
                >
                  4
                </motion.span>

                <motion.div
                  variants={ghostVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                  className="flex h-[85px] w-[85px] items-center justify-center sm:h-[130px] sm:w-[130px]"
                >
                  <img
                    src="https://cdn.21st.dev/assets/mirror/88/8848c4fd858052c49c5a5d7267489c02b021c6cf3e31bfec02787e16f1ab7d0e.png"
                    alt="A friendly ghost"
                    width={130}
                    height={130}
                    draggable={false}
                    className="h-full w-full select-none object-contain"
                  />
                </motion.div>

                <motion.span
                  custom={1}
                  variants={numberVariants}
                  className="select-none text-[100px] font-bold leading-none tracking-tighter text-white/70 sm:text-[150px] md:text-[180px]"
                >
                  4
                </motion.span>
              </>
            ) : (
              <div
                className="flex items-center justify-center gap-1"
                aria-hidden="true"
              >
                {String(statusCode)
                  .split("")
                  .map((digit, index) => (
                    <motion.span
                      key={`${index}-${digit}`}
                      custom={index % 2 === 0 ? -1 : 1}
                      variants={numberVariants}
                      className="select-none text-[90px] font-bold leading-none tracking-tighter text-white/70 sm:text-[130px] md:text-[160px]"
                    >
                      {digit}
                    </motion.span>
                  ))}
              </div>
            )}
          </div>

          {/* Error title */}
          <motion.h1
            variants={itemVariants}
            className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            {title ?? defaults.title}
          </motion.h1>

          {/* Error description */}
          <motion.p
            variants={itemVariants}
            className="mx-auto mb-9 max-w-md text-base leading-7 text-zinc-400 sm:mb-11 sm:text-lg"
          >
            {message ?? defaults.message}
          </motion.p>

          {/* Return home */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex justify-center"
          >
            <Link
              to="/"
              className="group inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black transition-colors duration-300 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-4 focus:ring-offset-[#09090b] sm:text-base"
            >
              <span>Back to MovieBox</span>

              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </motion.div>

          {/* Footer */}
          <motion.div
            variants={itemVariants}
            className="mt-12 flex flex-col items-center gap-4"
          >
            <Logo size={64} tone="dark" />
            <p className="text-xs tracking-[0.2em] text-zinc-600">
              EVERY STORY STARTS SOMEWHERE
            </p>
          </motion.div>
        </motion.section>
      </AnimatePresence>
    </main>
  );
}
