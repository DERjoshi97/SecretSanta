import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_VALIDITY_MS,
  createConfirmationToken,
  readConfirmationToken,
} from "../src/confirmation.js";
import { buildMail } from "../src/mailer.js";

const data = {
  eventName: "Weihnachten 2026",
  participantName: "Anna Ä",
  participantEmail: "anna@example.com",
  organizerName: "Orga",
  organizerEmail: "orga@example.com",
};

describe("confirmation tokens", () => {
  it("round-trips the confirmation data", () => {
    const now = Date.now();
    const token = createConfirmationToken("secret", data, now);
    expect(readConfirmationToken("secret", token, now)).toEqual({
      ...data,
      expires: now + CONFIRMATION_VALIDITY_MS,
    });
  });

  it("rejects tampered, foreign, expired and malformed tokens", () => {
    const now = Date.now();
    const token = createConfirmationToken("secret", data, now);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), o: "evil@example.com" }),
    ).toString("base64url");

    expect(readConfirmationToken("secret", `${forged}.${signature}`, now)).toBeNull();
    expect(readConfirmationToken("anderes", token, now)).toBeNull();
    expect(readConfirmationToken("secret", token, now + CONFIRMATION_VALIDITY_MS + 1)).toBeNull();
    expect(readConfirmationToken("secret", "kaputt", now)).toBeNull();
    expect(readConfirmationToken("secret", undefined, now)).toBeNull();
  });

  it("does not reveal who was drawn", () => {
    const token = createConfirmationToken("secret", data);
    const decoded = Buffer.from(token.split(".")[0], "base64url").toString();
    expect(decoded).not.toContain("Ben");

    const mail = buildMail(
      { name: "Anna", email: "anna@example.com" },
      { name: "Ben", email: "ben@example.com" },
      {
        eventName: "X",
        message: "",
        organizer: { name: "Orga", email: "orga@example.com" },
        confirmUrl: `https://wichteln.example/bestaetigen?token=${token}`,
      },
    );
    expect(mail.html).toContain(token);
    expect(mail.replyTo).toBe("orga@example.com");
  });
});
