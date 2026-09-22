import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffle, buildDeck, awardCows, reassignPinkCow, determineWinner } from "./logic.js";

const players = (spec) => spec.map(([id, cows]) => ({ id, name: id, cows }));

// seeded rng: returns values from a fixed list, cycling
const seededRng = (values) => { let i = 0; return () => values[i++ % values.length]; };

test("shuffle returns a permutation and does not mutate input", () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(input, seededRng([0.1, 0.9, 0.3, 0.7]));
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test("buildDeck includes only selected sets, shaped as {text,setNaam}", () => {
  const sets = [
    { id: "a", naam: "A", vragen: ["a1", "a2"] },
    { id: "b", naam: "B", vragen: ["b1"] },
  ];
  const deck = buildDeck(sets, ["a"], seededRng([0]));
  assert.equal(deck.length, 2);
  assert.deepEqual([...deck].map(c => c.text).sort(), ["a1", "a2"]);
  assert.ok(deck.every(c => c.setNaam === "A"));
});

test("awardCows increments only herd members and does not mutate", () => {
  const ps = players([["p1", 0], ["p2", 3], ["p3", 1]]);
  const out = awardCows(ps, ["p1", "p3"]);
  assert.deepEqual(out.map(p => p.cows), [1, 3, 2]);
  assert.deepEqual(ps.map(p => p.cows), [0, 3, 1]); // unchanged
});

test("reassignPinkCow: exactly one out gets the pink cow", () => {
  const ps = players([["p1", 0], ["p2", 0], ["p3", 0], ["p4", 0]]);
  assert.equal(reassignPinkCow(ps, ["p1", "p2", "p3"], null), "p4");
});

test("reassignPinkCow: two or more out leaves holder unchanged", () => {
  const ps = players([["p1", 0], ["p2", 0], ["p3", 0], ["p4", 0]]);
  assert.equal(reassignPinkCow(ps, ["p1", "p2"], "p1"), "p1");
});

test("reassignPinkCow: nobody out leaves holder unchanged", () => {
  const ps = players([["p1", 0], ["p2", 0], ["p3", 0]]);
  assert.equal(reassignPinkCow(ps, ["p1", "p2", "p3"], null), null);
});

test("reassignPinkCow: sole outlier who already holds it keeps it", () => {
  const ps = players([["p1", 0], ["p2", 0], ["p3", 0]]);
  assert.equal(reassignPinkCow(ps, ["p1", "p2"], "p3"), "p3");
});

test("determineWinner: nobody at target yields null", () => {
  const ps = players([["p1", 7], ["p2", 5], ["p3", 2]]);
  assert.equal(determineWinner(ps, 8, null), null);
});

test("determineWinner: sole eligible leader wins", () => {
  const ps = players([["p1", 8], ["p2", 5], ["p3", 2]]);
  assert.equal(determineWinner(ps, 8, null), "p1");
});

test("determineWinner: pink-cow holder is excluded even with most cows", () => {
  const ps = players([["p1", 9], ["p2", 8], ["p3", 2]]);
  assert.equal(determineWinner(ps, 8, "p1"), "p2");
});

test("determineWinner: tie among eligible leaders yields null", () => {
  const ps = players([["p1", 8], ["p2", 8], ["p3", 2]]);
  assert.equal(determineWinner(ps, 8, null), null);
});
