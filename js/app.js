// app.js — pääsovellus
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MATCHES, calcPoints, isLocked, fmtDate, matchResult } from './matches.js';

// ─── Konfiguraatio ───────────────────────────────────────────────────────────
// Vaihda nämä omilla Supabase-projektin arvoilla!
const SUPABASE_URL  = 'https://hwomgxbxcyrrjcwgjgtj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b21neGJ4Y3lycmpjd2dqZ3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTEzNTgsImV4cCI6MjA5NjQ2NzM1OH0.oMMNWvwPcSbqXSSoVnBh1BwqFoPT_-rfra5A6pIrsgo';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Sovelluksen tila ─────────────────────────────────────────────────────────
let state = {
  view: 'bets',       // 'bets' | 'leaderboard' | 'others'
  filter: 'all',      // 'all' | 'open' | 'locked' | 'bet'
  user: null,
  profile: null,
  bets: {},           // { match_id: { prediction, home_goals, away_goals } }
  matches: [],        // Supabasesta haettu (sisältää result-kentän)
  leaderboard: [],
  saveQueue: {},      // Debounce-jonossa olevat tallennukset
  saveTimers: {},
};

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

// Salasana = rekisteröintitunnus + PIN
function makePassword(fragment, pin) {
  return `${fragment}-${pin}`;
}

async function signInOrRegister(displayName, pin) {
  const inviteCode = localStorage.getItem('mm2026_invite_fragment') || '';
  const email    = nameToEmail(displayName);
  const password = makePassword(inviteCode || 'noinvite', pin);

  // Yritetään kirjautua — onnistuu paluukerroilla
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
  const nav = document.getElementById('topbar-nav');
  const usr = document.getElementById('topbar-user');
  if (!nav || !usr) return;

  if (!state.user) {
    nav.innerHTML = '';
    usr.innerHTML = '';
    return;
  }

  nav.innerHTML = `
    <div class="nav-tabs">
      <button class="nav-tab ${state.view==='bets'?'active':''}" onclick="app.setView('bets')">Veikkaukset</button>
      <button class="nav-tab ${state.view==='leaderboard'?'active':''}" onclick="app.setView('leaderboard')">Pisteet</button>
      <button class="nav-tab ${state.view==='others'?'active':''}" onclick="app.setView('others')">Muiden veikkaukset</button>
    </div>`;

  usr.innerHTML = `
    <button class="user-badge" onclick="app.signOut()">
      ${state.profile?.display_name || 'Käyttäjä'}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>`;
}

async function renderAuth(root) {
  const invited = await checkInvite();

  if (!invited) {
    root.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-logo-area">
          <span class="auth-logo-icon">⚽</span>
          <div class="auth-brand">MM 2026</div>
          <div class="auth-tagline">Veikkaus &nbsp;·&nbsp; AFRY</div>
        </div>
        <div class="auth-card">
          <div class="auth-sub" style="text-align:center;padding:0.5rem 0">
            Tarvitset kutsulinkkin päästäksesi sivustolle.<br>
            <span style="color:rgba(255,255,255,0.2);font-size:11px">Ota yhteyttä ryhmän ylläpitäjään.</span>
          </div>
        </div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo-area">
        <span class="auth-logo-icon">⚽</span>
        <div class="auth-brand">MM 2026</div>
        <div class="auth-tagline">Veikkaus &nbsp;·&nbsp; Kirjaudu sisään</div>
      </div>
      <div class="auth-card" id="auth-card">
        <div class="auth-sub">Syötä nimesi ja PIN-koodi.</div>
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
  if (state.view === 'bets')        renderBets(el);
  else if (state.view === 'leaderboard') renderLeaderboard(el);
  else if (state.view === 'others') renderOthers(el);
}

// ─── Veikkausnäkymä ───────────────────────────────────────────────────────────
function renderBets(el) {
  const matchList = state.matches.length ? state.matches : MATCHES;
  const total  = matchList.length;
  const betCnt = Object.keys(state.bets).length;
  const openCnt   = matchList.filter(m => !isLocked(m)).length;
  const lockedCnt = matchList.filter(m =>  isLocked(m)).length;
  const pts = getTotalPoints();

  let filtered = matchList;
  if (state.filter === 'open')   filtered = matchList.filter(m => !isLocked(m));
  if (state.filter === 'locked') filtered = matchList.filter(m =>  isLocked(m));
  if (state.filter === 'bet')    filtered = matchList.filter(m =>  state.bets[m.id]);

  // Ryhmitä lohkoittain
  const groups = {};
  filtered.forEach(m => {
    const g = m.group_name || m.g;
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  });

  const groupsHtml = Object.entries(groups)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([g, ms]) => {
      const rows = ms.map(m => renderMatchCard(m)).join('');
      return `<div class="group-block"><div class="group-label">Lohko ${g}</div>${rows}</div>`;
    }).join('');

  el.innerHTML = `
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
      <button class="filter-btn ${state.filter==='locked'?'active':''}" onclick="app.setFilter('locked')">Suljetut</button>
      <button class="filter-btn ${state.filter==='bet'?'active':''}"    onclick="app.setFilter('bet')">Veikatut</button>
      <span class="filter-count">${filtered.length} ottelua</span>
    </div>
    ${groupsHtml || '<div class="loading">Ei otteluita.</div>'}`;

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
  const locked  = isLocked(m);
  const bet     = state.bets[matchId];
  const mData   = getMatchData(matchId);
  const res     = matchResult(mData);
  const ptsObj  = bet && mData?.result ? calcPoints(bet, mData) : null;

  const metaParts = [fmtDate(m.dt || m.kickoff)];
  if (res) metaParts.push(`Tulos: ${res.score}`);
  const metaHtml = `<div class="match-meta">${metaParts.join(' · ')}</div>`;

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
        <span class="match-home">${m.home || m.h}</span>
        <span class="match-away">${m.away || m.a}</span>
        ${metaHtml}
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
    matchList.filter(m => isLocked(m)).forEach(m => {
      const g = m.group_name || m.g;
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    });
    if (!Object.keys(groups).length)
      return '<div class="loading">Ei vielä lukittuja otteluita.</div>';

    return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([g,ms]) => {
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
        return `
          <div class="group-block" style="margin-bottom:1rem">
            <div class="group-label" style="margin-bottom:4px">${m.home||m.h} – ${m.away||m.a} <span style="font-weight:400;color:var(--c-text3)">${fmtDate(m.dt||m.kickoff)}</span></div>
            <div class="others-grid">${chips || '<span style="font-size:12px;color:var(--c-text3)">Ei veikkauksia</span>'}</div>
          </div>`;
      }).join('');
      return `<div style="margin-bottom:1.5rem"><div class="group-label" style="font-size:13px;margin-bottom:8px">Lohko ${g}</div>${rows}</div>`;
    }).join('');
  })();

  el.innerHTML = `<div style="padding-top:0.5rem">${groupsHtml}</div>`;
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

  setFilter(f) {
    state.filter = f;
    renderView();
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
  // Näytä auth-sivu heti — state.user on null kunnes Supabase vastaa
  renderAll();

  // Auth-tilan muutos (kirjautuminen, uloskirjautuminen)
  sb.auth.onAuthStateChange(async (event, session) => {
    state.user = session?.user || null;

    if (state.user) {
      // Hae profiili
      const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single();
      state.profile = profile;

      await Promise.all([loadMatches(), loadBets()]);
    }

    renderAll();
  });

  // Alussa tarkista session
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    renderAll();
  }

  // Päivitä ottelutilanne 60s välein (lock-logiikka)
  setInterval(() => {
    if (state.user && state.view === 'bets') renderView();
  }, 60_000);
}

init();
