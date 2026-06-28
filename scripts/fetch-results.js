// fetch-results.js
// Hakee MM 2026 tulokset ESPN:stä. Ajetaan GitHub Actionsista 2 min välein.

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
  'turkiye':                      'turkey',
};

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
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

function toDateStr(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
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

async function insertMatch(id, groupName, home, away, kickoff) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
    method: 'POST',
    headers: {
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify({ id, group_name: groupName, home, away, kickoff, tbd: false }),
  });
  if (!res.ok) throw new Error(`Supabase-inserttivirhe (${id}): ${res.status} ${await res.text()}`);
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
    if (typeText.startsWith('goal'))         type = 'goal';
    else if (typeText === 'own goal')        type = 'owngoal';
    else if (typeText.includes('penalty'))   type = 'penalty';
    else if (typeText === 'yellow card')     type = 'yellow';
    else if (typeText.includes('red'))       type = 'red';
    if (!type) continue;
    const player = d.athletesInvolved?.[0]?.displayName || '';
    const clock  = d.clock?.displayValue || '';
    const min    = clock.split(':')[0] || '';
    const team   = d.team?.id === homeTeamId ? 'home' : 'away';
    events.push({ type, min, player, team });
  }
  return events.sort((a, b) => parseInt(a.min || 0) - parseInt(b.min || 0));
}

// Määrittää jatkopelieron kierroksen ESPN-tapahtuman päivämäärän perusteella
function knockoutRound(dateStr) {
  const t = new Date(dateStr).getTime();
  const d = (y, m, day) => Date.UTC(y, m - 1, day);
  if (t >= d(2026,6,29) && t < d(2026,7,5))  return 'R32';
  if (t >= d(2026,7,6)  && t < d(2026,7,10)) return 'R16';
  if (t >= d(2026,7,11) && t < d(2026,7,13)) return 'QF';
  if (t >= d(2026,7,15) && t < d(2026,7,17)) return 'SF';
  if (t >= d(2026,7,18) && t < d(2026,7,19)) return '3P';
  if (t >= d(2026,7,19))                      return 'FIN';
  return null;
}

// Täyttää TBD-jatkopelipaikat ESPN:stä.
// - Matchataan lähimpään TBD-paikkaan (±48h) ja päivitetään kickoff oikeaksi
// - Jos sopivaa paikkaa ei löydy, luodaan uusi rivi automaattisesti
async function updateKnockoutMatches(tbdMatches, events, sbIndex, sbMatches) {
  const slots = tbdMatches
    .filter(m => m.home === 'TBD')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  let updated = 0;

  for (const event of events.sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeFi = toFi(homeComp.team?.displayName);
    const awayFi = toFi(awayComp.team?.displayName);
    if (!homeFi || !awayFi) continue;

    if (sbIndex.has(`${homeFi}|${awayFi}`)) continue;

    const espnTime = new Date(event.date).getTime();
    const round = knockoutRound(event.date);
    if (!round) continue;

    const slotIdx = slots.findIndex(m =>
      Math.abs(new Date(m.kickoff).getTime() - espnTime) < 48 * 36e5
    );

    if (slotIdx !== -1) {
      const slot = slots[slotIdx];
      // Päivitä joukkueet + oikea kickoff ESPN:stä
      console.log(`  📋 ${slot.id}: TBD → ${homeFi} – ${awayFi} (${event.date})`);
      await patchMatch(slot.id, { home: homeFi, away: awayFi, tbd: false, kickoff: event.date });
      slot.home = homeFi;
      slot.away = awayFi;
      slot.tbd = false;
      sbIndex.set(`${homeFi}|${awayFi}`, slot);
      slots.splice(slotIdx, 1);
    } else {
      // Ei sopivaa paikkaa → luo uusi rivi
      const existing = sbMatches.filter(m => m.group_name === round).length;
      const newId = `${round}_${String(existing + 1).padStart(2, '0')}`;
      console.log(`  ➕ Uusi rivi ${newId}: ${homeFi} – ${awayFi} (${event.date})`);
      await insertMatch(newId, round, homeFi, awayFi, event.date);
      const newMatch = { id: newId, home: homeFi, away: awayFi, group_name: round, kickoff: event.date, tbd: false };
      sbIndex.set(`${homeFi}|${awayFi}`, newMatch);
      sbMatches.push(newMatch);
    }
    updated++;
  }

  if (updated) console.log(`Jatkopeliparit päivitetty: ${updated}`);
}

async function main() {
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY puuttuu'); process.exit(1); }

  const sbMatches = await fetchSupabaseMatches();
  const now = Date.now();

  // Aktiiviset: käynnissä tai alkaa pian (3h taaksepäin, 5min eteenpäin)
  const activeMatches = sbMatches.filter(m =>
    !m.result && !m.tbd &&
    new Date(m.kickoff).getTime() > now - 3 * 36e5 &&
    new Date(m.kickoff).getTime() <= now + 5 * 60 * 1000
  );

  // Kaikki täyttämättömät TBD-paikat
  const tbdMatches = sbMatches.filter(m => m.tbd);

  if (!activeMatches.length && !tbdMatches.length) {
    console.log('Ei käynnissä olevia otteluita tai täytettäviä jatkopelipareja — ohitetaan.');
    process.exit(0);
  }

  // Haetaan ESPN:stä: perusjaksolta + ±1 päivä TBD-kickoffeista (aikavyöhyke-epävarmuus)
  const standardDates = [-1, 0, 1, 2, 3, 4, 5].map(i =>
    toDateStr(new Date(now + i * 864e5))
  );
  const tbdDates = tbdMatches.flatMap(m => {
    const t = new Date(m.kickoff).getTime();
    return [-1, 0, 1].map(i => toDateStr(new Date(t + i * 864e5)));
  });
  const allDates = [...new Set([...standardDates, ...tbdDates])];

  const events = (await Promise.all(allDates.map(fetchEspn))).flat();
  console.log(`ESPN: ${events.length} ottelua (${allDates.length} päivää)`);

  // sbIndex vain tunnetuista (ei-TBD) otteluista
  const sbIndex = new Map(
    sbMatches.filter(m => !m.tbd).map(m => [`${m.home}|${m.away}`, m])
  );

  // Vaihe 1: Täytä TBD-jatkopelipaikat
  if (tbdMatches.length) {
    await updateKnockoutMatches(tbdMatches, events, sbIndex, sbMatches);
  }

  // Vaihe 2: Päivitä käynnissä olevien ja päättyneiden otteluiden tulokset
  if (!activeMatches.length) {
    console.log('Ei käynnissä olevia otteluita — valmis.');
    process.exit(0);
  }

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
      await patchMatch(sbM.id, { result, home_goals: hg, away_goals: ag, live_clock: null, live_period: null, live_events: null });
      updatedResults++;
    } else {
      const desc = (event.status?.type?.description || '').toLowerCase();
      const isHT = desc.includes('halftime') || desc.includes('half time');
      const liveClock  = isHT ? 'HT' : (event.status?.displayClock || '');
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
