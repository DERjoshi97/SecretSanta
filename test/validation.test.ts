import { describe, expect, it } from "vitest";
import { parseDrawRequest, ValidationError } from "../src/validation.js";

const participants = [
  { name: "Anna", email: "Anna@Example.com" },
  { name: "Ben", email: "ben@example.com" },
  { name: "Clara", email: "clara@example.com" },
];

const organizer = { name: "Orga", email: "Orga@Example.com" };

describe("parseDrawRequest", () => {
  it("normalizes emails and expands mutual exclusions", () => {
    const request = parseDrawRequest({
      organizer,
      participants,
      exclusions: [{ giver: "anna@example.com", receiver: "ben@example.com", mutual: true }],
    });
    expect(request.eventName).toBe("Wichteln");
    expect(request.organizer).toEqual({ name: "Orga", email: "orga@example.com" });
    expect(request.participants[0].email).toBe("anna@example.com");
    expect(request.exclusions).toEqual([
      { giver: "anna@example.com", receiver: "ben@example.com" },
      { giver: "ben@example.com", receiver: "anna@example.com" },
    ]);
  });

  it("requires an organizer with a valid email", () => {
    expect(() => parseDrawRequest({ participants })).toThrow(/Namen als Organisator/);
    expect(() =>
      parseDrawRequest({ organizer: { name: "Orga", email: "kaputt" }, participants }),
    ).toThrow(/Rückmeldungen/);
  });

  it("rejects too few participants", () => {
    expect(() => parseDrawRequest({ organizer, participants: participants.slice(0, 2) })).toThrow(ValidationError);
  });

  it("rejects duplicate emails (case-insensitive)", () => {
    expect(() =>
      parseDrawRequest({ organizer, participants: [...participants, { name: "Anna 2", email: "anna@example.com" }] }),
    ).toThrow(/mehrfach/);
  });

  it("rejects invalid emails", () => {
    expect(() =>
      parseDrawRequest({ organizer, participants: [...participants, { name: "Dora", email: "keine-mail" }] }),
    ).toThrow(/ungültig/);
  });

  it("rejects exclusions referencing unknown people", () => {
    expect(() =>
      parseDrawRequest({
        organizer,
        participants,
        exclusions: [{ giver: "anna@example.com", receiver: "fremd@example.com" }],
      }),
    ).toThrow(/unbekannte/);
  });
});
