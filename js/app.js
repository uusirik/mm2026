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
  '0556e8c64c72a62f4b6029a8a42cace0fedaf9ed1f1c69794f4d47864642dc29',
]);
const INVITE_KEY = 'mm2026_invited';

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
    localStorage.setItem('mm2026_invite_fragment', fragment);
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
  const inviteCode = localStorage.getItem('mm2026_invite_fragment') || '';
  const email    = nameToEmail(displayName);
  const password = makePassword(pin);

  // Yritetään kirjautua — onnistuu paluukerroilla millä laitteella tahansa
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
  if (!signInErr) return null;

  // Kirjautuminen epäonnistui — yritetään rekisteröidä uutena käyttäjänä
  if (!inviteCode) return new Error('Rekisteröityminen vaatii kutsulinkkin');

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

function getNextMatches() {
  const list = state.matches.length ? state.matches : MATCHES;
  const upcoming = list
    .filter(m => !m.result && !m.tbd && new Date(m.kickoff || m.dt) > Date.now() - 2 * 36e5)
    .sort((a, b) => new Date(a.kickoff || a.dt) - new Date(b.kickoff || b.dt));
  if (!upcoming.length) return [];
  const firstKickoff = new Date(upcoming[0].kickoff || upcoming[0].dt).getTime();
  // Kaikki saman alkamisajan ottelut (toleranssi 5 min)
  return upcoming.filter(m => new Date(m.kickoff || m.dt) - firstKickoff < 5 * 60 * 1000);
}

function renderNextMatchCard() {
  const matches = getNextMatches();
  if (!matches.length) return '';

  const label = matches.length > 1 ? 'SEURAAVAT OTTELUT' : 'SEURAAVA OTTELU';

  return matches.map((m, i) => {
    const home    = m.home  || m.h;
    const away    = m.away  || m.a;
    const kickoff = m.kickoff || m.dt;
    const group   = m.group_name || m.g;
    const mData   = getMatchData(m.id);
    const bet     = state.bets[m.id];

    const hasOdds = mData?.odds_home || mData?.odds_draw || mData?.odds_away;
    const oddsHtml = hasOdds ? `
      <div class="nm-odds">
        <div class="nm-odds-item"><span class="nm-odds-lbl">1</span><span class="nm-odds-val">${mData.odds_home ?? '–'}</span></div>
        <div class="nm-odds-sep">·</div>
        <div class="nm-odds-item"><span class="nm-odds-lbl">X</span><span class="nm-odds-val">${mData.odds_draw ?? '–'}</span></div>
        <div class="nm-odds-sep">·</div>
        <div class="nm-odds-item"><span class="nm-odds-lbl">2</span><span class="nm-odds-val">${mData.odds_away ?? '–'}</span></div>
      </div>` : '';

    const actionHtml = bet
      ? `<span class="nm-bet-done">✓ Veikattu ${bet.home_goals}–${bet.away_goals}</span>`
      : `<button class="nm-bet-btn" onclick="app.scrollToMatch('${m.id}')">Veikkaa →</button>`;

    return `
      <div class="next-match-card${i > 0 ? ' next-match-card--subsequent' : ''}">
        <div class="nm-header">
          <span class="nm-label">${i === 0 ? label : ''}</span>
          <span class="nm-group">Lohko ${group}</span>
        </div>
        <div class="nm-teams">
          <div class="nm-team">
            <span class="nm-flag">${flagImg(home, 48)}</span>
            <span class="nm-name">${home}</span>
          </div>
          <div class="nm-center">
            <div class="nm-vs">VS</div>
            <div class="nm-countdown" data-kickoff="${kickoff}">–</div>
          </div>
          <div class="nm-team">
            <span class="nm-flag">${flagImg(away, 48)}</span>
            <span class="nm-name">${away}</span>
          </div>
        </div>
        ${oddsHtml}
        <div class="nm-footer">
          <span class="nm-date">${fmtDate(kickoff)}</span>
          ${actionHtml}
        </div>
      </div>`;
  }).join('');
}

function startCountdown() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  _countdownTimer = setInterval(tickCountdowns, 1000);
  tickCountdowns();
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
      <div class="info-panel-sub">Jatkosarjassa:</div>
      <table class="info-table">
        <tr><td>Loppusijoitus täysin oikein</td><td>3 p</td></tr>
        <tr><td>Veikkasi X, jatkoaika/pk:t ratkaisi</td><td>2 p</td></tr>
        <tr><td>Joukkue oikeassa mitaliottelussa, väärä sijoitus</td><td>1 p</td></tr>
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
        <a class="news-card" href="${item.link}" target="_blank" rel="noopener">
          <div class="news-title">${item.title}</div>
          <div class="news-meta">${item.sourceName} · ${timeAgo(item.pubDate)}</div>
        </a>`).join('')}
    </div>`;
}

// ─── Pistetaulukko ────────────────────────────────────────────────────────────
function renderLeaderboard(el) {
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
        <span class="lb-name ${isMe?'me':''}">${row.display_name}</span>
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
    </div>`;
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
            return `<div class="other-chip">
              <span class="other-chip-name">${u.name}</span>
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

    const btn = document.getElementById('name-submit');
    btn.disabled = true;
    btn.textContent = 'Kirjaudutaan…';

    const reset = () => { btn.disabled = false; btn.textContent = 'Kirjaudu →'; };
    const timeout = setTimeout(() => { reset(); toast('Aikakatkaisu — yritä uudelleen', true); }, 10000);

    const err = await signInOrRegister(name, pin);
    clearTimeout(timeout);

    if (err) {
      const msg = err.message.includes('Rekisteröityminen') || err.message.includes('Sähköposti')
        ? err.message
        : err.message.includes('already registered') ? 'Väärä PIN-koodi tälle nimelle'
        : 'Kirjautuminen epäonnistui: ' + err.message;
      toast(msg, true);
      reset();
    }
  },

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
};

function updateStats() {
  const matchList = state.matches.length ? state.matches : MATCHES;
  const betCnt = Object.keys(state.bets).length;
  const total  = matchList.length;
  const pts    = getTotalPoints();
  const sv = document.querySelector('.stat-val:nth-child(1)');
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
