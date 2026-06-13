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

function parseLiveEvents(comp, homeTeamId) {
  const details = comp.details || [];
  const events = [];
  for (const d of details) {
    const typeText = (d.type?.text || '').toLowerCase();
    let type = null;
    if (typeText === 'goal')                          type = 'goal';
    else if (typeText === 'own goal')                 type = 'owngoal';
    else if (typeText === 'penalty goal')             type = 'penalty';
    else if (typeText === 'yellow card')              type = 'yellow';
    else if (typeText.includes('red'))                type = 'red';
    if (!type) continue;
    const player = d.athletesInvolved?.[0]?.displayName || '';
    const clock  = d.clock?.displayValue || '';
    const min    = clock.split(':')[0] || '';
    const team   = d.team?.id === homeTeamId ? 'home' : 'away';
    events.push({ type, min, player, team });
  }
  return events.sort((a, b) => parseInt(a.min || 0) - parseInt(b.min || 0));
}

async function hasActiveMatches() {
  const twoHoursAgo = new Date(Date.now() - 3 * 36e5).toISOString();
  const inFive      = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?kickoff=gte.${twoHoursAgo}&kickoff=lte.${inFive}&result=is.null&tbd=is.false&select=id&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }

  if (!await hasActiveMatches()) {
    console.log('Ei käynnissä olevia tai alkavia otteluita — ohitetaan.');
    process.exit(0);
  }

  const sbMatches = await fetchSupabaseMatches();
  const sbIndex = new Map(sbMatches.map(m => [`${m.home}|${m.away}`, m]));

  const dates = getRelevantDates();
  const events = (await Promise.all(dates.map(fetchEspn))).flat();
  console.log(`ESPN: ${events.length} ottelua (${dates.join(', ')})`);

  let updatedResults = 0;

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

    const completed  = event.status?.type?.completed;
    const inProgress = event.status?.type?.state === 'in';
    if (!completed && !inProgress) continue;

    const hg = parseInt(homeComp.score) || 0;
    const ag = parseInt(awayComp.score) || 0;

    if (completed) {
      if (sbM.result !== null && sbM.home_goals === hg && sbM.away_goals === ag) continue;
      const result = hg > ag ? '1' : ag > hg ? '2' : 'x';
      console.log(`  ✓ ${homeFi} ${hg}–${ag} ${awayFi} → ${result}`);
      await patchMatch(sbM.id, { result, home_goals: hg, away_goals: ag });
      updatedResults++;
    } else {
      const desc = (event.status?.type?.description || '').toLowerCase();
      const isHT = desc.includes('halftime') || desc.includes('half time');
      const liveClock = isHT ? 'HT' : (event.status?.displayClock || '');
      const livePeriod = event.status?.period || 1;
      const liveEvents = parseLiveEvents(comp, homeComp.team?.id);
      if (sbM.home_goals === hg && sbM.away_goals === ag && sbM.live_clock === liveClock) continue;
      console.log(`  ⚽ ${homeFi} ${hg}–${ag} ${awayFi} (${liveClock || livePeriod + '. jakso'}, ${liveEvents.length} tapahtumaa)`);
      await patchMatch(sbM.id, { home_goals: hg, away_goals: ag, live_clock: liveClock, live_period: livePeriod, live_events: liveEvents.length ? liveEvents : null });
    }
  }

  console.log(`Valmis. Tuloksia päivitetty: ${updatedResults}`);
}

main().catch(err => { console.error(err); process.exit(1); });
