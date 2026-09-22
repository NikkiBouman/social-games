# Herd Mentality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static "social games" collection with a game picker and a fully playable Herd Mentality scorekeeper.

**Architecture:** Vanilla HTML/CSS/JS, no build step. Root `index.html` is the picker; each game lives in its own folder. Herd Mentality's risky logic (cow scoring, pink-cow reassignment, win detection, deck shuffle) lives in pure, side-effect-free functions in `herd-mentality/logic.js` and is unit-tested with Node's built-in test runner. `herd-mentality/game.js` is a thin UI controller that imports the logic, renders the DOM, wires events, and persists state to `localStorage`. Question sets are JSON files loaded via `fetch`.

**Tech Stack:** HTML, CSS, ES modules (browser + Node). Tests: `node --test` (Node 18+, no dependencies). Runtime: none — served as static files (`python3 -m http.server` locally, GitHub Pages in prod).

## Global Constraints

- No build step, no runtime dependencies. Browser loads ES modules directly via `<script type="module">`.
- Site must be **served over http** (not opened via `file://`) because question sets load via `fetch`.
- Minimum **3 players** and **≥ 1 selected set** to start a game.
- Win target default **8**, minimum 1, set on the setup screen.
- Pure logic functions are side-effect-free and never touch the DOM or `localStorage`.
- `localStorage` uses a single key `social-games:herd-mentality`, overwritten with the full state on every change.
- Node is required only for running tests, not for running the site.
- Dutch UI copy throughout.

---

### Task 1: Repo scaffolding + collection shell

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `assets/styles.css`
- Create: `index.html`

**Interfaces:**
- Consumes: nothing.
- Produces: shared CSS design tokens (CSS custom properties on `:root`), a root picker page linking to `herd-mentality/`.

- [ ] **Step 1: Create `package.json`** (enables ES-module tests via `node --test`)

```json
{
  "name": "social-games",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
.DS_Store
node_modules/
```

- [ ] **Step 3: Create `assets/styles.css`** with a mobile-first base and design tokens

```css
:root {
  --bg: #faf7f2;
  --surface: #ffffff;
  --ink: #23201c;
  --muted: #6b645c;
  --accent: #2f8f5b;
  --accent-ink: #ffffff;
  --pink: #e86aa6;
  --border: #e4ddd2;
  --radius: 14px;
  --shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  --maxw: 640px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.4;
}

.wrap { max-width: var(--maxw); margin: 0 auto; padding: 20px 16px 48px; }

h1 { font-size: 1.6rem; margin: 0 0 4px; }
.subtitle { color: var(--muted); margin: 0 0 24px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; min-height: 48px; padding: 0 18px;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface); color: var(--ink);
  font-size: 1rem; font-weight: 600; cursor: pointer;
}
.btn-primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.game-grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
.game-card {
  display: block; text-decoration: none; color: inherit;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px;
}
.game-card h2 { margin: 0 0 6px; font-size: 1.2rem; }
.game-card p { margin: 0; color: var(--muted); }
```

- [ ] **Step 4: Create `index.html`** (the picker)

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Social Games</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <main class="wrap">
    <h1>🎉 Social Games</h1>
    <p class="subtitle">Kies een spel om te spelen.</p>
    <div class="game-grid">
      <a class="game-card" href="herd-mentality/">
        <h2>🐄 Herd Mentality</h2>
        <p>Denk als de kudde. Zit jij bij de meerderheid — of blijf je met de roze koe zitten?</p>
      </a>
    </div>
  </main>
</body>
</html>
```

- [ ] **Step 5: Verify in the browser**

Run: `python3 -m http.server 8000` from the project root, open `http://localhost:8000/`.
Expected: the picker renders with one card "🐄 Herd Mentality"; clicking it navigates to `/herd-mentality/` (404 for now — expected until Task 4).

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore assets/styles.css index.html
git commit -m "feat: collection shell + shared styles"
```

---

### Task 2: Question sets (data + validation test)

**Files:**
- Create: `herd-mentality/sets.json`
- Create: `herd-mentality/questions/algemeen.json`
- Create: `herd-mentality/questions/dieren.json`
- Create: `herd-mentality/questions/eten.json`
- Create: `herd-mentality/questions/geschiedenis.json`
- Create: `herd-mentality/questions/18plus.json`
- Test: `herd-mentality/sets.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: JSON contract. `sets.json` = array of `{ id, naam, emoji, bestand }`. Each set file = `{ id, naam, vragen: [string, ...] }`. Every `id` in `sets.json` matches the `id` inside its `bestand`, and every set has ≥ 5 questions.

- [ ] **Step 1: Create `herd-mentality/sets.json`**

```json
[
  { "id": "algemeen", "naam": "Algemeen", "emoji": "💬", "bestand": "questions/algemeen.json" },
  { "id": "dieren", "naam": "Dieren", "emoji": "🐾", "bestand": "questions/dieren.json" },
  { "id": "eten", "naam": "Eten", "emoji": "🍔", "bestand": "questions/eten.json" },
  { "id": "geschiedenis", "naam": "Geschiedenis", "emoji": "📜", "bestand": "questions/geschiedenis.json" },
  { "id": "18plus", "naam": "18+", "emoji": "🔞", "bestand": "questions/18plus.json" }
]
```

- [ ] **Step 2: Create the five question files** (Herd Mentality style: subjective, one clear answer per head; ≥ 8 each)

`herd-mentality/questions/algemeen.json`:
```json
{
  "id": "algemeen",
  "naam": "Algemeen",
  "vragen": [
    "Wat is de beste kleur?",
    "Noem een beroemde Nederlander.",
    "Wat is het beste vervoermiddel?",
    "Noem een dag van de week.",
    "Wat is de beste vakantiebestemming?",
    "Noem een emoji die je vaak gebruikt.",
    "Wat is het beste seizoen?",
    "Noem een merk auto.",
    "Wat is de handigste app op je telefoon?",
    "Noem een sport."
  ]
}
```

`herd-mentality/questions/dieren.json`:
```json
{
  "id": "dieren",
  "naam": "Dieren",
  "vragen": [
    "Noem een dier met een staart.",
    "Wat is het engste dier?",
    "Noem een huisdier.",
    "Welk dier zou je willen zijn?",
    "Noem een dier uit de dierentuin.",
    "Wat is het schattigste dier?",
    "Noem een dier dat kan vliegen.",
    "Welk dier is het slimst?",
    "Noem een dier dat in de zee leeft.",
    "Wat is het snelste dier?"
  ]
}
```

`herd-mentality/questions/eten.json`:
```json
{
  "id": "eten",
  "naam": "Eten",
  "vragen": [
    "Wat is de beste saus?",
    "Noem een pizzabelegging.",
    "Wat is het beste ontbijt?",
    "Noem een groente die niemand lust.",
    "Wat hoort er op patat?",
    "Noem een merk frisdrank.",
    "Wat is de beste snack voor op de bank?",
    "Noem een gerecht dat je moeder maakte.",
    "Wat is het lekkerste ijssmaakje?",
    "Noem iets wat je op brood doet."
  ]
}
```

`herd-mentality/questions/geschiedenis.json`:
```json
{
  "id": "geschiedenis",
  "naam": "Geschiedenis",
  "vragen": [
    "Noem een beroemde uitvinder.",
    "Wat is de belangrijkste uitvinding ooit?",
    "Noem een oude beschaving.",
    "Welk jaartal is historisch het belangrijkst?",
    "Noem een beroemde koning of koningin.",
    "Wat is het bekendste bouwwerk uit de oudheid?",
    "Noem een oorlog uit de geschiedenisles.",
    "Welke historische figuur zou je willen ontmoeten?",
    "Noem een beroemde ontdekkingsreiziger.",
    "Wat is de belangrijkste gebeurtenis van de 20e eeuw?"
  ]
}
```

`herd-mentality/questions/18plus.json`:
```json
{
  "id": "18plus",
  "naam": "18+",
  "vragen": [
    "Wat is de beste manier om een kater te verhelpen?",
    "Noem een slecht idee na middernacht.",
    "Wat is de meest gênante dansmove?",
    "Noem een drankje voor op een feestje.",
    "Wat is het slechtste tinder-openingszinnetje?",
    "Noem iets wat je nooit tegen je schoonouders zegt.",
    "Wat is de meest overschatte uitgaansactiviteit?",
    "Noem een reden om vroeg van een feestje weg te gaan.",
    "Wat is het beste dronken-eten?",
    "Noem iets wat altijd misgaat op vakantie met vrienden."
  ]
}
```

- [ ] **Step 3: Write the failing validation test** `herd-mentality/sets.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (rel) => JSON.parse(await readFile(join(here, rel), "utf8"));

test("sets.json entries are well-formed and point to matching files", async () => {
  const sets = await readJson("sets.json");
  assert.ok(Array.isArray(sets) && sets.length >= 1);
  const ids = new Set();
  for (const s of sets) {
    assert.ok(s.id && s.naam && s.emoji && s.bestand, `incomplete set entry: ${JSON.stringify(s)}`);
    assert.ok(!ids.has(s.id), `duplicate set id: ${s.id}`);
    ids.add(s.id);
    const file = await readJson(s.bestand);
    assert.equal(file.id, s.id, `id mismatch for ${s.bestand}`);
    assert.equal(file.naam, s.naam, `naam mismatch for ${s.bestand}`);
    assert.ok(Array.isArray(file.vragen) && file.vragen.length >= 5, `too few vragen in ${s.bestand}`);
    for (const q of file.vragen) assert.equal(typeof q, "string", `non-string vraag in ${s.bestand}`);
  }
});
```

- [ ] **Step 4: Run the test**

Run: `node --test herd-mentality/sets.test.js`
Expected: PASS (all five sets present and consistent). If it fails, fix the JSON to match the contract.

- [ ] **Step 5: Commit**

```bash
git add herd-mentality/sets.json herd-mentality/questions herd-mentality/sets.test.js
git commit -m "feat: starter question sets + validation test"
```

---

### Task 3: Pure game logic (TDD)

**Files:**
- Create: `herd-mentality/logic.js`
- Test: `herd-mentality/logic.test.js`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces (exact signatures — the UI controller in Task 4–6 depends on these):
  - `shuffle(items, rng = Math.random) -> Array` — new shuffled array, input untouched.
  - `buildDeck(sets, selectedSetIds, rng = Math.random) -> Array<{text, setNaam}>` — cards from selected sets only, shuffled. `sets` are loaded set objects `{ id, naam, vragen }`.
  - `awardCows(players, herdIds) -> players` — new array, `+1 cows` for players whose `id` is in `herdIds`.
  - `reassignPinkCow(players, herdIds, currentHolderId) -> string|null` — the sole not-in-herd player's id if exactly one is out; otherwise `currentHolderId`.
  - `determineWinner(players, target, pinkCowHolderId) -> string|null` — id of the sole highest-scoring eligible player (`cows >= target`, not the pink-cow holder), else `null`.
  - Player shape everywhere: `{ id: string, name: string, cows: number }`.

- [ ] **Step 1: Write failing tests** `herd-mentality/logic.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test herd-mentality/logic.test.js`
Expected: FAIL — `Cannot find module ./logic.js` / functions undefined.

- [ ] **Step 3: Implement `herd-mentality/logic.js`**

```js
// Pure, side-effect-free game logic for Herd Mentality.
// No DOM, no localStorage, no I/O.

export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(sets, selectedSetIds, rng = Math.random) {
  const selected = new Set(selectedSetIds);
  const cards = [];
  for (const set of sets) {
    if (!selected.has(set.id)) continue;
    for (const text of set.vragen) cards.push({ text, setNaam: set.naam });
  }
  return shuffle(cards, rng);
}

export function awardCows(players, herdIds) {
  const inHerd = new Set(herdIds);
  return players.map((p) => (inHerd.has(p.id) ? { ...p, cows: p.cows + 1 } : p));
}

export function reassignPinkCow(players, herdIds, currentHolderId) {
  const inHerd = new Set(herdIds);
  const out = players.filter((p) => !inHerd.has(p.id));
  return out.length === 1 ? out[0].id : currentHolderId;
}

export function determineWinner(players, target, pinkCowHolderId) {
  const eligible = players.filter((p) => p.cows >= target && p.id !== pinkCowHolderId);
  if (eligible.length === 0) return null;
  const max = Math.max(...eligible.map((p) => p.cows));
  const leaders = eligible.filter((p) => p.cows === max);
  return leaders.length === 1 ? leaders[0].id : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test herd-mentality/logic.test.js`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add herd-mentality/logic.js herd-mentality/logic.test.js
git commit -m "feat: pure Herd Mentality logic with tests"
```

---

### Task 4: Game shell — HTML, state, persistence, setup screen

**Files:**
- Create: `herd-mentality/index.html`
- Create: `herd-mentality/game.js`
- Modify: `assets/styles.css` (append Herd Mentality styles)

**Interfaces:**
- Consumes: `logic.js` (`buildDeck`), `sets.json`, `questions/*.json`.
- Produces (used by Tasks 5–6, all in `game.js`):
  - Module-level `state` object matching the datamodel (see spec §Datamodel), plus `sets` (loaded set objects) held in a module variable.
  - `save()` — writes `state` to `localStorage` key `social-games:herd-mentality`.
  - `load() -> bool` — hydrates `state` from storage; returns whether a game was restored.
  - `render()` — dispatches to `renderSetup()` / `renderPlaying()` (Task 5) / win overlay (Task 6) based on `state.phase` and `state.winnerId`.
  - `startGame()` — validates (≥3 players, ≥1 set), builds deck, sets `phase = "playing"`.
  - `newGame()` — clears storage, resets to a fresh setup state, re-renders.

- [ ] **Step 1: Create `herd-mentality/index.html`**

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Herd Mentality</title>
  <link rel="stylesheet" href="../assets/styles.css">
</head>
<body>
  <main class="wrap">
    <p><a class="backlink" href="../">← Alle spellen</a></p>
    <h1>🐄 Herd Mentality</h1>
    <div id="app"></div>
  </main>
  <script type="module" src="game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `herd-mentality/game.js`** — constants, state, persistence, data loading, and the render entry point

```js
import { buildDeck, awardCows, reassignPinkCow, determineWinner } from "./logic.js";

const STORAGE_KEY = "social-games:herd-mentality";
const app = document.getElementById("app");

let sets = [];        // loaded set objects: { id, naam, emoji, vragen }
let state = freshState();

function freshState() {
  return {
    version: 1,
    phase: "setup",
    players: [],            // { id, name, cows }
    target: 8,
    pinkCowHolderId: null,
    selectedSetIds: [],
    deck: [],               // { text, setNaam }
    cardIndex: 0,
    herdSelection: [],      // player ids toggled for the current card
    winnerId: null,
    acknowledgedWinnerId: null,
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) { state = parsed; return true; }
  } catch { /* ignore corrupt storage */ }
  return false;
}

function newId() {
  return "p" + Math.random().toString(36).slice(2, 9);
}

async function loadSets() {
  const index = await fetch("sets.json").then((r) => r.json());
  sets = await Promise.all(
    index.map(async (s) => {
      const file = await fetch(s.bestand).then((r) => r.json());
      return { id: s.id, naam: s.naam, emoji: s.emoji, vragen: file.vragen };
    })
  );
}

function startGame() {
  if (state.players.length < 3 || state.selectedSetIds.length < 1) return;
  state.deck = buildDeck(sets, state.selectedSetIds);
  state.cardIndex = 0;
  state.herdSelection = [];
  state.pinkCowHolderId = null;
  state.winnerId = null;
  state.acknowledgedWinnerId = null;
  state.phase = "playing";
  save();
  render();
}

function newGame() {
  localStorage.removeItem(STORAGE_KEY);
  state = freshState();
  // keep loaded `sets`; only game state resets
  render();
}

function render() {
  if (state.phase === "setup") return renderSetup();
  return renderPlaying(); // Task 5 adds the win overlay on top
}

// ---- boot ----
(async function boot() {
  try {
    await loadSets();
  } catch (e) {
    app.innerHTML = `<p class="error">Kon de vragen niet laden. Draai je de site via een server (niet als bestand)?</p>`;
    return;
  }
  load(); // restore in-progress game if present
  render();
})();
```

- [ ] **Step 3: Add `renderSetup()` to `game.js`** (players, target, set checkboxes, start button)

```js
function renderSetup() {
  const canStart = state.players.length >= 3 && state.selectedSetIds.length >= 1;
  app.innerHTML = `
    <section class="card">
      <h2>Spelers</h2>
      <form id="add-player" class="row">
        <input id="player-name" type="text" placeholder="Naam speler" autocomplete="off" maxlength="24">
        <button class="btn" type="submit">Toevoegen</button>
      </form>
      <ul class="player-list">
        ${state.players.map((p) => `
          <li><span>${escapeHtml(p.name)}</span>
          <button class="link-btn" data-remove="${p.id}">verwijder</button></li>`).join("")}
      </ul>
      <p class="hint">${state.players.length < 3 ? `Nog minstens ${3 - state.players.length} speler(s) nodig.` : `${state.players.length} spelers.`}</p>
    </section>

    <section class="card">
      <h2>Winst bij</h2>
      <div class="row">
        <button class="btn" data-target-step="-1">−</button>
        <output id="target-out">${state.target} 🐄</output>
        <button class="btn" data-target-step="1">+</button>
      </div>
    </section>

    <section class="card">
      <h2>Vragensets</h2>
      <div class="set-list">
        ${sets.map((s) => `
          <label class="set-item">
            <input type="checkbox" data-set="${s.id}" ${state.selectedSetIds.includes(s.id) ? "checked" : ""}>
            <span>${s.emoji} ${escapeHtml(s.naam)}</span>
            <small>${s.vragen.length} vragen</small>
          </label>`).join("")}
      </div>
    </section>

    <button id="start" class="btn btn-primary btn-block" ${canStart ? "" : "disabled"}>Start spel</button>
  `;

  app.querySelector("#add-player").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = app.querySelector("#player-name");
    const name = input.value.trim();
    if (!name) return;
    state.players.push({ id: newId(), name, cows: 0 });
    save(); renderSetup();
  });
  app.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      state.players = state.players.filter((p) => p.id !== b.dataset.remove);
      save(); renderSetup();
    }));
  app.querySelectorAll("[data-target-step]").forEach((b) =>
    b.addEventListener("click", () => {
      state.target = Math.max(1, state.target + Number(b.dataset.targetStep));
      save(); renderSetup();
    }));
  app.querySelectorAll("[data-set]").forEach((c) =>
    c.addEventListener("change", () => {
      const id = c.dataset.set;
      state.selectedSetIds = c.checked
        ? [...state.selectedSetIds, id]
        : state.selectedSetIds.filter((x) => x !== id);
      save(); renderSetup();
    }));
  app.querySelector("#start").addEventListener("click", startGame);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
```

- [ ] **Step 4: Add a temporary `renderPlaying()` stub** so `render()` doesn't crash before Task 5

```js
function renderPlaying() {
  app.innerHTML = `<p>Spel gestart — spelscherm volgt (Taak 5).</p>
    <button id="tmp-new" class="btn">Nieuw spel</button>`;
  app.querySelector("#tmp-new").addEventListener("click", newGame);
}
```

- [ ] **Step 5: Append setup styles to `assets/styles.css`**

```css
.backlink { color: var(--muted); text-decoration: none; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; margin-bottom: 16px; }
.card h2 { margin: 0 0 12px; font-size: 1.05rem; }
.row { display: flex; gap: 8px; align-items: center; }
.row input[type="text"] { flex: 1; min-height: 48px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem; }
.player-list { list-style: none; padding: 0; margin: 12px 0 0; }
.player-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
.link-btn { background: none; border: none; color: var(--pink); cursor: pointer; font-size: 0.9rem; }
.hint { color: var(--muted); font-size: 0.9rem; margin: 12px 0 0; }
#target-out { font-size: 1.2rem; font-weight: 700; min-width: 80px; text-align: center; }
.set-list { display: grid; gap: 8px; }
.set-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); }
.set-item small { margin-left: auto; color: var(--muted); }
.btn-block { display: flex; width: 100%; }
.error { color: #b3261e; }
```

- [ ] **Step 6: Verify in the browser**

Run: serve the project, open `http://localhost:8000/herd-mentality/`.
Expected: setup screen renders. Adding < 3 players keeps "Start spel" disabled; with ≥ 3 players and ≥ 1 set checked it enables. `+/−` adjusts the target (floors at 1). Refresh mid-setup keeps players/target/sets (localStorage). Clicking Start shows the Task-5 stub.

- [ ] **Step 7: Commit**

```bash
git add herd-mentality/index.html herd-mentality/game.js assets/styles.css
git commit -m "feat: herd-mentality game shell, state, persistence, setup screen"
```

---

### Task 5: Playing screen — card, herd toggle, scoring, scoreboard, skip

**Files:**
- Modify: `herd-mentality/game.js` (replace the `renderPlaying()` stub; add `nextCard()`, `skipCard()`, `reshuffle()`)
- Modify: `assets/styles.css` (append playing-screen styles)

**Interfaces:**
- Consumes: `state`, `save()`, `render()`, `newGame()`, and `logic.js` (`awardCows`, `reassignPinkCow`, `determineWinner`, `buildDeck`).
- Produces: `nextCard()` (applies the round then advances), `skipCard()` (advances only), used by Task 6's overlay flow.

- [ ] **Step 1: Replace the `renderPlaying()` stub** with the real playing screen

```js
function renderPlaying() {
  if (state.cardIndex >= state.deck.length) return renderDeckEmpty();

  const card = state.deck[state.cardIndex];
  const inHerd = new Set(state.herdSelection);
  app.innerHTML = `
    <section class="question-card">
      <small class="q-set">${escapeHtml(card.setNaam)}</small>
      <p class="q-text">${escapeHtml(card.text)}</p>
      <small class="q-progress">Kaart ${state.cardIndex + 1} van ${state.deck.length}</small>
    </section>

    <p class="hint">Tik iedereen aan die in de <strong>kudde</strong> zit (kreeg een koe):</p>
    <div class="herd-grid">
      ${state.players.map((p) => `
        <button class="herd-btn ${inHerd.has(p.id) ? "in-herd" : ""}" data-herd="${p.id}">
          ${escapeHtml(p.name)} ${inHerd.has(p.id) ? "🐄" : ""}
        </button>`).join("")}
    </div>

    <div class="actions">
      <button id="skip" class="btn">Sla over</button>
      <button id="next" class="btn btn-primary">Volgende kaart</button>
    </div>

    ${renderScoreboard()}

    <details class="override">
      <summary>Roze koe handmatig toewijzen</summary>
      <div class="override-body">
        ${state.players.map((p) => `<button class="btn" data-pink="${p.id}">🩷 ${escapeHtml(p.name)}</button>`).join("")}
        <button class="btn" data-pink="__none">Niemand</button>
      </div>
    </details>

    <button id="new" class="link-btn">Nieuw spel</button>
  `;

  app.querySelectorAll("[data-herd]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.herd;
      state.herdSelection = inHerd.has(id)
        ? state.herdSelection.filter((x) => x !== id)
        : [...state.herdSelection, id];
      save(); renderPlaying();
    }));
  app.querySelector("#next").addEventListener("click", nextCard);
  app.querySelector("#skip").addEventListener("click", skipCard);
  app.querySelector("#new").addEventListener("click", newGame);
  app.querySelectorAll("[data-pink]").forEach((b) =>
    b.addEventListener("click", () => {
      state.pinkCowHolderId = b.dataset.pink === "__none" ? null : b.dataset.pink;
      save(); renderPlaying();
    }));
}

function renderScoreboard() {
  const sorted = [...state.players].sort((a, b) => b.cows - a.cows);
  return `
    <section class="scoreboard">
      <h2>Stand</h2>
      <ul>
        ${sorted.map((p) => `
          <li class="${p.id === state.pinkCowHolderId ? "has-pink" : ""}">
            <span>${escapeHtml(p.name)}</span>
            <span class="score">
              ${p.id === state.pinkCowHolderId ? '<span class="pink-tag">🩷 kan niet winnen</span>' : ""}
              <strong>${p.cows} 🐄</strong>
            </span>
          </li>`).join("")}
      </ul>
      <small class="hint">Winst bij ${state.target} 🐄</small>
    </section>`;
}

function renderDeckEmpty() {
  app.innerHTML = `
    <section class="question-card"><p class="q-text">Alle kaarten gehad! 🎉</p></section>
    ${renderScoreboard()}
    <div class="actions">
      <button id="reshuffle" class="btn btn-primary">Opnieuw husselen</button>
      <button id="new" class="btn">Nieuw spel</button>
    </div>`;
  app.querySelector("#reshuffle").addEventListener("click", reshuffle);
  app.querySelector("#new").addEventListener("click", newGame);
}
```

- [ ] **Step 2: Add `nextCard()`, `skipCard()`, `reshuffle()`** to `game.js`

```js
function nextCard() {
  state.players = awardCows(state.players, state.herdSelection);
  state.pinkCowHolderId = reassignPinkCow(state.players, state.herdSelection, state.pinkCowHolderId);
  state.herdSelection = [];
  state.cardIndex += 1;
  state.winnerId = determineWinner(state.players, state.target, state.pinkCowHolderId);
  save();
  render(); // Task 6: render() shows the win overlay when there's a new winner
}

function skipCard() {
  state.herdSelection = [];
  state.cardIndex += 1;
  save();
  render();
}

function reshuffle() {
  state.deck = buildDeck(sets, state.selectedSetIds);
  state.cardIndex = 0;
  save();
  render();
}
```

- [ ] **Step 3: Append playing-screen styles to `assets/styles.css`**

```css
.question-card { background: var(--accent); color: var(--accent-ink); border-radius: var(--radius); padding: 24px; text-align: center; margin-bottom: 16px; }
.q-set { text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; font-weight: 700; }
.q-text { font-size: 1.5rem; font-weight: 700; margin: 10px 0; }
.q-progress { opacity: 0.85; }
.herd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 8px 0 16px; }
.herd-btn { min-height: 52px; border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: 1rem; font-weight: 600; cursor: pointer; }
.herd-btn.in-herd { border-color: var(--accent); background: #e8f5ee; }
.actions { display: flex; gap: 10px; margin-bottom: 20px; }
.actions .btn { flex: 1; }
.scoreboard ul { list-style: none; padding: 0; margin: 8px 0; }
.scoreboard li { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
.scoreboard li.has-pink { color: var(--muted); }
.pink-tag { color: var(--pink); font-size: 0.8rem; margin-right: 8px; }
.override { margin: 8px 0 16px; }
.override summary { cursor: pointer; color: var(--muted); }
.override-body { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
```

- [ ] **Step 4: Verify in the browser** (this is the core scoring flow)

Run: serve, start a game with 4 players (A, B, C, D), target 3.
Checks:
1. Tap A, B, C into the herd, leave D out → Volgende kaart → A/B/C show 1 🐄, D gets 🩷 and "kan niet winnen".
2. Next card: tap A, B, D (leave C out) → C is sole outlier → pink cow moves to C; D no longer flagged.
3. Next card: tap only A, B (C and D both out) → pink cow does NOT move (2 outliers); A/B +1.
4. "Sla over" advances the card and clears herd taps without changing any score or the pink cow.
5. Progress counter increments; refresh mid-round keeps the herd taps and current card.
6. Manual override sets/clears the pink cow holder.
7. Advance past the last card → "Alle kaarten gehad" with reshuffle.

- [ ] **Step 5: Commit**

```bash
git add herd-mentality/game.js assets/styles.css
git commit -m "feat: playing screen, scoring, scoreboard, skip + reshuffle"
```

---

### Task 6: Win overlay

**Files:**
- Modify: `herd-mentality/game.js` (extend `render()`, add `renderWinOverlay()`, `keepPlaying()`)
- Modify: `assets/styles.css` (append overlay styles)

**Interfaces:**
- Consumes: `state.winnerId`, `state.acknowledgedWinnerId`, `newGame()`, `renderPlaying()`.
- Produces: win overlay behavior — shown only when `winnerId` is set and differs from `acknowledgedWinnerId`.

- [ ] **Step 1: Extend `render()`** to show the overlay on a new winner

```js
function render() {
  if (state.phase === "setup") return renderSetup();
  renderPlaying();
  if (state.winnerId && state.winnerId !== state.acknowledgedWinnerId) {
    renderWinOverlay();
  }
}
```

- [ ] **Step 2: Add `renderWinOverlay()` and `keepPlaying()`** to `game.js`

```js
function renderWinOverlay() {
  const winner = state.players.find((p) => p.id === state.winnerId);
  if (!winner) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay-card">
      <p class="confetti">🏆</p>
      <h2>${escapeHtml(winner.name)} wint!</h2>
      <p>${winner.cows} 🐄 — en geen roze koe.</p>
      <div class="actions">
        <button id="keep" class="btn">Toch verder spelen</button>
        <button id="restart" class="btn btn-primary">Nieuw spel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#keep").addEventListener("click", keepPlaying);
  overlay.querySelector("#restart").addEventListener("click", () => {
    overlay.remove();
    newGame();
  });
}

function keepPlaying() {
  state.acknowledgedWinnerId = state.winnerId;
  save();
  document.querySelector(".overlay")?.remove();
}
```

- [ ] **Step 3: Append overlay styles to `assets/styles.css`**

```css
.overlay { position: fixed; inset: 0; background: rgba(35, 32, 28, 0.6); display: flex; align-items: center; justify-content: center; padding: 20px; }
.overlay-card { background: var(--surface); border-radius: var(--radius); padding: 28px; max-width: 360px; width: 100%; text-align: center; box-shadow: var(--shadow); }
.overlay-card .confetti { font-size: 3rem; margin: 0; }
.overlay-card h2 { margin: 6px 0; }
```

- [ ] **Step 4: Verify in the browser**

Run: serve, start with 3 players, target 2.
Checks:
1. Get player A to 2 🐄 with no pink cow → win overlay appears naming A.
2. "Toch verder spelen" closes it; playing more rounds where A stays the leader does NOT re-open it.
3. Get player B to become the new sole eligible leader → overlay reappears for B.
4. Give the current leader the pink cow (manual override) → the overlay does not appear on the next round while they hold it.
5. "Nieuw spel" from the overlay returns to setup with a cleared board.

- [ ] **Step 5: Commit**

```bash
git add herd-mentality/game.js assets/styles.css
git commit -m "feat: win overlay with keep-playing and new-game"
```

---

### Task 7: Design polish pass

**Files:**
- Modify: `assets/styles.css`
- Modify: `herd-mentality/index.html`, `index.html` (only if markup tweaks help)

**Interfaces:**
- Consumes: everything above. Produces: no behavior changes — visual polish only.

- [ ] **Step 1: Polish with the frontend-design skill**

Invoke `frontend-design` to refine spacing, typography, tap targets, and the card/cow theme for a friendly party-game feel. Keep it mobile-first, keep behavior identical, no new dependencies.

- [ ] **Step 2: Verify in the browser** on a narrow viewport (~390px) — everything readable, tap targets ≥ 44px, no layout breakage on setup / playing / win.

- [ ] **Step 3: Run the full test suite**

Run: `node --test`
Expected: all logic + sets tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: design polish for herd-mentality"
```

---

## Self-Review

**Spec coverage:**
- Collection shell → Task 1. ✅
- Directory structure, no build, served-over-http → Tasks 1–4, Global Constraints. ✅
- Setup screen (players, target default 8, multi-set, ≥3 players) → Task 4. ✅
- Playing screen (card, herd toggle, Sla over / Volgende kaart, scoreboard, manual pink-cow override) → Task 5. ✅
- Scoring rules (awardCows, reassignPinkCow) → Task 3 (logic) + Task 5 (wiring). ✅
- Win check + overlay + acknowledgedWinnerId + keep-playing/new-game → Task 3 (`determineWinner`) + Task 6. ✅
- Question sets format + starter content → Task 2. ✅
- Deck build + shuffle + deck-empty reshuffle → Task 3 (`buildDeck`) + Task 5 (`reshuffle`/`renderDeckEmpty`). ✅
- localStorage single key, self-bounded, restore-in-progress, new-game clears → Task 4 (`save`/`load`/`newGame`). ✅
- Edge cases (all-in-herd, none-in-herd, sole outlier is holder, deck empty, mid-round refresh) → Task 3 tests + Task 5 verification. ✅

**Placeholder scan:** No TBD/TODO; every code step has real code. Task 5's `renderPlaying()` stub in Task 4 is explicitly replaced in Task 5 (intentional, labeled). ✅

**Type consistency:** Player shape `{id,name,cows}` consistent across logic and UI. Function names (`buildDeck`, `awardCows`, `reassignPinkCow`, `determineWinner`, `save`, `load`, `render`, `renderSetup`, `renderPlaying`, `renderScoreboard`, `nextCard`, `skipCard`, `reshuffle`, `renderWinOverlay`, `keepPlaying`, `newGame`) consistent between definition and call sites. `state` shape matches spec datamodel including `acknowledgedWinnerId`. ✅
