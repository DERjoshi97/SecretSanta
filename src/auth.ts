import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE = "wichteln_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type AuthConfig = {
  password: string;
  secret: string;
  /** true, wenn das Passwort zufällig erzeugt wurde, weil keins konfiguriert ist. */
  generatedPassword: boolean;
  /** true, wenn kein SESSION_SECRET konfiguriert ist (Links/Sitzungen überleben keinen Neustart). */
  generatedSecret: boolean;
};

/**
 * Liest das Organisator-Passwort aus ORGANIZER_PASSWORD. Fehlt es, wird beim
 * Start ein zufälliges Passwort erzeugt, damit die App nie ungeschützt läuft.
 */
export function createAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const configured = env.ORGANIZER_PASSWORD?.trim();
  return {
    password: configured || randomBytes(9).toString("base64url"),
    secret: env.SESSION_SECRET || randomBytes(32).toString("hex"),
    generatedPassword: !configured,
    generatedSecret: !env.SESSION_SECRET,
  };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function checkPassword(config: AuthConfig, candidate: string): boolean {
  // Hashes haben immer die gleiche Länge -> Vergleich in konstanter Zeit möglich.
  return timingSafeEqual(sha256(candidate), sha256(config.password));
}

function sign(config: AuthConfig, payload: string): string {
  return createHmac("sha256", config.secret).update(payload).digest("base64url");
}

/** Erzeugt ein signiertes Sitzungs-Token der Form `<ablaufzeit>.<signatur>`. */
export function createSessionToken(config: AuthConfig, now = Date.now()): string {
  const expires = String(now + SESSION_DURATION_MS);
  return `${expires}.${sign(config, expires)}`;
}

export function isValidSessionToken(config: AuthConfig, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  const expected = Buffer.from(sign(config, expires));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  return Number(expires) > now;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function isAuthenticated(config: AuthConfig, req: Request): boolean {
  return isValidSessionToken(config, readCookie(req, SESSION_COOKIE));
}

export function setSessionCookie(config: AuthConfig, req: Request, res: Response) {
  res.cookie(SESSION_COOKIE, createSessionToken(config), {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAuthenticated(config, req)) {
      next();
      return;
    }
    res.status(401).json({ error: "Bitte melde dich zuerst an." });
  };
}

/** Einfache Bremse gegen Passwort-Raten: begrenzt Fehlversuche pro IP-Adresse. */
export class LoginLimiter {
  private failures = new Map<string, { count: number; resetAt: number }>();

  isBlocked(ip: string, now = Date.now()): boolean {
    const entry = this.failures.get(ip);
    if (!entry || entry.resetAt <= now) return false;
    return entry.count >= MAX_FAILED_LOGINS;
  }

  recordFailure(ip: string, now = Date.now()) {
    const entry = this.failures.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(ip, { count: 1, resetAt: now + FAILED_LOGIN_WINDOW_MS });
    } else {
      entry.count++;
    }
  }

  reset(ip: string) {
    this.failures.delete(ip);
  }
}
