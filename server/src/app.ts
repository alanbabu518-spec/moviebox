import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";

const app = express();

// Disable Express fingerprinting.
app.disable("x-powered-by");

// Security headers
app.use(helmet());

// Restrict cross-origin requests to the configured frontend.
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  }),
);

// Limit incoming request payload size.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// Parse cookies before routes that need them.
app.use(cookieParser());

// Root endpoint
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to MovieBox API",
  });
});

// Liveness check: verifies that the API process responds.
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "moviebox-api",
    timestamp: new Date().toISOString(),
  });
});

// API routes.
// CSRF protection is already applied inside routes/index.ts.
app.use("/api", routes);

// Error handling must remain after routes.
app.use(notFound);
app.use(errorHandler);

export default app;
