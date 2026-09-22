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
    assert.ok(Array.isArray(file.vragen) && file.vragen.length >= 1, `no vragen in ${s.bestand}`);
    for (const q of file.vragen) assert.equal(typeof q, "string", `non-string vraag in ${s.bestand}`);
  }
});
