// app.js — pääsovellus
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { MATCHES, calcPoints, isLocked, fmtDate, matchResult } from './matches.js';

// ─── Konfiguraatio ───────────────────────────────────────────────────────────
// Vaihda nämä omilla Supabase-projektin arvoilla!
const SUPABASE_URL  = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b21neGJ4Y3lycmpjd2dqZ3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTEzNTgsImV4cCI6MjA5NjQ2NzM1OH0.oMMNWvwPcSbqXSSoVnBh1BwqFoPT_-rfra5A6pIrsgo';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Sovelluksen tila ─────────────────────────────────────────────────────────
let state = {
  view: 'bets',       // 'bets' | 'leaderboard' | 'others' | 'news'
  filter: 'all',      // 'all' | 'open' | 'locked' | 'bet' | 'unbet'
  user: null,
  profile: null,
  bets: {},           // { match_id: { prediction, home_goals, away_goals } }
  matches: [],        // Supabasesta haettu (sisältää result-kentän)
  leaderboard: [],
  news: null,         // { items: [], fetchedAt: 0 }
  saveQueue: {},
  saveTimers: {},
};

// ─── Joukkueiden liput (flagcdn.com kuvat — toimii kaikilla alustoilla) ───────
const TEAM_CODES = {
  'Meksiko':'mx','Etelä-Afrikka':'za','Etelä-Korea':'kr','Tšekki':'cz',
  'Kanada':'ca','Bosnia & Hertsegovina':'ba','Qatar':'qa','Sveitsi':'ch',
  'Brasilia':'br','Marokko':'ma','Haiti':'ht','Skotlanti':'gb-sct',
  'Australia':'au','Turkki':'tr','Saksa':'de','Curaçao':'cw',
  'Alankomaat':'nl','Japani':'jp','Norsunluurannikko':'ci','Ecuador':'ec',
  'Ruotsi':'se','Tunisia':'tn','Espanja':'es','Kap Verde':'cv',
  'Belgia':'be','Egypti':'eg','Saudi-Arabia':'sa','Uruguay':'uy',
  'Iran':'ir','Uusi-Seelanti':'nz','Ranska':'fr','Senegal':'sn',
  'Irak':'iq','Norja':'no','Argentiina':'ar','Algeria':'dz',
  'Itävalta':'at','Jordania':'jo','Portugali':'pt','Kongon DT':'cd',
  'Englanti':'gb-eng','Kroatia':'hr','Ghana':'gh','Panama':'pa',
  'Uzbekistan':'uz','Kolumbia':'co','USA':'us','Paraguay':'py',
};

function flagImg(team, size = 15) {
  const code = TEAM_CODES[team];
  if (!code) return '';
  return `<span class="fi fi-${code}" style="font-size:${size}px;border-radius:2px;vertical-align:middle" title="${team}"></span>`;
}

// ─── Supabase-apurit ──────────────────────────────────────────────────────────
async function loadMatches() {
  const { data } = await sb.from('matches').select('*').order('kickoff');
  if (data) state.matches = data;
}

async function loadBets() {
  if (!state.user) return;
  const { data } = await sb
    .from('bets')
    .select('*')
    .eq('user_id', state.user.id);
  if (data) {
    state.bets = {};
    data.forEach(b => {
      state.bets[b.match_id] = {
        prediction: b.prediction,
        home_goals: b.home_goals,
        away_goals: b.away_goals,
      };
    });
  }
}

async function loadLeaderboard() {
  const { data } = await sb.from('leaderboard').select('*');
  if (data) state.leaderboard = data;
}

async function saveBet(matchId) {
  const bet = state.bets[matchId];
  if (!bet || !state.user) return;

  const match = state.matches.find(m => m.id === matchId) ||
                MATCHES.find(m => m.id === matchId);
  if (isLocked(match)) return;

  const { error } = await sb.from('bets').upsert({
    user_id:    state.user.id,
    match_id:   matchId,
    prediction: bet.prediction,
    home_goals: bet.home_goals,
    away_goals: bet.away_goals,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,match_id' });

  if (error) {
    toast('Tallennusvirhe — yritä uudelleen', true);
  }
}

function debounceSave(matchId) {
  clearTimeout(state.saveTimers[matchId]);
  state.saveTimers[matchId] = setTimeout(() => saveBet(matchId), 800);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// SHA-256 tiiviste kutsukoodeista — itse koodi on vain URL-fragmentissa (#...)
const INVITE_HASHES = new Set([
  '8b345f1b0e4072637dcbc1c0bca1996dc5b955ad8ddcb9de04728ee5ceec0230',
]);
const INVITE_KEY = 'mm2026_invited';
const LOCKOUT_KEY = 'mm2026_lockout';
const ATTEMPTS_KEY = 'mm2026_attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minuuttia

function shortName(full) {
  if (!full) return '?';
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function checkInvite() {
  if (localStorage.getItem(INVITE_KEY)) return true;
  const fragment = window.location.hash.slice(1);
  if (!fragment) return false;
  const hash = await sha256(fragment);
  if (INVITE_HASHES.has(hash)) {
    localStorage.setItem(INVITE_KEY, '1');
    history.replaceState(null, '', window.location.pathname);
    return true;
  }
  return false;
}

// Muodostaa Supabase-emailin nimestä — käyttäjä ei koskaan näe tätä
function nameToEmail(name) {
  const slug = name.toLowerCase()
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/å/g,'a')
    .replace(/\s+/g,'.').replace(/[^a-z0-9.]/g,'');
  return `${slug}@afry2026.test`;
}

// Salasana = kiinteä prefix + PIN (ei riipu kutsulinkkistä)
function makePassword(pin) {
  return `MM26vk-${pin}`;
}

async function signInOrRegister(displayName, pin) {
  const invited  = localStorage.getItem(INVITE_KEY);
  const email    = nameToEmail(displayName);
  const password = makePassword(pin);

  // Yritetään kirjautua — onnistuu paluukerroilla millä laitteella tahansa
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
  if (!signInErr) return null;

  // Kirjautuminen epäonnistui — jos ei kutsulinkkiä, kyse on väärästä PIN-koodista
  if (!invited) return new Error('Väärä nimi tai PIN-koodi');

  // Kutsulinkkiä löytyy — yritetään rekisteröidä uutena käyttäjänä
  const { error: signUpErr } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (signUpErr) {
    const m = signUpErr.message.toLowerCase();
    if (m.includes('already') || m.includes('registered'))
      return new Error('Väärä PIN-koodi tälle nimelle');
    return signUpErr;
  }

  // Kirjaudu sisään heti rekisteröinnin jälkeen
  const { error: signInAfterErr } = await sb.auth.signInWithPassword({ email, password });
  return signInAfterErr ?? null;
}

async function signOut() {
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  state.bets = {};
  renderAll();
}

// ─── Pisteet ──────────────────────────────────────────────────────────────────
function getMatchData(matchId) {
  return state.matches.find(m => m.id === matchId) ||
         MATCHES.find(m => m.id === matchId);
}

function getTotalPoints() {
  let total = 0;
  Object.entries(state.bets).forEach(([matchId, bet]) => {
    const m = getMatchData(matchId);
    if (m?.result) {
      const { points } = calcPoints(bet, m);
      if (points) total += points;
    }
  });
  return total;
}

// ─── Render ───────────────────────────────────────────────────────────────────
async function renderAll() {
  renderTopbar();

  const session = state.user;
  const root = document.getElementById('app-root');

  if (!session) {
    document.querySelector('.topbar').style.display = 'none';
    await renderAuth(root);
    return;
  }
  document.querySelector('.topbar').style.display = '';

  renderMainShell(root);
}

function renderTopbar() {
  const nav  = document.getElementById('topbar-nav');
  const usr  = document.getElementById('topbar-user');
  const bnav = document.getElementById('bottom-nav');
  if (!nav || !usr) return;

  if (!state.user) {
    nav.innerHTML  = '';
    usr.innerHTML  = '';
    if (bnav) bnav.innerHTML = '';
    return;
  }

  nav.innerHTML = `
    <div class="nav-tabs">
      <button class="nav-tab ${state.view==='bets'?'active':''}" onclick="app.setView('bets')">Veikkaukset</button>
      <button class="nav-tab ${state.view==='leaderboard'?'active':''}" onclick="app.setView('leaderboard')">Pisteet</button>
      <button class="nav-tab ${state.view==='others'?'active':''}" onclick="app.setView('others')">Vertailu</button>
      <button class="nav-tab ${state.view==='news'?'active':''}" onclick="app.setView('news')">Uutiset</button>
    </div>`;

  usr.innerHTML = `
    <button class="user-badge" onclick="app.signOut()">
      ${state.profile?.display_name || 'Käyttäjä'}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>`;

  if (bnav) {
    bnav.innerHTML = `
      <button class="bnav-tab ${state.view==='bets'?'active':''}" onclick="app.setView('bets')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="0.5" fill="currentColor"/><circle cx="3" cy="12" r="0.5" fill="currentColor"/><circle cx="3" cy="18" r="0.5" fill="currentColor"/></svg>
        <span>Veikkaukset</span>
      </button>
      <button class="bnav-tab ${state.view==='leaderboard'?'active':''}" onclick="app.setView('leaderboard')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
        <span>Pisteet</span>
      </button>
      <button class="bnav-tab ${state.view==='others'?'active':''}" onclick="app.setView('others')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Vertailu</span>
      </button>
      <button class="bnav-tab ${state.view==='news'?'active':''}" onclick="app.setView('news')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>
        <span>Uutiset</span>
      </button>`;
  }
}

async function renderAuth(root) {
  // Tallenna kutsukoodi URL-fragmentista jos se löytyy
  await checkInvite();

  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo-area">
        <span class="auth-logo-icon">⚽</span>
        <div class="auth-brand">MM 2026</div>
        <div class="auth-tagline">Veikkaus &nbsp;·&nbsp; Kirjaudu sisään</div>
      </div>
      <div class="auth-card" id="auth-card">
        <div class="auth-sub">Kirjaudu nimellä ja PIN-koodilla. Uusi käyttäjä? Tarvitset kutsulinkkin.</div>
        <div class="field">
          <label for="inp-name">Nimi</label>
          <input type="text" id="inp-name" placeholder="Etunimi Sukunimi" autocomplete="name" />
        </div>
        <div class="field">
          <label for="inp-pin">PIN-koodi (4 numeroa)</label>
          <input type="password" id="inp-pin" placeholder="••••" maxlength="4"
                 inputmode="numeric" pattern="[0-9]{4}" autocomplete="current-password" />
        </div>
        <button class="btn btn-primary btn-full" id="name-submit" onclick="app.submitName()">
          Kirjaudu →
        </button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('inp-name')?.focus(), 50);
  document.getElementById('inp-pin').addEventListener('keydown', e => {
    if (e.key === 'Enter') app.submitName();
  });
}


function renderMainShell(root) {
  root.innerHTML = `<div class="main-content" id="main-view"></div>`;
  renderView();
}

function renderView() {
  const el = document.getElementById('main-view');
  if (!el) return;
  if (state.view === 'bets')             renderBets(el);
  else if (state.view === 'leaderboard') renderLeaderboard(el);
  else if (state.view === 'others')      renderOthers(el);
  else if (state.view === 'news')        renderNews(el);
}

// ─── Seuraava ottelu -kortti ──────────────────────────────────────────────────
let _countdownTimer = null;

const GROUP_LABELS = {
  R32: 'Viimeinen 32', R16: 'Viimeinen 16',
  QF:  'Puolivälierät', SF: 'Välierät',
  '3P': 'Pronssiottelu', FIN: 'Finaali',
};

// Järjestys lohkoille renderöinnissä
const GROUP_ORDER = {
  A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, I:9, J:10, K:11, L:12,
  R32:13, R16:14, QF:15, SF:16, '3P':17, FIN:18,
};

function getLiveMatches() {
  const list = state.matches.length ? state.matches : MATCHES;
  return list.filter(m => !m.result && !m.tbd && isLocked(m));
}

function getNextUpcomingMatches() {
  const list = state.matches.length ? state.matches : MATCHES;
  const upcoming = list
    .filter(m => !m.result && !m.tbd && !isLocked(m))
    .sort((a, b) => new Date(a.kickoff || a.dt) - new Date(b.kickoff || b.dt));
  if (!upcoming.length) return [];
  const firstKickoff = new Date(upcoming[0].kickoff || upcoming[0].dt).getTime();
  return upcoming.filter(m => new Date(m.kickoff || m.dt) - firstKickoff < 5 * 60 * 1000);
}

function getNextMatches() {
  const live = getLiveMatches();
  if (live.length) return live;
  return getNextUpcomingMatches();
}

function _renderOneNextCard(m, cardIndex, label) {
  const home    = m.home  || m.h;
  const away    = m.away  || m.a;
  const kickoff = m.kickoff || m.dt;
  const group   = m.group_name || m.g;
  const mData   = getMatchData(m.id);
  const bet     = state.bets[m.id];
  const locked  = isLocked(m);
  const live    = locked && !mData?.result;

  const liveClock = mData?.live_clock;
  const centerHtml = live
    ? `<div class="nm-live-score">
         <div class="nm-score">${mData?.home_goals ?? 0} – ${mData?.away_goals ?? 0}</div>
         <div class="nm-elapsed${liveClock === 'HT' ? ' ht' : ''}"${liveClock ? '' : ` data-kickoff="${kickoff}"`}>${liveClock || '–'}</div>
       </div>`
    : `<div class="nm-vs">VS</div>
       <div class="nm-countdown" data-kickoff="${kickoff}">–</div>`;

  const hasOdds = !live && (mData?.odds_home || mData?.odds_draw || mData?.odds_away);
  const oddsHtml = hasOdds ? `
    <div class="nm-odds">
      <div class="nm-odds-item"><span class="nm-odds-lbl">1</span><span class="nm-odds-val">${mData.odds_home ?? '–'}</span></div>
      <div class="nm-odds-sep">·</div>
      <div class="nm-odds-item"><span class="nm-odds-lbl">X</span><span class="nm-odds-val">${mData.odds_draw ?? '–'}</span></div>
      <div class="nm-odds-sep">·</div>
      <div class="nm-odds-item"><span class="nm-odds-lbl">2</span><span class="nm-odds-val">${mData.odds_away ?? '–'}</span></div>
    </div>` : '';

  const actionHtml = locked
    ? (bet
        ? `<span class="nm-bet-done">✓ Veikattu ${bet.home_goals}–${bet.away_goals}</span>`
        : `<div class="locked-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Suljettu</div>`)
    : (bet
        ? `<span class="nm-bet-done">✓ Veikattu ${bet.home_goals}–${bet.away_goals}</span>`
        : `<button class="nm-bet-btn" onclick="app.scrollToMatch('${m.id}')">Veikkaa →</button>`);

  const eventsHtml = live && mData?.live_events?.length
    ? `<div class="nm-events">${mData.live_events.map(e => {
        const icons = { goal:'⚽', penalty:'⚽', owngoal:'🔴', yellow:'🟨', red:'🟥' };
        const icon = icons[e.type] || '';
        const isHome = e.team === 'home';
        return `<div class="nm-event">
          <span class="nm-event-home-name">${isHome ? e.player : ''}</span>
          <span class="nm-event-spacer"></span>
          <span class="nm-event-icon">${icon}</span>
          <span class="nm-event-min">${e.min}'</span>
          <span class="nm-event-away-name">${!isHome ? e.player : ''}</span>
        </div>`;
      }).join('')}</div>` : '';

  const stakesHtml = live ? `
    <button class="nm-stakes-toggle" onclick="app.toggleStakes(this,'${m.id}')">
      <span>Veikkaukset tällä tuloksella</span>
      <span class="nm-stakes-arrow">▼</span>
    </button>
    <div class="nm-stakes-list" id="stakes-${m.id}"></div>` : '';

  return `
    <div class="next-match-card${cardIndex > 0 ? ' next-match-card--subsequent' : ''}">
      <div class="nm-header">
        <span class="nm-label">${label}</span>
        <span class="nm-group">Lohko ${group}</span>
      </div>
      <div class="nm-teams">
        <div class="nm-team">
          <span class="nm-flag">${flagImg(home, 48)}</span>
          <span class="nm-name">${home}</span>
        </div>
        <div class="nm-center">${centerHtml}</div>
        <div class="nm-team">
          <span class="nm-flag">${flagImg(away, 48)}</span>
          <span class="nm-name">${away}</span>
        </div>
      </div>
      ${oddsHtml}
      ${eventsHtml}
      <div class="nm-footer">
        <span class="nm-date">${fmtDate(kickoff)}</span>
        ${actionHtml}
      </div>
      ${stakesHtml}
    </div>`;
}

function renderNextMatchCard() {
  const liveMatches     = getLiveMatches();
  const upcomingMatches = getNextUpcomingMatches();

  if (!liveMatches.length && !upcomingMatches.length) return '';

  let html = '';

  if (liveMatches.length) {
    const liveLabel = liveMatches.length > 1 ? 'KÄYNNISSÄ OLEVAT OTTELUT' : 'KÄYNNISSÄ OLEVA OTTELU';
    html += liveMatches.map((m, i) => _renderOneNextCard(m, i, i === 0 ? liveLabel : '')).join('');
  }

  if (upcomingMatches.length) {
    const nextLabel = upcomingMatches.length > 1 ? 'SEURAAVAT OTTELUT' : 'SEURAAVA OTTELU';
    html += upcomingMatches.map((m, i) => _renderOneNextCard(m, i, i === 0 ? nextLabel : '')).join('');
  }

  return html;
}

function startCountdown() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  _countdownTimer = setInterval(tickCountdowns, 1000);
  tickCountdowns();
}

function calcElapsed(kickoff) {
  const min = Math.floor((Date.now() - new Date(kickoff)) / 60000);
  if (min < 0) return null;
  if (min <= 45) return `${min}'`;
  if (min <= 60) return 'HT';
  return `${Math.min(min - 15, 90)}'`;
}

function tickCountdowns() {
  document.querySelectorAll('.nm-countdown[data-kickoff]').forEach(el => {
    const diff = new Date(el.dataset.kickoff) - Date.now();
    if (diff <= 0) {
      el.textContent = '⚽ Käynnissä';
      el.classList.add('live');
      return;
    }
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const min = Math.floor((diff % 36e5) / 6e4);
    const s   = Math.floor((diff % 6e4) / 1e3);
    if (d > 0)       el.textContent = `${d} pv ${h} t`;
    else if (h > 0)  el.textContent = `${h} t ${min} min`;
    else             el.textContent = `${min}:${String(s).padStart(2,'0')}`;
  });
  document.querySelectorAll('.nm-elapsed[data-kickoff]').forEach(el => {
    const t = calcElapsed(el.dataset.kickoff);
    if (!t) return;
    el.textContent = t;
    el.classList.toggle('ht', t === 'HT');
  });
}

// ─── Veikkausnäkymä ───────────────────────────────────────────────────────────
function renderBets(el) {
  const matchList = state.matches.length ? state.matches : MATCHES;
  const playable = matchList.filter(m => !m.tbd);
  const total  = playable.length;
  const betCnt = playable.filter(m => state.bets[m.id]).length;
  const openCnt   = playable.filter(m => !isLocked(m)).length;
  const lockedCnt = playable.filter(m =>  isLocked(m)).length;
  const pts = getTotalPoints();

  let filtered = matchList;
  if (state.filter === 'open')   filtered = matchList.filter(m => !isLocked(m) && !m.tbd);
  if (state.filter === 'locked') filtered = matchList.filter(m =>  isLocked(m) && !m.tbd);
  if (state.filter === 'bet')    filtered = matchList.filter(m =>  state.bets[m.id]);
  if (state.filter === 'unbet')  filtered = matchList.filter(m => !isLocked(m) && !state.bets[m.id] && !m.tbd);

  // Ryhmitä lohkoittain
  const groups = {};
  filtered.forEach(m => {
    const g = m.group_name || m.g;
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  });

  const groupsHtml = Object.entries(groups)
    .sort(([a],[b]) => (GROUP_ORDER[a]??99) - (GROUP_ORDER[b]??99))
    .map(([g, ms]) => {
      const label = GROUP_LABELS[g] ?? `Lohko ${g}`;
      const isKnockout = !!GROUP_LABELS[g];
      const rows = ms.map(m => renderMatchCard(m)).join('');
      return `<div class="group-block"><div class="group-label ${isKnockout?'knockout-label':''}">${label}</div>${rows}</div>`;
    }).join('');

  el.innerHTML = `
    ${renderNextMatchCard()}
    <div class="stats-row">
      <div class="stat-card"><div class="stat-val">${betCnt}</div><div class="stat-lbl">Veikattu</div></div>
      <div class="stat-card"><div class="stat-val">${openCnt}</div><div class="stat-lbl">Avoinna</div></div>
      <div class="stat-card"><div class="stat-val">${pts}</div><div class="stat-lbl">Pistettä</div></div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${total?Math.round(betCnt/total*100):0}%"></div>
    </div>
    <div class="filter-bar">
      <button class="filter-btn ${state.filter==='all'?'active':''}"    onclick="app.setFilter('all')">Kaikki</button>
      <button class="filter-btn ${state.filter==='open'?'active':''}"   onclick="app.setFilter('open')">Avoimet</button>
      <button class="filter-btn ${state.filter==='unbet'?'active':''}"  onclick="app.setFilter('unbet')">Veikkaamatta</button>
      <button class="filter-btn ${state.filter==='locked'?'active':''}" onclick="app.setFilter('locked')">Suljetut</button>
      <button class="filter-btn ${state.filter==='bet'?'active':''}"    onclick="app.setFilter('bet')">Veikatut</button>
      <span class="filter-count">${filtered.length} ottelua</span>
      <button class="info-btn" onclick="app.toggleInfo()" title="Pisteytyssäännöt">?</button>
    </div>
    <div class="info-panel" id="info-panel" style="display:none">
      <div class="info-panel-title">Pisteytys</div>
      <table class="info-table">
        <tr><td>Tulos täysin oikein (1/X/2 + molemmat maalit)</td><td>4 p</td></tr>
        <tr><td>Voittaja + toisen joukkueen maalit oikein</td><td>3 p</td></tr>
        <tr><td>Vain voittaja oikein</td><td>2 p</td></tr>
        <tr><td>Vain toisen joukkueen maalit oikein</td><td>1 p</td></tr>
        <tr><td>Ei osumia</td><td>0 p</td></tr>
      </table>
    </div>
    ${groupsHtml || '<div class="loading">Ei otteluita.</div>'}`;

  startCountdown();

  // Kiinnitetään goal-inputtien event-handlerit
  el.querySelectorAll('.goal-input').forEach(inp => {
    inp.addEventListener('change', () => handleGoalInput(inp));
    inp.addEventListener('input',  () => handleGoalInput(inp));
  });
}

function handleGoalInput(inp) {
  const matchId = inp.dataset.match;
  const side    = inp.dataset.side;
  const raw     = inp.value.trim();
  if (raw === '') return;
  const val = Math.max(0, Math.min(99, parseInt(raw) || 0));
  inp.value = val;

  const prev = state.bets[matchId] || { home_goals: 0, away_goals: 0 };
  const home = side === 'home' ? val : prev.home_goals ?? 0;
  const away = side === 'away' ? val : prev.away_goals ?? 0;
  const prediction = home > away ? '1' : away > home ? '2' : 'x';

  state.bets[matchId] = { prediction, home_goals: home, away_goals: away };
  updateMatchCardPoints(matchId);
  debounceSave(matchId);
  updateStats();
}

function renderMatchCard(m) {
  const matchId = m.id;

  const home = m.home || m.h;
  const away = m.away || m.a;

  // TBD-ottelu — ei vielä veikattavissa
  if (m.tbd) {
    return `
      <div class="match-card locked tbd-match" id="card-${matchId}">
        <div class="match-teams">
          <span class="match-home tbd-name">?</span>
          <span class="match-away tbd-name">?</span>
          <div class="match-meta">${fmtDate(m.dt || m.kickoff)}</div>
        </div>
        <span class="tbd-badge">Avautuu kun otteluparit selviävät</span>
      </div>`;
  }

  const locked  = isLocked(m);
  const bet     = state.bets[matchId];
  const mData   = getMatchData(matchId);
  const res     = matchResult(mData);
  const ptsObj  = bet && mData?.result ? calcPoints(bet, mData) : null;

  const metaParts = [fmtDate(m.dt || m.kickoff)];
  if (res) metaParts.push(`Tulos: ${res.score}`);
  const metaHtml = `<div class="match-meta">${metaParts.join(' · ')}</div>`;

  const oddsHtml = (!locked && (mData?.odds_home || mData?.odds_draw || mData?.odds_away))
    ? `<div class="match-odds">
        <span class="odds-label">1</span><span class="odds-val">${mData.odds_home ?? '–'}</span>
        <span class="odds-sep">·</span>
        <span class="odds-label">X</span><span class="odds-val">${mData.odds_draw ?? '–'}</span>
        <span class="odds-sep">·</span>
        <span class="odds-label">2</span><span class="odds-val">${mData.odds_away ?? '–'}</span>
       </div>`
    : '';

  let actionHtml = '';
  if (locked) {
    if (bet) {
      const cls = { '1': 'r1', 'x': 'rx', '2': 'r2' }[bet.prediction];
      actionHtml = `
        <div class="bet-display">
          <span class="bet-result-badge ${cls}">${bet.prediction.toUpperCase()}</span>
          <span class="bet-score">${bet.home_goals}–${bet.away_goals}</span>
          ${ptsObj ? `<span class="points-badge" id="pts-${matchId}">${ptsObj.points}p</span>` : ''}
        </div>`;
    } else {
      actionHtml = `<div class="locked-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Suljettu
      </div>`;
    }
  } else {
    const hg = bet?.home_goals ?? '';
    const ag = bet?.away_goals ?? '';
    actionHtml = `
      <div class="goals-block">
        <input type="number" class="goal-input" min="0" max="99"
          data-match="${matchId}" data-side="home"
          value="${hg}" placeholder="0" />
        <span class="goals-sep">–</span>
        <input type="number" class="goal-input" min="0" max="99"
          data-match="${matchId}" data-side="away"
          value="${ag}" placeholder="0" />
      </div>`;
  }

  return `
    <div class="match-card ${locked?'locked':''} ${bet?'has-bet':''}" id="card-${matchId}">
      <div class="match-teams">
        <span class="match-home">${flagImg(home)}${home}</span>
        <span class="match-away">${flagImg(away)}${away}</span>
        ${metaHtml}
        ${oddsHtml}
      </div>
      ${actionHtml}
    </div>`;
}

function updateMatchCardPoints(matchId) {
  const el = document.getElementById(`pts-${matchId}`);
  if (!el) return;
  const bet  = state.bets[matchId];
  const mData = getMatchData(matchId);
  if (!bet || !mData?.result) return;
  const { points } = calcPoints(bet, mData);
  el.textContent = `${points}p`;
}

// ─── Uutiset ──────────────────────────────────────────────────────────────────
const NEWS_FEEDS = [
  { name: 'YLE Urheilu',  url: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_URHEILU' },
  { name: 'IS Urheilu',   url: 'https://www.is.fi/rss/urheilu.xml' },
  { name: 'IL Urheilu',   url: 'https://www.iltalehti.fi/rss/urheilu.xml' },
  { name: 'HS Urheilu',   url: 'https://www.hs.fi/rss/urheilu.xml' },
  { name: 'SuomiFutis',   url: 'https://www.suomifutis.com/feed/', noFilter: true },
];
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const NEWS_CACHE_MS = 10 * 60 * 1000;

const FOOTBALL_WORDS = ['jalkapallo','mm-kisa','mm 2026','world cup','fifa','maajoukkue',
                        'veikkaus','lohko','finaali','välierä','puolivälierä'];

function isFootballNews(title) {
  const t = (title || '').toLowerCase();
  return FOOTBALL_WORDS.some(w => t.includes(w));
}

async function loadNews() {
  if (state.news && Date.now() - state.news.fetchedAt < NEWS_CACHE_MS) {
    return state.news.items;
  }
  const all = [];
  await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    try {
      const res  = await fetch(`${RSS2JSON}${encodeURIComponent(feed.url)}`);
      const data = await res.json();
      (data.items || []).forEach(item => all.push({ ...item, sourceName: feed.name, noFilter: feed.noFilter }));
    } catch { /* feed epäkäytettävissä, ohitetaan */ }
  }));
  const filtered = all.filter(item => item.noFilter || isFootballNews(item.title));
  filtered.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  state.news = { items: filtered, fetchedAt: Date.now() };
  return filtered;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'juuri nyt';
  if (m < 60) return `${m} min sitten`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t sitten`;
  return `${Math.floor(h / 24)} pv sitten`;
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? url : '#';
  } catch { return '#'; }
}

async function renderNews(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Ladataan uutisia…</div>';
  const items = await loadNews();
  if (!items.length) {
    el.innerHTML = '<div class="loading">Ei uutisia saatavilla.</div>';
    return;
  }
  el.innerHTML = `
    <div class="news-list">
      ${items.slice(0, 30).map(item => `
        <a class="news-card" href="${safeUrl(item.link)}" target="_blank" rel="noopener noreferrer">
          <div class="news-title">${esc(item.title)}</div>
          <div class="news-meta">${esc(item.sourceName)} · ${timeAgo(item.pubDate)}</div>
        </a>`).join('')}
    </div>`;
}

// ─── Stakes-dropdown (live-ottelut) ──────────────────────────────────────────
const _stakesCache = {};

async function toggleStakes(btn, matchId) {
  const list = document.getElementById(`stakes-${matchId}`);
  if (!list) return;
  const isOpen = list.classList.contains('open');
  list.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  if (isOpen || _stakesCache[matchId]) {
    if (_stakesCache[matchId]) list.innerHTML = renderStakesRows(matchId);
    return;
  }
  list.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:12px">Ladataan...</div>';
  const { data } = await sb.from('bets').select('*, profiles(id,display_name)').eq('match_id', matchId);
  if (!data) { list.innerHTML = ''; return; }
  const match = state.matches.find(m => m.id === matchId);
  const hg = match?.home_goals ?? 0;
  const ag = match?.away_goals ?? 0;
  const currentResult = hg > ag ? '1' : ag > hg ? '2' : 'x';
  _stakesCache[matchId] = data
    .map(b => {
      const { points } = calcPoints(b, { result: currentResult, home_goals: hg, away_goals: ag, extra_time: false });
      const isMe = b.user_id === state.user?.id;
      return { name: isMe ? b.profiles?.display_name : shortName(b.profiles?.display_name || '?'), score: `${b.home_goals}–${b.away_goals}`, points: points ?? 0, isMe };
    })
    .sort((a, b) => b.points - a.points);
  list.innerHTML = renderStakesRows(matchId);
}

function renderStakesRows(matchId) {
  return (_stakesCache[matchId] || []).map(s => {
    const cls = s.points >= 4 ? 'winning' : s.points >= 1 ? 'partial' : 'losing';
    return `<div class="nm-stake-row ${cls}">
      <div class="nm-stake-left">
        <span class="nm-stake-name">${s.name}${s.isMe ? ' <span class="nm-stake-you">(sinä)</span>' : ''}</span>
        <span class="nm-stake-score">${s.score}</span>
      </div>
      <span class="nm-stake-pts">${s.points}p</span>
    </div>`;
  }).join('');
}

// ─── Pistetaulukko ────────────────────────────────────────────────────────────
async function renderLeaderboard(el) {
  if (!state.leaderboard.length) {
    loadLeaderboard().then(() => renderView());
    el.innerHTML = '<div class="loading"><div class="spinner"></div> Ladataan...</div>';
    return;
  }

  const rows = state.leaderboard.map((row, i) => {
    const isMe = row.user_id === state.user?.id;
    const rankCls = i < 3 ? 'top3' : '';
    return `
      <div class="lb-row">
        <span class="lb-rank ${rankCls}">${i+1}.</span>
        <span class="lb-name ${isMe?'me':''}">${shortName(row.display_name)}</span>
        <span class="lb-num">${row.bets_placed}</span>
        <span class="lb-num">${row.exact_results}</span>
        <span class="lb-points">${row.total_points} p</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="leaderboard">
      <div class="lb-header">
        <span>#</span>
        <span>Pelaaja</span>
        <span style="text-align:center">Veikkaukset</span>
        <span style="text-align:center">Tarkat</span>
        <span style="text-align:right">Pisteet</span>
      </div>
      ${rows || '<div class="loading">Ei tietoja vielä.</div>'}
    </div>
    <div id="lb-extras"></div>`;

  const completedMatches = state.matches.filter(m => m.result).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (!completedMatches.length) return;

  const { data: allBets } = await sb.from('bets').select('*, profiles(id,display_name)');
  if (!allBets) return;

  const byUser = {};
  allBets.forEach(b => {
    if (!byUser[b.user_id]) byUser[b.user_id] = { id: b.user_id, name: b.profiles?.display_name || '?', bets: {} };
    byUser[b.user_id].bets[b.match_id] = b;
  });

  const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#a78bfa','#38bdf8','#fb923c','#94a3b8','#f472b6','#34d399'];

  const breakdown = Object.values(byUser).map(u => {
    const c = { p4:0, p3:0, p2:0, p1:0, p0:0 };
    completedMatches.forEach(m => {
      const b = u.bets[m.id];
      if (!b) return;
      const { points } = calcPoints(b, m);
      if (points === null) return;
      c[`p${points}`] = (c[`p${points}`] || 0) + 1;
    });
    return { ...c, name: shortName(u.name), isMe: u.id === state.user?.id };
  }).sort((a, b) => (b.p4*4+b.p3*3+b.p2*2+b.p1) - (a.p4*4+a.p3*3+a.p2*2+a.p1));

  const labels = ['Start', ...completedMatches.map(m => {
    const d = new Date(m.kickoff);
    return `${d.getUTCDate()}.${d.getUTCMonth()+1}.`;
  })];

  const datasets = Object.values(byUser).map((u, idx) => {
    const isMe = u.id === state.user?.id;
    let cum = 0;
    return {
      label: shortName(u.name),
      data: [0, ...completedMatches.map(m => {
        const b = u.bets[m.id];
        if (b) cum += calcPoints(b, m).points || 0;
        return cum;
      })],
      borderColor: COLORS[idx % COLORS.length],
      backgroundColor: COLORS[idx % COLORS.length] + '18',
      borderWidth: isMe ? 2.5 : 1.5,
      pointRadius: isMe ? 4 : 2.5,
      pointHoverRadius: 6,
      tension: 0.35,
      fill: false,
    };
  });

  const extrasEl = document.getElementById('lb-extras');
  if (!extrasEl) return;

  const hdStyle = 'text-align:center;font-size:11px;font-weight:700;letter-spacing:.06em;padding:0 4px';
  const cell = (val, pts) => {
    let s = 'text-align:center;display:block;font-size:13px;';
    if (val === 0) s += 'color:var(--text3)';
    else if (pts === 4) s += 'color:var(--green);font-weight:700';
    else if (pts === 3) s += 'color:var(--indigo);font-weight:600';
    else if (pts === 2) s += 'color:var(--amber)';
    else s += 'color:var(--text2)';
    return `<span style="${s}">${val > 0 ? val : '–'}</span>`;
  };

  extrasEl.innerHTML = `
    <div class="lb-card" style="margin-top:0.75rem">
      <div class="lb-card-title">Miten pisteet muodostuu</div>
      <div style="display:grid;grid-template-columns:1fr 44px 44px 44px 44px 44px;padding:0.5rem 1rem 0.4rem;gap:2px;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.06em">Pelaaja</span>
        <span style="${hdStyle};color:var(--green)">4p</span>
        <span style="${hdStyle};color:var(--indigo)">3p</span>
        <span style="${hdStyle};color:var(--amber)">2p</span>
        <span style="${hdStyle};color:var(--text2)">1p</span>
        <span style="${hdStyle};color:var(--text3)">0p</span>
      </div>
      ${breakdown.map(r => `
        <div style="display:grid;grid-template-columns:1fr 44px 44px 44px 44px 44px;padding:6px 1rem;gap:2px;border-bottom:1px solid var(--border);${r.isMe?'background:var(--surface2)':''}">
          <span style="font-size:13px;font-weight:${r.isMe?'600':'400'};color:var(--text)">${r.name}${r.isMe?' <span style="color:var(--indigo);font-size:11px">(sinä)</span>':''}</span>
          ${cell(r.p4,4)}${cell(r.p3,3)}${cell(r.p2,2)}${cell(r.p1,1)}${cell(r.p0,0)}
        </div>`).join('')}
    </div>
    <div class="lb-card" style="margin-top:0.75rem;padding:1rem">
      <div class="lb-card-title">Pistekehitys</div>
      <canvas id="lb-chart" height="220"></canvas>
    </div>`;

  if (window.Chart) {
    new window.Chart(document.getElementById('lb-chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: '#7c889e', font: { size: 11 }, boxWidth: 12, boxHeight: 2, padding: 12, usePointStyle: true, pointStyle: 'line' } },
          tooltip: { backgroundColor: '#131720', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#7c889e', padding: 10, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} p` } }
        },
        scales: {
          x: { ticks: { color: '#3d4a60', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { beginAtZero: true, ticks: { color: '#3d4a60', font: { size: 11 }, stepSize: 4 }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }
}

// ─── Muiden veikkaukset ───────────────────────────────────────────────────────
async function renderOthers(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Ladataan...</div>';

  const { data: allBets } = await sb
    .from('bets')
    .select('*, profiles(display_name)');

  const { data: profiles } = await sb.from('profiles').select('id, display_name');

  if (!allBets || !profiles) {
    el.innerHTML = '<div class="loading">Lataus epäonnistui.</div>';
    return;
  }

  // Ryhmitä käyttäjittäin
  const byUser = {};
  allBets.forEach(b => {
    if (!byUser[b.user_id]) byUser[b.user_id] = { name: b.profiles?.display_name || '?', bets: {} };
    byUser[b.user_id].bets[b.match_id] = b;
  });

  const matchList = state.matches.length ? state.matches : MATCHES;

  const groupsHtml = (() => {
    const groups = {};
    matchList.filter(m => isLocked(m) && !m.tbd).forEach(m => {
      const g = m.group_name || m.g;
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    });
    if (!Object.keys(groups).length)
      return '<div class="loading">Ei vielä lukittuja otteluita.</div>';

    return Object.entries(groups)
      .sort(([a],[b]) => (GROUP_ORDER[a]??99) - (GROUP_ORDER[b]??99))
      .map(([g,ms]) => {
        const rows = ms.map(m => {
          const chips = Object.values(byUser).map(u => {
            const b = u.bets[m.id];
            if (!b) return '';
            const cls = { '1': 'r1', 'x': 'rx', '2': 'r2' }[b.prediction];
            const isMe = Object.keys(byUser).find(id => byUser[id] === u) === state.user?.id;
            return `<div class="other-chip">
              <span class="other-chip-name">${isMe ? u.name : shortName(u.name)}</span>
              <span class="other-chip-bet bet-result-badge ${cls}">${b.prediction.toUpperCase()} ${b.home_goals}–${b.away_goals}</span>
            </div>`;
          }).filter(Boolean).join('');
          if (!chips) return '';
          return `
            <div class="others-match">
              <div class="others-match-title">${flagImg(m.home||m.h)}${m.home||m.h} – ${flagImg(m.away||m.a)}${m.away||m.a} <span class="others-date">${fmtDate(m.dt||m.kickoff)}</span></div>
              <div class="others-grid">${chips}</div>
            </div>`;
        }).filter(Boolean).join('');
        if (!rows) return '';
        const label = GROUP_LABELS[g] ?? `Lohko ${g}`;
        return `<div class="others-group"><div class="group-label ${GROUP_LABELS[g]?'knockout-label':''}">${label}</div>${rows}</div>`;
      }).join('');
  })();

  el.innerHTML = `<div class="others-view">${groupsHtml}</div>`;
}

// ─── Toiminnot (globaalit, kutsutaan HTML:stä) ────────────────────────────────
window.app = {
  async submitName() {
    const name = document.getElementById('inp-name')?.value.trim();
    const pin  = document.getElementById('inp-pin')?.value.trim();

    if (!name) { toast('Syötä nimesi', true); return; }
    if (!/^\d{4}$/.test(pin)) { toast('PIN-koodi on 4 numeroa', true); return; }

    // Tarkista lukitus
    const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0');
    if (Date.now() < lockUntil) {
      const secs = Math.ceil((lockUntil - Date.now()) / 1000);
      toast(`Liian monta yritystä — odota ${secs} s`, true);
      return;
    }

    const btn = document.getElementById('name-submit');
    btn.disabled = true;
    btn.textContent = 'Kirjaudutaan…';

    const reset = () => { btn.disabled = false; btn.textContent = 'Kirjaudu →'; };
    const timeout = setTimeout(() => { reset(); toast('Aikakatkaisu — yritä uudelleen', true); }, 10000);

    const err = await signInOrRegister(name, pin);
    clearTimeout(timeout);

    if (err) {
      // Laske epäonnistuneet yritykset
      const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') + 1;
      if (attempts >= MAX_ATTEMPTS) {
        localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
        localStorage.setItem(ATTEMPTS_KEY, '0');
        toast('Liian monta väärää yritystä — odota 5 minuuttia', true);
      } else {
        localStorage.setItem(ATTEMPTS_KEY, String(attempts));
        const msg = err.message.includes('already registered')
          ? `Väärä PIN-koodi (${attempts}/${MAX_ATTEMPTS})`
          : err.message.includes('epäonnistui') || err.message.includes('vaatii') || err.message.includes('Väärä')
          ? `${err.message} (${attempts}/${MAX_ATTEMPTS})`
          : `Kirjautuminen epäonnistui (${attempts}/${MAX_ATTEMPTS})`;
        toast(msg, true);
      }
      reset();
    } else {
      localStorage.setItem(ATTEMPTS_KEY, '0');
      localStorage.removeItem(LOCKOUT_KEY);
    }
  },

  toggleStakes(btn, matchId) { toggleStakes(btn, matchId); },

  scrollToMatch(matchId) {
    state.filter = 'all';
    renderView();
    setTimeout(() => {
      const el = document.getElementById(`card-${matchId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 1800);
    }, 80);
  },

  setFilter(f) {
    state.filter = f;
    renderView();
  },

  toggleInfo() {
    const p = document.getElementById('info-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  },

  setView(v) {
    state.view = v;
    renderTopbar();
    renderView();
  },

  async signOut() {
    await signOut();
  },

  dismissKoBanner,
};

function updateStats() {
  const matchList = state.matches.length ? state.matches : MATCHES;
  const betCnt = Object.keys(state.bets).length;
  const total  = matchList.length;
  const pts    = getTotalPoints();
  const el = document.querySelectorAll('.stat-val');
  if (el[0]) el[0].textContent = betCnt;
  if (el[2]) el[2].textContent = pts;
  const pf = document.querySelector('.progress-fill');
  if (pf) pf.style.width = (total ? Math.round(betCnt/total*100) : 0) + '%';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isError ? 'var(--c-red)' : 'var(--c-text)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── Kertaluenteinen jatkopelimuistutus ───────────────────────────────────────
const KO_BANNER_KEY = 'mm26_ko_banner_v3';

function showKoBanner() {
  if (localStorage.getItem(KO_BANNER_KEY)) return;
  const el = document.getElementById('ko-banner');
  if (el) el.style.display = 'flex';
}

function dismissKoBanner() {
  localStorage.setItem(KO_BANNER_KEY, '1');
  const el = document.getElementById('ko-banner');
  if (el) el.style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Tarkista sessio ensin — estää login-sivun välähtämisen F5:llä
  const { data: { session: existing } } = await sb.auth.getSession();
  if (existing) {
    state.user = existing.user;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
    state.profile = profile;
    await Promise.all([loadMatches(), loadBets()]);
  }
  renderAll();
  if (state.user) showKoBanner();

  // Kuuntele myöhempiä auth-muutoksia (kirjautuminen, uloskirjautuminen)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return; // Hoidettu yllä
    state.user = session?.user || null;

    if (state.user) {
      const { data: profile } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
      state.profile = profile;
      await Promise.all([loadMatches(), loadBets()]);
    } else {
      state.profile = null;
      state.bets = {};
    }
    renderAll();
    if (state.user) showKoBanner();
  });

  // Päivitä lock-tilanne 60s välein
  setInterval(() => {
    if (state.user && state.view === 'bets') renderView();
  }, 60_000);

  // Hae tuoreet ottelutulokset Supabasesta 5 min välein
  setInterval(async () => {
    if (!state.user) return;
    await loadMatches();
    if (state.view === 'bets') renderView();
  }, 5 * 60_000);
}

init();
