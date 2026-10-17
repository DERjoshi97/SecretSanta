/**
 * Auslosung für das Wichteln.
 *
 * Jede Person beschenkt genau eine andere Person und wird von genau einer
 * Person beschenkt (Permutation ohne Fixpunkte). Zusätzlich können einzelne
 * Paarungen "Schenker -> Beschenkter" ausgeschlossen werden.
 */

export type Pairing = { giver: string; receiver: string };

/** Ausgeschlossene Paarung: `giver` darf `receiver` nicht ziehen. */
export type Exclusion = { giver: string; receiver: string };

export class DrawImpossibleError extends Error {
  constructor() {
    super(
      "Mit diesen Ausschlüssen ist keine gültige Auslosung möglich. Bitte entferne einige Ausschlüsse.",
    );
    this.name = "DrawImpossibleError";
  }
}

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const REJECTION_ATTEMPTS = 2000;

/**
 * Lost aus, wer wen beschenkt.
 *
 * Zuerst wird per Zufallspermutation + Verwerfen gelost – das liefert jede
 * gültige Zuordnung mit gleicher Wahrscheinlichkeit. Ist die Gruppe durch
 * Ausschlüsse so eingeschränkt, dass das zu selten klappt, wird per
 * Backtracking gesucht; findet auch das nichts, ist die Auslosung unmöglich.
 *
 * @param ids eindeutige Kennungen der Teilnehmer (z. B. E-Mail-Adressen)
 */
export function draw(
  ids: string[],
  exclusions: Exclusion[] = [],
  random: Random = Math.random,
): Pairing[] {
  if (new Set(ids).size !== ids.length) {
    throw new Error("Teilnehmer müssen eindeutig sein.");
  }
  if (ids.length < 2) {
    throw new DrawImpossibleError();
  }

  const forbidden = new Set(exclusions.map((e) => `${e.giver}\u0000${e.receiver}`));
  const allowed = (giver: string, receiver: string) =>
    giver !== receiver && !forbidden.has(`${giver}\u0000${receiver}`);

  for (let attempt = 0; attempt < REJECTION_ATTEMPTS; attempt++) {
    const receivers = shuffle(ids, random);
    if (ids.every((giver, i) => allowed(giver, receivers[i]))) {
      return ids.map((giver, i) => ({ giver, receiver: receivers[i] }));
    }
  }

  const result = backtrack(ids, allowed, random);
  if (!result) throw new DrawImpossibleError();
  return result;
}

function backtrack(
  ids: string[],
  allowed: (giver: string, receiver: string) => boolean,
  random: Random,
): Pairing[] | null {
  // Am stärksten eingeschränkte Schenker zuerst, damit Sackgassen früh auffallen.
  const candidates = new Map(
    ids.map((giver) => [giver, shuffle(ids.filter((r) => allowed(giver, r)), random)]),
  );
  const givers = shuffle(ids, random).sort(
    (a, b) => candidates.get(a)!.length - candidates.get(b)!.length,
  );

  const taken = new Set<string>();
  const assignment = new Map<string, string>();

  const solve = (index: number): boolean => {
    if (index === givers.length) return true;
    const giver = givers[index];
    for (const receiver of candidates.get(giver)!) {
      if (taken.has(receiver)) continue;
      taken.add(receiver);
      assignment.set(giver, receiver);
      if (solve(index + 1)) return true;
      taken.delete(receiver);
      assignment.delete(giver);
    }
    return false;
  };

  if (!solve(0)) return null;
  return ids.map((giver) => ({ giver, receiver: assignment.get(giver)! }));
}
