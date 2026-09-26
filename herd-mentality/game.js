import { buildDeck, awardCows, reassignPinkCow, determineWinner } from "./logic.js";

const STORAGE_KEY = "social-games:herd-mentality";
const app = document.getElementById("app");

// Optional multiplayer: when opened from the lobby with room params, the host
// pushes the current question to connected phones (display-only). Without params
// Herd Mentality runs fully local, exactly as before.
const params = new URLSearchParams(location.search);
const ROOM = params.get("room");
const ROLE = params.get("role");
const PID = params.get("pid");
const CONNECTED = !!(ROOM && ROLE && PID);
let net = null;            // lazily imported connection layer (only when connected)
let connectedRoster = [];  // host: player names from the lobby

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
    view: "card",           // sub-view while playing: "card" | "herd"
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
  state.view = "card";
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
  document.body.classList.toggle("is-playing", state.phase === "playing");
  if (state.phase === "setup") return renderSetup();
  renderPlaying();
  if (state.winnerId && state.winnerId !== state.acknowledgedWinnerId) {
    renderWinOverlay();
  }
}

function renderSetup() {
  const canStart = state.players.length >= 3 && state.selectedSetIds.length >= 1;
  const selectedCount = sets.filter((s) => state.selectedSetIds.includes(s.id)).length;
  const allSelected = sets.length > 0 && selectedCount === sets.length;
  app.innerHTML = `
    <section class="card">
      <h2>Spelers</h2>
      <form id="add-player" class="row">
        <input id="player-name" type="text" placeholder="Naam speler" autocomplete="off" maxlength="24">
        <button class="btn btn-add" type="submit">
          <span class="btn-label">Toevoegen</span><span class="btn-icon" aria-hidden="true">+</span>
        </button>
      </form>
      <ul class="player-list">
        ${state.players.map((p) => `
          <li><span>${escapeHtml(p.name)}</span>
          <button class="link-btn" data-remove="${p.id}">verwijder</button></li>`).join("")}
      </ul>
      <p class="hint">${state.players.length < 3 ? `Nog minstens ${3 - state.players.length} speler(s) nodig.` : `${state.players.length} spelers.`}</p>
      ${(CONNECTED && ROLE === "host" && connectedRoster.length)
        ? `<button type="button" id="use-connected" class="btn btn-block" style="margin-top:10px">Deze ${connectedRoster.length} verbonden spelers gebruiken?</button>`
        : ""}
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
        <label class="set-item select-all">
          <input type="checkbox" id="select-all-sets" ${allSelected ? "checked" : ""}>
          <span>Alles selecteren</span>
          <small>${selectedCount} / ${sets.length}</small>
        </label>
        ${sets.map((s) => `
          <label class="set-item">
            <input type="checkbox" data-set="${s.id}" ${state.selectedSetIds.includes(s.id) ? "checked" : ""}>
            <span>${s.emoji} ${escapeHtml(s.naam)}</span>
            <small>${s.vragen.length} vragen</small>
          </label>`).join("")}
      </div>
    </section>

    <button id="start" class="btn btn-pop btn-block" ${canStart ? "" : "disabled"}>Start spel</button>
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
  const selectAll = app.querySelector("#select-all-sets");
  selectAll.indeterminate = selectedCount > 0 && !allSelected;
  selectAll.addEventListener("change", () => {
    state.selectedSetIds = selectAll.checked ? sets.map((s) => s.id) : [];
    save(); renderSetup();
  });
  app.querySelector("#start").addEventListener("click", startGame);
  const useBtn = app.querySelector("#use-connected");
  if (useBtn) useBtn.addEventListener("click", () => {
    state.players = connectedRoster.map((p) => ({ id: newId(), name: p.name, cows: 0 }));
    save(); renderSetup();
  });
}

function renderPlaying() {
  if (state.cardIndex >= state.deck.length) return renderDeckEmpty();
  if (state.view === "herd") return renderHerdView();
  return renderCardView();
}

// Card view: only the question, big. Tapping the card face does nothing
// (deliberate — prevents accidental advance when the phone is on the table).
function renderCardView() {
  const card = state.deck[state.cardIndex];
  if (CONNECTED && ROLE === "host" && net) net.pushGameState(ROOM, { currentQuestion: card.text });
  app.innerHTML = `
    <section class="stage">
      <div class="topbar">
        <button id="settings" class="icon-btn" aria-label="Instellingen">⚙</button>
        <button id="board" class="icon-btn" aria-label="Spelersbord">📊</button>
      </div>
      <div class="card-face">
        <small class="q-set">${escapeHtml(card.setNaam)}</small>
        <div class="q-row">
          <p class="q-text">${escapeHtml(card.text)}</p>
          <button id="to-herd" class="arrow-btn" aria-label="Score invullen">→</button>
        </div>
      </div>
      <div class="stage-sub">
        <button id="skip" class="skip-btn" aria-label="Overslaan">⤼ overslaan</button>
        <span class="q-progress">${state.cardIndex + 1} / ${state.deck.length}</span>
      </div>
    </section>`;
  app.querySelector("#to-herd").addEventListener("click", () => { state.view = "herd"; save(); render(); });
  app.querySelector("#board").addEventListener("click", openScoreboard);
  app.querySelector("#settings").addEventListener("click", openSettings);
  app.querySelector("#skip").addEventListener("click", skipCard);
  fitQuestion();
}

// Shrink the question until it fits inside the (fixed-height) card, so it is
// always fully visible regardless of length. Runs on render, resize and font load.
function fitQuestion() {
  const face = app.querySelector(".card-face");
  const q = face && face.querySelector(".q-text");
  if (!q) return;
  let size = 48; // px, readable maximum
  q.style.fontSize = size + "px";
  while (size > 18 && face.scrollHeight > face.clientHeight) {
    size -= 2;
    q.style.fontSize = size + "px";
  }
}

// Herd view: only the players, as toggles. Confirm advances to the next card.
function renderHerdView() {
  const inHerd = new Set(state.herdSelection);
  app.innerHTML = `
    <section class="stage">
      <div class="topbar">
        <button id="back" class="icon-btn" aria-label="Terug naar kaart">←</button>
        <button id="board" class="icon-btn" aria-label="Spelersbord">📊</button>
      </div>
      <h2 class="herd-title">Wie zat in de kudde?</h2>
      <div class="herd-grid">
        ${state.players.map((p) => `
          <button class="herd-btn ${inHerd.has(p.id) ? "in-herd" : ""}" data-herd="${p.id}">
            ${escapeHtml(p.name)}${inHerd.has(p.id) ? " 🐄" : ""}
          </button>`).join("")}
      </div>
      <button id="next" class="btn btn-pop btn-block">Volgende kaart →</button>
    </section>`;
  app.querySelectorAll("[data-herd]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.herd;
      state.herdSelection = inHerd.has(id)
        ? state.herdSelection.filter((x) => x !== id)
        : [...state.herdSelection, id];
      save(); renderHerdView();
    }));
  app.querySelector("#back").addEventListener("click", () => { state.view = "card"; save(); render(); });
  app.querySelector("#next").addEventListener("click", nextCard);
  app.querySelector("#board").addEventListener("click", openScoreboard);
}

// Scoreboard popup: cow counts + pink-cow holder, plus manual pink-cow override.
function openScoreboard() {
  const sorted = [...state.players].sort((a, b) => b.cows - a.cows);
  const modal = document.createElement("div");
  modal.className = "overlay";
  modal.innerHTML = `
    <div class="sheet">
      <h2>📊 Spelersbord</h2>
      <ul class="scoreboard-list">
        ${sorted.map((p) => `
          <li class="${p.id === state.pinkCowHolderId ? "has-pink" : ""}">
            <span>${escapeHtml(p.name)}</span>
            <span class="score">${p.id === state.pinkCowHolderId ? "🩷 " : ""}<strong>${p.cows} 🐄</strong></span>
          </li>`).join("")}
      </ul>
      <small class="hint">Winst bij ${state.target} 🐄 · 🩷 = kan niet winnen</small>
      <details class="override">
        <summary>Roze koe handmatig toewijzen</summary>
        <div class="override-body">
          ${state.players.map((p) => `<button class="btn" data-pink="${p.id}">🩷 ${escapeHtml(p.name)}</button>`).join("")}
          <button class="btn" data-pink="__none">Niemand</button>
        </div>
      </details>
      <button id="close-board" class="btn btn-pop btn-block">Sluiten</button>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#close-board").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelectorAll("[data-pink]").forEach((b) =>
    b.addEventListener("click", () => {
      state.pinkCowHolderId = b.dataset.pink === "__none" ? null : b.dataset.pink;
      save();
      close();
      openScoreboard(); // reopen so the updated 🩷 shows immediately
    }));
}

// Settings popup: add/remove players mid-game, or start a new game.
function openSettings() {
  const modal = document.createElement("div");
  modal.className = "overlay";
  modal.innerHTML = `
    <div class="sheet">
      <h2>⚙ Instellingen</h2>
      <form id="add-player" class="row">
        <input id="player-name" type="text" placeholder="Speler toevoegen" autocomplete="off" maxlength="24">
        <button class="btn" type="submit">+</button>
      </form>
      <ul class="player-list">
        ${state.players.map((p) => `
          <li><span>${escapeHtml(p.name)}</span>
          <button class="link-btn" data-remove="${p.id}">verwijder</button></li>`).join("")}
      </ul>
      <div class="actions"><button id="new" class="btn btn-block">Nieuw spel</button></div>
      <button id="close-settings" class="btn btn-pop btn-block">Sluiten</button>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#close-settings").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector("#add-player").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = modal.querySelector("#player-name");
    const name = input.value.trim();
    if (!name) return;
    state.players.push({ id: newId(), name, cows: 0 });
    save(); close(); openSettings();
  });
  modal.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.remove;
      state.players = state.players.filter((p) => p.id !== id);
      state.herdSelection = state.herdSelection.filter((x) => x !== id);
      if (state.pinkCowHolderId === id) state.pinkCowHolderId = null;
      if (state.winnerId === id) state.winnerId = null;
      if (state.acknowledgedWinnerId === id) state.acknowledgedWinnerId = null;
      save(); close(); openSettings();
    }));
  modal.querySelector("#new").addEventListener("click", () => { close(); newGame(); });
}

function renderDeckEmpty() {
  app.innerHTML = `
    <section class="stage">
      <div class="card-face"><p class="q-text">Alle kaarten gehad! 🎉</p></div>
      <div class="actions">
        <button id="reshuffle" class="btn btn-pop">Opnieuw husselen</button>
        <button id="board" class="btn">Spelersbord</button>
        <button id="new" class="btn">Nieuw spel</button>
      </div>
    </section>`;
  app.querySelector("#reshuffle").addEventListener("click", reshuffle);
  app.querySelector("#board").addEventListener("click", openScoreboard);
  app.querySelector("#new").addEventListener("click", newGame);
}

function nextCard() {
  state.players = awardCows(state.players, state.herdSelection);
  state.pinkCowHolderId = reassignPinkCow(state.players, state.herdSelection, state.pinkCowHolderId);
  state.herdSelection = [];
  state.cardIndex += 1;
  state.view = "card";
  state.winnerId = determineWinner(state.players, state.target, state.pinkCowHolderId);
  save();
  render(); // render() shows the win overlay when there's a new winner
}

function skipCard() {
  state.herdSelection = [];
  state.cardIndex += 1;
  state.view = "card";
  save();
  render();
}

function reshuffle() {
  state.deck = buildDeck(sets, state.selectedSetIds);
  state.cardIndex = 0;
  state.view = "card";
  save();
  render();
}

function renderWinOverlay() {
  const winner = state.players.find((p) => p.id === state.winnerId);
  if (!winner) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay win";
  overlay.innerHTML = `
    <div class="sheet">
      <p class="confetti">🏆</p>
      <h2>${escapeHtml(winner.name)} wint!</h2>
      <p>${winner.cows} 🐄 — en geen roze koe.</p>
      <div class="actions">
        <button id="keep" class="btn">Toch verder spelen</button>
        <button id="restart" class="btn btn-pop">Nieuw spel</button>
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
  if (CONNECTED) {
    try { net = await import("../lib/connect.js"); } catch { net = null; }
  }
  if (CONNECTED && ROLE === "player" && net) return bootPlayer();

  try {
    await loadSets();
  } catch (e) {
    app.innerHTML = `<p class="error">Kon de vragen niet laden. Draai je de site via een server (niet als bestand)?</p>`;
    return;
  }
  if (CONNECTED && ROLE === "host" && net) {
    net.onRoster(ROOM, (r) => { connectedRoster = r; if (state.phase === "setup") renderSetup(); });
  }
  load(); // restore in-progress game if present
  render();

  // keep the question fitted after the webfont loads and on resize/orientation change
  const refit = () => { if (state.phase === "playing" && state.view === "card") fitQuestion(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  window.addEventListener("resize", refit);
})();

// ---- connected player: mirror the host's current question (display only) ----
function bootPlayer() {
  document.body.classList.add("is-playing");
  renderPlayerQuestion(null);
  net.onGameState(ROOM, (g) => renderPlayerQuestion(g && g.currentQuestion));
}
function renderPlayerQuestion(text) {
  app.innerHTML = `
    <section class="stage">
      <div class="card-face">
        <p class="q-text">${text ? escapeHtml(text) : "Wachten op de host…"}</p>
      </div>
    </section>`;
  fitQuestion();
}
