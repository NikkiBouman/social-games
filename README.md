# Social Games

Een verzameling browser-based partyspellen. Statische site (geen build-stap).

## Spellen

- **🐄 Herd Mentality** — `herd-mentality/`. Denk als de kudde. Speelt lokaal op
  één apparaat, of met verbonden telefoons (die tonen dan de vraag).
- **🕵️ Imposter** — `imposter/`. Iedereen op z'n eigen telefoon; één speler is de
  imposter en kent de vraag niet. Vereist verbonden telefoons.

## Lokaal draaien

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Herd Mentality speel je zo al lokaal.

## Met telefoons spelen

De telefoons praten via Firebase (Realtime Database), maar ze moeten de site wél
allemaal van een bereikbaar adres laden. `localhost` werkt alleen op je eigen
machine. Twee opties:

- **Zelfde wifi (snel testen):** serveer op je netwerk en laat telefoons naar je
  Mac-IP gaan.
  ```bash
  python3 -m http.server 8000 --bind 0.0.0.0
  ipconfig getifaddr en0        # je LAN-IP, bijv. 192.168.1.23
  # telefoons → http://192.168.1.23:8000
  ```
- **Deployen:** zet de map op GitHub Pages / Cloudflare Pages en deel die URL.

Flow: open de site → **Kamer starten** (jij bent host) → anderen gaan naar
dezelfde site en doen **Meedoen** met de 4-letter code → host kiest een spel.
Imposter heeft minstens 3 spelers nodig.

## Firebase

Project `social-games-6c5d7`, Realtime Database in europe-west1, open test-mode
rules. De config in `lib/connect.js` is publiek bedoeld (RTDB bevat alleen
tijdelijke spel-data). ⚠️ Test-mode rules kunnen na ~30 dagen dichtklappen — dan
in de console de rules weer op open zetten (of strakke rules toevoegen).

## Tests

```bash
node --test herd-mentality/logic.test.js herd-mentality/sets.test.js imposter/logic.test.js
```

Ontwerp-specs staan in `docs/superpowers/specs/`.
