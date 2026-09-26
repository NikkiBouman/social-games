import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shuffle, pickImpostor, buildDeck, viewFor, tallyVotes, voteResult } from "./logic.js";

// Deterministic RNG so shuffles/picks are reproducible in tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const here = dirname(fileURLToPath(import.meta.url));

test("shuffle keeps the same multiset", () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, mulberry32(42));
  assert.equal(out.length, src.length);
  assert.deepEqual([...out].sort(), [...src].sort());
  assert.deepEqual(src, [1, 2, 3, 4, 5]); // input untouched
});

test("pickImpostor returns a member; null on empty", () => {
  const ids = ["a", "b", "c"];
  const pick = pickImpostor(ids, mulberry32(1));
  assert.ok(ids.includes(pick));
  assert.equal(pickImpostor([], mulberry32(1)), null);
});

test("buildDeck: filters 18+ unless enabled, tags types, pairs carry twist", async () => {
  const data = JSON.parse(await readFile(join(here, "questions.json"), "utf8"));

  const clean = buildDeck(data, { adult: false }, mulberry32(7));
  assert.ok(clean.length > 0);
  assert.ok(clean.every((r) => ["wijzen", "aantallen", "antwoorden"].includes(r.type)));
  const antClean = clean.filter((r) => r.type === "antwoorden");
  assert.ok(antClean.every((r) => typeof r.imposterQuestion === "string"));

  const withAdult = buildDeck(data, { adult: true }, mulberry32(7));
  assert.ok(withAdult.length > clean.length, "18+ on should add questions");
});

test("viewFor hides the question from the imposter (wijzen/aantallen)", () => {
  const round = { type: "aantallen", prompt: "P", imposter: "I", question: "Q" };
  const imp = viewFor(round, true);
  assert.equal(imp.imposter, true);
  assert.equal(imp.question, undefined);
  assert.equal(imp.instruction, "I");

  const normal = viewFor(round, false);
  assert.equal(normal.imposter, false);
  assert.equal(normal.question, "Q");
});

test("viewFor gives the imposter the twisted question (antwoorden)", () => {
  const round = { type: "antwoorden", prompt: "P", imposter: "I", question: "echt", imposterQuestion: "twist" };
  const imp = viewFor(round, true);
  assert.equal(imp.question, "twist");
  assert.equal(viewFor(round, false).question, "echt");
});

test("voteResult: strict majority catches the imposter", () => {
  const votes = { a: "x", b: "x", c: "y" }; // x has 2, y has 1
  const r = voteResult(votes, "x");
  assert.equal(r.topSuspectPid, "x");
  assert.equal(r.caught, true);
  assert.equal(r.tie, false);
});

test("voteResult: tie at the top → imposter escapes", () => {
  const votes = { a: "x", b: "y" };
  const r = voteResult(votes, "x");
  assert.equal(r.tie, true);
  assert.equal(r.topSuspectPid, null);
  assert.equal(r.caught, false);
});

test("voteResult: majority on the wrong person → escapes", () => {
  const votes = { a: "y", b: "y", c: "x" };
  const r = voteResult(votes, "x");
  assert.equal(r.topSuspectPid, "y");
  assert.equal(r.caught, false);
});

test("tallyVotes ignores null votes", () => {
  assert.deepEqual(tallyVotes({ a: "x", b: null, c: "x" }), { x: 2 });
});
