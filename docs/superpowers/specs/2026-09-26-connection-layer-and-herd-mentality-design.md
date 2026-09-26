# Verbindingslaag + Herd Mentality-aansluiting — design (slice 1)

Een gedeelde "verbind telefoons"-laag op **social-games-niveau**, plus Herd
Mentality als eerste spel dat erop aansluit. Slice 1 van een groter geheel; slice
2 is het Imposter-spel (aparte spec:
`2026-09-26-imposter-game-design.md`), dat op dezelfde laag leunt.

## 1. Doel & aanpak

- Telefoons **connecten vóórdat** een spel gekozen wordt: er is één kamer (lobby)
  op collectie-niveau met een **4-letter kamercode**. Eén apparaat is **host**.
- Elk spel in de collectie kan die verbinding gebruiken. De laag levert drie
  dingen: **roster** (wie is verbonden), **host-navigatie** (host bestuurt), en
  **per-speler payload** (host schrijft wat elke telefoon toont).
- Techniek: Firebase Realtime Database (project `social-games-6c5d7`,
  europe-west1, test-mode), SDK v12.19.0 vanaf de gstatic-CDN (ES-modules).
  Gespiegeld op het Quiz-patroon (`../Quiz`): **host = enige schrijver van de
  gedeelde state; elke speler schrijft alleen z'n eigen node.**

## 2. Rollen & apparaten

- **Host** — maakt de kamer, ziet het roster, kiest het spel, bestuurt (doorklikken
  / beëindigen) **en speelt mee**.
- **Speler** — joint met de kamercode + naam, schrijft alleen `players/{pid}`
  (naam bij join; later spel-specifieke invoer). Ziet wat de host naar z'n node
  pusht.

## 3. Firebase-model (gedeelde laag)

Alles onder `rooms/{CODE}` (CODE = 4 hoofdletters). Aparte namespace van Quiz
(`games/`), dus geen botsing.

```
rooms/{CODE}/
  meta/
    phase        # 'lobby' | 'ingame'
    game         # null | 'herd' | 'imposter'
    hostId
    ts
  players/{pid}/
    id, name, joinedAt        # roster; speler schrijft eigen node bij join
  game/                       # spel-specifieke, host-geschreven state (vorm per spel)
  # spel-specifieke per-speler data leeft onder players/{pid}/... (zie spel-spec)
```

De laag schrijft `meta` en `players`; wat er in `game/` en in extra
`players/{pid}/*`-velden staat, definieert elk spel zelf.

## 4. Lobby-flow

1. Host opent social-games → "Kamer starten" → krijgt code (+ optioneel join-QR).
   `meta.phase='lobby'`, `meta.game=null`.
2. Spelers openen de join-URL → code + naam → schrijven `players/{pid}`. Roster
   vult live bij host en spelers.
3. Host kiest een spel → `meta.game` gezet, `meta.phase='ingame'`. Het spel neemt
   het over (leest roster, pusht per-speler payload).

## 5. Herd Mentality-aansluiting

**Verbinding is optioneel — HM blijft volledig werken zonder kamer.**

- **Setup:** is er een actieve kamer met verbonden spelers, dan toont HM
  *"Deze verbonden spelers gebruiken?"* → **ja** neemt de roster-namen over als
  HM-spelers; **nee**/geen kamer → handmatige namenlijst zoals nu.
- **Tijdens spelen:** de host draait HM zoals nu (deck, kaartweergave,
  herd-selectie, koeien). Daarbovenop pusht de host de **huidige vraagtekst** naar
  `game/currentQuestion`. Verbonden telefoons tonen **alleen die vraag**
  (read-only); herd-selectie en scoring blijven **op de host**.
- **Geen geheim in HM** → de vraag mag gewoon in de publieke `game/`-state; geen
  per-speler-truc nodig (anders dan bij Imposter).
- **Backward compatible:** geen kamer = HM werkt exact als vandaag. De verbinding
  is puur additief.

## 6. Componenten & bestanden

- Nieuwe gedeelde module **`lib/connect.js`** (nieuw `lib/` in social-games):
  Firebase-init + de laag-primitieven — `createRoom()`, `joinRoom(code, naam)`,
  `onRoster(cb)`, `setGame(code, game)`, `pushGameState(code, obj)`,
  `onGameState(code, cb)`, `writeMyNode(code, pid, obj)`, `genCode()`. Firebase-vrij
  te houden waar mogelijk; de pure helpers (`genCode`, roster-import) apart testen.
- Landings-`index.html`: "Kamer starten" / "Deelnemen met code" naast de
  spelkeuze-grid.
- `herd-mentality/game.js`: setup-prompt "deze spelers gebruiken?" +
  `pushGameState` van de huidige vraag; nieuwe **speler-weergave** (alleen de
  vraag) wanneer je als niet-host verbonden bent.
- Styling hergebruikt `assets/styles.css`.

## 7. Randgevallen (MVP)

- **Host verlaat** → kamer/spel stopt; geen host-resume in MVP (latere optie; Quiz
  heeft `hostResume`).
- **Speler joint laat** → verschijnt in het roster; bij HM kan de host 'm alsnog
  als speler toevoegen (of niet).
- **Refresh** → geen naadloze resume in MVP (non-goal; Firebase-reconnect vangt
  wegvallende verbinding op).
- **Dubbele namen** → toegestaan.
- **Open rules** → iedereen met de code kan lezen/schrijven in die kamer;
  acceptabel (geen gevoelige data). Zie ook de Imposter-spec §het-geheim.

## 8. Testen

- Pure helpers in `lib/connect.js` (code-generatie, roster-→-spelerslijst-import)
  met `node --test`.
- `node --check` op de losse modules.
- Firebase-integratie handmatig op ≥2 apparaten (host + speler).

## 9. Non-goals (slice 1)

Host-resume/refresh-survival, dichtgetimmerde auth-rules, in-app antwoorden voor
HM (blijft display-only), QR is nice-to-have.
