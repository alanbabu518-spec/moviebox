import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import {
  createAuthToken,
  requestMagicLink,
  verifyMagicLink,
} from "./auth.service.js";
import {
  authenticateWithGoogle,
  getGoogleAuthorizationUrl,
} from "./google.service.js";
import { emailAuthSchema } from "./auth.validator.js";
import { prisma } from "../../config/database.js";
import type { AuthenticatedRequest } from "../../shared/types/auth.js";

const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? ("none" as const) : ("lax" as const),
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const authCookieClearOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? ("none" as const) : ("lax" as const),
  path: "/",
};

const oauthStateCookieName = "moviebox_oauth_state";

const oauthStateCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax" as const,
  maxAge: 5 * 60 * 1000,
  path: "/api/auth/google/callback",
};

const clearAuthCookie = (res: Response) => {
  res.clearCookie(env.cookieName, authCookieClearOptions);
};

const clearOAuthStateCookie = (res: Response) => {
  res.clearCookie(oauthStateCookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/auth/google/callback",
  });
};

// Prevent sensitive authentication responses from being cached
// or exposing their URL through the Referer header.
const protectAuthenticationResponse = (res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
};

export const requestEmailLogin = async (req: Request, res: Response) => {
  const parsed = emailAuthSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address",
    });
  }

  const result = await requestMagicLink(parsed.data.email);

  return res.status(200).json({
    success: true,
    data: result,
  });
};

export const googleLogin = async (_req: Request, res: Response) => {
  const { url, state } = await getGoogleAuthorizationUrl();

  res.cookie(oauthStateCookieName, state, oauthStateCookieOptions);

  return res.redirect(302, url);
};

export const googleCallback = async (req: Request, res: Response) => {
  protectAuthenticationResponse(res);

  const code = req.query.code;
  const state = req.query.state;
  const stateCookie = req.cookies?.[oauthStateCookieName];

  // Clear the state cookie regardless of callback validity.
  clearOAuthStateCookie(res);

  if (
    typeof code !== "string" ||
    code.length === 0 ||
    typeof state !== "string" ||
    state.length === 0 ||
    typeof stateCookie !== "string" ||
    state !== stateCookie
  ) {
    return res.status(400).json({
      success: false,
      message: "Google OAuth state validation failed",
    });
  }

  const result = await authenticateWithGoogle(code, state);
  const token = createAuthToken(result.user.id);

  res.cookie(env.cookieName, token, cookieOptions);

  return res.redirect(302, env.clientUrl);
};

export const verifyEmailMagicLink = async (req: Request, res: Response) => {
  protectAuthenticationResponse(res);

  const token = req.query.token;

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing authentication token",
    });
  }

  const result = await verifyMagicLink(token);

  res.cookie(env.cookieName, result.token, cookieOptions);

  return res.redirect(302, env.clientUrl);
};

export const getCurrentUser = async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      avatar: true,
      profileCompleted: true,
      createdAt: true,
    },
  });

  if (!user) {
    clearAuthCookie(res);

    return res.status(401).json({
      success: false,
      message: "User not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: { user },
  });
};

export const logout = async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  clearOAuthStateCookie(res);

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const deleteAccount = async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    clearAuthCookie(res);

    return res.status(401).json({
      success: false,
      message: "User not found",
    });
  }

  // Prisma's onDelete: Cascade removes the user's related records.
  await prisma.user.delete({
    where: { id: userId },
  });

  clearAuthCookie(res);
  clearOAuthStateCookie(res);

  return res.status(200).json({
    success: true,
    message:
      "Your account and associated personal data have been permanently deleted.",
  });
};
