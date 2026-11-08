import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../config/database.js";
import { AppError } from "../shared/utils/appError.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

const authCookieClearOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? ("none" as const) : ("lax" as const),
  path: "/",
};

const clearAuthCookie = (res: Response): void => {
  res.clearCookie(env.cookieName, authCookieClearOptions);
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token: unknown = req.cookies?.[env.cookieName];

  if (typeof token !== "string" || token.length === 0) {
    next(new AppError("Authentication required", 401));
    return;
  }

  if (token.length > 4096) {
    clearAuthCookie(res);
    next(new AppError("Invalid authentication token", 401));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.userId !== "string" ||
      payload.userId.length === 0 ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      clearAuthCookie(res);
      next(new AppError("Invalid authentication token", 401));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });

    if (!user) {
      clearAuthCookie(res);
      next(new AppError("Account no longer exists", 401));
      return;
    }

    (req as AuthenticatedRequest).userId = user.id;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      clearAuthCookie(res);
      next(new AppError("Invalid or expired authentication token", 401));
      return;
    }

    next(error);
  }
};
