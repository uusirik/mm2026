# MM 2026 Veikkaus ⚽

FIFA MM 2026 -kisaveikkaussivusto kollegoille. Veikkaa kaikkien 72 alkusarjaottelun tulokset — sulkeutuu automaattisesti ottelun alkaessa. Jatkosarjaottelut avautuvat veikattavaksi kun otteluparit selviävät.

**Sivusto:** [uusirik.github.io/mm2026](https://uusirik.github.io/mm2026/)  
**Pääsy:** Kutsulinkin kautta (jaetaan erikseen)

---

## Ominaisuudet

- Kirjautuminen nimellä + 4-numeroinen PIN (ei sähköpostia)
- Pääsy vain kutsulinkin kautta — muut eivät voi rekisteröityä
- Maaliennusteet syötetään suoraan (1/X/2 lasketaan automaattisesti)
- Tulokset haetaan automaattisesti ESPN API:sta 5 min välein
- Kertoimet ottelukorteissa (ESPN/DraftKings)
- Seuraava ottelu -kortti laskurilla ja liputus
- Kisauutiset omalla välilehdellä (Google Uutiset + YLE Urheilu)
- Pistetaulukko reaaliajassa
- Muiden veikkausten selaus lukittujen otteluiden jälkeen
- Mobiilioptimoitu, toimii kaikilla laitteilla

## Pisteytys

| Tilanne | Pisteet |
|---------|---------|
| Tulos täysin oikein (1/X/2 + molemmat maalit) | 4 p |
| Voittaja + toisen joukkueen maalimäärä oikein | 3 p |
| Vain voittaja oikein | 2 p |
| Vain toisen joukkueen maalimäärä oikein (väärä voittaja) | 1 p |
| Loppusijoitus täysin oikein (jatkoaika/rangaistukset) | 3 p |
| Taisteli oikeassa mitaliottelussa (veikkasi X, jatkoaika ratkaisi) | 2 p |
| Bonus: peli oikein tai joukkue väärässä mitaliottelussa | 1 p |
| Ei osumia | 0 p |

---

## Tekninen rakenne

| Osa | Teknologia |
|-----|-----------|
| Frontend | Puhdas HTML/CSS/ES-moduulit, ei build-vaihetta |
| Hosting | GitHub Pages |
| Tietokanta | Supabase (PostgreSQL + Auth) |
| Deploy | GitHub Actions (`main`-branch) |
| Tulosdata | ESPN API (ilmainen, ei API-avainta) |
| Uutiset | Google News RSS + YLE Urheilu (rss2json) |

---

## Asennus alusta

### 1. Supabase

1. Luo ilmainen projekti [supabase.com](https://supabase.com)
2. **Authentication → Settings:**
   - `Enable email confirmations` → **OFF**
   - `Enable sign ups` → **ON**
3. **SQL Editor → New query** — aja koko `sql/schema.sql`
4. Tallenna:
   - **Project URL** (Settings → API)
   - **anon public** -avain (Settings → API)
   - **service_role** -avain (Settings → API) — vain GitHub Secretsiin

### 2. Konfiguroi app.js

Avaa `js/app.js` ja vaihda projektikohtaiset arvot:

```js
const SUPABASE_URL  = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON = 'eyJhbGci...';
```

### 3. GitHub Pages & Secrets

1. Push `main`-branchiin
2. **Settings → Pages → Source:** GitHub Actions
3. **Settings → Secrets → Actions** — lisää:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabasen service_role-avain

### 4. Kutsulinkin jako

Rekisteröityminen vaatii kutsulinkkin. Lisää oma kutsukoodi `js/app.js`-tiedostossa olevaan `INVITE_HASHES`-listaan SHA-256-tiivisteenä — koodi itse ei tallennu palvelimelle.

---

## Tiedostorakenne

```
mm2026-veikkaus/
├── index.html                    # Pääsivu
├── css/
│   └── style.css                 # Tyylit (tumma teema)
├── js/
│   ├── app.js                    # Pääsovellus, auth, UI
│   └── matches.js                # Otteludata + pistelaskulogiikka
├── scripts/
│   ├── fetch-results.js          # ESPN API → Supabase (tulokset + kertoimet)
│   └── fetch-odds.js             # (varalla) The Odds API -integraatio
├── sql/
│   ├── schema.sql                # Täydellinen Supabase-schema (aja kerran)
│   ├── add-odds.sql              # Lisää kertoimsarakkeet (sisältyy schema.sql:ään)
│   └── add-knockout.sql          # Jatkosarjaottelut + tbd-sarake
└── .github/workflows/
    ├── deploy.yml                # GitHub Pages deploy
    └── fetch-results.yml         # Tulosdata 5 min välein
```

---

## Tulosten manuaalinen syöttö

Tulokset haetaan automaattisesti ESPN:stä. Jos tarvitaan manuaalinen korjaus:

```sql
-- Normaali aika: Meksiko 2-1 Etelä-Afrikka
UPDATE matches SET result = '1', home_goals = 2, away_goals = 1, extra_time = false
WHERE id = 'A1';

-- Jatkoajalla ratkaistu
UPDATE matches SET result = '2', home_goals = 1, away_goals = 2, extra_time = true
WHERE id = 'R32_01';
```
