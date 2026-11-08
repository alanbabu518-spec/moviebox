import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/database.js";
import { redis } from "./config/redis.js";

const server = app.listen(env.port, () => {
  console.log(`MovieBox API running on port ${env.port}`);
});

server.on("error", (error) => {
  console.error("MovieBox server error:", error);
  process.exit(1);
});

let isShuttingDown = false;

const shutdown = (signal: string): void => {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`${signal} received. Starting graceful shutdown...`);

  // Force shutdown if connections do not close in time.
  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing shutdown.");

    server.closeAllConnections();
    redis.disconnect();

    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown error:", error);
    }

    console.log("HTTP server closed.");

    const results = await Promise.allSettled([
      prisma.$disconnect(),
      redis.status === "end" ? Promise.resolve() : redis.quit(),
    ]);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Resource cleanup failed (${index === 0 ? "Prisma" : "Redis"}):`,
          result.reason,
        );
      }
    });

    clearTimeout(forceExitTimer);

    console.log("MovieBox shutdown completed.");

    process.exit(
      error || results.some((result) => result.status === "rejected") ? 1 : 0,
    );
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
