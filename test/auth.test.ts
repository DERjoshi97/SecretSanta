import { describe, expect, it } from "vitest";
import {
  checkPassword,
  createAuthConfig,
  createSessionToken,
  isValidSessionToken,
  LoginLimiter,
} from "../src/auth.js";

const config = createAuthConfig({ ORGANIZER_PASSWORD: "geheim", SESSION_SECRET: "s3cret" });

describe("auth", () => {
  it("checks the organizer password", () => {
    expect(checkPassword(config, "geheim")).toBe(true);
    expect(checkPassword(config, "falsch")).toBe(false);
    expect(checkPassword(config, "")).toBe(false);
  });

  it("generates a random password when none is configured", () => {
    const generated = createAuthConfig({});
    expect(generated.generatedPassword).toBe(true);
    expect(generated.password.length).toBeGreaterThanOrEqual(12);
    expect(createAuthConfig({}).password).not.toBe(generated.password);
  });

  it("accepts valid session tokens and rejects expired or forged ones", () => {
    const now = Date.now();
    const token = createSessionToken(config, now);
    expect(isValidSessionToken(config, token, now)).toBe(true);
    expect(isValidSessionToken(config, token, now + 13 * 60 * 60 * 1000)).toBe(false);

    const [, signature] = token.split(".");
    expect(isValidSessionToken(config, `${now + 10 ** 12}.${signature}`, now)).toBe(false);

    const other = createAuthConfig({ ORGANIZER_PASSWORD: "geheim", SESSION_SECRET: "anders" });
    expect(isValidSessionToken(other, token, now)).toBe(false);
    expect(isValidSessionToken(config, undefined)).toBe(false);
    expect(isValidSessionToken(config, "kaputt")).toBe(false);
  });

  it("blocks an IP after too many failed logins and unblocks after the window", () => {
    const limiter = new LoginLimiter();
    const now = Date.now();
    for (let i = 0; i < 10; i++) limiter.recordFailure("1.2.3.4", now);
    expect(limiter.isBlocked("1.2.3.4", now)).toBe(true);
    expect(limiter.isBlocked("5.6.7.8", now)).toBe(false);
    expect(limiter.isBlocked("1.2.3.4", now + 16 * 60 * 1000)).toBe(false);
  });
});
