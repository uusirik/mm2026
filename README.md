# MM 2026 Veikkaus ⚽

FIFA MM 2026 kisaveikkaussivusto. Kirjaudu sähköpostilinkin kautta ja veikkaa
alkusarjan 72 ottelun tulokset — kohde sulkeutuu automaattisesti pelin alkaessa.

## Tekniikka

- **Frontend**: Puhdas HTML/CSS/JS, ei build-vaihetta
- **Hosting**: GitHub Pages
- **Backend**: Supabase (autentikaatio + PostgreSQL)
- **Deploy**: GitHub Actions → automaattinen `main`-branchista

## Pisteytys

| Tilanne | Pisteet |
|---------|---------|
| Tulos täysin oikein (1/X/2 + molemmat maalit) | 4 p |
| Voittaja + toisen joukkueen maalimäärä oikein | 3 p |
| Vain voittaja oikein | 2 p |
| Vain toisen joukkueen maalimäärä oikein (väärä voittaja) | 1 p |
| Loppusijoitus täysin oikein (jatkoaika/rangaistukset) | 3 p |
| Loppusijoituksessa väärällä sijalla, taisteli oikeassa mitaliottelussa | 2 p |
| Bonus: peli oikein tai joukkue väärässä mitaliottelussa (jatkoaika) | 1 p |
| Ei osumia | 0 p |

## Asennus

### 1. Luo Supabase-projekti

1. Mene [supabase.com](https://supabase.com) → luo ilmainen projekti
2. **SQL Editor** → aja tiedosto `sql/schema.sql` kokonaan
3. Kopioi talteen:
   - **Project URL** (Settings → API → Project URL)
   - **anon public** -avain (Settings → API → Project API keys)

### 2. Aseta Supabase Magic Link

1. Supabase → **Authentication** → **Providers** → **Email**
2. Varmista että "Enable Email provider" on päällä
3. Voit halutessasi ottaa pois käytöstä "Confirm email" (magic link hoitaa vahvistuksen)

### 3. Konfiguroi sovellus

Avaa `js/app.js` ja vaihda rivit:

```js
const SUPABASE_URL  = 'SUPABASE_URL_HERE';
const SUPABASE_ANON = 'SUPABASE_ANON_KEY_HERE';
```

Esim.:
```js
const SUPABASE_URL  = 'https://xyzabcdef.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 4. Aseta GitHub Pages

1. Luo uusi GitHub-repo (voi olla yksityinen tai julkinen)
2. Push koodi `main`-branchiin
3. GitHub → **Settings** → **Pages**
   - Source: **GitHub Actions**
4. GitHub → **Settings** → **Secrets and variables** → **Actions** (ei tarvita, avaimet ovat julkisia anon-avaimia)
5. Ensimmäinen push käynnistää automaattisen deployn

### 5. Aseta Supabase Redirect URL

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs**

Lisää GitHub Pages -osoitteesi, esim.:
```
https://kayttajatunnus.github.io/mm2026-veikkaus/
```

### 6. Tulosten syöttö (admin)

Tulokset syötetään suoraan Supabaseen SQL Editorilla tai Table Editorilla:

```sql
-- Esimerkki: Meksiko voitti 2-1 (normaali aika)
UPDATE matches SET result = '1', home_goals = 2, away_goals = 1, extra_time = false
WHERE id = 'A1';

-- Esimerkki: jatkoajalla ratkaistu peli
UPDATE matches SET result = '2', home_goals = 1, away_goals = 2, extra_time = true
WHERE id = 'B1';
```

## Tiedostorakenne

```
mm2026-veikkaus/
├── index.html          # Pääsivu
├── css/
│   └── style.css       # Tyylitiedosto
├── js/
│   ├── app.js          # Pääsovellus + Supabase-integraatio
│   └── matches.js      # Otteludata + pistelaskulogiikka
├── sql/
│   └── schema.sql      # Supabase-tietokannan rakenne
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Actions deploy
```

## Lisäominaisuuksia myöhemmin

- Pudotuspelien veikkaus
- Turnausvoittajan veikkaus
- Sähköposti-ilmoitukset kun kohde sulkeutuu
- Tilastot omista veikkauksista
