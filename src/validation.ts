import type { Exclusion } from "./draw.js";

export type Participant = { name: string; email: string };

export type DrawRequest = {
  eventName: string;
  message: string;
  organizer: Participant;
  participants: Participant[];
  exclusions: Exclusion[];
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 200;

function text(value: unknown, field: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(`${field} muss Text sein.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} darf höchstens ${maxLength} Zeichen lang sein.`);
  }
  return trimmed;
}

/** Prüft und normalisiert die Anfrage des Organisators. E-Mails werden kleingeschrieben. */
export function parseDrawRequest(body: unknown): DrawRequest {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Ungültige Anfrage.");
  }
  const raw = body as Record<string, unknown>;

  const rawOrganizer = (typeof raw.organizer === "object" && raw.organizer !== null
    ? raw.organizer
    : {}) as Record<string, unknown>;
  const organizer = {
    name: text(rawOrganizer.name, "Name des Organisators", 100),
    email: text(rawOrganizer.email, "E-Mail des Organisators", 254).toLowerCase(),
  };
  if (!organizer.name) throw new ValidationError("Bitte gib deinen Namen als Organisator an.");
  if (!EMAIL_PATTERN.test(organizer.email)) {
    throw new ValidationError("Bitte gib eine gültige E-Mail-Adresse für Rückmeldungen an.");
  }

  if (!Array.isArray(raw.participants)) {
    throw new ValidationError("Es fehlen die Teilnehmer.");
  }
  if (raw.participants.length < MIN_PARTICIPANTS) {
    throw new ValidationError(`Es werden mindestens ${MIN_PARTICIPANTS} Teilnehmer benötigt.`);
  }
  if (raw.participants.length > MAX_PARTICIPANTS) {
    throw new ValidationError(`Es sind höchstens ${MAX_PARTICIPANTS} Teilnehmer erlaubt.`);
  }

  const seen = new Set<string>();
  const participants = raw.participants.map((p: unknown, i: number): Participant => {
    const entry = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
    const label = `Teilnehmer ${i + 1}`;
    const name = text(entry.name, `Name von ${label}`, 100);
    const email = text(entry.email, `E-Mail von ${label}`, 254).toLowerCase();
    if (!name) throw new ValidationError(`${label} hat keinen Namen.`);
    if (!EMAIL_PATTERN.test(email)) {
      throw new ValidationError(`Die E-Mail-Adresse von ${name} ist ungültig.`);
    }
    if (seen.has(email)) {
      throw new ValidationError(`Die E-Mail-Adresse ${email} kommt mehrfach vor.`);
    }
    seen.add(email);
    return { name, email };
  });

  const rawExclusions = raw.exclusions ?? [];
  if (!Array.isArray(rawExclusions)) {
    throw new ValidationError("Ausschlüsse müssen eine Liste sein.");
  }
  const exclusions: Exclusion[] = [];
  for (const e of rawExclusions) {
    const entry = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
    const giver = text(entry.giver, "Ausschluss", 254).toLowerCase();
    const receiver = text(entry.receiver, "Ausschluss", 254).toLowerCase();
    if (!seen.has(giver) || !seen.has(receiver)) {
      throw new ValidationError("Ein Ausschluss verweist auf eine unbekannte Person.");
    }
    if (giver === receiver) {
      throw new ValidationError("Eine Person kann nicht von sich selbst ausgeschlossen werden.");
    }
    exclusions.push({ giver, receiver });
    if (entry.mutual === true) exclusions.push({ giver: receiver, receiver: giver });
  }

  return {
    eventName: text(raw.eventName, "Anlass", 100) || "Wichteln",
    message: text(raw.message, "Nachricht", 2000),
    organizer,
    participants,
    exclusions,
  };
}
