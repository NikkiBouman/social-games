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
  renderPlaying();
  if (state.winnerId && state.winnerId !== state.acknowledgedWinnerId) {
    renderWinOverlay();
  }
}

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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
