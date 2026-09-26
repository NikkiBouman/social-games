// Pure, side-effect-free logic for the Imposter game.
// No DOM, no Firebase, no I/O — so it can be unit-tested with `node --test`.

export function shuffle(items, rnd = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Choose one imposter pid from the list of player ids.
export function pickImpostor(playerIds, rnd = Math.random) {
  if (!playerIds.length) return null;
  return playerIds[Math.floor(rnd() * playerIds.length)];
}

// Flatten the mode-based question data into a shuffled deck of rounds.
// Each round: { type, prompt, imposter, question, imposterQuestion? }.
// `adult` includes 18+ questions; otherwise they are filtered out.
export function buildDeck(data, { adult = false } = {}, rnd = Math.random) {
  const rounds = [];
  for (const type of ["wijzen", "aantallen"]) {
    const set = data[type];
    if (!set) continue;
    for (const q of set.vragen || []) {
      if (q.adult && !adult) continue;
      rounds.push({ type, prompt: set.prompt, imposter: set.imposter, question: q.t });
    }
  }
  const ant = data.antwoorden;
  if (ant) {
    for (const pr of ant.paren || []) {
      if (pr.adult && !adult) continue;
      rounds.push({
        type: "antwoorden",
        prompt: ant.prompt,
        imposter: ant.imposter,
        question: pr.echt,
        imposterQuestion: pr.imposter,
      });
    }
  }
  return shuffle(rounds, rnd);
}

// What a player should see during the answer phase.
// - Imposter (wijzen/aantallen): only the instruction (no question).
// - Imposter (antwoorden): the instruction + the twisted question to answer.
// - Non-imposter: the prompt + the real question.
export function viewFor(round, isImposter) {
  if (isImposter) {
    if (round.type === "antwoorden") {
      return { imposter: true, instruction: round.imposter, prompt: round.prompt, question: round.imposterQuestion };
    }
    return { imposter: true, instruction: round.imposter };
  }
  return { imposter: false, prompt: round.prompt, question: round.question };
}

export function tallyVotes(votes) {
  const counts = {};
  for (const suspect of Object.values(votes || {})) {
    if (suspect == null) continue;
    counts[suspect] = (counts[suspect] || 0) + 1;
  }
  return counts;
}

// Resolve the end-of-game vote.
// Majority (strict single top) on the imposter = group wins (caught).
// A tie at the top, or a top vote on someone else, = imposter escapes.
export function voteResult(votes, impostorPid) {
  const counts = tallyVotes(votes);
  let top = null;
  let max = 0;
  let tie = false;
  for (const [pid, n] of Object.entries(counts)) {
    if (n > max) { max = n; top = pid; tie = false; }
    else if (n === max) { tie = true; }
  }
  const topSuspectPid = max > 0 && !tie ? top : null;
  const caught = topSuspectPid === impostorPid && topSuspectPid != null;
  return { topSuspectPid, tie, caught, counts };
}
