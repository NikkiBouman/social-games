# Imposter — design (slice 2)

Een in-app partyspel (Jackbox-achtig) bovenop de gedeelde verbindingslaag
(`2026-09-26-connection-layer-and-herd-mentality-design.md`). Iedereen op z'n
eigen telefoon; één speler is de **imposter** en kent de vraag niet (of krijgt een
getwiste variant). Over meerdere vragen probeert de groep te ontmaskeren wie de
imposter is; aan het eind stemt iedereen in de app.

## 1. Kern

- Verbinding is **verplicht** (de laag levert kamer + roster + push). Minimaal 3
  spelers.
- Er is **één imposter voor het hele spel**, geloot bij de start.
- De host **bestuurt én speelt mee**. Voor de imposter-geheimhouding: zie §4.
- Vraag na vraag; elke vraag heeft een **type** dat de invoer bepaalt. Na elke
  vraag zien alle spelers elkaars antwoorden en bespreken ze offline.
- **Eindstemming** in de app → onthulling: pakte de groep de imposter?

## 2. Vraagtypes

Elke vraag heeft één van drie types. Alle invoer gebeurt **in de app**; er is geen
fysieke component meer.

| Type | Niet-imposter ziet | Invoer | Imposter ziet |
|---|---|---|---|
| **WIJZEN** | prompt + vraag | tik een **speler** aan (roster als opties) | alleen instructie (geen vraag) |
| **AANTALLEN** | prompt + vraag | tik een **getal 0–10** aan | alleen instructie (geen vraag) |
| **ANTWOORDEN** | prompt + de **echte** vraag | **tekstveld** | de **getwiste** 2e vraag + tekstveld |

- WIJZEN-prompt: "Wijs naar de speler waar jouw antwoord op slaat."
- AANTALLEN-prompt: "Kies het getal (0–10) dat jouw antwoord is."
- ANTWOORDEN-prompt: "Vul je antwoord op de vraag in."
- Imposter-instructies (in-app taal, zelfde toon als origineel):
  - WIJZEN: "Je bent de imposter. Kies een willekeurige speler en hoop op het beste."
  - AANTALLEN: "Je bent de imposter. Kies een willekeurig getal (0–10) en hoop op het beste."
  - ANTWOORDEN: "Je bent de imposter. Beantwoord de vraag — maar hij heeft net een andere twist dan de echte vraag."

Bij **AANTALLEN** is het antwoordbereik 0–10; 10 telt als "10 of meer".

## 3. Ronde-choreografie (per vraag)

1. **Antwoorden** — elke telefoon toont z'n eigen `view` (zie §5) en de bijpassende
   invoer. Iedereen voert in en verstuurt → `players/{pid}/answer`.
2. **Eerlijk lezen** — daarna toont **elk** scherm de **echte** vraag aan iedereen
   (ook de imposter). Niet-imposters zien de banner *"Lees de vraag opnieuw voor
   eerlijkheid"* — zo ziet elk scherm er hetzelfde uit en valt de imposter (die 'm
   nu pas leest) niet op. Iedereen klikt **"ok"** (`players/{pid}/read`). Je ziet
   **niet** wie nog niet klikte (geen timing-tell).
3. **Onthulling** — als iedereen "ok" klikte, verschijnen **alle antwoorden mét
   naam** op elke telefoon (WIJZEN → "X koos Y", AANTALLEN → "X: 7", ANTWOORDEN →
   "X: …"). Bespreken → host gaat naar de volgende vraag.

## 4. Het geheim — host speelt mee, imposter "pragmatisch verborgen"

De imposter moet verborgen blijven, óók voor de host (die meespeelt). Volledig
waterdicht verbergen kan alleen met een servertje + Firebase-auth + per-speler
rules (zie route 2 hieronder) — dat breekt de "puur client + open DB"-eenvoud.

**Gekozen route (1, pragmatisch):** de app loot de imposter in code en toont de
host — net als elke speler — **alleen z'n eigen rol**; de mapping wordt nergens
getoond. Voor een normale host onzichtbaar. Restrisico: een host die met
devtools/DB gaat graven kan 't vinden — zelfde categorie als de open-rules-
kanttekening die al geaccepteerd is. Prima voor een vriendenspel.

**Bewaard als open keuze (2, waterdicht, later):** Cloudflare Worker (gratis) loot
bij start + Firebase Anonymous Auth + rules zodat elke telefoon alléén z'n eigen
rol leest. Reëel extra werk; alleen doen als spieken een echt probleem wordt.

Concreet, ongeacht de route: vraag- en imposter-identiteit staan **nooit** in de
publieke `game/`-state. Alles wat een speler moet zien staat in z'n **eigen**
`players/{pid}/view` (zie §5).

## 5. Datamodel (bovenop de laag)

Onder `rooms/{CODE}` (van de laag), met `meta.game='imposter'`:

```
rooms/{CODE}/
  game/
    phase          # 'lobby' | 'answer' | 'read' | 'reveal' | 'voting' | 'result'
    roundNo        # ronde-teller (géén vraag-id!)
    type           # 'wijzen' | 'aantallen' | 'antwoorden'  (huidige vraag)
    prompt         # de prompt-tekst voor niet-imposters (type-afhankelijk)
    question       # ECHTE vraag — pas publiek vanaf fase 'read' (eerlijk lezen)
    answers        # 'reveal': map pid -> weergave-antwoord (mét naam via names)
    result         # 'result': { impostorPid, impostorName, topSuspectPid|null,
                   #             tie, caught, votes:{pid->suspectPid} }
  players/{pid}/
    id, name
    view           # 'answer'-fase: { instruction } (imposter, wijzen/aantallen)
                   #   | { prompt, question } (niet-imposter, of imposter-antwoorden
                   #     met de getwiste vraag). Host schrijft; telefoon rendert dit.
    answer         # huidige ronde: pid (wijzen) | 0..10 (aantallen) | tekst (antwoorden)
    read           # true zodra "ok" geklikt in de 'read'-fase
    vote           # 'voting': verdachte-pid (speler schrijft eigen)
```

- In fase `answer` staat `game.question` **niet** publiek (anders leest de imposter
  'm mee); de vraag verschijnt daar alleen in de niet-imposter-`view`. Pas in fase
  `read` zet de host `game.question` publiek (dan mag iedereen 'm zien).
- De **tally** tijdens `voting` berekent de host lokaal uit `players`; pas bij
  `result` schrijft de host `game.result`.

## 6. Spelverloop (fases)

`lobby` (laag) → host **start** (imposter geloot, `game`-state aangemaakt) →
per vraag de choreografie uit §3 (`answer` → `read` → `reveal`) → herhaal →
wanneer de groep zover is: host opent **`voting`** (elke telefoon toont de namen
behalve zichzelf → tik verdachte) → host **onthult** (`result`): echte imposter,
meest-gestemde verdachte, en of de groep 'm pakte. Daarna nieuw spel.

## 7. Win-conditie (pure functie)

Gegeven `votes` en `impostorPid`: `topSuspectPid` = meest gestemde (gelijkspel aan
top → `tie=true`, `topSuspectPid=null`); `caught = !tie && topSuspectPid ===
impostorPid`. `caught` → groep wint, anders ontsnapt de imposter.

## 8. 18+ toggle

Vragen zijn **per stuk** getagd `adult: true|false` (default false). De host heeft
een **aan/uit-schakelaar** in de setup die 18+-vragen in- of uitsluit uit de deck.

## 9. Vragenformaat (eigen, uitbreidbaar — géén hergebruik van andere spellen)

Mode-based; nieuwe categorieën schuiven er zo bij. Voorstel:

```json
{
  "wijzen": {
    "prompt": "Wijs naar de speler waar jouw antwoord op slaat.",
    "imposter": "Je bent de imposter. Kies een willekeurige speler en hoop op het beste.",
    "vragen": [ { "t": "Wie kan het beste koken?", "adult": false }, … ]
  },
  "aantallen": {
    "prompt": "Kies het getal (0–10) dat jouw antwoord is.",
    "imposter": "Je bent de imposter. Kies een willekeurig getal (0–10) en hoop op het beste.",
    "vragen": [ { "t": "Hoeveel kopjes koffie drink je per dag?", "adult": false }, … ]
  },
  "antwoorden": {
    "prompt": "Vul je antwoord op de vraag in.",
    "imposter": "Je bent de imposter. Beantwoord de vraag — maar hij heeft net een andere twist dan de echte vraag.",
    "paren": [ { "echt": "Wat drink je het liefst op een borrel?",
                 "imposter": "Wat is het eerste dat je op een dag drinkt?", "adult": false }, … ]
  }
}
```

### Vragen tot nu toe

**WIJZEN**
- Met wie zou jij op een onbewoond eiland willen zitten?
- Wie vertrouw jij met een geheim?
- Wie is de slimste?
- Wie kan het beste koken?
- Wie zou nu zomaar 5 km kunnen rennen?
- *(18+)* Wie heeft volgens jou de meest kinky seks?
- *(18+)* Wie zal het minst vaak seks hebben?

**AANTALLEN** (0–10)
- Hoeveel dagen draag jij een broek voordat je 'm wast?
- Hoe vaak douche jij per week?
- Hoeveel boeken lees je per maand?
- Hoe vaak poep je op een dag?
- Hoeveel kopjes koffie drink je per dag?
- Hoeveel boterhammen eet je op een dag?
- Hoeveel glazen alcohol drink je per week?
- *(18+)* Hoe vaak per week heb je seks?
- *(18+)* Na hoeveel dates heb je seks?

**ANTWOORDEN** (paren — echt / imposter-twist)
- "Wat drink je het liefst op een borrel?" / "Wat is het eerste dat je op een dag drinkt?"
- "Wat is een sport die je niet regelmatig zou willen beoefenen?" / "Wat is de laatste sport die je (in het echt of op tv) hebt gezien?"
- "Van welk land vind je het eten het lekkerst?" / "Wat is je volgende vakantiebestemming?"
- *(18+)* "Wat is het beste seksstandje?" / "Als je van geslacht zou veranderen, welk standje zou je dan het liefst uitproberen?"

*(Er komen later meer categorieën/vragen; die passen in dit formaat.)*

## 10. Bestanden

- `imposter/index.html` — host + speler in één, gebruikt `lib/connect.js` en de
  Firebase-config van het social-games-project.
- `imposter/game.js` — fase-rendering per rol/type + de choreografie.
- `imposter/logic.js` — pure functies: `pickImpostor`, `viewFor(type, isImposter,
  q)`, `deck(sets, {adult}, rnd)`, `tallyVotes`, `voteResult`.
- `imposter/logic.test.js` — `node --test`.
- `imposter/questions.json` — de mode-based vragen.
- Entry in de landings-`index.html`.

## 11. Randgevallen (MVP)

- **Speler joint na start** → krijgt de huidige `view`; kan niet meer de imposter
  zijn (rol is vergeven).
- **Host verlaat** → spel stopt (geen resume in MVP).
- **AANTALLEN > 10** → geklemd op 10 ("10 of meer").
- **Niet iedereen stemt/klikt "ok"** → host kan forceren (doorzetten) zonder te
  tonen wie achterblijft.

## 12. Non-goals

Blijvend scorebord over meerdere spellen, per-ronde/Weerwolf-stemmen met afvallen,
host-resume/refresh-survival, waterdichte auth-rules (route 2), geluid/media.

## 13. Testen

- Pure logica volledig gedekt met `node --test` (imposter loten, `viewFor` per
  type, 18+-filtering in `deck`, tally, `voteResult`).
- Firebase-integratie handmatig op ≥3 apparaten.
