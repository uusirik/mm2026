// fetch-results.js
// Hakee MM 2026 tulokset ESPN:stä. Ajetaan GitHub Actionsista 5 min välein.

const SUPABASE_URL = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function mlToDecimal(ml) {
  if (ml == null) return null;
  const n = Number(ml);
  if (isNaN(n) || n === 0) return null;
  const dec = n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  return Math.round(dec * 100) / 100;
}

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

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }

  const sbMatches = await fetchSupabaseMatches();
  const sbIndex = new Map(sbMatches.map(m => [`${m.home}|${m.away}`, m]));

  const dates = getRelevantDates();
  const events = (await Promise.all(dates.map(fetchEspn))).flat();
  console.log(`ESPN: ${events.length} ottelua (${dates.join(', ')})`);

  let updatedResults = 0;
  let updatedOdds    = 0;

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

    // ESPN-kertoimet (DraftKings, tulee lähempänä ottelua)
    if (!sbM.result) {
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
          console.log(`  Kertoimet ${homeFi}: 1:${homeOdds??'–'} X:${drawOdds??'–'} 2:${awayOdds??'–'}`);
          updatedOdds++;
        }
      }
    }

    // Tulos (vain kun ottelu on päättynyt)
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
