// fetch-results.js
// Hakee MM 2026 tulokset ESPN:stä ja kertoimet Veikkauksen EBET-APIsta.
// Ajetaan GitHub Actionsista 5 min välein.

const SUPABASE_URL = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VEIKKAUS_USER = process.env.VEIKKAUS_USERNAME;
const VEIKKAUS_PASS = process.env.VEIKKAUS_PASSWORD;

const VEIKKAUS_API = 'https://www.veikkaus.fi/api';
const VEIKKAUS_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-ESA-API-Key': 'ROBOT',
};

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Suomenkielinen nimi → englanninkielinen (ESPN-muoto)
const TEAM_MAP = {
  'Meksiko':              'Mexico',
  'Etelä-Afrikka':        'South Africa',
  'Etelä-Korea':          'South Korea',
  'Tšekki':               'Czech Republic',
  'Kanada':               'Canada',
  'Bosnia & Hertsegovina':'Bosnia',
  'Qatar':                'Qatar',
  'Sveitsi':              'Switzerland',
  'Brasilia':             'Brazil',
  'Marokko':              'Morocco',
  'Haiti':                'Haiti',
  'Skotlanti':            'Scotland',
  'Australia':            'Australia',
  'Turkki':               'Turkey',
  'Saksa':                'Germany',
  'Curaçao':              'Curacao',
  'Alankomaat':           'Netherlands',
  'Japani':               'Japan',
  'Norsunluurannikko':    'Ivory Coast',
  'Ecuador':              'Ecuador',
  'Ruotsi':               'Sweden',
  'Tunisia':              'Tunisia',
  'Espanja':              'Spain',
  'Kap Verde':            'Cape Verde',
  'Belgia':               'Belgium',
  'Egypti':               'Egypt',
  'Saudi-Arabia':         'Saudi Arabia',
  'Uruguay':              'Uruguay',
  'Iran':                 'Iran',
  'Uusi-Seelanti':        'New Zealand',
  'Ranska':               'France',
  'Senegal':              'Senegal',
  'Irak':                 'Iraq',
  'Norja':                'Norway',
  'Argentiina':           'Argentina',
  'Algeria':              'Algeria',
  'Itävalta':             'Austria',
  'Jordania':             'Jordan',
  'Portugali':            'Portugal',
  'Kongon DT':            'DR Congo',
  'Englanti':             'England',
  'Kroatia':              'Croatia',
  'Ghana':                'Ghana',
  'Panama':               'Panama',
  'Uzbekistan':           'Uzbekistan',
  'Kolumbia':             'Colombia',
  'USA':                  'United States',
  'Paraguay':             'Paraguay',
};

// Lisäsynonyymit ESPN:n nimille
const ALIASES = {
  'usa':                          'unitedstates',
  'unitedstatesofamerica':        'unitedstates',
  'czechia':                      'czechrepublic',
  'ivorycoast':                   'ivorycoast',
  "cotedivoire":                  'ivorycoast',
  'democraticrepublicofcongo':    'drcongo',
  'congodr':                      'drcongo',
  'republicofcongo':              'drcongo',
  'bosnia':                       'bosnia',
  'bosniaandherzegovina':         'bosnia',
  'bosniaherzegovina':            'bosnia',
};

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Rakenna EN (normalisoitu) → FI-hakemisto
const EN_TO_FI = {};
for (const [fi, en] of Object.entries(TEAM_MAP)) {
  EN_TO_FI[normalize(en)] = fi;
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  if (!EN_TO_FI[alias]) EN_TO_FI[alias] = EN_TO_FI[canonical];
}

function toFi(espnName) {
  const key = normalize(espnName);
  return EN_TO_FI[key] || EN_TO_FI[ALIASES[key]];
}

// Muunna amerikkalainen kerroin desimaaliksi
function mlToDecimal(ml) {
  if (ml == null) return null;
  const n = Number(ml);
  if (isNaN(n) || n === 0) return null;
  const dec = n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  return Math.round(dec * 100) / 100;
}

// Palauttaa eilen + tänään + seuraavat 5 päivää YYYYMMDD-muodossa (UTC)
// Eilinen = tulokset, tulevat = kertoimet etukäteen
function getRelevantDates() {
  const now = new Date();
  return [-1, 0, 1, 2, 3, 4, 5].map(i => {
    const d = new Date(now.getTime() + i * 864e5);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });
}

async function fetchEspn(dateStr) {
  const res = await fetch(`${ESPN_BASE}?dates=${dateStr}`);
  if (!res.ok) throw new Error(`ESPN-virhe: ${res.status}`);
  return (await res.json()).events || [];
}

async function fetchSupabaseMatches() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase-lukuvirhe: ${res.status}`);
  return res.json();
}

async function patchMatch(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase-päivitysvirhe (${id}): ${res.status} ${await res.text()}`);
}

// ── Veikkaus EBET-kertoimet ───────────────────────────────────────────────────

async function veikkausLogin() {
  const res = await fetch(`${VEIKKAUS_API}/bff/v1/sessions`, {
    method: 'POST',
    headers: VEIKKAUS_HEADERS,
    body: JSON.stringify({ type: 'STANDARD_LOGIN', login: VEIKKAUS_USER, password: VEIKKAUS_PASS }),
  });
  if (!res.ok) { console.warn(`Veikkaus login epäonnistui: ${res.status}`); return null; }
  // Kerää session-cookiet
  const cookies = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')].filter(Boolean))
    .map(c => c.split(';')[0]).join('; ');
  console.log('Veikkaus: kirjautuminen onnistui');
  return cookies;
}

async function fetchVeikkausOdds(cookie) {
  // Debug: listaa saatavilla olevat pelityypit
  const gamesRes = await fetch(`${VEIKKAUS_API}/sport-open-games/v1/games`, {
    headers: { ...VEIKKAUS_HEADERS, Cookie: cookie },
  });
  console.log(`Veikkaus /games status: ${gamesRes.status}`);
  if (gamesRes.ok) {
    const gamesText = await gamesRes.text();
    console.log('Veikkaus /games:', gamesText.slice(0, 800));
  }

  const res = await fetch(`${VEIKKAUS_API}/sport-open-games/v1/games/EBET/draws`, {
    headers: { ...VEIKKAUS_HEADERS, Cookie: cookie },
  });
  console.log(`Veikkaus draws status: ${res.status}`);
  if (res.status === 204) { console.warn('Veikkaus: 204 ei sisältöä'); return []; }
  if (!res.ok) { console.warn(`Veikkaus: HTTP-virhe ${res.status}`); return []; }
  const text = await res.text();
  console.log('Veikkaus raw (500 merkkiä):', text.slice(0, 500));
  const data = JSON.parse(text);
  // Pura kaikki 1X2-rivit
  const games = [];
  for (const draw of (data.draws ?? [])) {
    for (const row of (draw.rows ?? [])) {
      if (row.type !== '1X2') continue;
      const comps = row.competitors ?? [];
      const home = comps.find(c => c.id === '1');
      const away = comps.find(c => c.id === '2');
      const draw_ = comps.find(c => c.id === '3');
      if (!home || !away) continue;
      games.push({
        home: home.name,
        away: away.name,
        odds_home: home.odds?.odds ?? null,
        odds_draw: draw_?.odds?.odds ?? null,
        odds_away: away.odds?.odds ?? null,
      });
    }
  }
  return games;
}

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }

  const sbMatches = await fetchSupabaseMatches();
  const sbIndex = new Map(sbMatches.map(m => [`${m.home}|${m.away}`, m]));

  const dates = getRelevantDates();
  const events = (await Promise.all(dates.map(fetchEspn))).flat();
  console.log(`ESPN: ${events.length} ottelua (${dates.join(', ')})`);

  let updatedResults = 0;
  let updatedOdds    = 0;

  // ── Veikkaus-kertoimet (1X2 desimaalit) ────────────────────────────────────
  if (VEIKKAUS_USER && VEIKKAUS_PASS) {
    try {
      const cookie = await veikkausLogin();
      if (cookie) {
        const vGames = await fetchVeikkausOdds(cookie);
        console.log(`Veikkaus: ${vGames.length} 1X2-peliä`);
        for (const g of vGames) {
          const sbM = sbIndex.get(`${g.home}|${g.away}`);
          if (!sbM || sbM.result) continue;
          if (g.odds_home || g.odds_draw || g.odds_away) {
            await patchMatch(sbM.id, {
              odds_home: g.odds_home, odds_draw: g.odds_draw, odds_away: g.odds_away,
              odds_updated_at: new Date().toISOString(),
            });
            console.log(`  ✓ ${g.home}: 1:${g.odds_home} X:${g.odds_draw} 2:${g.odds_away}`);
            updatedOdds++;
          }
        }
      }
    } catch (e) {
      console.warn('Veikkaus-kertoimet epäonnistuivat:', e.message);
    }
  }

  // ── ESPN-tulokset ──────────────────────────────────────────────────────────
  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeFi = toFi(homeComp.team?.displayName);
    const awayFi = toFi(awayComp.team?.displayName);
    if (!homeFi || !awayFi) {
      console.warn(`  Tuntematon joukkue: "${homeComp.team?.displayName}" tai "${awayComp.team?.displayName}"`);
      continue;
    }

    const sbM = sbIndex.get(`${homeFi}|${awayFi}`);
    if (!sbM) { console.warn(`  Ei vastaavuutta: ${homeFi} – ${awayFi}`); continue; }

    // ESPN draw-kerroin varmuuskopiona jos Veikkaus ei ole käytössä
    if (!VEIKKAUS_USER && !sbM.result) {
      const oddsArr = comp.odds;
      if (oddsArr?.length) {
        const o = oddsArr[0];
        const homeOdds = mlToDecimal(o.homeTeamOdds?.moneyLine);
        const awayOdds = mlToDecimal(o.awayTeamOdds?.moneyLine);
        const drawOdds = mlToDecimal(o.drawOdds?.moneyLine);
        if (homeOdds || drawOdds || awayOdds) {
          await patchMatch(sbM.id, {
            odds_home: homeOdds, odds_draw: drawOdds, odds_away: awayOdds,
            odds_updated_at: new Date().toISOString(),
          });
          updatedOdds++;
        }
      }
    }

    // ── Tulos (vain kun ottelu on päättynyt) ──────────────────────────────
    const completed = event.status?.type?.completed;
    if (!completed) continue;

    const hg = parseInt(homeComp.score) || 0;
    const ag = parseInt(awayComp.score) || 0;

    if (sbM.result !== null && sbM.home_goals === hg && sbM.away_goals === ag) continue;

    const result = hg > ag ? '1' : ag > hg ? '2' : 'x';
    console.log(`  ✓ ${homeFi} ${hg}–${ag} ${awayFi} → ${result}`);
    await patchMatch(sbM.id, { result, home_goals: hg, away_goals: ag });
    updatedResults++;
  }

  console.log(`Valmis. Tuloksia päivitetty: ${updatedResults}, kertoimia: ${updatedOdds}`);
}

main().catch(err => { console.error(err); process.exit(1); });
