import { describe, expect, it } from "vitest";
import { draw, DrawImpossibleError, type Exclusion, type Pairing } from "../src/draw.js";

const people = ["anna", "ben", "clara", "david", "emma", "finn"];

function expectValid(ids: string[], pairings: Pairing[], exclusions: Exclusion[] = []) {
  expect(pairings.map((p) => p.giver).sort()).toEqual([...ids].sort());
  expect(pairings.map((p) => p.receiver).sort()).toEqual([...ids].sort());
  for (const { giver, receiver } of pairings) {
    expect(giver).not.toBe(receiver);
    expect(exclusions).not.toContainEqual({ giver, receiver });
  }
}

describe("draw", () => {
  it("assigns every person exactly one receiver and nobody draws themselves", () => {
    for (let i = 0; i < 200; i++) expectValid(people, draw(people));
  });

  it("respects exclusions", () => {
    const exclusions: Exclusion[] = [
      { giver: "anna", receiver: "ben" },
      { giver: "ben", receiver: "anna" },
      { giver: "clara", receiver: "david" },
      { giver: "emma", receiver: "finn" },
    ];
    for (let i = 0; i < 200; i++) expectValid(people, draw(people, exclusions), exclusions);
  });

  it("finds the only valid assignment in heavily constrained groups", () => {
    // Jeder darf nur seinen "Nachfolger" ziehen -> genau eine gültige Lösung.
    const exclusions: Exclusion[] = people.flatMap((giver, i) =>
      people
        .filter((r) => r !== giver && r !== people[(i + 1) % people.length])
        .map((receiver) => ({ giver, receiver })),
    );
    const pairings = draw(people, exclusions);
    expectValid(people, pairings, exclusions);
    expect(pairings).toEqual(people.map((giver, i) => ({ giver, receiver: people[(i + 1) % people.length] })));
  });

  it("throws when no valid assignment exists", () => {
    const exclusions = ["ben", "clara"].map((receiver) => ({ giver: "anna", receiver }));
    expect(() => draw(["anna", "ben", "clara"], exclusions)).toThrow(DrawImpossibleError);
  });

  it("produces different results (is actually random)", () => {
    const results = new Set(Array.from({ length: 50 }, () => JSON.stringify(draw(people))));
    expect(results.size).toBeGreaterThan(10);
  });

  it("is roughly uniform over all valid assignments", () => {
    // 4 Personen haben genau 9 fixpunktfreie Permutationen.
    const ids = ["a", "b", "c", "d"];
    const counts = new Map<string, number>();
    const runs = 9000;
    for (let i = 0; i < runs; i++) {
      const key = draw(ids).map((p) => p.receiver).join();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});
