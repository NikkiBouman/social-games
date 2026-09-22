# Social Games — collectie + Herd Mentality (ontwerp)

- **Datum:** 2026-09-22
- **Status:** goedgekeurd (in afwachting van spec-review)

## Doel

Een kleine collectie simpele feestspellen als statische website. Eén overzichtspagina
(`index.html`) waar je een spel kiest; elk spel woont in een eigen map en is op zichzelf
speelbaar. De spellen worden grotendeels **offline** aan tafel gespeeld — de site is een
hulpmiddel (score bijhouden, kaartjes tonen), niet de plek waar het hele spel zich afspeelt.

Eerste spel: **Herd Mentality**.

## Scope

**Wel:**
- Root-spelkiezer met (nu) één spelkaart.
- Herd Mentality: setup → kaartjes aflopen → score bijhouden → winnaar.
- Vragensets als JSON-bestanden in de repo, per categorie, meerdere tegelijk te kiezen.
- Spelstand bewaren over refresh heen (localStorage).

**Niet:**
- Geen backend, database of accounts.
- Geen online/multi-device multiplayer — één apparaat (de "spelleider") houdt de stand bij.
- Geen in-app editor voor vragen. Vragen wijzigen = JSON editen + committen.
- Geen fiche-ruilregel (3 koeien → 3-punts-koe); digitaal telt gewoon een geheel getal.

## Techniek

Kale statische site, **geen buildstap**: vanilla HTML/CSS/JS.

- Lokaal draaien: `python3 -m http.server` (of vergelijkbaar) vanuit de projectmap.
- Hosten: GitHub Pages (of elke statische host). Vragen "leven" in de repo; updaten = commit + push, Pages herbouwt.
- ⚠️ Vragen worden via `fetch` uit JSON geladen. Dit werkt **niet** via `file://` (direct
  dubbelklikken). De site moet geserveerd worden — lokaal via de http-server, online via Pages.

### Mappenstructuur

```
social-games/
  index.html                 # spelkiezer (overzicht)
  assets/
    styles.css               # gedeelde basisstijl, mobile-first
  herd-mentality/
    index.html               # het spel
    game.js                  # spellogica
    sets.json                # index van beschikbare sets
    questions/
      algemeen.json
      dieren.json
      eten.json
      geschiedenis.json
      18plus.json
  docs/superpowers/specs/    # dit document
```

Nieuw spel toevoegen = nieuwe map + een spelkaart op de root-`index.html`.
Vragen uitbreiden = JSON-bestand erbij + regel in `sets.json`.

## Collectie-shell (`index.html`)

Overzichtspagina met een titel en een grid/lijst van spelkaarten. Nu één kaart:
**Herd Mentality**, die linkt naar `herd-mentality/`. Opgezet zodat een extra spel
neerkomt op een kaart erbij.

## Herd Mentality — schermen

### 1. Setup
- Spelers toevoegen/verwijderen: naam-invoer + lijst met verwijderknop per speler.
- Winst-aantal (koeien) instelbaar, standaard **8**, minimaal 1.
- Sets aanvinken (checkboxes, meerdere tegelijk), minimaal 1 vereist.
- **Start spel**: actief bij **≥ 3 spelers** én ≥ 1 set.

### 2. Spel (per kaartje) — mobiel plat op tafel

Het spel-scherm heeft twee sub-views (`state.view`), zodat de telefoon plat op tafel
kan liggen en iedereen meeleest.

**Kaart-view (`view = "card"`)** — de standaard.
- Alleen de vraag, groot en centraal (`clamp`-lettergrootte, vult het scherm), met klein
  categorie-label. **Tikken op de kaart zelf doet niets** — bewust, zodat je niet per
  ongeluk doorklikt als de telefoon op tafel ligt of het scherm even uitvalt.
- Kleine bediening onderaan: **📊 spelersbord** (opent popup), een voortgangsteller
  (`3 / 30`), en een **→**-knop die naar de herd-view gaat. Subtiel: **Sla over** en
  **Nieuw spel**.

**Herd-view (`view = "herd"`)** — na de →.
- Toont **alleen de spelers** als grote toggle-knoppen; tik aan wie in de kudde zit
  (krijgt 🐄), nogmaals tikken haalt 'm eruit.
- **Volgende kaart →** past de score toe (zie regels) en toont het volgende kaart-view.
- **← Kaart** gaat terug zonder te scoren; de herd-selectie blijft bewaard.

**Spelersbord (popup)** — oproepbaar vanuit beide views.
- Koeien per speler (aflopend), wie de 🩷 roze koe heeft, en "🩷 = kan niet winnen".
- Bevat de **handmatige roze-koe-override** ("geef roze koe aan … / Niemand") voor
  randgevallen die de auto-regel niet dekt. Zo blijft de herd-view puur spelers.

Skip/Volgende raken de score en roze koe aan zoals in §Scorelogica; `view` keert bij elke
kaartwissel terug naar `"card"`.

### 3. Winst
- Verschijnt (als overlay boven het spel-scherm) zodra na een ronde een nieuwe winnaar wordt
  bepaald (zie winstcheck), d.w.z. `winnerId` is gezet én verschilt van `acknowledgedWinnerId`.
- Toont de winnaar + knoppen:
  - **Toch verder spelen** → overlay sluiten, `acknowledgedWinnerId = winnerId`, spel gaat
    door met de huidige stand. Het scherm komt pas terug als er een *andere* speler
    winnaar wordt.
  - **Nieuw spel** → terug naar setup, stand gewist.

## Scorelogica (de kern)

Bij **Volgende kaart** (`applyRound`):
1. Elke speler in de herd-selectie: `cows += 1`.
2. Roze koe: laat `nietInHerd` = spelers die *niet* zijn aangetikt.
   - Is `nietInHerd.length === 1` → de roze koe gaat naar die ene speler (de unieke).
   - Anders → de roze koe blijft staan waar ie stond (geen wijziging).
   - (De handmatige override kan de houder altijd los hiervan zetten.)
3. Herd-selectie wissen, kaart-index +1.
4. Winstcheck uitvoeren.

**Sla over** raakt score noch roze koe aan; alleen kaart-index +1.

> Bewuste beperking (door gebruiker gekozen): de app kent de antwoorden niet. Als er 2+
> spelers buiten de herd vallen, kan de app niet zien of daar een echte unieke tussen zit,
> dus kent hij dan géén roze koe toe. Voor die zeldzame gevallen (bijv. gelijkspel mét één
> unieke) is er de handmatige override.

### Winstcheck (`checkWin`)

Bepaalt onder de spelers die mogen winnen wie er wint:

```
eligible = spelers met cows >= target EN id != pinkCowHolderId
als eligible leeg is → geen winnaar, doorspelen
maxEligible = hoogste cows onder eligible
leaders = eligible met cows == maxEligible
als leaders.length == 1 → winnerId = leaders[0].id
anders → gelijkspel bovenaan onder de kanshebbers, winnerId blijft/​wordt null, doorspelen
```

Het win-scherm reageert op `winnerId` t.o.v. `acknowledgedWinnerId` (zie schermen §3):
alleen een *nieuwe* winnaar opent de overlay opnieuw.

Gevolg (trouw aan de doosregels): de roze-koe-houder kan niet winnen, óók niet als die
de meeste koeien heeft — die telt niet mee en blokkeert de anderen niet. Halen twee
kanshebbers tegelijk het doel, dan speel je door tot er één bovenaan staat.

## Datamodel (spelstand)

```js
state = {
  version: 1,
  phase: 'setup' | 'playing' | 'won',
  players: [ { id, name, cows } ],   // id = stabiele string
  target: 8,
  pinkCowHolderId: string | null,
  selectedSetIds: [ string ],
  deck: [ { text, setNaam } ],       // geschud bij start; volledige lijst
  cardIndex: number,                 // index van huidige kaart in deck
  view: 'card' | 'herd',             // sub-view tijdens spelen
  herdSelection: [ playerId ],       // aangetikt voor de huidige kaart
  winnerId: string | null,           // huidige bepaalde winnaar (of null)
  acknowledgedWinnerId: string | null, // winnaar waarvoor "Toch verder spelen" is gekozen
}
```

## Vragensets — formaat

`sets.json` (index):
```json
[
  { "id": "algemeen", "naam": "Algemeen", "emoji": "💬", "bestand": "questions/algemeen.json" }
]
```

Per set-bestand (`questions/<id>.json`):
```json
{
  "id": "algemeen",
  "naam": "Algemeen",
  "vragen": [
    "Wat is de beste saus?",
    "Noem een dier met een staart."
  ]
}
```

Startsets die ik vul met een handvol vragen elk: Algemeen, Dieren, Eten, Geschiedenis, 18+.

## Deck & husselen

Bij start: alle vragen uit de gekozen sets samenvoegen tot `deck`, husselen, en aflopen via
`cardIndex`. Kaarten op (`cardIndex >= deck.length`) → melding + knop "opnieuw husselen"
(deck opnieuw schudden, `cardIndex = 0`).

## Opslaan (localStorage)

- Eén sleutel (bijv. `social-games:herd-mentality`), na elke wijziging overschreven met de
  volledige `state`. Groeit dus niet mee met het aantal potjes.
- Bij laden: is er een spel in uitvoering, dan verdergaan waar je was (incl. herd-selectie
  van de lopende kaart). "Nieuw spel" wist/overschrijft de sleutel.
- Footprint: enkele KB tot tientallen KB — ruim onder de ~5 MB origin-limiet.

## UX / stijl

Mobile-first (het apparaat gaat rond aan tafel): grote tikdoelen, duidelijke scheiding
tussen vraag, spelerslijst en scorebord. Koe-thema (🐄 / 🩷) voor charme. Gedeelde
`assets/styles.css` met een spel-neutrale basis + Herd Mentality-accenten. De feitelijke
visuele uitwerking gebeurt in de implementatiefase (frontend-design).

## Randgevallen

- **< 3 spelers of 0 sets:** start geblokkeerd.
- **Iedereen in de herd:** iedereen +1, roze koe onveranderd.
- **Niemand in de herd (gelijkspel/geen meerderheid):** niemand +1; roze koe verschuift alleen
  als er toevallig precies 1 speler is (kan niet bij ≥ 3 spelers) — dus onveranderd. Override
  beschikbaar.
- **Sole outlier is al de houder:** blijft bij die speler (no-op).
- **Deck leeg:** melding + opnieuw husselen.
- **Refresh midden in een ronde:** herd-selectie is bewaard, je zit weer op dezelfde kaart.

## Toekomst (buiten deze spec)

- Extra spellen als nieuwe mappen + spelkaarten.
- Eventueel gedeelde helpers (bijv. een scorebord-component) als er meer spellen bijkomen —
  pas extraheren wanneer een tweede spel het echt deelt.
