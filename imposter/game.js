// Imposter — host + player in one file (role from the URL). Built on the shared
// connection layer (../lib/connect.js). See the design spec:
// docs/superpowers/specs/2026-09-26-imposter-game-design.md
//
// URL params (set by the lobby on the landing page):
//   ?room=CODE&role=host|player&pid=PID

import * as net from "../lib/connect.js";
import { pickImpostor, buildDeck, viewFor } from "./logic.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const code = params.get("room");
const role = params.get("role");
const pid = params.get("pid");
const isHost = role === "host";

// ---- shared caches (from Firebase) ----
let QUESTIONS = null;
let meta = null;   // rooms/{code}/meta
let game = null;   // rooms/{code}/game (host-authoritative)
let me = null;     // rooms/{code}/players/{pid}  (my own node)
let roster = [];   // host only: full player objects
let kicked = false;  // this player was removed by the host
let seenMe = false;  // have we ever seen our own node (to detect removal)

// ---- host-only local state (deliberately NOT in Firebase) ----
let deck = [];
let roundIndex = 0;
let imposterPid = null;      // the secret — host memory only
let modes = { wijzen: "device", aantallen: "device", antwoorden: "device" };
let adult = false;
let hostInitialized = false;
let showTimer = null;        // physical-mode: countdown → shown
let correctByPid = {};       // pid -> #rounds a non-imposter voted for the real imposter
let roundsPlayed = 0;        // completed voting rounds this game

// ---- countdown animation ----
let cdTimer = null;
let cdLastSecond = -1;

// ---- audio (best-effort; unlocked on first tap) ----
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio, no problem */ }
}
document.addEventListener("pointerdown", unlockAudio);
function beep(freq = 880, dur = 0.12) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch { /* ignore */ }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nameOf = (id) => (game?.names && game.names[id]) || "?";

// ================= boot =================
(async function boot() {
  if (!code || !role || !pid) {
    app.innerHTML = `<p class="error">Geen kamer gevonden. <a href="../">Ga terug naar de lobby</a> om een spel te starten.</p>`;
    return;
  }
  try {
    QUESTIONS = await fetch("questions.json").then((r) => r.json());
  } catch {
    app.innerHTML = `<p class="error">Kon de vragen niet laden. Draai je de site via een server?</p>`;
    return;
  }
  net.onMeta(code, (m) => { meta = m; render(); });
  net.onGameState(code, (g) => { game = g; onGameChange(); render(); });
  net.onMyNode(code, pid, (n) => {
    me = n;
    if (n) seenMe = true;
    else if (seenMe && !isHost) kicked = true;
    render();
  });
  if (isHost) {
    net.onRoster(code, (r) => {
      roster = r;
      // keep the public name map fresh (names are not secret)
      const names = {};
      for (const p of r) names[p.id] = p.name;
      if (game) net.patchGameState(code, { names });
      render();
    });
  }
})();

function onGameChange() {
  if (isHost && !hostInitialized && (!game || !game.phase)) {
    hostInitialized = true;
    const names = {};
    for (const p of roster) names[p.id] = p.name;
    net.pushGameState(code, { phase: "setup", modes, adult, names });
  }
}

// ================= render =================
function render() {
  if (kicked) {
    app.innerHTML = `<div class="imp-block"><h2 class="imp-h">Je bent uit de kamer gehaald</h2><p><a href="../">← Terug naar de lobby</a></p></div>`;
    return;
  }
  if (!meta) { app.innerHTML = `<p class="hint">Verbinden…</p>`; return; }
  const phase = game?.phase || "setup";

  if (isHost && phase === "setup") { renderHostSetup(); return; }

  let html = playerContentHTML(phase);
  if (isHost) html += hostBarHTML(phase);
  app.innerHTML = `<section class="imp-stage">${html}</section>`;

  wirePlayerContent(phase);
  if (isHost) wireHostBar(phase);

  if (phase === "countdown") startCountdownTick(); else stopCountdownTick();
}

// ---------- host setup ----------
function renderHostSetup() {
  const n = roster.length;
  const toggle = (type, label, dev, phys) => `
    <div class="imp-mode">
      <span class="imp-mode-label">${label}</span>
      <div class="imp-seg">
        <button data-mode="${type}" data-val="device" class="${modes[type] === "device" ? "on" : ""}">${dev}</button>
        <button data-mode="${type}" data-val="physical" class="${modes[type] === "physical" ? "on" : ""}">${phys}</button>
      </div>
    </div>`;
  app.innerHTML = `
    <section class="card">
      <h2>Verbonden spelers (${n})</h2>
      <ul class="player-list">
        ${roster.map((p) => `<li><span>${esc(p.name)}</span>${p.id !== pid ? `<button class="link-btn" data-kick="${p.id}">kick</button>` : ""}</li>`).join("")}
      </ul>
      <p class="hint">${n < 3 ? `Nog minstens ${3 - n} speler(s) nodig.` : "Klaar om te starten."}</p>
    </section>
    <section class="card">
      <h2>Antwoorden per type</h2>
      ${toggle("aantallen", "Aantallen", "Nummer invoeren", "Vingers opsteken")}
      ${toggle("wijzen", "Wijzen", "Speler aanklikken", "Speler aanwijzen")}
      ${toggle("antwoorden", "Antwoorden", "Antwoord intypen", "Antwoord opnoemen")}
      <label class="imp-adult">
        <input type="checkbox" id="adult" ${adult ? "checked" : ""}>
        <span>🔞 18+ vragen meenemen</span>
      </label>
    </section>
    <button id="start" class="btn btn-pop btn-block" ${n >= 3 ? "" : "disabled"}>Start spel</button>`;

  app.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      modes[b.dataset.mode] = b.dataset.val;
      net.patchGameState(code, { modes });
      renderHostSetup();
    }));
  const adultBox = app.querySelector("#adult");
  adultBox.addEventListener("change", () => { adult = adultBox.checked; });
  app.querySelector("#start").addEventListener("click", startGame);
  wireKick();
}

function wireKick() {
  app.querySelectorAll("[data-kick]").forEach((b) =>
    b.addEventListener("click", () => net.kickPlayer(code, b.dataset.kick)));
}

// Compact player manager for the host during play (kick a stuck/left player,
// which unblocks the "everyone answered" gate). Names only — no answer status.
function hostManageHTML() {
  const others = roster.filter((p) => p.id !== pid);
  if (!others.length) return "";
  return `<details class="imp-manage"><summary>Spelers beheren (${roster.length})</summary>
    <ul class="imp-manage-list">
      ${others.map((p) => `<li><span>${esc(p.name)}</span><button class="link-btn" data-kick="${p.id}">kick</button></li>`).join("")}
    </ul></details>`;
}

// ================= host actions =================
function startGame() {
  const ids = roster.map((p) => p.id);
  if (ids.length < 3) return;
  imposterPid = pickImpostor(ids);
  deck = buildDeck(QUESTIONS, { adult });
  roundIndex = 0;
  correctByPid = {};
  roundsPlayed = 0;
  if (!deck.length) { alert("Geen vragen beschikbaar met deze instellingen."); return; }
  beginRound();
}

function currentRound() { return deck[roundIndex] || null; }

function beginRound() {
  const round = currentRound();
  if (!round) return;
  // write each player's private view + clear last round's answer/read
  for (const p of roster) {
    net.writeMyNode(code, p.id, {
      view: viewFor(round, p.id === imposterPid),
      answer: null,
      read: null,
      vote: null,
    });
  }
  const names = {};
  for (const p of roster) names[p.id] = p.name;
  net.pushGameState(code, {
    phase: "answer",
    roundNo: roundIndex + 1,
    type: round.type,
    modes,
    names,
    question: null,   // stays hidden until read/shown
    answers: null,
    result: null,
    countdownStart: null,
  });
}

function nextRound() {
  roundIndex += 1;
  if (roundIndex >= deck.length) { deck = buildDeck(QUESTIONS, { adult }); roundIndex = 0; }
  beginRound();
}

function toRead() {                 // device: reveal the real question to all
  const round = currentRound();
  net.patchGameState(code, { phase: "read", question: round.question });
}

function toReveal() {               // device: show everyone's answers
  const round = currentRound();
  const answers = roster.map((p) => ({ name: p.name, display: answerDisplay(round.type, p) }));
  net.patchGameState(code, { phase: "reveal", answers });
}

function startCountdown() {         // physical: 3-2-1, then show question
  net.patchGameState(code, { phase: "countdown", countdownStart: Date.now(), question: null });
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    const round = currentRound();
    net.patchGameState(code, { phase: "shown", question: round.question });
  }, 6000); // 3s countdown + 3s action
}

// Tally this round's votes.
//  - The imposter's own vote is ignored.
//  - accused = the most-voted person (among non-imposter votes).
//  - Unanimous = everyone EXCEPT the imposter and the accused voted for the
//    accused (the accused can't vote themselves, so their vote is ignored too).
//  - Unanimous on the real imposter → game ends (group wins).
//  - Unanimous on someone else → reveal "was not the imposter" and continue.
//  - No clear/unanimous accused → "verdeeld" and continue.
function tally() {
  roundsPlayed += 1;
  const voters = roster.filter((p) => p.id !== imposterPid); // ignore the imposter's vote
  for (const p of voters) if (p.vote === imposterPid) correctByPid[p.id] = (correctByPid[p.id] || 0) + 1;

  const counts = {};
  for (const p of voters) if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
  let accused = null, max = 0, tie = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > max) { max = n; accused = id; tie = false; }
    else if (n === max) { tie = true; }
  }

  const deciders = roster.filter((p) => p.id !== imposterPid && p.id !== accused);
  const unanimous = !!accused && !tie && deciders.length > 0 && deciders.every((p) => p.vote === accused);

  if (unanimous && accused === imposterPid) {
    net.patchGameState(code, {
      phase: "result",
      result: { impostorPid, impostorName: nameLocal(imposterPid), roundsPlayed, correctByPid },
    });
  } else if (unanimous) {
    net.patchGameState(code, { phase: "inconclusive", msg: `Unaniem op ${nameLocal(accused)} — maar dat was niet de imposter!` });
  } else {
    net.patchGameState(code, { phase: "inconclusive", msg: "De stemmen waren verdeeld." });
  }
}

function newGame() {
  hostInitialized = true;
  imposterPid = null; deck = []; roundIndex = 0; correctByPid = {}; roundsPlayed = 0;
  const names = {};
  for (const p of roster) names[p.id] = p.name;
  net.pushGameState(code, { phase: "setup", modes, adult, names });
}

const nameLocal = (id) => { const p = roster.find((x) => x.id === id); return p ? p.name : "?"; };

function answerDisplay(type, p) {
  if (p.answer == null || p.answer === "") return "(geen antwoord)";
  if (type === "wijzen") return `koos ${nameLocal(p.answer)}`;
  return String(p.answer);
}

// ================= player-facing content (host renders this too) =================
function playerContentHTML(phase) {
  const view = me?.view || {};
  const type = game?.type;
  const mode = (game?.modes && type) ? game.modes[type] : "device";

  if (phase === "setup") {
    return `<div class="imp-wait"><p class="imp-big">⏳</p><p>Wacht tot de host het spel start…</p></div>`;
  }

  if (phase === "answer") {
    const header = view.imposter
      ? `<div class="imp-role imp-imposter">🤫 ${esc(view.instruction)}</div>`
      : `<p class="imp-prompt">${esc(view.prompt)}</p><p class="imp-q">${esc(view.question)}</p>`;
    // ANTWOORDEN imposter also gets a (twisted) question to answer
    const impQ = view.imposter && view.question
      ? `<p class="imp-q">${esc(view.question)}</p>` : "";
    if (mode === "physical") {
      return `<div class="imp-block">${header}${impQ}<p class="hint">Maak je klaar — wacht op het aftellen.</p></div>`;
    }
    return `<div class="imp-block">${header}${impQ}${inputHTML(type)}</div>`;
  }

  if (phase === "read") {
    const banner = view.imposter ? "" : `<div class="imp-banner">Lees de vraag opnieuw voor eerlijkheid</div>`;
    const done = me?.read ? `<p class="imp-done">Gelezen ✓ — wacht op de rest</p>` : `<button id="okread" class="btn btn-pop btn-block">OK, gelezen</button>`;
    return `<div class="imp-block">${banner}<p class="imp-q">${esc(game.question)}</p>${done}</div>`;
  }

  if (phase === "countdown") {
    const action = view.imposter
      ? esc(view.instruction)
      : actionLabel(type);
    return `<div class="imp-block imp-countdown">
      <p class="imp-count" id="cd">3</p>
      <p class="imp-action">${action}</p>
    </div>`;
  }

  if (phase === "shown") {
    const banner = view.imposter ? "" : `<div class="imp-banner">Lees de vraag opnieuw voor eerlijkheid</div>`;
    return `<div class="imp-block">${banner}<p class="imp-q">${esc(game.question)}</p></div>
      <div class="imp-block">${votePanelHTML()}</div>`;
  }

  if (phase === "reveal") {
    const rows = (game.answers || []).map((a) =>
      `<li><span class="imp-aname">${esc(a.name)}</span><span class="imp-aval">${esc(a.display)}</span></li>`).join("");
    return `<div class="imp-block"><h2 class="imp-h">Antwoorden</h2><ul class="imp-answers">${rows}</ul></div>
      <div class="imp-block">${votePanelHTML()}</div>`;
  }

  if (phase === "inconclusive") {
    return `<div class="imp-block"><h2 class="imp-h">${esc(game.msg || "Volgende ronde")}</h2><p class="hint">De volgende vraag komt eraan.</p></div>`;
  }

  if (phase === "result" && game.result) {
    const r = game.result;
    const iAmImposter = pid === r.impostorPid;
    const personal = iAmImposter
      ? `<p class="imp-personal">Jij was de imposter — je hield het <strong>${r.roundsPlayed}</strong> ronde(s) vol.</p>`
      : `<p class="imp-personal">Je had de imposter <strong>${(r.correctByPid && r.correctByPid[pid]) || 0}×</strong> goed.</p>`;
    return `<div class="imp-block">
      <h2 class="imp-h">🎉 De imposter is gepakt!</h2>
      <p class="imp-win">Het was <strong>${esc(r.impostorName)}</strong>.</p>
      ${personal}
    </div>`;
  }

  return `<p class="hint">…</p>`;
}

function inputHTML(type) {
  if (type === "aantallen") {
    const btns = Array.from({ length: 11 }, (_, n) =>
      `<button class="imp-num ${me?.answer === n ? "on" : ""}" data-num="${n}">${n}</button>`).join("");
    return `<div class="imp-nums">${btns}</div>${submittedNote()}`;
  }
  if (type === "wijzen") {
    return `<div class="imp-players">${pickButtonsHTML("pick")}</div>${submittedNote()}`;
  }
  // antwoorden
  const val = typeof me?.answer === "string" ? me.answer : "";
  return `<form id="textform" class="imp-textform">
      <input id="textans" type="text" maxlength="60" placeholder="Jouw antwoord" value="${esc(val)}" autocomplete="off">
      <button class="btn btn-pop" type="submit">Versturen</button>
    </form>${me?.answer ? `<p class="imp-done">Verstuurd ✓</p>` : ""}`;
}

// WIJZEN answering: you may point at anyone, including yourself.
function pickButtonsHTML(kind) {
  const names = game?.names || {};
  return Object.keys(names).map((id) =>
    `<button class="imp-pick ${me?.[kind === "pick" ? "answer" : "vote"] === id ? "on" : ""}" data-${kind}="${id}">${esc(names[id])}</button>`).join("");
}

function voteButtonsHTML() {
  const names = game?.names || {};
  return `<div class="imp-players">${Object.keys(names).filter((id) => id !== pid).map((id) =>
    `<button class="imp-pick ${me?.vote === id ? "on" : ""}" data-vote="${id}">${esc(names[id])}</button>`).join("")}</div>`;
}

function votePanelHTML() {
  const note = me?.vote ? `<p class="imp-done">Gestemd op ${esc(nameOf(me.vote))} ✓ — je kunt nog wijzigen.</p>` : "";
  return `<h2 class="imp-h">Wie is de imposter?</h2>${voteButtonsHTML()}${note}`;
}

function submittedNote() { return me?.answer != null && me?.answer !== "" ? `<p class="imp-done">Antwoord opgeslagen ✓</p>` : ""; }

function actionLabel(type) {
  if (type === "aantallen") return "Steek je vingers op!";
  if (type === "wijzen") return "Wijs naar je speler!";
  return "Zeg je antwoord!";
}

function wirePlayerContent(phase) {
  if (phase === "answer") {
    app.querySelectorAll("[data-num]").forEach((b) =>
      b.addEventListener("click", () => net.writeMyNode(code, pid, { answer: Number(b.dataset.num) })));
    app.querySelectorAll("[data-pick]").forEach((b) =>
      b.addEventListener("click", () => net.writeMyNode(code, pid, { answer: b.dataset.pick })));
    const form = app.querySelector("#textform");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = app.querySelector("#textans").value.trim();
      if (v) net.writeMyNode(code, pid, { answer: v });
    });
  }
  if (phase === "read") {
    const ok = app.querySelector("#okread");
    if (ok) ok.addEventListener("click", () => net.writeMyNode(code, pid, { read: true }));
  }
  // vote buttons appear on the reveal/shown screens
  app.querySelectorAll("[data-vote]").forEach((b) =>
    b.addEventListener("click", () => net.writeMyNode(code, pid, { vote: b.dataset.vote })));
}

// ================= host control bar =================
function hostBarHTML(phase) {
  const round = currentRound();
  const type = round?.type;
  const mode = type ? modes[type] : "device";
  let buttons = "";

  if (phase === "answer") {
    if (mode === "physical") {
      buttons = `<button id="h-count" class="btn btn-pop">Start aftellen ⏱</button>`;
    } else {
      const answered = roster.filter((p) => p.answer != null && p.answer !== "").length;
      const all = roster.length > 0 && answered === roster.length;
      buttons = `<button id="h-read" class="btn btn-pop" ${all ? "" : "disabled"}>Toon de vraag →</button>
                 <span class="hint">${answered}/${roster.length} geantwoord</span>`;
    }
  } else if (phase === "read") {
    const readCount = roster.filter((p) => p.read).length;
    buttons = `<button id="h-reveal" class="btn btn-pop">Toon antwoorden →</button>
               <span class="hint">${readCount}/${roster.length} gelezen</span>`;
  } else if (phase === "reveal" || phase === "shown") {
    const voted = roster.filter((p) => p.vote).length;
    buttons = `<button id="h-tally" class="btn btn-pop">Toon uitslag →</button>
               <span class="hint">${voted}/${roster.length} gestemd</span>`;
  } else if (phase === "inconclusive") {
    buttons = `<button id="h-next" class="btn btn-pop">Volgende vraag →</button>`;
  } else if (phase === "countdown") {
    buttons = `<span class="hint">Aftellen…</span>`;
  } else if (phase === "result") {
    buttons = `<button id="h-new" class="btn btn-pop">Nieuw spel</button>`;
  }

  const info = phase !== "result"
    ? `<span class="imp-round">Vraag ${game?.roundNo ?? "?"} · ${labelType(type)}${mode === "physical" ? " · fysiek" : ""}</span>`
    : "";
  const manage = phase === "result" ? "" : hostManageHTML();
  return `<div class="imp-hostbar">${info}<div class="imp-hostbtns">${buttons}</div>${manage}</div>`;
}

function labelType(t) {
  return t === "wijzen" ? "Wijzen" : t === "aantallen" ? "Aantallen" : t === "antwoorden" ? "Antwoorden" : "";
}

function wireHostBar(phase) {
  const on = (id, fn) => { const b = app.querySelector("#" + id); if (b) b.addEventListener("click", fn); };
  on("h-read", toRead);
  on("h-reveal", toReveal);
  on("h-count", startCountdown);
  on("h-tally", tally);
  on("h-next", nextRound);
  on("h-new", newGame);
  wireKick();
}

// ================= countdown animation =================
function startCountdownTick() {
  stopCountdownTick();
  cdLastSecond = -1;
  const tick = () => {
    if (!game || game.phase !== "countdown") { stopCountdownTick(); return; }
    const el = document.getElementById("cd");
    if (!el) return;
    const elapsed = (Date.now() - (game.countdownStart || Date.now())) / 1000;
    let label;
    if (elapsed < 3) label = String(3 - Math.floor(elapsed)); // 3,2,1
    else label = "NU!";
    if (el.textContent !== label) {
      el.textContent = label;
      beep(label === "NU!" ? 1320 : 880, label === "NU!" ? 0.25 : 0.12);
    }
  };
  tick();
  cdTimer = setInterval(tick, 150);
}
function stopCountdownTick() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
