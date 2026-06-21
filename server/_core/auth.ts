import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { hashPassword, verifyPassword } from "./password";

export type SessionPayload = {
  userId: number;
  name: string;
};

class AuthService {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

    return new SignJWT({ userId: payload.userId, name: payload.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const { userId, name } = payload as Record<string, unknown>;
      if (typeof userId !== "number") return null;
      return { userId, name: typeof name === "string" ? name : "" };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  /** Registers a new user and returns a signed session token, or null if the email is already taken. */
  async register(
    email: string,
    password: string,
    name: string
  ): Promise<{ token: string; user: User } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) return null;

    const passwordHash = await hashPassword(password);
    const userId = await db.createUser({
      openId: normalizedEmail,
      email: normalizedEmail,
      name,
      passwordHash,
      loginMethod: "password",
    });
    const user = await db.getUserById(userId);
    if (!user) throw new Error("User creation failed unexpectedly");

    const token = await this.signSession({ userId: user.id, name: user.name ?? "" });
    return { token, user };
  }

  /** Verifies credentials and returns a signed session token, or null if invalid. */
  async login(email: string, password: string): Promise<{ token: string; user: User } | null> {
    const user = await db.getUserByEmail(email.trim().toLowerCase());
    if (!user?.passwordHash) return null;
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;

    await db.touchLastSignedIn(user.id);
    const token = await this.signSession({ userId: user.id, name: user.name ?? "" });
    return { token, user };
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const session = await this.verifySession(cookies.get(COOKIE_NAME));
    if (!session) throw ForbiddenError("Invalid session cookie");

    const user = await db.getUserById(session.userId);
    if (!user) throw ForbiddenError("User not found");
    return user;
  }
}

export const auth = new AuthService();
