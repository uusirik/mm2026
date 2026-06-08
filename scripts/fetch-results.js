// fetch-results.js
// Hakee MM 2026 otteluiden tulokset api-football.com:sta ja päivittää Supabaseen.
// Ajetaan GitHub Actionsin kautta 30 min välein.

const SUPABASE_URL = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// FIFA World Cup 2026 — api-football.com league id
const LEAGUE_ID = 1;
const SEASON    = 2026;

// Suomenkielinen nimi → englanninkielinen (api-football.com)
const TEAM_MAP = {
  'Meksiko':              'Mexico',
  'Etelä-Afrikka':        'South Africa',
  'Etelä-Korea':          'South Korea',
  'Tšekki':               'Czech Republic',
  'Kanada':               'Canada',
  'Bosnia & Hertsegovina':'Bosnia',
  'Bosn. & Hertseg.':     'Bosnia',
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
  'Norsunluurannikko':    "Ivory Coast",
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
};

// Päättymistatukset api-football.com:ssa
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
// Statukset jotka tarkoittavat jatkoaikaa / rangaistuksia
const EXTRA_TIME_STATUSES = new Set(['AET', 'PEN']);

async function fetchFixtures() {
  const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${LEAGUE_ID}&season=${SEASON}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key':  RAPIDAPI_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
  });
  if (!res.ok) throw new Error(`API-virhe: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.response || [];
}

async function fetchSupabaseMatches() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=*`, {
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase-lukuvirhe: ${res.status}`);
  return res.json();
}

async function updateMatch(matchId, patch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`,
    {
      method:  'PATCH',
      headers: {
        apikey:          SUPABASE_KEY,
        Authorization:   `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        Prefer:          'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase-päivitysvirhe (${matchId}): ${res.status} ${txt}`);
  }
}

function normalize(name) {
  return (name || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Rakenna hakemisto englanninkielinen nimi → joukkueen suomenkielinen key
const EN_TO_FI = {};
for (const [fi, en] of Object.entries(TEAM_MAP)) {
  EN_TO_FI[normalize(en)] = fi;
}

function matchTeam(apiName) {
  return EN_TO_FI[normalize(apiName)];
}

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }
  if (!RAPIDAPI_KEY) { console.error('RAPIDAPI_KEY puuttuu'); process.exit(1); }

  console.log('Haetaan otteludata Supabasesta...');
  const sbMatches = await fetchSupabaseMatches();

  // Indeksoi kickoff-ajan (ISO-minuutti) ja kotijoukkueen perusteella
  const sbIndex = new Map();
  for (const m of sbMatches) {
    const homeEn = TEAM_MAP[m.home];
    const awayEn = TEAM_MAP[m.away];
    if (homeEn && awayEn) {
      const key = `${normalize(homeEn)}|${normalize(awayEn)}`;
      sbIndex.set(key, m);
    }
  }

  console.log(`Haetaan tulokset api-football.com:sta (league=${LEAGUE_ID}, season=${SEASON})...`);
  const fixtures = await fetchFixtures();
  console.log(`Saatiin ${fixtures.length} ottelua API:sta`);

  let updated = 0;
  let skipped = 0;

  for (const f of fixtures) {
    const status = f.fixture?.status?.short;
    if (!FINISHED_STATUSES.has(status)) { skipped++; continue; }

    const homeApi = f.teams?.home?.name;
    const awayApi = f.teams?.away?.name;
    const homeFi  = matchTeam(homeApi);
    const awayFi  = matchTeam(awayApi);

    if (!homeFi || !awayFi) {
      console.warn(`  Tuntematon joukkue: "${homeApi}" tai "${awayApi}" — ohitetaan`);
      continue;
    }

    const key = `${normalize(TEAM_MAP[homeFi])}|${normalize(TEAM_MAP[awayFi])}`;
    const sbM  = sbIndex.get(key);
    if (!sbM) { console.warn(`  Ei vastaavuutta: ${homeFi} – ${awayFi}`); continue; }

    // Jos tulos on jo oikein, ei tarvitse päivittää
    const hg = f.goals?.home ?? 0;
    const ag = f.goals?.away ?? 0;
    if (sbM.result !== null && sbM.home_goals === hg && sbM.away_goals === ag) {
      skipped++;
      continue;
    }

    const result = hg > ag ? '1' : ag > hg ? '2' : 'x';
    const extraTime = EXTRA_TIME_STATUSES.has(status);

    console.log(`  Päivitetään ${sbM.id}: ${homeFi} ${hg}–${ag} ${awayFi} (${result}${extraTime ? ', ja' : ''})`);
    await updateMatch(sbM.id, {
      result,
      home_goals:  hg,
      away_goals:  ag,
      extra_time:  extraTime,
    });
    updated++;
  }

  console.log(`\nValmis. Päivitetty: ${updated}, ohitettu: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
