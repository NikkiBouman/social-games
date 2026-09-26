# Imposter — design

Een nieuw partyspel in de `social-games`-collectie: telefoons koppelen aan één
host, iedereen ziet dezelfde vraag behalve één speler (de imposter), die alleen
"jij bent de imposter" ziet. Spelers steken **fysiek** vingers op als antwoord;
de groep probeert over meerdere vragen te ontmaskeren wie de imposter is. Aan het
eind stemt iedereen in de app op een verdachte en onthult de host of de groep 'm
te pakken had.

## 1. Kern van de gameplay

- Er is **één imposter voor het hele spel**, willekeurig geloot bij de start.
- De host stuurt vraag na vraag. Elke gewone speler ziet de **vraagtekst**; de
  imposter ziet **alleen** "🤫 jij bent de imposter" — nooit de vraag.
- Vingers opsteken en het bespreken gebeurt **fysiek/offline**; de app verzamelt
  geen antwoorden.
- Er is **geen automatische onthulling** per vraag. Het spel loopt door tot de
  groep genoeg denkt te weten.
- **Eindstemming (in de app):** de host opent de stemronde, elke telefoon tikt
  een verdachte aan, de host onthult de echte imposter en of de meerderheid 'm te
  pakken had (meerderheid correct = groep wint; gelijkspel of fout = imposter
  ontsnapt).

## 2. Aanpak (beslist)

Firebase Realtime Database + een 4-letter kamercode, gespiegeld op het bestaande
Quiz-project (`../Quiz`, Jackbox/Kahoot-stijl):

- **Host** = de enige schrijver van de publieke `state`. Maakt de kamer, kiest de
  vragenset(s), loot de imposter, paceert de vragen, opent de stemming, onthult.
- **Speler** = joint met de code, schrijft alleen z'n eigen `players/{pid}`-node
  (naam bij join, later z'n stem).
- Live push via Firebase-listeners (`onValue`), geen polling. Firebase JS SDK
  **v12.14.0** vanaf de gstatic-CDN (ES-modules), net als Quiz.

Overwogen en verworpen: statische QR-links (host kan niet live sturen, gedoe met
QR-distributie), WebRTC P2P (onbetrouwbaar op mobiel/verschillende netwerken).

## 3. Firebase-project (nieuw — prerequisite door de gebruiker)

We gebruiken een **apart** Firebase-project voor `social-games` (niet `quiz-db61a`
hergebruiken), voor schone scheiding. Dit kan alleen de gebruiker aanmaken:

1. Firebase-console → nieuw project (bijv. `social-games`).
2. Realtime Database aanmaken, locatie **europe-west1**, **test-mode** (open
   rules).
3. Web-app toevoegen → `firebaseConfig`-object kopiëren (inclusief `databaseURL`).
4. Config aanleveren; die komt in `imposter/`.

Tot de config er is wordt gebouwd met een **placeholder-config**; het werkt pas
echt zodra de echte config erin staat. Dit is exact het stappenplan uit het
comment-blok in Quiz's `index.html`.

## 4. Het geheim — de kern die moet kloppen

De vraag én de imposter-identiteit moeten verborgen blijven voor de imposter (en
voor slimme spelers). Daarom:

- De **publieke `state`** bevat **géén** vraagtekst, **géén** vraag-id en **géén**
  imposter-id. Alleen niet-geheime velden: `phase`, een ronde-*teller*, namen,
  spelersaantal.
- De inhoud die een speler moet zien staat **per speler** in `players/{pid}/view`,
  door de host geschreven: de vraagtekst voor gewone spelers, de sentinel
  `"IMPOSTER"` voor de imposter. Elke telefoon rendert alléén z'n eigen `view`.
- Omdat er nergens publiek een vraag-id staat, kan de imposter de vraag niet
  afleiden uit de statische JSON.

**Bekende beperking (bewust geaccepteerd):** de RTDB-rules staan open (test-mode),
net als bij Quiz. Een speler die Firebase handmatig inspecteert kan technisch
andermans `view`-node lezen en zo de imposter of de vraag achterhalen. Voor een
partyspel onder vrienden acceptabel. Echt dichttimmeren = Firebase-auth-rules
(later; een rules-wijziging, geen herontwerp).

## 5. Plek in de code

Nieuw spel **`imposter/`** naast `herd-mentality/`, met een eigen entry in de
landings-`index.html`. Hergebruikt de vragensets uit
`herd-mentality/questions/*.json` (de host laadt ze via fetch; geen kopie).

## 6. Datamodel (RTDB) — aparte namespace

Alles onder `imposter/{CODE}` (CODE = 4 hoofdletters). Test-mode rules.

```
imposter/{CODE}/
  state/                     # host-only, publiek leesbaar
    phase                    # 'lobby' | 'playing' | 'voting' | 'reveal'
    roundNo                  # ronde-teller voor weergave ("vraag 3"), géén vraag-id
    names                    # map pid -> naam
    playerCount              # aantal spelers
    result                   # alleen in 'reveal': { impostorPid, impostorName,
                             #   caught: bool, topSuspectPid|null, tie: bool,
                             #   votes: { pid -> suspectPid } }
  players/{pid}/
    id, name
    view                     # 'playing': vraagtekst | "IMPOSTER";
                             #   andere fases: null (UI volgt dan state.phase)
    vote                     # 'voting': door de speler geschreven verdachte-pid
  setup/                     # host-only: gekozen setIds (voor optionele resume)
```

Toelichting:
- De host schrijft in `playing` per ronde ieders `view`. De vraagvolgorde houdt de
  host **lokaal** aan (geshuffelde lijst uit de gekozen sets); alleen de tekst gaat
  per speler de lucht in.
- De **tally** tijdens `voting` wordt door de host lokaal berekend uit de
  `players`-snapshot (host-scherm) en **niet** in `state` gezet, om spelers niet te
  beïnvloeden. Pas bij `reveal` schrijft de host `state.result`.

## 7. Spelverloop (fases)

1. **lobby** — host maakt kamer, deelt code (+ join-QR, nice-to-have). Spelers
   joinen; hun namen verschijnen live. Host kiest vragenset(s).
2. **playing** — bij de start loot de host de imposter (vaste pid). Host tikt
   "volgende vraag" → schrijft ieders `view` (vraagtekst, of `"IMPOSTER"`),
   `roundNo++`. Groep steekt vingers op en bespreekt offline. Herhaal.
3. **voting** — host tikt "stemmen". Elke telefoon toont de spelersnamen (behalve
   zichzelf) → tik verdachte → schrijft `players/{pid}/vote`. Vote is aanpasbaar
   tot de host sluit. Host ziet live wie al gestemd heeft.
4. **reveal** — host tikt "onthul". Host berekent de uitslag en schrijft
   `state.result`. Alle schermen tonen: de echte imposter, de meest-gestemde
   verdachte, en of de groep 'm te pakken had. Daarna "nieuw spel".

De host mag ook vanuit `playing` direct naar `reveal` (stemmen overslaan) — de
offline-variant blijft dus mogelijk.

## 8. Win-conditie (pure functie, getest)

Gegeven de `votes`-map en `impostorPid`:
- `topSuspectPid` = meest gestemde pid; bij gelijkspel aan de top → `tie = true`,
  `topSuspectPid = null`.
- `caught = !tie && topSuspectPid === impostorPid`.
- `caught` → groep wint; anders ontsnapt de imposter.

## 9. Bestanden

- `imposter/index.html` — host én speler in één bestand (rol op runtime bepaald,
  zoals Quiz), Firebase-config bovenaan.
- `imposter/game.js` — verbinding (create/join/listeners/pushState), fase-rendering
  voor host en speler. Spiegelt Quiz's host/player-patroon.
- `imposter/logic.js` — **pure** functies, Firebase-vrij:
  - `genCode()` — 4 hoofdletters.
  - `pickImpostor(playerIds, rnd)` — kiest één pid.
  - `viewFor(pid, impostorPid, questionText)` — vraagtekst of `"IMPOSTER"`.
  - `buildDeck(sets, setIds, rnd)` — geshuffelde vraaglijst (mag lenen van
    herd-mentality's `buildDeck`).
  - `tallyVotes(votes)` — `{ suspectPid: count }`.
  - `voteResult(votes, impostorPid)` — `{ topSuspectPid, tie, caught }`.
- `imposter/logic.test.js` — `node --test`, net als `herd-mentality/`.
- Entry toevoegen aan de landings-`index.html` (collectiegrid).
- Styling hergebruikt `assets/styles.css` (neo-brutalist), eventueel een paar
  extra regels.

## 10. Randgevallen (MVP)

- **Speler joint na de start** → krijgt gewoon de huidige `view` (de host schrijft
  bij nieuwe joins de actuele ronde-inhoud). Zo iemand kan de imposter niet meer
  zijn (rol is al vergeven).
- **Host verlaat** → spel stopt; geen host-resume in de MVP (wel te noemen als
  latere optie; Quiz heeft `hostResume`).
- **Dubbele namen** → toegestaan.
- **Verbinding valt weg** → Firebase-reconnect regelt het meeste; refresh-survival
  is een non-goal voor nu.
- **Te weinig spelers** (< 3) → host kan niet starten.

## 11. Non-goals (bewust weggelaten)

Blijvend scorebord over meerdere spellen, per-ronde stemmen/afvallen (Weerwolf),
host-resume & refresh-survival, dichtgetimmerde auth-rules, geluid/media.

## 12. Testen

- Pure logica (`logic.js`) volledig gedekt met `node --test` (imposter loten,
  `viewFor`, tally, `voteResult`, code-generatie, deck-shuffle-invarianten).
- Firebase-integratie handmatig getest op ≥2 apparaten (host + speler) zodra de
  echte config er is.
- Syntax-check van de losse module: `node --check imposter/game.js`.

## 13. Openstaande afhankelijkheid

De echte `firebaseConfig` van het nieuwe project (zie §3). Tot dan placeholder;
alles behalve de live-verbinding is te bouwen en te testen.
