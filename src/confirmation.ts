import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bestätigungslinks für Teilnehmer.
 *
 * Es gibt keine Datenbank – alles, was zum Benachrichtigen des Organisators
 * nötig ist, steckt signiert im Link selbst. Wer gezogen wurde, steht bewusst
 * NICHT im Token.
 */
export type Confirmation = {
  eventName: string;
  participantName: string;
  participantEmail: string;
  organizerName: string;
  organizerEmail: string;
  /** Ablaufzeitpunkt in Millisekunden. */
  expires: number;
};

export const CONFIRMATION_VALIDITY_MS = 120 * 24 * 60 * 60 * 1000;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`confirm:${payload}`).digest("base64url");
}

export function createConfirmationToken(
  secret: string,
  data: Omit<Confirmation, "expires">,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      e: data.eventName,
      n: data.participantName,
      p: data.participantEmail,
      on: data.organizerName,
      o: data.organizerEmail,
      x: now + CONFIRMATION_VALIDITY_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** Liefert die Daten des Tokens, oder `null`, wenn es ungültig oder abgelaufen ist. */
export function readConfirmationToken(
  secret: string,
  token: unknown,
  now = Date.now(),
): Confirmation | null {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(secret, payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof raw.x !== "number" || raw.x <= now) return null;
    return {
      eventName: String(raw.e),
      participantName: String(raw.n),
      participantEmail: String(raw.p),
      organizerName: String(raw.on),
      organizerEmail: String(raw.o),
      expires: raw.x,
    };
  } catch {
    return null;
  }
}
