import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ANON_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { nanoid } from "nanoid";
import type { User } from "../../drizzle/schema";
import { auth } from "./auth";
import { getSessionCookieOptions } from "./cookies";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Stable id for a not-yet-signed-up visitor — see ANON_COOKIE_NAME. */
  anonymousId: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await auth.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  let anonymousId = cookies[ANON_COOKIE_NAME];
  if (!anonymousId) {
    anonymousId = nanoid();
    const cookieOptions = getSessionCookieOptions(opts.req);
    opts.res.cookie(ANON_COOKIE_NAME, anonymousId, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    anonymousId,
  };
}
