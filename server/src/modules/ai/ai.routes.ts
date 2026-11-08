import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

import { authenticate } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../shared/types/auth.js";

import {
  askMovieAssistant,
  searchWithAI,
  getAIRecommendationResults,
  chatWithMovieAssistant,
} from "./ai.controller.js";

const router = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Rate-limit requests by authenticated user.
 * Falls back to IP if authentication middleware does not provide a user ID.
 */
const createAIRateLimiter = (limit: number, message: string) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
      const userId = (req as AuthenticatedRequest).userId;

      return userId
        ? `user:${userId}`
        : `ip:${ipKeyGenerator(req.ip ?? "127.0.0.1")}`;
    },

    message: {
      success: false,
      message,
    },
  });

// Maximum requests per authenticated user in 15 minutes.
const aiChatLimiter = createAIRateLimiter(
  20,
  "Too many AI chat requests. Please try again in 15 minutes.",
);

const aiSearchLimiter = createAIRateLimiter(
  30,
  "Too many AI search requests. Please try again in 15 minutes.",
);

const aiRecommendationLimiter = createAIRateLimiter(
  10,
  "Too many recommendation requests. Please try again in 15 minutes.",
);

const movieAssistantLimiter = createAIRateLimiter(
  20,
  "Too many movie assistant requests. Please try again in 15 minutes.",
);

// AI movie search
router.post("/search", authenticate, aiSearchLimiter, searchWithAI);

// Personalized AI recommendations
router.get(
  "/recommendations",
  authenticate,
  aiRecommendationLimiter,
  getAIRecommendationResults,
);

// Ask questions about a specific movie
router.post(
  "/:tmdbId/ai",
  authenticate,
  movieAssistantLimiter,
  askMovieAssistant,
);

// Momo AI chatbot
router.post("/chat", authenticate, aiChatLimiter, chatWithMovieAssistant);

export default router;
