// fetch-odds.js
// Hakee MM 2026 kertoimet the-odds-api.com:sta ja päivittää Supabaseen.
// Ajetaan GitHub Actionsin kautta 4h välein.

const SUPABASE_URL = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

// The Odds API sport key FIFA World Cup
const SPORT = 'soccer_fifa_world_cup';

// Suomenkielinen nimi → englanninkielinen
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
  'USA':                  'USA',
  'Paraguay':             'Paraguay',
};

// Lisäsynonyymit joita The Odds API saattaa käyttää
const ALIASES = {
  'czechia':          'czech republic',
  'united states':    'usa',
  'ivory coast':      'ivory coast',
  "cote d'ivoire":    'ivory coast',
  'democratic republic of congo': 'dr congo',
  'congo dr':         'dr congo',
};

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Rakenna EN (normalisoitu) → FI-hakemisto
const EN_TO_FI = {};
for (const [fi, en] of Object.entries(TEAM_MAP)) {
  EN_TO_FI[normalize(en)] = fi;
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const fi = EN_TO_FI[normalize(canonical)];
  if (fi) EN_TO_FI[normalize(alias)] = fi;
}

function toFi(apiName) {
  return EN_TO_FI[normalize(apiName)];
}

// Laske keskikerroin usean kirjanpitäjän yli
function avgOdds(bookmakers, teamName, type) {
  const prices = [];
  for (const bm of bookmakers) {
    const market = bm.markets?.find(m => m.key === 'h2h');
    if (!market) continue;
    let outcome;
    if (type === 'draw') {
      outcome = market.outcomes.find(o => o.name === 'Draw');
    } else {
      outcome = market.outcomes.find(o => normalize(o.name) === normalize(teamName));
    }
    if (outcome?.price) prices.push(outcome.price);
  }
  if (!prices.length) return null;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return Math.round(avg * 100) / 100;
}

async function fetchOddsApi() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
  const res = await fetch(url);
  if (res.status === 404) {
    console.log('Laji ei ole vielä aktiivinen The Odds API:ssa — hypätään yli');
    return [];
  }
  if (!res.ok) throw new Error(`Odds API -virhe: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchSupabaseMatches() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase-lukuvirhe: ${res.status}`);
  return res.json();
}

async function updateMatchOdds(matchId, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase-päivitysvirhe (${matchId}): ${res.status} ${await res.text()}`);
}

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }
  if (!ODDS_API_KEY)  { console.error('ODDS_API_KEY puuttuu'); process.exit(1); }

  console.log('Haetaan kertoimet The Odds API:sta...');
  const events = await fetchOddsApi();
  console.log(`Saatiin ${events.length} ottelua`);
  if (!events.length) return;

  console.log('Haetaan otteludata Supabasesta...');
  const sbMatches = await fetchSupabaseMatches();

  // Indeksi: "homeFi|awayFi" → match
  const sbIndex = new Map();
  for (const m of sbMatches) {
    sbIndex.set(`${m.home}|${m.away}`, m);
  }

  let updated = 0;
  for (const event of events) {
    const homeFi = toFi(event.home_team);
    const awayFi = toFi(event.away_team);
    if (!homeFi || !awayFi) {
      console.warn(`  Tuntematon joukkue: "${event.home_team}" tai "${event.away_team}"`);
      continue;
    }

    const sbM = sbIndex.get(`${homeFi}|${awayFi}`);
    if (!sbM) { console.warn(`  Ei vastaavuutta: ${homeFi} – ${awayFi}`); continue; }

    const homeOdds = avgOdds(event.bookmakers, event.home_team, 'home');
    const drawOdds = avgOdds(event.bookmakers, null,             'draw');
    const awayOdds = avgOdds(event.bookmakers, event.away_team,  'away');

    if (!homeOdds && !drawOdds && !awayOdds) continue;

    console.log(`  ${homeFi} – ${awayFi}: ${homeOdds} / ${drawOdds} / ${awayOdds}`);
    await updateMatchOdds(sbM.id, {
      odds_home:       homeOdds,
      odds_draw:       drawOdds,
      odds_away:       awayOdds,
      odds_updated_at: new Date().toISOString(),
    });
    updated++;
  }

  console.log(`\nValmis. Päivitetty: ${updated} ottelua`);
}

main().catch(err => { console.error(err); process.exit(1); });
