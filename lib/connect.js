// Shared "connect phones to a room" layer for social-games.
//
// Firebase Realtime Database. One device is the host and writes the shared
// `game` state + each player's private `view`; every player writes only its own
// `players/{pid}` node. Room code = 4 uppercase letters.
//
// Data shape (per room):
//   rooms/{CODE}/meta/    { phase:'lobby'|'ingame', game, hostId, ts }
//   rooms/{CODE}/players/{pid}/  { id, name, ...game-specific fields }
//   rooms/{CODE}/game/    game-specific host-authoritative state
//
// Firebase config is public by design (RTDB is in open test-mode). Nothing
// sensitive lives here.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, onValue,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDS_IeMYVIMpz0bVCk8Kjxn4rojYcYLV8s",
  authDomain: "social-games-6c5d7.firebaseapp.com",
  databaseURL: "https://social-games-6c5d7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "social-games-6c5d7",
  storageBucket: "social-games-6c5d7.firebasestorage.app",
  messagingSenderId: "802002493599",
  appId: "1:802002493599:web:ffbfb38be75d92c94cc2aa",
};

const db = getDatabase(initializeApp(firebaseConfig));

// ---- refs ----
const roomRef = (c) => ref(db, `rooms/${c}`);
const metaRef = (c) => ref(db, `rooms/${c}/meta`);
const playersRef = (c) => ref(db, `rooms/${c}/players`);
const playerRef = (c, p) => ref(db, `rooms/${c}/players/${p}`);
const gameRef = (c) => ref(db, `rooms/${c}/game`);

// ---- pure helpers (exported for tests; no I/O) ----
// Ambiguous letters (I, O) dropped so codes are easy to read/type out loud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function genCode(rnd = Math.random) {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}
export function newId(rnd = Math.random) {
  const chunk = () => Math.floor(rnd() * 1e9).toString(36);
  return "p" + chunk() + chunk();
}

// ---- room lifecycle ----
export async function createRoom(hostName) {
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const snap = await get(metaRef(code));
    if (!snap.exists()) break;
    code = genCode();
  }
  const pid = newId();
  await set(roomRef(code), {
    meta: { phase: "lobby", game: null, hostId: pid, ts: Date.now() },
    players: { [pid]: { id: pid, name: hostName } },
  });
  return { code, pid };
}

export async function joinRoom(code, name) {
  const snap = await get(metaRef(code));
  if (!snap.exists()) return { error: "nogame" };
  const pid = newId();
  await set(playerRef(code, pid), { id: pid, name });
  return { code, pid };
}

export async function roomExists(code) {
  return (await get(metaRef(code))).exists();
}

// ---- subscriptions (return an unsubscribe function) ----
export function onMeta(code, cb) {
  return onValue(metaRef(code), (s) => cb(s.val()));
}
export function onRoster(code, cb) {
  return onValue(playersRef(code), (s) => cb(Object.values(s.val() || {})));
}
export function onGameState(code, cb) {
  return onValue(gameRef(code), (s) => cb(s.val()));
}
export function onMyNode(code, pid, cb) {
  return onValue(playerRef(code, pid), (s) => cb(s.val()));
}

// ---- writes ----
export function setGame(code, game) {
  return update(metaRef(code), { game, phase: "ingame" });
}
export function backToLobby(code) {
  return update(metaRef(code), { game: null, phase: "lobby" });
}
// Host replaces the whole game/ node (authoritative snapshot).
export function pushGameState(code, obj) {
  return set(gameRef(code), obj);
}
// Host merges a few fields into game/ without clobbering the rest.
export function patchGameState(code, obj) {
  return update(gameRef(code), obj);
}
// Merge fields into a single player node (used by both host, for `view`, and
// players, for their own `answer`/`read`/`vote`). Different keys → safe merges.
export function writeMyNode(code, pid, obj) {
  return update(playerRef(code, pid), obj);
}
export async function getPlayers(code) {
  return Object.values((await get(playersRef(code))).val() || {});
}
// Host removes a player from the room (kick). The kicked device sees its own
// node vanish (onMyNode → null / roster no longer contains it).
export function kickPlayer(code, playerId) {
  return remove(playerRef(code, playerId));
}
export function endRoom(code) {
  return remove(roomRef(code));
}
