# Imposter — design (slice 2)

Een in-app partyspel (Jackbox-achtig) bovenop de gedeelde verbindingslaag
(`2026-09-26-connection-layer-and-herd-mentality-design.md`). Iedereen op z'n
eigen telefoon; één speler is de **imposter** en kent de vraag niet (of krijgt een
getwiste variant). Over meerdere vragen probeert de groep te ontmaskeren wie de
imposter is; aan het eind stemt iedereen in de app.

## 1. Kern

- Verbinding is **verplicht** (de laag levert kamer + roster + push). Elke speler
  heeft een telefoon (nodig om privé z'n vraag/rol te zien — ook de imposter).
  Minimaal 3 spelers.
- Er is **één imposter voor het hele spel**, geloot bij de start.
- De host **bestuurt én speelt mee**. Voor de imposter-geheimhouding: zie §6.
- Vraag na vraag; elke vraag heeft een **type** (§2). Per type kies je in de setup
  of er **op het apparaat** of **fysiek** wordt geantwoord (§3). Na elke vraag
  bespreekt de groep offline.
- **Eindstemming** in de app → onthulling: pakte de groep de imposter?

## 2. Vraagtypes

| Type | Niet-imposter ziet | Antwoord (device) | Imposter ziet |
|---|---|---|---|
| **WIJZEN** | prompt + vraag | tik een **speler** aan | alleen instructie (geen vraag) |
| **AANTALLEN** | prompt + vraag | tik een **getal 0–10** aan | alleen instructie (geen vraag) |
| **ANTWOORDEN** | prompt + **echte** vraag | **tekstveld** | de **getwiste** 2e vraag + tekstveld |

- Prompts (niet-imposter): WIJZEN "Wijs naar de speler waar jouw antwoord op
  slaat." · AANTALLEN "Kies het getal (0–10) dat jouw antwoord is." · ANTWOORDEN
  "Vul je antwoord op de vraag in."
- Imposter-instructies: WIJZEN "Je bent de imposter. Kies een willekeurige speler
  en hoop op het beste." · AANTALLEN "Je bent de imposter. Kies een willekeurig
  getal (0–10) en hoop op het beste." · ANTWOORDEN "Je bent de imposter. Beantwoord
  de vraag — maar hij heeft net een andere twist dan de echte vraag."
- AANTALLEN-bereik is 0–10; 10 telt als "10 of meer".

## 3. Setup: invoermodus per type + 18+

Na het verbinden (lobby van de laag) ziet de **host** een setup-scherm:

- **Per type een keuze device ↔ fysiek:**
  - AANTALLEN: *"nummer invoeren"* of *"vingers opsteken"*.
  - WIJZEN: *"speler aanklikken"* of *"speler aanwijzen"*.
  - ANTWOORDEN: *"antwoord intypen"* of *"antwoord opnoemen"*.
- Daaronder de **18+ toggle** (sluit 18+-vragen in/uit).
- Dan **Start** → imposter geloot, spel begint.

De keuze geldt per type voor het hele spel. Een spel kan dus types mengen (bijv.
AANTALLEN fysiek, ANTWOORDEN op device). In **beide** modi blijven de telefoons in
gebruik om de vraag/rol te tonen; alleen het *antwoorden* verschilt.

## 4. Ronde — device-modus (per vraag)

1. **Antwoorden** (`answer`) — elke telefoon toont z'n eigen `view` (§7) + de
   invoer (speler-kiezer / 0–10 / tekstveld). Iedereen voert in en verstuurt →
   `players/{pid}/answer`.
2. **Eerlijk lezen** (`read`) — daarna toont **elk** scherm de **echte** vraag aan
   iedereen (ook de imposter); niet-imposters zien de banner *"Lees de vraag
   opnieuw voor eerlijkheid"* — zo ziet elk scherm er hetzelfde uit en valt de
   imposter (die 'm nu pas leest) niet op. Iedereen klikt **"ok"**
   (`players/{pid}/read`). Je ziet **niet** wie nog niet klikte.
3. **Onthulling** (`reveal`) — als iedereen "ok" klikte, verschijnen **alle
   antwoorden mét naam** op elke telefoon (WIJZEN → "X koos Y", AANTALLEN → "X: 7",
   ANTWOORDEN → "X: …"). Bespreken → host naar de volgende vraag.

## 5. Ronde — fysieke modus (per vraag)

1. **Klaarmaken** (`answer`, geen invoer) — niet-imposters zien de vraag (+ "maak je
   klaar om te … opsteken/aanwijzen/opnoemen"); de imposter ziet alleen z'n
   instructie. Géén app-invoer.
2. **Aftellen** (`countdown`) — de app telt **3… 2… 1…** af **met geluid**; op "0"
   doet iedereen z'n fysieke actie tegelijk (vingers opsteken / aanwijzen /
   antwoord opnoemen). Sync via een gedeelde starttijd (`game.countdownStart`) die
   de host schrijft; elk toestel telt lokaal af.
3. **Vraag tonen** (`shown`) — na nog ~3 sec verschijnt de **echte vraag op ieders
   scherm, ook bij de imposter** (equaliseert de schermen + de imposter leert de
   vraag). Bespreken → host naar de volgende vraag.

Geen antwoord-verzameling of "ok"-stap in fysieke modus.

## 6. Het geheim — host speelt mee, imposter "pragmatisch verborgen"

De imposter moet verborgen blijven, óók voor de meespelende host. Volledig
waterdicht kan alleen met een servertje + Firebase-auth + per-speler rules (route
2) — dat breekt de "puur client + open DB"-eenvoud.

**Gekozen route (1, pragmatisch):** de app loot de imposter in code en toont de
host — net als elke speler — **alleen z'n eigen rol**; de mapping wordt nergens
getoond. Voor een normale host onzichtbaar. Restrisico: een host die met
devtools/DB graaft kan 't vinden — zelfde categorie als de open-rules-kanttekening
die al geaccepteerd is. Prima voor een vriendenspel.

**Open keuze (2, waterdicht, later):** Cloudflare Worker (gratis) loot bij start +
Firebase Anonymous Auth + rules zodat elke telefoon alléén z'n eigen rol leest.
Reëel extra werk; alleen als spieken een echt probleem wordt.

Ongeacht de route: vraag- en imposter-identiteit staan **nooit** in de publieke
`game/`-state vóór het moment dat de vraag sowieso aan iedereen getoond wordt.
Alles wat een speler eerder moet zien staat in z'n **eigen** `players/{pid}/view`.

## 7. Datamodel (bovenop de laag)

Onder `rooms/{CODE}` (van de laag), met `meta.game='imposter'`:

```
rooms/{CODE}/
  game/
    modes          # { wijzen:'device'|'physical', aantallen:…, antwoorden:… }  (setup)
    adult          # bool — 18+ toggle
    phase          # 'lobby'|'answer'|'read'|'reveal'|'countdown'|'shown'|'voting'|'result'
    roundNo        # ronde-teller (géén vraag-id!)
    type           # 'wijzen'|'aantallen'|'antwoorden' (huidige vraag)
    prompt         # prompt-tekst voor niet-imposters
    question       # ECHTE vraag — pas publiek in 'read' (device) / 'shown' (fysiek)
    countdownStart # ts waarop de 3-2-1 begon (fysieke modus)
    answers        # 'reveal' (device): map pid -> weergave-antwoord
    result         # 'result': { impostorPid, impostorName, topSuspectPid|null,
                   #             tie, caught, votes:{pid->suspectPid} }
  players/{pid}/
    id, name
    view           # 'answer'-fase: { instruction }  (imposter bij wijzen/aantallen)
                   #   | { prompt, question }  (niet-imposter; of imposter-antwoorden
                   #     met de getwiste vraag). Host schrijft; telefoon rendert dit.
    answer         # device-modus, huidige ronde: pid | 0..10 | tekst
    read           # device-modus: true zodra "ok" geklikt in 'read'
    vote           # 'voting': verdachte-pid (speler schrijft eigen)
```

- In fase `answer` staat `game.question` **niet** publiek (anders leest de imposter
  'm mee); de vraag zit daar alleen in de niet-imposter-`view`. Publiek wordt 'ie
  pas in `read` (device) of `shown` (fysiek).
- **Tally** tijdens `voting` berekent de host lokaal uit `players`; pas bij
  `result` schrijft de host `game.result`.

## 8. Spelverloop (fases)

`lobby` → **setup** (§3) → host **start** (imposter geloot) → per vraag de flow uit
§4 (device) of §5 (fysiek), afhankelijk van `modes[type]` → herhaal → host opent
**`voting`** (elke telefoon toont de namen behalve zichzelf → tik verdachte) → host
**onthult** (`result`). Daarna nieuw spel.

## 9. Win-conditie (pure functie)

Gegeven `votes` en `impostorPid`: `topSuspectPid` = meest gestemde (gelijkspel aan
top → `tie=true`, `topSuspectPid=null`); `caught = !tie && topSuspectPid ===
impostorPid`. `caught` → groep wint, anders ontsnapt de imposter.

## 10. Vragenformaat (eigen, uitbreidbaar — géén hergebruik van andere spellen)

Mode-based; nieuwe categorieën schuiven er zo bij. Per vraag een `adult`-vlag
(default false) voor de 18+ toggle.

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

## 11. Bestanden

- `imposter/index.html` — host + speler in één, gebruikt `lib/connect.js` +
  Firebase-config van het social-games-project.
- `imposter/game.js` — setup, fase-rendering per rol/type/modus, choreografie,
  aftel-timer.
- `imposter/logic.js` — pure functies: `pickImpostor`, `viewFor(type, isImposter,
  q)`, `deck(sets, {adult}, rnd)`, `tallyVotes`, `voteResult`.
- `imposter/logic.test.js` — `node --test`.
- `imposter/questions.json` — de mode-based vragen.
- Aftel-geluid: via Web Audio (korte piep per tel + "go"), geen asset nodig; speelt
  op het host-toestel (centraal).
- Entry in de landings-`index.html`.

## 12. Randgevallen (MVP)

- **Speler joint na start** → krijgt de huidige `view`; kan niet meer de imposter
  zijn.
- **Host verlaat** → spel stopt (geen resume in MVP).
- **AANTALLEN > 10** → geklemd op 10 ("10 of meer").
- **Niet iedereen stemt/klikt "ok"** → host kan forceren zonder te tonen wie
  achterblijft.
- **Klok-skew bij aftellen** → acceptabel; kleine afwijking tussen toestellen deert
  een partyspel niet.

## 13. Non-goals

Blijvend scorebord over meerdere spellen, per-ronde/Weerwolf-stemmen, host-resume/
refresh-survival, waterdichte auth-rules (route 2), losse geluidsassets.

## 14. Testen

- Pure logica volledig gedekt met `node --test` (imposter loten, `viewFor` per
  type, 18+-filtering in `deck`, tally, `voteResult`).
- Firebase-integratie + aftel-sync handmatig op ≥3 apparaten.
