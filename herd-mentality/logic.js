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
