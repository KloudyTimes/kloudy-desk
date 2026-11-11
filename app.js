/* Grok Bot desk app. Plain JS, no framework, no build step. FOMO links always come from the API (links.py). */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = window.localStorage;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (location.hash.startsWith('#t=')) { LS.setItem('t', decodeURIComponent(location.hash.slice(3))); history.replaceState(null, '', location.pathname); }
/* Plan B: opened as {URL}#d={DATA_PATH} -> read-only static JSON under d/{DATA_PATH}/ (no /api, no SSE). The hash is kept in the URL so iOS "Add to Home Screen" remembers it. */
if (location.hash.startsWith('#d=')) LS.setItem('d', decodeURIComponent(location.hash.slice(3)));
const DATA = LS.getItem('d'), STATIC = !!DATA && !LS.getItem('t');
/* LIVE-ONLY app (Matthew t900u/t901u): only the live Trench view (real wallet, live trades). Paper books run hidden server-side. */
const LIVE_ONLY = STATIC;
const DEFAULT_PROFILES = LIVE_ONLY ? ['trench'] : ['strict', 'trench'];
let PROFILES = DEFAULT_PROFILES.slice();
let PROF = LIVE_ONLY ? 'trench' : (PROFILES.includes(LS.getItem('p')) ? LS.getItem('p') : 'strict');
function syncProfiles(state) {
  if (LIVE_ONLY) { PROFILES = ['trench']; PROF = 'trench'; return; }
  const keys = state && state.profiles ? Object.keys(state.profiles) : [];
  if (keys.length) {
    const order = ['strict', 'trench', 'loose', 'news'];
    PROFILES = order.filter(p => keys.includes(p)).concat(keys.filter(p => !order.includes(p)));
  }
  if (!PROFILES.includes(PROF)) { PROF = PROFILES[0] || 'strict'; LS.setItem('p', PROF); }
}
const APP_SINCE_DEFAULT = 1794593340; // 2026-11-13 19:09 Europe/Amsterdam — live Trench current-rules deploy
const appSince = () => {
  const st = S.state;
  if (st && st.app_since_ts) return Number(st.app_since_ts);
  if (st && st.rules && st.rules.since_ts) return Number(st.rules.since_ts);
  return APP_SINCE_DEFAULT;
};
const copyish = (...parts) => {
  const blob = parts.map(x => String(x || '')).join(' ').toLowerCase();
  return blob.includes('copy:') || blob.includes('watch-only') || blob.includes('watch only') || blob.includes('waiting room') || blob.includes('copy trading');
};
const sinceDeploy = ts => (ts || 0) >= appSince();
const liveRows = rows => (rows || []).filter(r => (r.ts == null || sinceDeploy(r.ts)) && !copyish(r.source, r.title, r.subtitle, r.value, r.reason, r.verdict));
const rulesOf = () => (S.state && S.state.rules) || { title: 'Current rules', items: [] };
const rulesCard = () => {
  const r = rulesOf(), items = r.items || [];
  if (!LIVE_ONLY && !items.length) return '';
  if (!items.length) return '<div class="rules" id="rules-card"><h3>Current rules</h3></div>';
  return `<div class="rules" id="rules-card"><h3>${esc(r.title || 'Current rules')}</h3><ol>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div>`;
};
const DEX_OK = /^https:\/\/dexscreener\.com\/solana\/[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const pumpAge = s => { if (s == null || s === '') return ''; if (s < 60) return s + 's'; if (s < 90 * 60) return Math.max(1, Math.round(s / 60)) + 'm'; return Math.round(s / 3600) + 'h'; };
const pumpFeed = () => {
  if (!LIVE_ONLY) return '';
  const rows = (S.state && S.state.pump_feed) || [];
  const body = rows.length ? rows.map(r => {
    const href = DEX_OK.test(r.dex_url || '') ? r.dex_url : '';
    const st = r.status === 'skipped' ? 'skip' : (r.status === 'bought' ? 'ok' : (r.status === 'checking' ? 'wait' : ''));
    const why = r.detail ? ' · ' + r.detail : '';
    const inner = `<span class="n">${esc(r.name || r.mint || '')}</span><span class="a">${esc(pumpAge(r.age_s))}</span><span class="s">${esc((r.status || '') + why)}</span>`;
    return href ? `<a class="pf-row ${st}" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`
                : `<div class="pf-row ${st}">${inner}</div>`;
  }).join('') : '<div class="sec" style="padding:6px 0">No pump.fun coins yet</div>';
  return `<div class="rules pumpfeed" id="h-pump"><h3>Pump.fun feed</h3>${body}</div>`;
};
const BASE = STATIC ? new URL('d/' + encodeURIComponent(DATA) + '/', document.baseURI).href : '';

const S = { state: null, chart: null, range: LS.getItem('range') || '1D', account: null, settings: null, lastOk: 0, offline: false, retryAt: 0, unauth: false, tab: 'home', stack: [], activity: null };
const fmt$ = (v, d = 2) => (v == null ? '–' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtPrice = p => { if (p == null) return '–'; if (p >= 1) return '$' + p.toFixed(2); const s = p.toPrecision(3); return '$' + (p < 0.0001 ? Number(p).toExponential(2) : String(Number(s))); };
const fmtBig = v => v == null ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0);
const hhmm = ts => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const age = m => m == null ? '' : m < 90 ? m + 'm old' : Math.round(m / 60) + 'h old';
const initials = n => esc((n || '?').slice(0, 2).toUpperCase());

/* ---------- api ---------- */
function staticFile(path) {
  const u = new URL(path, 'http://x'), p = u.pathname, q = u.searchParams;
  let m;
  if (p === '/api/state') return 'state.json';
  if (p === '/api/chart') return 'chart_' + (q.get('range') || '1D').toUpperCase() + '.json';
  if (p === '/api/activity') return q.get('before') ? null : 'activity.json';
  if ((m = p.match(/^\/api\/coin\/([\w]+)$/))) return 'coin/' + m[1] + '.json';
  if ((m = p.match(/^\/api\/audit\/([\w]+)$/))) return 'audit/' + m[1] + '.json';
  if ((m = p.match(/^\/api\/agents\/(\w+)\/decisions$/))) return 'agents/' + m[1] + '.json';
  if (p === '/api/account') return 'account.json';
  if (p === '/api/settings') return 'settings.json';
  if (p === '/api/search') return 'search.json';
  if (p === '/api/news') return 'news.json';
  return null;
}
/* Live feed (VM): read-only copy of state/chart/activity straight from the desk, polled every few seconds.
   URL comes from d/{DATA}/live.json on Pages; any failure falls back to the Pages files for 60s. */
const LIVE = { url: null, checked: 0, downUntil: 0 };
const LIVE_FILE = /(^|\/)(state|activity|chart_[A-Z0-9]+)\.json$/;
async function liveURL() {
  if (Date.now() - LIVE.checked < 60000) return LIVE.url;
  LIVE.checked = Date.now();
  try { const r = await fetch(BASE + 'live.json?t=' + Math.floor(Date.now() / 30000), { cache: 'no-store' }); if (r.ok) { const j = await r.json(); LIVE.url = (j.url && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(j.url)) ? j.url : null; } } catch (_) {}
  return LIVE.url;
}
const liveOn = () => !!LIVE.url && Date.now() >= LIVE.downUntil;
async function liveJSON(f) {
  if (!LIVE_FILE.test(f)) return null;
  const u = await liveURL(); if (!u || Date.now() < LIVE.downUntil) return null;
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(u + '/d/' + encodeURIComponent(DATA) + '/' + f, { cache: 'no-store', signal: ac.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (_) { LIVE.downUntil = Date.now() + 60000; LIVE.checked = 0; return null; }
  finally { clearTimeout(to); }
}
async function api(path, opts = {}) {
  if (STATIC) {
    if (opts.method && opts.method !== 'GET') { toast('Read-only here · use Telegram commands to change things'); const e = new Error('readonly'); e.status = 405; throw e; }
    let f = staticFile(path);
    if (f && PROF !== 'strict' && f !== 'search.json' && f !== 'news.json') f = PROF + '/' + f;
    if (!f) { const j = { rows: [], next: null }; return j; }
    const lj = await liveJSON(f); if (lj) { S.unauth = false; return lj; }
    const r = await fetch(BASE + f + '?t=' + Math.floor(Date.now() / 15000), { cache: 'no-store' });
    if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
    S.unauth = false;
    const j = await r.json();
    if (f.endsWith('search.json')) { const q = (new URL(path, 'http://x').searchParams.get('q') || '').toLowerCase(); return { results: j.results.filter(c => c.mint === q || (c.symbol || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)).slice(0, 12) }; }
    return j;
  }
  if (PROF !== 'strict' && path.startsWith('/api/')) path += (path.includes('?') ? '&' : '?') + 'profile=' + PROF;
  const t = LS.getItem('t');
  const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + (t || ''), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 401) { S.unauth = true; throw new Error('401'); }
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; try { e.body = await r.json(); } catch (_) {} throw e; }
  S.unauth = false;
  return r.json();
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) });
function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }

/* ---------- profile switch (Strict / Loose) ---------- */
const profileSwitch = () => LIVE_ONLY ? '' : `<div class="seg pswitch" role="tablist" aria-label="Paper profile">${PROFILES.map(p => `<button data-p="${p}" class="${PROF === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>`;
function bindSwitch(root) {
  root.querySelectorAll('.pswitch button').forEach(b => b.onclick = async () => {
    if (b.dataset.p === PROF) return;
    PROF = b.dataset.p; LS.setItem('p', PROF); S.state = null; S.chart = null; S.activity = null;
    await refresh(); show(S.tab);
  });
}
const profLine = (n) => { if (LIVE_ONLY) return ''; const P = S.state && S.state.profiles; if (!P) return ''; const c = p => (P[p] && P[p].agents[n] ? P[p].agents[n].count : '–'); return `<span class="pcount">${PROFILES.map(p => p + ' ' + c(p)).join(' · ')}</span>`; };
const statsLine = () => { if (LIVE_ONLY) return ''; const P = S.state && S.state.profiles && S.state.profiles[PROF], t = P && P.stats; if (!t) return ''; return t.trades ? `${t.trades} trades · ${t.wins}W ${t.losses}L · ${t.win_rate}% win · ${t.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(t.pnl_usd).toFixed(2)} after fees` + (t.best ? ` · best ${esc(t.best.name)} ${t.best.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(t.best.pnl_usd).toFixed(2)} · worst ${esc(t.worst.name)} ${t.worst.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(t.worst.pnl_usd).toFixed(2)}` : '') : 'No closed trades yet'; };

/* ---------- error banner ---------- */
function banner() {
  const b = $('#banner');
  if (S.unauth) { b.hidden = false; b.textContent = STATIC ? 'No data · open the desk link with #d=… once' : 'Not signed in · open the desk link with #t=… once'; return; }
  if (STATIC && S.state && Date.now() / 1000 - S.state.ts > 240 && !S.offline) { b.hidden = false; b.textContent = 'Desk data is ' + Math.round((Date.now() / 1000 - S.state.ts) / 60) + ' min old · the desk may be restarting'; return; }
  if (!S.offline) { b.hidden = true; return; }
  const n = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000));
  b.hidden = false;
  b.textContent = `Desk offline · retrying in ${n}s · last update ${S.lastOk ? new Date(S.lastOk).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'never'}`;
}
setInterval(banner, 1000);

/* ---------- odometer ---------- */
class Odo {
  constructor(el) { this.el = el; this.str = null; this.digits = []; }
  set(str) {
    if (this.str === str) return;
    const chars = [...str], rebuild = this.str === null || this.str.length !== str.length;
    if (rebuild) {
      this.el.innerHTML = ''; this.digits = [];
      chars.forEach(c => {
        if (/\d/.test(c)) {
          const d = document.createElement('span'); d.className = 'd';
          const col = document.createElement('span'); col.className = 'col';
          col.innerHTML = '0123456789'.split('').map(x => `<span>${x}</span>`).join('');
          col.style.transition = 'none'; col.style.transform = `translateY(${-68 * Number(c)}px)`;
          d.appendChild(col); this.el.appendChild(d); this.digits.push({ col, v: Number(c) });
        } else { const s = document.createElement('span'); s.className = 'sym'; s.textContent = c; this.el.appendChild(s); this.digits.push(null); }
      });
    } else {
      let rank = 0; const idxs = [];
      chars.forEach((c, i) => { const d = this.digits[i]; if (d && Number(c) !== d.v) idxs.push(i); });
      idxs.reverse().forEach(i => {                    // each changed digit rolls 600ms ease-out, 30ms stagger right to left
        const d = this.digits[i], v = Number(chars[i]);
        d.col.style.transition = reduce ? 'none' : `transform 600ms ease-out ${rank * 30}ms`;
        d.col.style.transform = `translateY(${-68 * v}px)`; d.v = v; rank++;
      });
    }
    this.str = str;
  }
}

/* ---------- home ---------- */
const Home = {
  mount(root) {
    root.innerHTML = `
      <div class="nav"><button class="iconbtn" id="h-avatar" aria-label="Account"><span class="avatar">G</span></button>
        <div class="title">Grok Bot <i>›</i></div>
        <div class="navr"><button class="iconbtn" id="h-search" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button>
        <button class="iconbtn" id="h-bell" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg><span class="dot" id="h-dot" hidden></span></button></div></div>
      <div class="balrow"><div class="bal" id="h-bal"></div><span class="pill paper" id="h-paper" hidden${LIVE_ONLY ? ' style="display:none"' : ''}>${LIVE_ONLY ? '' : 'PAPER'}</span><span class="pill live" id="h-live" hidden>LIVE</span></div>
      <div class="today"><span id="h-today" class="num"></span><span class="pill mult" id="h-mult"></span></div>
      <div id="h-walletsplit" class="sec" style="font-size:12px;margin-top:2px;line-height:1.35" hidden></div>
      <div class="pswrap" id="h-psw">${profileSwitch()}</div>
      <div id="h-stats" class="sec" style="font-size:12px;margin-top:6px;line-height:1.35"></div>
      <div id="h-livestats" style="font-size:12px;margin-top:4px;line-height:1.35;color:var(--red)" hidden></div>
      <div id="h-paperstats" class="sec" style="font-size:12px;margin-top:4px;line-height:1.35${LIVE_ONLY ? ';display:none' : ''}" hidden></div>
      <div id="h-ticket" class="sec" style="font-size:13px;margin-top:8px" hidden></div>
      <div id="h-rules">${LIVE_ONLY ? '' : ''}</div>
      <div class="chartwrap"><canvas id="h-chart"></canvas></div>
      <div class="range" id="h-range">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-r="${r}">${r}</button>`).join('')}</div>
      <div class="h2"><span id="h-agents-t">Agents · 5 running</span></div>
      <div class="carousel" id="h-car"></div>
      <div class="h2"><span>Activity</span><button id="h-seeall">See all</button></div>
      <div id="h-act"></div>`;
    bindSwitch(root);
    this.odo = new Odo($('#h-bal')); this.cardHash = {}; this.prevLast = null; this.born = {};
    $('#h-avatar').onclick = () => go('account'); $('#h-seeall').onclick = () => go('activity');
    $('#h-search').onclick = () => push('search');
    $('#h-bell').onclick = async () => { try { await post('/api/unread/clear'); } catch (_) {} go('activity'); };
    $('#h-range').onclick = e => { const r = e.target.dataset.r; if (r) { S.range = r; LS.setItem('range', r); loadChart().then(() => this.drawChart()); this.ranges(); } };
    this.ranges(); this.first = true;
    // loading skeleton until the first state arrives
    if (!S.state) { $('#h-bal').innerHTML = '<div class="sk" style="width:220px;height:56px"></div>'; $('#h-car').innerHTML = '<div class="sk acard"></div>'; $('#h-act').innerHTML = '<div class="sk" style="height:200px"></div>'; this.skel = true; }
    this.update();
  },
  ranges() { document.querySelectorAll('#h-range button').forEach(b => b.classList.toggle('on', b.dataset.r === S.range)); },
  update() {
    const st = S.state; if (!st) return;
    if (this.skel) { this.skel = false; $('#h-bal').innerHTML = ''; this.odo = new Odo($('#h-bal')); $('#h-car').innerHTML = ''; $('#h-act').innerHTML = ''; }
    const lv = st.live || null;
    const livePot = (st.headline === 'live' || PROF === 'trench') && lv && lv.wallet_usd != null && lv.wallet_usd !== '';
    const ps = $('#h-paperstats');
    if (livePot) {
      this.odo.set(fmt$(Number(lv.wallet_usd)));
      $('#h-paper').hidden = true;
      $('#h-live').hidden = false;
      $('#h-live').textContent = lv.on ? 'LIVE ON' : 'LIVE OFF';
      const pnl = Number(lv.pnl_usd) || 0;
      const pnlTxt = `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
      const today = $('#h-today'); today.textContent = pnlTxt; today.className = 'num ' + (pnl >= 0 ? 'green' : 'red');
      $('#h-mult').textContent = lv.wallet_sol != null && lv.wallet_sol !== '' ? Number(lv.wallet_sol).toFixed(3) + ' SOL' : 'live P&L';
      const open = (lv.open && lv.open.length)
        ? ' · open: ' + lv.open.map(o => (o.name || o.mint) + (o.pct != null ? ` ${o.pct >= 0 ? '+' : ''}${o.pct}%` : '')).join(', ')
        : ' · 0 open';
      const fail = lv.failed ? ` · ${lv.failed} failed` + (lv.failed_last && lv.failed_last.name ? ` (${lv.failed_last.name})` : '') : '';
      const off = lv.on ? '' : ' · ' + (lv.why_off || 'off');
      $('#h-stats').textContent = `LIVE · ${lv.trades} closed · ${lv.wins}W ${Math.max(0, lv.trades - lv.wins)}L · ${pnlTxt} · ${lv.buys}/${lv.max_buys} buys${open}${fail}${off}`;
      const ls = $('#h-livestats'); ls.hidden = true;
      const paperBal = st.paper_balance != null ? Number(st.paper_balance) : null;
      ps.hidden = LIVE_ONLY;
      if (!LIVE_ONLY) ps.textContent = (paperBal != null ? `paper $${paperBal.toFixed(2)} · ` : 'paper · ') + (statsLine() || 'No closed paper trades yet');
      const sp = $('#h-walletsplit');
      if (sp) {
        if (lv.wallet_sol_usd != null && lv.wallet_sol_usd !== '' && lv.wallet_tokens_usd != null && lv.wallet_tokens_usd !== '') {
          sp.hidden = false;
          sp.textContent = `SOL $${Number(lv.wallet_sol_usd).toFixed(2)} · tokens $${Number(lv.wallet_tokens_usd).toFixed(2)}`;
        } else { sp.hidden = true; }
      }
    } else {
      const sp = $('#h-walletsplit'); if (sp) sp.hidden = true;
      this.odo.set(fmt$(st.balance));
      $('#h-paper').hidden = st.mode !== 'PAPER'; $('#h-paper').textContent = PROF === 'strict' ? 'PAPER' : 'PAPER · ' + PROF.toUpperCase();
      $('#h-stats').textContent = statsLine();
      $('#h-live').hidden = !lv; if (lv) $('#h-live').textContent = lv.on ? 'LIVE ON' : 'LIVE OFF';
      const ls = $('#h-livestats'); ls.hidden = !lv;
      if (lv) {
        const wal = lv.wallet_usd != null && lv.wallet_usd !== '' ? `wallet $${Number(lv.wallet_usd).toFixed(2)}` : 'wallet –';
        const pnl = `${lv.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(lv.pnl_usd).toFixed(2)}`;
        const open = (lv.open && lv.open.length)
          ? ' · open: ' + lv.open.map(o => (o.name || o.mint) + (o.pct != null ? ` ${o.pct >= 0 ? '+' : ''}${o.pct}%` : '')).join(', ')
          : ' · 0 open';
        const fail = lv.failed ? ` · ${lv.failed} failed` + (lv.failed_last && lv.failed_last.name ? ` (${lv.failed_last.name})` : '') : '';
        const off = lv.on ? '' : ' · ' + (lv.why_off || 'off');
        ls.textContent = `LIVE (real money) · ${wal} · ${lv.trades} closed · ${lv.wins}W ${lv.trades - lv.wins}L · ${pnl} · ${lv.buys}/${lv.max_buys} buys${open}${fail}${off}`;
      }
      ps.hidden = true;
      const t = $('#h-today'); t.textContent = (st.today_pct >= 0 ? '+' : '') + st.today_pct.toFixed(2) + '%'; t.className = 'num ' + (st.today_pct >= 0 ? 'green' : 'red');
      $('#h-mult').textContent = st.multiplier.toFixed(2) + '×';
    }
    const slot = $('#h-rules'); if (slot) slot.innerHTML = rulesCard() + pumpFeed();
    $('#h-dot').hidden = !st.unread;
    const tk = $('#h-ticket'); tk.hidden = !(st.ticket_warning || st.ticket_note); tk.textContent = st.ticket_warning || st.ticket_note || ''; tk.style.color = st.ticket_warning ? 'var(--orange)' : '';
    const running = Object.values(st.agents).filter(a => !a.paused).length;
    $('#h-agents-t').textContent = `Agents · ${running} running`;
    this.cards(); this.drawChart(); this.acts();
  },
  cards() {
    const car = $('#h-car'), a = S.state.agents; const order = ['auditor', 'scanner', 'analyst', 'executor', 'risk'];
    order.forEach(n => {
      let el = car.querySelector(`[data-a="${n}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'acard'; el.dataset.a = n; car.appendChild(el); el.onclick = () => { if (n === 'auditor' && a.auditor.live) push('audit', a.auditor.live.mint); }; }
      const html = agentCard(n, a[n]) + profLine(n) + '<i hidden>' + PROF + '</i>';
      if (this.cardHash[n] !== html) { el.innerHTML = html; this.cardHash[n] = html; afterCard(el, n, a[n]); }
    });
  },
  async acts() {
    try {
      const j = await api('/api/activity'); const el = $('#h-act'); if (!el) return;
      el.innerHTML = actList(liveRows(j.rows).slice(0, 5), PROF === 'trench' ? 'No live trades yet' : 'Nothing yet tonight'); bindRows(el);
    } catch (_) {}
  },
  drawChart() {
    const c = S.chart, cv = $('#h-chart'); if (!c || !cv) return;
    const now = Date.now();
    const marks = c.marks.map(m => { const k = m.ts + m.label; if (!this.born[k]) this.born[k] = this.first ? 0 : now; return { ...m, born: this.born[k] }; });
    const last = c.points[c.points.length - 1];
    const draw = (slide) => Charts.drawLine(cv, { points: c.points, marks: marks.map(m => ({ ...m, alpha: reduce || !m.born ? 1 : (Date.now() - m.born) / 200 })), start: c.start, empty: c.marks.length === 0, slide });
    const prev = this.prevLast; this.prevLast = last;
    this.first = false;
    if (!reduce && prev && last && (prev[1] !== last[1]) && c.points.length > 1) {
      const t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / 250); draw({ from: prev, t: k }); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
    } else draw(null);
    if (marks.some(m => m.born && Date.now() - m.born < 200) && !reduce) { const t0 = performance.now(); const step = t => { draw(null); if (t - t0 < 220) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  },
};

function srcTag(s) { if (LIVE_ONLY) return ''; return s && s.startsWith('copy:') ? ` · ${esc(s)}` : ''; }
function agentCard(n, c) {
  const head = (title, color, count) => `<div class="an"><span class="sdot ${c.paused ? 'off' : ''}"></span><span style="color:${color || '#fff'}">${title}</span></div>`;
  if (n === 'scanner') {
    const rows = liveRows(c.feed).slice(0, 5).map(f => f.verdict === 'kill'
      ? `<div class="r kill"><span class="n">${esc(f.name)}</span><span class="v">${esc(f.reason)}</span></div>`
      : `<div class="r"><span class="n">${esc(f.name)} · liq ${fmtBig(f.liq)}${srcTag(f.source)}</span><span class="v">→ auditor</span></div>`).join('');
    return `${head('Scanner', '#64d2ff')}<div class="big">${c.count} <span class="sub" style="font-size:15px">pools</span></div>
      <div class="feed">${rows || '<div class="sec">Listening for graduations</div>'}</div>`;
  }
  if (n === 'auditor') {
    const L = c.live, layers = L ? L.layers : [];
    const strips = Array.from({ length: 8 }, (_, i) => { const l = layers[i]; const cls = l ? (l.pass === true ? 'ok' : l.pass === false ? 'bad' : '') : (L && L.running && i === layers.length ? 'run' : ''); return `<div class="strip ${cls}">${i + 1}</div>`; }).join('');
    const status = !L ? 'Waiting for a coin' : (L.running || L.passed == null) ? 'checking' : L.passed === true ? '8/8 → Executor' : ('auditor rejected: ' + esc(L.reason || ''));
    return `${head('Auditor')}<div class="big">${c.count} <span class="sub" style="font-size:15px">taken apart</span></div>
      <div class="sub">${L ? esc(L.name) : ''}</div><div class="strips">${strips}</div>
      <div class="feed" style="margin-top:auto"><div class="r"><span>${status}</span><span class="v">${c.rejected} rejected</span></div></div>`;
  }
  if (n === 'analyst') {
    const l = c.last;
    return `${head('Analyst', '#ffd60a')}<div class="big">${l ? 'Scoring' : 'Scoring'}</div><div class="sub">${l ? esc(l.name || '') + (l.passed ? '' : ' · ' + esc(l.reason || '')) : 'Waiting for a coin'}</div>
      <div class="ringbox"><canvas data-ring="${l ? l.score : ''}" data-th="${l ? l.threshold : 70}"></canvas><div class="sub">${c.mode === 'rules' ? 'Rules mode' : 'Jev'}<br>green from ${l ? l.threshold : 70}</div></div>`;
  }
  if (n === 'executor') {
    const l = c.last;
    const bar = l ? (l.status === 'bought' ? '✓ Filled' : l.status === 'sent' ? 'Executing...' : esc(l.status)) : '';
    return `${head('Executor', '#00d35a')}<div class="big">${c.count} <span class="sub" style="font-size:15px">trades</span></div>
      <div class="sub">${l ? (fmt$(l.size, 2) + (l.live || l.pct == null ? ' · live' : ' · ' + l.pct + '% of stack')) : 'No live trades yet'}</div>
      <div style="margin-top:auto"><div class="sub">${bar}</div><div class="bar"><i style="width:${l && l.status === 'bought' ? 100 : 0}%"></i></div></div>`;
  }
  const le = c.last_exit;
  const exitTxt = le ? (le.label + ' · ' + esc(le.name) + (le.pnl_usd != null ? ' · ' + (le.pnl_usd >= 0 ? '+' : '-') + '$' + Math.abs(le.pnl_usd).toFixed(2) : '')) : '';
  return `${head('Risk', '#ff6b9a')}<div class="big">${c.guarding ? 'Guarding' : 'Guarding'}</div><div class="sub">${c.guarding ? c.count + ' open' : (exitTxt || 'Nothing open')}</div>
    ${c.guarding && le ? `<div class="sub">${exitTxt}</div>` : ''}
    <div class="pills"><span class="pill stop">stop -${c.stop_pct}%</span><span class="pill trail">trail ${c.trail_pct}%</span></div>`;
}
function afterCard(el, n, c) {
  if (n === 'analyst') { const cv = el.querySelector('canvas'); if (cv) Charts.drawRing(cv, cv.dataset.ring === '' ? null : Number(cv.dataset.ring), Number(cv.dataset.th)); }
  if (n === 'executor') { const i = el.querySelector('.bar i'); if (i && c.last && c.last.status === 'bought' && !reduce) { i.style.transition = 'none'; i.style.width = '0'; requestAnimationFrame(() => { i.style.transition = 'width 1.2s linear'; i.style.width = '100%'; }); } }
}

function actList(rows, emptyText) {
  if (!rows || !rows.length) return `<div class="empty card">${emptyText}</div>`;
  return `<div class="list">${rows.map(r => {
    const note = r.live_fail || '';
    let sub = r.subtitle || '';
    if (note && sub.includes(note)) sub = sub.replace(new RegExp('(?: · )?' + note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').replace(/ · $/, '');
    const name = (r.title || '').replace(/^(?:(?:LIVE|PAPER) · )+(?:(?:trench|loose|news) · )?(Bought|Sold|Stopped|Rejected|Buy failed|Switched) /, '');
    const bad = r.kind === 'stopped' || r.kind === 'failed' || r.kind === 'auto_off' || (r.value || '').startsWith('-');
    return `<button class="row" data-open="${r.opens}" data-mint="${esc(r.mint || '')}">
    <span class="logo">${initials(name)}</span>
    <span class="mid"><div class="t">${esc(r.title)}</div><div class="s">${esc(sub)} · ${hhmm(r.ts)}${srcTag(r.source)}</div>${note ? `<div class="s livefail">${esc(note)}</div>` : ''}</span>
    <span class="rv ${bad ? 'red' : r.kind === 'sold' || r.kind === 'hold' ? 'green' : r.kind === 'rejected' ? 'sec' : ''}">${esc(r.value)}</span></button>`;
  }).join('')}</div>`;
}
function bindRows(el) { el.querySelectorAll('.row[data-mint]').forEach(b => b.onclick = () => push(b.dataset.open === 'coin' ? 'coin' : 'audit', b.dataset.mint)); }

/* ---------- agents tab ---------- */
const Agents = {
  mount(root) {
    root.innerHTML = `<div class="big-title" style="margin-top:14px">Agents</div><div id="ag"></div>`;
    this.dec = {}; this.last = 0; this.update();
  },
  async update() {
    const st = S.state, root = $('#ag'); if (!root) return;
    if (!st) { root.innerHTML = [1, 2, 3].map(() => '<div class="sk" style="height:140px;margin-bottom:14px;border-radius:20px"></div>').join(''); return; }
    if (Date.now() - this.last > 10000) { this.last = Date.now(); await Promise.all(['scanner', 'auditor', 'analyst', 'executor', 'risk'].map(async n => { try { this.dec[n] = (await api(`/api/agents/${n}/decisions`)).decisions; } catch (_) {} })); }
    const label = { scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', executor: 'Executor', risk: 'Risk' };
    root.innerHTML = ['scanner', 'auditor', 'analyst', 'executor', 'risk'].map(n => {
      const a = st.agents[n], d = liveRows(this.dec[n] || []).slice(0, 20);
      return `<div class="fullcard" id="ag-${n}"><div class="top"><span class="sdot ${a.paused ? 'off' : ''}"></span><span class="nm">${label[n]}</span>
        <span class="sec">${a.count} ${esc(a.unit)}</span><button class="switch ${a.paused ? '' : 'on'} ${a.locked ? 'lock' : ''}" data-sw="${n}" aria-label="pause or resume ${n}"></button></div>
        <div class="sec" style="font-size:13px;margin-top:2px">${a.paused ? 'paused' : 'running'}${a.locked ? ' · locked while a position is open' : ''} · ${profLine(n).replace(/<[^>]+>/g, '')}</div>
        <div class="dec">${d.length ? d.map(x => `<div class="r"><span class="tm">${hhmm(x.ts)}</span><a class="co" href="${esc(x.coin_url)}" target="_blank" rel="noopener">${esc(x.coin)}</a><span class="vd ${/kill|reject|skipped|stop/.test(x.verdict) ? 'red' : /pass|bought|trail|sent/.test(x.verdict) ? 'green' : ''}">${esc(x.verdict)}</span><span class="rs">${esc(x.reason || '')}</span></div>`).join('') : '<div class="sec" style="padding:8px 0">No decisions yet</div>'}</div>
        ${LIVE_ONLY ? '' : '<button class="link" data-set="' + n + '">Settings</button>'}</div>`;
    }).join('');
    root.querySelectorAll('[data-sw]').forEach(b => b.onclick = async () => {
      const n = b.dataset.sw, a = st.agents[n];
      try { await post(`/api/agents/${n}/${a.paused ? 'resume' : 'pause'}`); await refresh(); this.last = 0; } catch (e) { toast(e.body && e.body.detail ? e.body.detail : 'Risk can’t be paused while a position is open'); }
    });
    root.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { S.scrollTo = 'grp-' + b.dataset.set; go('account'); });
  },
};

/* ---------- activity tab ---------- */
const Activity = {
  async mount(root) {
    root.innerHTML = `<div class="big-title" style="margin-top:14px">Activity</div><div class="pswrap">${profileSwitch()}</div><div id="al"><div class="sk" style="height:300px"></div></div><div id="more"></div>`;
    bindSwitch(root); this.rows = []; this.next = null; await this.update(true);
  },
  async update(first) {
    try {
      const j = await api('/api/activity'); if (!$('#al')) return;
      this.rows = liveRows(j.rows); this.next = j.next; this.draw();
    } catch (_) {}
  },
  draw() {
    $('#al').innerHTML = actList(this.rows, PROF === 'trench' ? 'No live trades yet' : 'Nothing yet tonight'); bindRows($('#al'));
    $('#more').innerHTML = this.next ? '<button class="cta plain" id="more-b">Load more</button>' : '';
    const b = $('#more-b'); if (b) b.onclick = async () => { const j = await api('/api/activity?before=' + this.next); this.rows = this.rows.concat(j.rows); this.next = j.next; this.draw(); };
  },
};

/* ---------- account tab ---------- */
const GROUPS = [['scanner', 'Scanner'], ['auditor', 'Auditor'], ['analyst', 'Analyst'], ['executor', 'Executor'], ['risk', 'Risk'], ['desk', 'Desk']];
const RULES = ['alive_volume_h1', 'organic_buys_h1', 'bundled_penalty', 'bundled_from', 'flush_drop_m5_pct', 'chase_h1_pct'];
const HIDE = ['desk.mode', 'desk.live_stack', 'desk.paper_start_stack'];
const pretty = k => k.split('.')[1].replace(/_/g, ' ');
const Account = {
  async mount(root) {
    root.innerHTML = `<div class="big-title" style="margin-top:14px">Account</div><div id="ac"><div class="sk" style="height:420px"></div></div>`;
    this.dirty = 0; await this.load();
  },
  async load() {
    try { [S.account, S.settings] = await Promise.all([api('/api/account'), api('/api/settings')]); } catch (_) {}
    this.draw();
  },
  update() { if (!this.dirty || Date.now() - this.dirty > 8000) this.load(); },
  draw() {
    const A = S.account, ST = S.settings, root = $('#ac'); if (!root || !A || !ST) return;
    const v = ST.values, rg = ST.ranges;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const fld = k => {
      const r = rg[k], val = v[k], id = 'f-' + k.replace('.', '-');
      if (r.type === 'bool') return `<div class="fld"><label class="lk">${pretty(k)}</label><button class="switch ${val ? 'on' : ''}" data-bool="${k}"></button></div>`;
      if (r.enum) return `<div class="fld"><label class="lk">${pretty(k)}</label><select data-enum="${k}" style="background:#2c2c2e;color:#fff;border:0;border-radius:10px;height:44px;padding:0 10px;font:500 16px -apple-system,system-ui">${r.enum.map(e => `<option ${e === val ? 'selected' : ''}>${e}</option>`).join('')}</select></div>`;
      if (r.type === 'str') return `<div class="fld"><label class="lk">${pretty(k)}</label><input type="text" data-str="${k}" value="${esc(val)}" style="width:190px"></div>`;
      return `<div class="sl"><div class="top"><label class="lk">${pretty(k)}</label><input type="number" inputmode="decimal" step="any" data-num="${k}" value="${val}"></div>
        <input type="range" data-rng="${k}" min="${r.min}" max="${r.max}" step="${(r.max - r.min) / 200}" value="${val}"><div class="rng ter" style="font-size:12px;margin-top:-6px;padding-bottom:6px">range ${r.min} to ${r.max}</div></div>`;
    };
    const groupHtml = ([g, name]) => {
      let keys = Object.keys(rg).filter(k => rg[k].group === g && !HIDE.includes(k));
      if (g === 'analyst') {
        const rules = keys.filter(k => RULES.includes(k.split('.')[1])), main = keys.filter(k => !rules.includes(k));
        return `<div class="setgrp" id="grp-analyst"><h3>Analyst</h3><div class="list">${main.map(fld).join('')}</div><h3 style="margin-top:16px">Analyst (rules)</h3><div class="list">${rules.map(fld).join('')}</div></div>`;
      }
      return `<div class="setgrp" id="grp-${g}"><h3>${name}</h3><div class="list">${keys.map(fld).join('')}</div></div>`;
    };
    root.innerHTML = `
      ${LIVE_ONLY ? '' : `      <div class="list"><div class="fld"><label class="lk">Mode</label><div class="seg" style="width:190px"><button data-mode="PAPER" class="${A.mode === 'PAPER' ? 'on paper' : ''}">PAPER</button><button data-mode="LIVE" class="${A.mode === 'LIVE' ? 'on' : ''}">LIVE</button></div></div>
        <div class="fld"><label class="lk">${A.mode === 'LIVE' ? 'Live stack' : 'Paper start stack'}</label><input type="number" inputmode="decimal" id="stackf" value="${A.stack}"><button class="link" id="stack-save">Save</button></div></div>`}
      <div class="list" style="margin-top:16px">
        ${A.profile_url ? `<a class="row" href="${esc(A.profile_url)}" target="_blank" rel="noopener"><span class="mid"><div class="t">Your FOMO profile</div><div class="s">@${esc(A.fomo_handle)}</div></span><span class="sec">›</span></a>`
          : `<div class="row"><span class="mid"><div class="t">Your FOMO profile</div><div class="s">Set your FOMO username below</div></span></div>`}
        <button class="row" id="invite"><span class="mid"><div class="t">Invite a friend</div><div class="s">Share the FOMO sign-up link</div></span><span class="sec">›</span></button>
        ${standalone ? `<button class="row" id="notif"><span class="mid"><div class="t">Enable notifications</div><div class="s">${A.webpush.subs ? 'On for this device' : 'Web push to this home screen app'}</div></span><span class="sec">›</span></button>` : ''}
        <div class="row"><span class="mid"><div class="t">Telegram</div><div class="s">${A.telegram.connected ? 'Connected' + (A.telegram.username ? ' · @' + esc(A.telegram.username) : '') : A.telegram.enabled ? 'Waiting for /start' + (A.telegram.username ? ' · @' + esc(A.telegram.username) : '') : 'Not connected'}</div></span></div>
        <button class="row" id="testpush"><span class="mid"><div class="t">Send test push</div></span><span class="sec">›</span></button></div>
      ${LIVE_ONLY ? rulesCard() : GROUPS.map(groupHtml).join('')}
      ${LIVE_ONLY ? '' : `<div class="sec" style="font-size:12px;margin:22px 0 4px;text-align:center">Analyst mode ${esc(A.analyst_mode)} · hosting plan ${esc(A.hosting)}</div>`}`;
    this.bind(root);
    if (STATIC) {
      root.insertAdjacentHTML('afterbegin', '<div class="card" style="margin-bottom:14px;padding:14px 16px"><div class="ct">Read-only view</div><div class="sec" style="font-size:14px;line-height:1.4">This is the published copy of the desk (live numbers refresh every few seconds). The card below is the live Trench rules it runs by now.</div></div>');
      root.querySelectorAll('input,select,.switch,[data-mode],#stack-save,#testpush,#notif').forEach(e => { e.disabled = true; e.style.opacity = '.45'; });
    }
    if (S.scrollTo) { const t = document.getElementById(S.scrollTo); if (t) t.scrollIntoView(); S.scrollTo = null; }
  },
  bind(root) {
    const save = async (k, val) => {
      this.dirty = Date.now();
      try { const r = await post('/api/settings', { [k]: val }); if (r.ticket_warning) toast(r.ticket_warning); else if (r.ticket_note) toast(r.ticket_note); else toast('Saved'); S.settings.values[k] = val; refresh(); }
      catch (e) { toast((e.body && e.body.errors && e.body.errors[k]) || 'Not saved'); this.load(); }
    };
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => {
      const m = b.dataset.mode; if (m === S.account.mode) return;
      if (m === 'LIVE') { const t = prompt('Type LIVE to confirm'); if (t !== 'LIVE') return; try { await post('/api/mode', { mode: 'LIVE', confirm: 'LIVE' }); } catch (e) { toast((e.body && e.body.detail) || 'Not switched'); return; } }
      else await post('/api/mode', { mode: 'PAPER' });
      await refresh(); this.load();
    });
    if ($('#stack-save')) $('#stack-save').onclick = () => save(S.account.mode === 'LIVE' ? 'desk.live_stack' : 'desk.paper_start_stack', $('#stackf').value);
    root.querySelectorAll('[data-bool]').forEach(b => b.onclick = () => {
      const k = b.dataset.bool, nv = !b.classList.contains('on');
      if (k === 'auditor.enabled' && !nv && !(confirm('Turn off the Auditor? Coins will be bought without being taken apart.') && confirm('Really turn it off? This removes the safety checks.'))) return;
      b.classList.toggle('on', nv); save(k, nv);
    });
    root.querySelectorAll('[data-enum]').forEach(s => s.onchange = () => save(s.dataset.enum, s.value));
    root.querySelectorAll('[data-str]').forEach(s => s.onchange = () => save(s.dataset.str, s.value));
    root.querySelectorAll('[data-num]').forEach(n => { const k = n.dataset.num, r = root.querySelector(`[data-rng="${k}"]`); n.onchange = () => { r.value = n.value; save(k, n.value); }; });
    root.querySelectorAll('[data-rng]').forEach(r => { const k = r.dataset.rng, n = root.querySelector(`[data-num="${k}"]`); r.oninput = () => { n.value = r.value; this.dirty = Date.now(); }; r.onchange = () => save(k, r.value); });
    $('#invite').onclick = async () => {
      const url = S.account.signup_url;
      if (navigator.share) { try { await navigator.share({ url }); return; } catch (_) { /* cancelled */ } }
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (_) { toast(url); }
    };
    $('#testpush').onclick = async () => { try { const r = await post('/api/test_push'); toast('Test push sent via ' + r.channels.join(', ')); } catch (_) { toast('Could not send'); } };
    const nb = $('#notif'); if (nb) nb.onclick = enableNotifications;
  },
};
async function enableNotifications() {
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    if (await Notification.requestPermission() !== 'granted') return toast('Notifications not allowed');
    const key = (await (await fetch('/vapid_public.txt')).text()).trim();
    const pad = '='.repeat((4 - key.length % 4) % 4), raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([...raw].map(c => c.charCodeAt(0))) });
    await post('/api/push', sub.toJSON()); toast('Notifications on');
  } catch (e) { toast('Could not enable notifications'); }
}

/* ---------- coin screen ---------- */
const Coin = {
  async mount(root, mint) {
    this.mint = mint;
    root.innerHTML = `<div class="page-h"><button class="back" id="back">‹</button><div class="coinhead" id="ch"><div class="sk" style="height:24px;width:160px"></div></div></div><div id="cb"><div class="sk" style="height:60px;width:200px"></div><div class="sk" style="height:240px;margin-top:14px"></div></div>`;
    $('#back').onclick = back; await this.update();
  },
  async update() {
    let c; try { c = await api('/api/coin/' + this.mint); } catch (e) { if (e.status === 404) { $('#cb').innerHTML = '<div class="empty">Unknown coin</div>'; } return; }
    if (!$('#cb')) return;
    $('#ch').innerHTML = `<span class="logo" style="width:32px;height:32px;border-radius:16px;background:#2c2c2e;display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:600;flex:none">${c.logo ? `<img src="${esc(c.logo)}" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : initials(c.symbol || c.name)}</span>
      <div style="min-width:0"><div class="nm">${esc(c.name || c.symbol || c.mint.slice(0, 6))}</div><div class="sec" style="font-size:13px">${esc(c.symbol || '')} · ${c.chain} · ${age(c.age_min)}${srcTag(c.source)}</div></div>
      ${c.shield ? `<span class="chip ${c.shield === '8/8' ? '' : 'bad'}">${c.shield}</span>` : ''}${c.paper && !LIVE_ONLY ? '<span class="pill paper">PAPER</span>' : ''}`;
    const since = c.since_entry_pct;
    const ex = c.exit, pos = c.position;
    $('#cb').innerHTML = `<div class="price num">${fmtPrice(c.price)}</div>
      ${since != null ? `<div class="num ${since >= 0 ? 'green' : 'red'}" style="font-weight:600;margin-top:2px">${since >= 0 ? '▲' : '▼'} ${Math.abs(since).toFixed(1)}% since entry</div>` : ''}
      <div class="cchart" style="margin:12px -16px 0"><canvas id="cc"></canvas></div>
      <div class="stats"><div class="stat"><div class="k">Market cap</div><div class="v num">${fmtBig(c.stats.mcap)}</div></div><div class="stat"><div class="k">Liquidity</div><div class="v num">${fmtBig(c.stats.liquidity)}</div></div>
        <div class="stat"><div class="k">24h volume</div><div class="v num">${fmtBig(c.stats.volume_24h)}</div></div><div class="stat"><div class="k">Holders</div><div class="v num">${c.stats.holders == null ? 'n/a' : c.stats.holders.toLocaleString()}</div></div></div>
      ${pos ? `<div class="card"><div class="ct">Your position</div><div class="kv"><span>${fmt$(pos.size)} in</span><b>Executor</b></div>
        <div class="kv"><span>Stop line</span><b class="red num">${fmtPrice(ex.stop)} · -${pos.stop_pct}%</b></div>
        <div class="kv"><span>Trail line</span><b class="num">${ex.trail ? fmtPrice(ex.trail) + ' · ' + pos.trail_pct + '%' : 'starts at +20%'}</b></div>
        <div class="kv"><span>Time left to timeout</span><b class="num">${Math.floor(ex.timeout_left_s / 3600)}h ${Math.floor(ex.timeout_left_s % 3600 / 60)}m</b></div></div>` : ''}
      <a class="cta ${c.sell ? 'sell' : ''}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${c.sell ? 'Sell on FOMO' : 'Buy on FOMO'}</a>
      <button class="cta plain" id="seeaudit">See the audit</button>`;
    $('#seeaudit').onclick = () => push('audit', this.mint);
    Charts.drawCandles($('#cc'), c.candles, ex ? ex.current : null);
  },
};

/* ---------- auditor screen ---------- */
const NAMES = ['Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders', 'Liquidity', 'Pool age', 'Bundled wallets', 'Delegations'];
const Audit = {
  async mount(root, mint) {
    this.mint = mint; this.layers = []; this.running = false; this.idx = 0; this.phase = 'wait'; this.t0 = 0; this.data = null; this.token = (this.token || 0) + 1; this.empty = false;
    root.innerHTML = `<div class="page-h"><button class="back" id="back">‹</button><div class="coinhead"><div class="nm" id="at">Auditor</div></div></div><div id="ab"><div class="sk" style="height:300px"></div></div>`;
    $('#back').onclick = back; await this.update();
  },
  async update() {
    let d; try { d = await api('/api/audit/' + this.mint); } catch (e) { if (e.status === 404) { this.empty = true; $('#ab').innerHTML = '<div class="empty card">No coin taken apart yet</div>'; } return; }
    if (!$('#ab')) return;
    if (!this.data) { this.data = d; this.build(); }
    this.data = d; this.layers = d.layers; this.running = d.running;
    $('#at').textContent = d.name;
    this.settle();
  },
  build() {
    const d = this.data;
    $('#ab').innerHTML = `<div class="discbox"><canvas id="dc"></canvas></div><div class="verdict" id="vd"></div>
      <div class="list" id="vr"></div>
      <div class="list" style="margin-top:16px"><div class="fld"><label class="lk">Take apart before buying</label><button class="switch ${d.enabled !== false ? 'on' : ''}" id="aen"></button></div></div>
      <a class="cta plain" href="${esc(d.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    $('#aen').onclick = async () => {
      const b = $('#aen'), nv = !b.classList.contains('on');
      if (!nv && !(confirm('Turn off the Auditor? Coins will be bought without being taken apart.') && confirm('Really turn it off? This removes the safety checks.'))) return;
      try { await post('/api/settings', { 'auditor.enabled': nv }); b.classList.toggle('on', nv); } catch (_) { toast('Not saved'); }
    };
    this.idx = 0; this.phase = 'wait'; this.loop(++this.token);
  },
  settle() { if (reduce) { this.idx = this.layers.length >= 8 || !this.running ? this.layers.length : this.layers.length; this.phase = 'wait'; this.frame(true); } },
  stateOf(i) { const l = this.layers[i]; if (i < this.idx) return l.pass === true ? 'ok' : l.pass === false ? 'bad' : 'skip'; return (i === this.idx && this.phase === 'beam') ? 'beam' : 'pending'; },
  frame(final) {
    const cv = $('#dc'); if (!cv) return;
    const states = Array.from({ length: 8 }, (_, i) => this.layers[i] ? this.stateOf(i) : 'pending');
    let beam = null;
    if (this.phase === 'beam') beam = this.idx + Math.min(1, (performance.now() - this.t0) / 350);
    else if (this.idx < 8 && this.running) beam = this.idx + 0.5;
    Charts.drawDiscs(cv, states, final ? null : beam, null);
    // value rows: only layers the server already sent AND the beam already passed
    $('#vr').innerHTML = NAMES.map((n, i) => { const l = this.layers[i], shown = l && i < this.idx;
      return `<div class="vrow"><span class="k"><span class="${shown ? (l.pass ? 'green' : l.pass === false ? 'red' : 'ter') : 'ter'}">${shown ? (l.pass ? '✓' : l.pass === false ? '✕' : '–') : '·'}</span>${n}</span><span class="num ${shown && l.pass === false ? 'red' : shown && l.pass === null ? 'nc' : 'sec'}">${shown ? esc(l.value) : '…'}</span></div>`; }).join('');
    const d = this.data;
    {
      const red = this.layers.find(l => l.pass === false);
      const nOk = this.layers.filter(l => l.pass === true).length;
      const finalPass = d.passed === true && nOk >= 8 && !red;
      const finalFail = d.passed === false || (!!red && d.running === false);
      if (finalFail && red) {
        $('#vd').innerHTML = `<div class="v1 red">auditor rejected: ${esc(red.value)}</div><div class="v2">Grok Bot won’t buy ${esc(d.name)}</div>`;
      } else if (finalPass) {
        $('#vd').innerHTML = `<div class="v1 green">Cleared · 8/8 parts</div><div class="v2">${d.sized ? 'Sent to Executor · ' + fmt$(d.sized) : 'Sent to Executor'}</div>`;
      } else {
        $('#vd').innerHTML = '<div class="v2">checking</div>';
      }
    }
  },
  async loop(token) {
    while (token === this.token && $('#dc')) {
      const l = this.layers[this.idx];
      if (reduce) { this.idx = this.layers.length; this.frame(true); await sleep(500); continue; }
      if (!l) { this.phase = 'wait'; this.frame(); await sleep(60); continue; }          // beam waits on the layer, never shows a result the server didn't send
      if (l.pass === null) { this.idx++; this.frame(); continue; }
      this.phase = 'beam'; this.t0 = performance.now();
      while (performance.now() - this.t0 < 350 && token === this.token) { this.frame(); await sleep(16); }
      this.idx++; this.phase = 'settle'; this.frame(); await sleep(150);
    }
  },
};

/* ---------- search ---------- */
const Search = {
  mount(root) {
    root.innerHTML = `<div class="page-h"><button class="back" id="back">‹</button><div class="coinhead"><div class="nm">Search</div></div></div>
      <div class="searchbox"><input type="text" id="q" placeholder="Name, symbol or mint" autocomplete="off" autocapitalize="off"></div><div id="sr"></div>`;
    $('#back').onclick = back; const q = $('#q'); q.focus(); let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      if (!q.value.trim()) { $('#sr').innerHTML = ''; return; }
      try { const j = await api('/api/search?q=' + encodeURIComponent(q.value.trim()));
        $('#sr').innerHTML = j.results.length ? `<div class="list">${j.results.map(r => `<button class="row" data-open="coin" data-mint="${esc(r.mint)}"><span class="logo">${initials(r.symbol || r.name)}</span><span class="mid"><div class="t">${esc(r.name || r.symbol || r.mint.slice(0, 8))}</div><div class="s">${esc(r.symbol || '')} · ${esc(r.mint.slice(0, 8))}…</div></span></button>`).join('')}</div>` : '<div class="empty">No coin found</div>';
        bindRows($('#sr')); } catch (_) {} }, 250); };
  },
  update() {},
};

/* ---------- news ---------- */
const News = {
  mount(root) {
    root.innerHTML = `<div class="nav"><div class="title">News</div></div>
      <div class="sec" id="news-blurb" style="font-size:13px;margin:4px 0 14px">Upcoming launches and coins backed by a real product or program. Not live, not financial advice.</div>
      <div id="news-book"></div>
      <div class="h2"><span>Picks</span></div>
      <div id="news-list"><div class="sk" style="height:220px"></div></div>`;
    this.update();
  },
  async update() {
    const el = document.getElementById('news-list'); if (!el) return;
    let j; try { j = await api('/api/news'); } catch (_) { return; }
    const book = document.getElementById('news-book');
    if (book && LIVE_ONLY) { book.innerHTML = ''; const blurb = document.getElementById('news-blurb'); if (blurb) blurb.textContent = 'Upcoming launches and coins backed by a real product or program. Not financial advice.'; }
    else if (book) {
      const trades = (j && j.trades) || [];
      const bal = j && j.news_balance;
      const blurb = document.getElementById('news-blurb');
      if (bal == null && !trades.length) {
        book.innerHTML = '';
        if (blurb) blurb.textContent = 'Upcoming launches and coins backed by a real product or program. Not live, not financial advice.';
      } else {
        if (blurb) blurb.textContent = 'Upcoming launches and coins backed by a real product or program. GOOD PICKs are paper-bought on the News book ($200, $20 tickets). Not live, not financial advice.';
        const head = `<div class="h2"><span>Paper book${bal != null ? ' · ' + fmt$(bal) : ''}</span></div>`;
        book.innerHTML = head + (trades.length ? actList(trades, 'No paper trades yet') : '<div class="empty card">No paper buys yet</div>');
        bindRows(book);
      }
    }
    const rows = (j && j.items) || [];
    if (!rows.length) { el.innerHTML = '<div class="empty card">No picks yet · the scanner is watching</div>'; return; }
    el.innerHTML = rows.map(n => {
      const cat = n.category === 'GOOD PICK' ? 'chip' : n.category === 'UPCOMING WATCH' ? 'chip' : 'chip';
      const catCol = n.category === 'GOOD PICK' ? '' : n.category === 'UPCOMING WATCH' ? ' style="background:rgba(100,210,255,.18);color:var(--cyan)"' : ' style="background:var(--card2);color:var(--sec)"';
      const why = (n.reasons || []).slice(0, 6).map(r => `<li>${esc(r)}</li>`).join('');
      const bits = [n.liq != null ? 'Liq ' + fmtBig(n.liq) : null, n.mcap != null ? 'Mcap ' + fmtBig(n.mcap) : null, n.rug_status ? 'Rug · ' + n.rug_status : null].filter(Boolean).join(' · ');
      const hrefs = [];
      if (n.coin_url) hrefs.push(`<a href="${esc(n.coin_url)}" target="_blank" rel="noopener">FOMO</a>`);
      if (n.dex_url) hrefs.push(`<a href="${esc(n.dex_url)}" target="_blank" rel="noopener">DexScreener</a>`);
      const site = n.links && n.links.website;
      if (site) hrefs.push(`<a href="${esc(site)}" target="_blank" rel="noopener">Website</a>`);
      const title = esc(n.name || n.symbol || (n.mint || '').slice(0, 8) || 'Item');
      const sub = [n.symbol, n.category === 'GOOD PICK' || n.category === 'UPCOMING WATCH' ? null : 'scored'].filter(Boolean).join(' · ');
      return `<div class="news-card">
        <div class="hd"><span class="${cat}"${catCol}>${esc(n.category || 'scored')}</span><span class="num" style="margin-left:auto">score ${n.score == null ? '–' : n.score}</span></div>
        <div class="ct">${title}${sub ? ` <span class="sec">${esc(sub)}</span>` : ''}</div>
        ${why ? `<ul class="why">${why}</ul>` : ''}
        ${bits ? `<div class="meta">${esc(bits)}</div>` : ''}
        ${hrefs.length ? `<div class="nlinks">${hrefs.join('')}</div>` : ''}
      </div>`;
    }).join('');
  },
};

/* ---------- router ---------- */
const SCREENS = { home: Home, agents: Agents, activity: Activity, account: Account, news: News, coin: Coin, audit: Audit, search: Search };
let current = null;
function show(name, arg) {
  current = SCREENS[name]; const root = $('#screen'); window.scrollTo(0, 0);
  current.mount(root, arg);
  const isTab = ['home', 'agents', 'activity', 'account', 'news'].includes(name);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', isTab ? t.dataset.tab === name : t.dataset.tab === S.tab));
}
function go(tab) { S.tab = tab; S.stack = []; history.replaceState(null, ''); show(tab); }
function push(name, arg) { S.stack.push([name, arg]); history.pushState({ n: S.stack.length }, ''); show(name, arg); }
function back() { if (S.stack.length) { S.stack.pop(); const t = S.stack[S.stack.length - 1]; if (t) show(t[0], t[1]); else show(S.tab); } }
window.addEventListener('popstate', () => { if (S.stack.length) back(); });
document.querySelectorAll('.tab').forEach(t => t.onclick = () => go(t.dataset.tab));

/* ---------- data loop + SSE ---------- */
async function loadChart() {
  try {
    const ch = await api('/api/chart?range=' + S.range);
    if (ch && LIVE_ONLY) {
      const since = appSince();
      ch.points = (ch.points || []).filter(p => p && p[0] >= since);
      ch.marks = (ch.marks || []).filter(m => (m.ts || 0) >= since);
      if (ch.points.length) ch.start = ch.points[0][1];
    }
    S.chart = ch;
  } catch (_) {}
}
async function refresh() {
  try {
    const [st] = await Promise.all([api('/api/state'), loadChart()]);
    S.state = st; syncProfiles(st); S.lastOk = Date.now(); S.offline = false;
  } catch (e) {
    if (S.unauth) { banner(); return; }
    S.offline = true; S.retryAt = Date.now() + (STATIC && !liveOn() ? 15000 : 5000);
  }
  banner(); if (current) current.update();
}
let rfTimer; const soon = () => { clearTimeout(rfTimer); rfTimer = setTimeout(refresh, 300); };
async function stream() {
  for (;;) {
    try {
      const r = await fetch('/api/stream', { headers: { Authorization: 'Bearer ' + (LS.getItem('t') || '') } });
      if (!r.ok || !r.body) throw new Error('stream');
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (chunk.match(/^event: (.+)$/m) || [])[1]; if (!ev) continue;
          if (ev === 'audit_layer' || ev === 'audit_done') { if (current === Audit) Audit.update(); soon(); }
          else if (['scan', 'verdict', 'signal', 'fill', 'exit', 'push'].includes(ev)) soon();
        }
      }
    } catch (_) {}
    await sleep(3000);
  }
}
window.addEventListener('resize', () => { if (current === Home) Home.drawChart(); });
show('home');
refresh(); if (STATIC) (async function loop() { for (;;) { await sleep(liveOn() ? 4000 : 15000); await refresh(); } })(); else setInterval(refresh, 5000); if (!STATIC) stream();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__app = { S, refresh, push, go };
})();
