/* Kloudy Desk · Kloud mode (paper only). No keys, no signing, plain DexScreener links only. */
const PRED = { dies: 'dies', 'graduation': 'graduates', '+50%': '+50%', '+100%': '+100%', '+15%': '+15%', '+25%': '+25%', 'stop -12%': 'stop −12%', flat: 'flat' };
const LS = window.localStorage;
function appDir() {
  let p = location.pathname || '/';
  if (/\/index\.html$/i.test(p)) p = p.replace(/index\.html$/i, '');
  if (!p.endsWith('/')) p += '/';
  return location.origin + p;
}
function paramFrom(str, name) {
  if (!str) return '';
  for (const part of str.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (decodeURIComponent(part.slice(0, i)) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return '';
}
function urlParam(name) {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const search = location.search.startsWith('?') ? location.search.slice(1) : '';
  return paramFrom(hash, name) || paramFrom(search, name) || '';
}
(function bootKey() {
  const urlD = urlParam('d'), urlT = urlParam('t');
  if (urlD) { LS.setItem('d', urlD); if (!urlT) LS.removeItem('t'); }
  if (urlT) LS.setItem('t', urlT);
  const d = LS.getItem('d') || '';
  if (d && !urlT) {
    const want = appDir() + '#d=' + encodeURIComponent(d);
    if (location.href.split('#')[0].replace(/\?.*$/, '') + (location.hash || '') !== want || location.search) {
      history.replaceState(null, '', want);
    }
    try {
      const start = appDir() + '?d=' + encodeURIComponent(d);
      const man = {
        name: 'Kloudy Desk', short_name: 'Kloudy Desk', display: 'standalone',
        background_color: '#bcc1c8', theme_color: '#bcc1c8', start_url: start, scope: appDir(),
        icons: [
          { src: appDir() + 'icons/icon-192-v20261118e.png', sizes: '192x192', type: 'image/png' },
          { src: appDir() + 'icons/icon-512-v20261118e.png', sizes: '512x512', type: 'image/png' },
          { src: appDir() + 'icons/icon-maskable-512-v20261118e.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      };
      const blob = new Blob([JSON.stringify(man)], { type: 'application/json' });
      const link = document.querySelector('link[rel="manifest"]');
      if (link) link.href = URL.createObjectURL(blob);
    } catch (e) {}
  }
})();
const DATA = LS.getItem('d'), STATIC = !!DATA && !LS.getItem('t');
const BASE = STATIC ? new URL('d/' + encodeURIComponent(DATA) + '/', appDir()).href : '';
let S = null, TAB = 'home', ERR = '', FILTER = 'all';
let LAST_GOOD = null, LAST_KEY = '', LAST_TAB = '';
const DEX = 'https://dexscreener.com/solana/';
const ICONV = '20261126c';
const BOT_ORDER = ['scanner', 'auditor', 'analyst', 'brain', 'executor', 'risk'];
const BOT_NAMES = { scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', brain: 'Brain', executor: 'Executor', risk: 'Risk', copy: 'Copy', dipscalp: 'Dip scalp' };

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function usd(n, z) { if (n == null || isNaN(n)) return z ? '–' : '$0.00'; const s = n < 0 ? '−' : ''; return s + '$' + Math.abs(n).toFixed(2); }
function k(n) { if (n == null) return '–'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'; return '$' + Math.round(n); }
function cls(n) { return n > 0 ? 'green' : n < 0 ? 'red' : ''; }
function tm(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function ago(s) { if (s == null) return '–'; if (s < 60) return Math.round(s) + 's'; if (s < 3600) return Math.round(s / 60) + 'm'; return Math.round(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm'; }
function card(title, body) { return `<div class="card">${title ? `<h3>${esc(title)}</h3>` : ''}${body}</div>`; }
function row(a, b, c) { return `<div class="row"><span>${a}</span><span class="${c || ''}">${b}</span></div>`; }
function pill(t, c) { return `<span class="pill ${c || ''}">${esc(t)}</span>`; }
function dexLink(o) {
  const u = (o && (o.dex || o.link)) || (o && o.mint ? DEX + o.mint : '');
  return String(u || '').split('?')[0];
}
function isJunk(s) {
  const t = String(s || '').toLowerCase();
  return new RegExp(('savi'+'pww') + '|referral|ref\\s*link|invite code|invite-code').test(t);
}
function cleanText(s) {
  return String(s || '').replace(/@\w+/g, '').replace(/\s+/g, ' ').trim();
}
function hasCopy() {
  const c = S && S.copy;
  if (!c || typeof c !== 'object') return false;
  const traders = c.followed || c.traders || c.watch || [];
  const trades = c.trades || c.copied || [];
  return !!(traders.length || trades.length || c.n_followed || c.count);
}
function copyData() {
  const c = (S && S.copy) || {};
  return {
    traders: c.followed || c.traders || c.watch || [],
    trades: c.trades || c.copied || [],
    n: c.n_followed || c.count || 0
  };
}
function hasDip() {
  const d = S && S.dipscalp;
  return !!(scalpOnly() || (d && (d.enabled || (d.trades && d.trades.length) || (d.stats && d.stats.trades) || (d.open && d.open.length))));
}
function dipData() {
  const d = (S && S.dipscalp) || {};
  const fromTrades = ((S && S.trades) || []).filter(t => (t.tag || '') === 'dipscalp');
  const trades = (d.trades && d.trades.length) ? d.trades : fromTrades;
  const st = d.stats || {};
  const closed = trades.filter(t => t.status === 'closed' || t.status === 'moonbag');
  return {
    trades,
    open: d.open || trades.filter(t => t.status === 'open' || t.status === 'moonbag'),
    stats: {
      trades: st.trades != null ? st.trades : closed.length,
      wins: st.wins != null ? st.wins : closed.filter(t => (t.pnl_usd || 0) > 0).length,
      pnl_usd: st.pnl_usd != null ? st.pnl_usd : closed.reduce((a, t) => a + (t.pnl_usd || 0), 0),
      fees_usd: st.fees_usd != null ? st.fees_usd : trades.reduce((a, t) => a + (t.fees_usd || 0), 0),
      open: st.open != null ? st.open : trades.filter(t => t.status === 'open').length
    },
    rules: d.rules || {},
    pot: d.pot || ((S && S.pot) || {}),
    note: d.note || ''
  };
}
function copyPaused() { return !!(S && S.copy && S.copy.paused); }
function scalpOnly() { return !!(S && (S.dipscalp_only || (S.sleeves && S.sleeves.normal && S.sleeves.normal.on === false))); }
function sleeveOn(id) {
  const sl = S && S.sleeves && S.sleeves[id];
  if (sl && sl.on === false) return false;
  if (id === 'copy') return !copyPaused();
  if (id === 'dipscalp') return true;
  return !scalpOnly();
}
function insiderPills(o) {
  const ins = (o && o.insider) || {};
  const bits = [];
  if (ins.bundle) bits.push(pill('bundle', 'bin'));
  if (ins.cluster) bits.push(pill('cluster', 'bin'));
  if (ins.sell_only) bits.push(pill('sell-only', 'bin'));
  if (ins.hidden_dev) bits.push(pill('hidden dev', 'bdev'));
  if (ins.early_insider) bits.push(pill('insider+', 'binplus'));
  return bits.join(' ');
}
function botIcon(id) {
  const file = id === 'dipscalp' ? 'cloud' : id;
  return `icons/bots/${file}.png?v=${ICONV}`;
}
function dots() { return `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>`; }
function syncThemeColor() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (!m) return;
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  m.content = dark ? '#131821' : '#bcc1c8';
}

async function load() {
  try {
    let j = null;
    const q = '?t=' + Math.floor(Date.now() / 3000);
    if (STATIC) {
      const alt = new URL('t/' + encodeURIComponent(DATA) + '/trap.json', appDir()).href;
      const get = u => fetch(u, { cache: 'no-store' }).then(x => x.ok ? x.json() : null).catch(() => null);
      j = await get(alt + q);                      // the desk publishes trap.json under t/; d/ is only a fallback
      if (!j) j = await get(BASE + 'trap.json' + q);
      if (!j) throw new Error('no trap.json');
    } else {
      const r = await fetch('/api/trap' + q, { headers: { Authorization: 'Bearer ' + (LS.getItem('t') || '') } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json();
    }
    S = j; LAST_GOOD = j; ERR = ''; applyLivePot();
  } catch (e) {
    if (LAST_GOOD) { S = LAST_GOOD; ERR = 'live feed hiccup, showing last data'; applyLivePot(); }
    else ERR = (DATA || LS.getItem('t')) ? 'Kloud mode data unavailable (' + e.message + ')' : 'Open the app with your private link';
  }
  render();
}

function headerStatus() {
  const st = (S && S.status) || 'no data';
  const mode = scalpOnly() ? ' · dip scalp only' : '';
  return `<div class="sub">${esc(st)}${mode} · paper day ${(S && S.paper_day) || 1}/${(S && S.paper_days) || 3}</div>`;
}

function computeLivePot() {
  const p = (S && S.pot) || {};
  const start = p.start_usd != null ? Number(p.start_usd) : 100;
  let realized = 0;
  if (S && S.totals && S.totals.pnl_usd != null && isFinite(S.totals.pnl_usd)) realized = Number(S.totals.pnl_usd);
  else ((S && S.trades) || []).forEach(t => {
    if (t && (t.status === 'closed' || t.status === 'moonbag') && t.pnl_usd != null && isFinite(t.pnl_usd)) realized += Number(t.pnl_usd);
  });
  let upnl = 0, openVal = 0;
  const opens = (S && ((S.open_positions || []).length ? S.open_positions : (S.open ? [S.open] : []))) || [];
  opens.forEach(t => {
    if (!t) return;
    if (t.upnl_usd_est != null && isFinite(t.upnl_usd_est)) upnl += Number(t.upnl_usd_est);
    if (t.value_usd_est != null && isFinite(t.value_usd_est)) openVal += Number(t.value_usd_est);
  });
  const eq = Math.round((start + realized + upnl) * 100) / 100;
  return { start, realized, upnl, eq, cash: Math.round((eq - openVal) * 100) / 100, openVal, pnl: Math.round((eq - start) * 100) / 100 };
}
function applyLivePot() {
  if (!S) return;
  const n = computeLivePot();
  S.pot = Object.assign({}, S.pot || {}, { start_usd: n.start, equity: n.eq, cash: n.cash, open_value: n.openVal, pnl_usd: n.pnl });
  if (S.agents && S.agents.risk) S.agents.risk.pot = S.pot;
  const curve = S.equity_curve || (S.equity_curve = []);
  const last = curve[curve.length - 1], now = Date.now() / 1000;
  if (!last || Math.abs((last.equity || 0) - n.eq) >= 0.005) {
    if (last && now - (last.t || 0) < 20) { last.equity = n.eq; last.cash = n.cash; last.t = now; }
    else curve.push({ t: now, equity: n.eq, cash: n.cash });
  }
}
function potNums() {
  const p = (S && S.pot) || {};
  const eq = p.equity != null ? p.equity : 100, start = p.start_usd != null ? p.start_usd : 100;
  const pnl = eq - start;
  const pct = start ? (pnl / start) * 100 : 0;
  const mult = start ? (eq / start) : 1;
  return { p, eq, start, pnl, pct, mult };
}

function hero() {
  const n = potNums();
  const sign = n.pct > 0 ? '+' : '';
  return `<div class="hero">
    <div class="hero-val ${cls(n.pnl)}">${usd(n.eq)}</div>
    <div class="hero-meta ${cls(n.pct)}">${sign}${n.pct.toFixed(2)}% · ${(Math.abs(n.mult-1)<0.01 && n.pnl ? n.mult.toFixed(3) : n.mult.toFixed(2))}x</div>
    <div class="hero-sub">${esc((S && S.status) || 'watching')} · paper day ${(S && S.paper_day) || 1}/${(S && S.paper_days) || 3}</div>
  </div>`;
}

function openPos() {
  return (S && (S.open || (S.open_positions || [])[0])) || null;
}

function liveChart() {
  const o = openPos();
  if (o) {
    const move = o.move_pct;
    const moveTxt = move == null ? '' : ((move > 0 ? '+' : '') + Number(move).toFixed(1) + '%');
    const cap = `Bought ${o.symbol || '?'} · ${usd(o.size_usd)} · verified`;
    const href = dexLink(o);
    return `<div class="chartcard">
      <div class="chart-top">
        <span class="live-tag"><span class="live-dot"></span> Live</span>
        <span class="chart-sym">$${esc(o.symbol || '?')} <span class="${cls(move)}">${esc(moveTxt)}</span></span>
      </div>
      <div class="chartwrap tall"><canvas id="poschart"></canvas></div>
      <div class="caption">
        <a class="caption-pill" href="${esc(href)}" target="_blank" rel="noopener">${esc(cap)} ${dots()}</a>
      </div>
    </div>`;
  }
  return `<div class="chartcard">
    <div class="chart-top">
      <span class="live-tag"><span class="live-dot"></span> Live</span>
      <span class="chart-sym muted">watching</span>
    </div>
    <div class="chartwrap tall"><canvas id="poschart"></canvas></div>
    <div class="caption"><div class="caption-pill">No open coin · Kloud mode is watching ${dots()}</div></div>
  </div>`;
}

function botView(id) {
  const A = (S && S.agents) || {};
  const a = A[id] || {};
  const latest = (a.latest || [])[0];
  const o = openPos();
  const now = Date.now() / 1000;
  const age = latest && latest.ts ? ago(Math.max(0, now - latest.ts)) : null;
  const sym = latest && cleanText(latest.symbol || (latest.mint && latest.mint.slice(0, 4)) || '');
  const v = latest && latest.verdict;
  if (id === 'scanner') {
    return { on: true, line: latest ? `reading new launches · ${age}` : 'reading new launches', badge: age || 'live', bcls: 'ok' };
  }
  if (id === 'auditor') {
    if (latest) {
      const bad = v === 'kill' || v === 'skip';
      const line = sym ? `${sym} · ${cleanText((latest.reason || v || 'checked').slice(0, 48))}` : cleanText((latest.reason || 'checking').slice(0, 56));
      return { on: true, line, badge: bad ? (v || 'flag') : (v === 'pass' || v === 'ok' ? 'passed' : (v || 'checked')), bcls: bad ? 'bad' : 'ok' };
    }
    return { on: true, line: 'waiting for rug checks', badge: 'ready', bcls: '' };
  }
  if (id === 'analyst') {
    if (latest) {
      const pack = latest.package || latest.rugcheck || {};
      const score = latest.score || latest.lore || pack.score;
      const line = sym ? `${sym}${score != null ? ' ' + score : (v ? ' · ' + v : '')}` : cleanText((latest.reason || 'reading lore').slice(0, 56));
      return { on: true, line, badge: (v && v !== 'kill') ? (v === 'pass' ? 'passed' : v) : (age || 'live'), bcls: v === 'kill' ? 'bad' : 'ok' };
    }
    return { on: true, line: 'reading stories', badge: 'ready', bcls: '' };
  }
  if (id === 'brain') {
    if (o) {
      const start = ((S.pot || {}).equity) || ((S.pot || {}).start_usd) || 100;
      const frac = o.size_usd != null && start ? Math.round((o.size_usd / start) * 100) + '% of pot' : '';
      const why = cleanText(o.size_reason || frac || 'sizing');
      return { on: true, line: `Sizing ${o.symbol || 'coin'} · ${why}`, badge: usd(o.size_usd), bcls: '' };
    }
    if (latest) return { on: true, line: `Sizing ${sym || 'coin'}`, badge: v || age || '', bcls: '' };
    return { on: true, line: 'waiting to size a trade', badge: 'ready', bcls: '' };
  }
  if (id === 'executor') {
    const trades = (S && S.trades) || [];
    if (o) return { on: true, line: `Paper bought ${o.symbol} · verified`, badge: usd(o.size_usd), bcls: 'ok' };
    if (trades.length) {
      const last = trades[0];
      return { on: true, line: `${last.status === 'open' ? 'Paper bought' : 'Closed'} ${last.symbol || ''}`, badge: trades.length + ' trades', bcls: '' };
    }
    return { on: true, line: 'ready to trade', badge: '0 trades', bcls: '' };
  }
  if (id === 'risk') {
    const n = ((S && S.open_positions) || []).length || (o ? 1 : 0);
    const r = (S && S.rules) || {};
    const sp = r.stop_pcts || {};
    let stopTxt;
    if (scalpOnly()) {
      const ds = (S && S.dipscalp && S.dipscalp.rules) || {};
      const stop = ds.stop_pct != null ? ds.stop_pct : -8;
      stopTxt = (stop > 0 ? '+' : '') + stop + '%';
    } else if (sp.normal != null && sp.conviction != null && Number(sp.normal) !== Number(sp.conviction)) {
      stopTxt = sp.normal + '% / ' + sp.conviction + '%';
    } else {
      const stop = r.stop_pct != null ? r.stop_pct : -10;
      stopTxt = (stop > 0 ? '+' : '') + stop + '%';
    }
    return { on: true, line: `Guarding ${n} · stop ${stopTxt}`, badge: n ? n + ' open' : 'flat', bcls: n ? 'warn' : '' };
  }
  if (id === 'copy') {
    const c = copyData();
    const nF = c.traders.length || c.n || 0;
    if (copyPaused()) {
      return { on: false, line: 'Paused — copy only lost money', badge: 'paused', bcls: 'bad' };
    }
    const last = c.trades[0];
    const who = last && cleanText(last.trader || last.name || last.handle || '');
    const safeWho = who && !isJunk(who) && who[0] !== '@' ? who : '';
    if (last) {
      return { on: true, line: `Copied ${last.symbol || 'coin'}${safeWho ? ' · ' + safeWho : ''}`, badge: (c.trades.length) + ' copies', bcls: 'ok' };
    }
    return { on: true, line: nF ? `following ${nF} trader${nF === 1 ? '' : 's'}` : 'waiting for copy signals', badge: nF ? nF + ' followed' : 'ready', bcls: '' };
  }
  if (id === 'dipscalp') {
    const d = dipData();
    const nOpen = (d.open || []).filter(t => t.status === 'open').length;
    const st = d.stats || {};
    if (nOpen) {
      const sym = d.open[0] && d.open[0].symbol;
      return { on: true, line: `Scalping ${sym || 'coin'} · ${st.trades || 0} trades`, badge: usd(st.pnl_usd), bcls: cls(st.pnl_usd) === 'red' ? 'bad' : 'ok' };
    }
    return { on: true, line: st.trades ? `${st.trades} scalp trades · ${usd(st.pnl_usd)}` : 'watching for 8–25% dips on strong coins', badge: nOpen ? nOpen + ' open' : 'ready', bcls: '' };
  }
  return { on: false, line: '', badge: '', bcls: '' };
}

function botsBlock() {
  const ids = BOT_ORDER.slice();
  if (hasCopy() || copyPaused()) ids.push('copy');
  if (hasDip()) ids.push('dipscalp');
  const rows = ids.map(id => {
    const v = botView(id);
    return `<div class="botrow">
      <img class="botav" src="${esc(botIcon(id))}" width="46" height="46" alt="">
      <div class="botmain">
        <div class="botname"><span class="sdot ${v.on ? '' : 'off'}"></span>${esc(BOT_NAMES[id] || id)}</div>
        <div class="botline">${esc(v.line)}</div>
      </div>
      <div class="botbadge ${v.bcls || ''}">${esc(v.badge)}</div>
    </div>`;
  }).join('');
  const n = ids.length;
  return `<div class="sec-head"><h2>Bots</h2><span class="n-running">${n} running</span></div><div class="botlist">${rows}</div>`;
}

function activityItems() {
  const items = [];
  const trades = (S && S.trades) || [];
  trades.forEach(t => {
    if (isJunk(t.symbol) || isJunk(t.source) || isJunk(t.reason)) return;
    const link = dexLink(t);
    if (t.status === 'open' || t.opened_at) {
      items.push({
        ts: t.opened_at || 0, kind: 'buy',
        title: `Bought ${t.symbol || '?'} ${usd(t.size_usd)}`,
        meta: [tm(t.opened_at), t.entry_mcap != null ? k(t.entry_mcap) + ' MC' : ''].filter(Boolean).join(' · '),
        right: t.status === 'open' ? usd(t.upnl_usd_est, 1) : '',
        rcls: t.status === 'open' ? cls(t.upnl_usd_est) : '',
        mark: '↗', link
      });
    }
    if (t.status && t.status !== 'open' && t.closed_at) {
      const part = t.sold_frac != null ? Math.round(t.sold_frac * 100) + '%' : (t.exit || 'sold');
      items.push({
        ts: t.closed_at || 0, kind: 'sell',
        title: `Sold ${t.symbol || '?'} ${part}`,
        meta: tm(t.closed_at),
        right: usd(t.pnl_usd, 1), rcls: cls(t.pnl_usd),
        mark: '↘', link
      });
    }
  });
  ((S && S.kills) || []).forEach(e => {
    if (isJunk(e.symbol) || isJunk(e.reason)) return;
    items.push({
      ts: e.ts || 0, kind: 'kill',
      title: `Kill ${e.symbol || (e.mint || '').slice(0, 4) || '?'}`,
      meta: [cleanText((e.reason || e.check || '').slice(0, 80)), tm(e.ts)].filter(Boolean).join(' · '),
      right: e.check || e.stage || 'kill', rcls: 'red', mark: '✕', link: dexLink(e)
    });
  });
  ((S && S.rejects) || []).forEach(e => {
    if (isJunk(e.symbol) || isJunk(e.reason)) return;
    items.push({
      ts: e.ts || 0, kind: 'reject',
      title: `Reject ${e.symbol || (e.mint || '').slice(0, 4) || '?'}`,
      meta: [cleanText((e.reason || '').slice(0, 80)), tm(e.ts)].filter(Boolean).join(' · '),
      right: e.verdict || 'skip', rcls: '', mark: '–', link: dexLink(e)
    });
  });
  if (hasCopy()) {
    copyData().trades.forEach(t => {
      if (isJunk(t.symbol) || isJunk(t.trader) || isJunk(t.handle) || isJunk(t.reason)) return;
      items.push({
        ts: t.ts || t.opened_at || t.closed_at || 0, kind: 'copy',
        title: `Copied ${t.symbol || '?'} ${t.size_usd != null ? usd(t.size_usd) : ''}`.trim(),
        meta: [tm(t.ts || t.opened_at), t.entry_mcap != null ? k(t.entry_mcap) + ' MC' : ''].filter(Boolean).join(' · '),
        right: t.pnl_usd != null ? usd(t.pnl_usd, 1) : (t.mcap ? k(t.mcap) + ' MC' : ''),
        rcls: t.pnl_usd != null ? cls(t.pnl_usd) : '',
        mark: '⧉', link: dexLink(t)
      });
    });
  }
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return items;
}

function actRow(e) {
  const inner = `<span class="actmark">${e.mark}</span>
    <div class="actbody"><div class="acttitle">${esc(e.title)}</div><div class="actmeta">${esc(e.meta)}</div></div>
    <div class="actright ${e.rcls || ''}">${esc(e.right || '')}</div>`;
  if (e.link) return `<a class="actrow" href="${esc(e.link)}" target="_blank" rel="noopener">${inner}</a>`;
  return `<div class="actrow">${inner}</div>`;
}

function activityBlock(limit) {
  const items = activityItems();
  const show = limit ? items.slice(0, limit) : items;
  const body = show.length ? show.map(actRow).join('') : '<div class="empty">No activity yet. Kloud mode is watching.</div>';
  return `<div class="card act">${body}</div>`;
}


const SPARK_LS = 'kd-sparks-v1', SPARK_MAX = 48;
let SPARKS = null;
function loadSparks() {
  if (SPARKS) return SPARKS;
  try { SPARKS = JSON.parse(LS.getItem(SPARK_LS) || '{}') || {}; } catch (e) { SPARKS = {}; }
  return SPARKS;
}
function saveSparks() {
  try { LS.setItem(SPARK_LS, JSON.stringify(SPARKS)); } catch (e) {}
}
function sparkPush(id, y, t) {
  if (y == null || !isFinite(y)) return;
  const s = loadSparks();
  const arr = s[id] || [];
  const ts = t || (S && S.generated_at) || (Date.now() / 1000);
  const last = arr[arr.length - 1];
  if (last && last.x === ts) last.y = y;
  else if (last && last.y === y && Math.abs(ts - last.x) < 3) { /* same real value, skip tight dup */ }
  else arr.push({ x: ts, y: y });
  while (arr.length > SPARK_MAX) arr.shift();
  s[id] = arr; SPARKS = s; saveSparks();
}
function sparkPts(id) { return (loadSparks()[id] || []).slice(); }
function lastEval() {
  const evs = ((S && S.evals) || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return evs[0] || null;
}
function auditorCounts() {
  const kills = ((S && S.kills) || []).length;
  const passes = ((S && S.evals) || []).length;
  return { kills, passes };
}
function recordSparks() {
  if (!S) return;
  const s = loadSparks();
  if ((!s.risk || s.risk.length < 2) && (S.equity_curve || []).length) {
    s.risk = (S.equity_curve || []).filter(p => p && isFinite(p.t) && isFinite(p.equity)).slice(-SPARK_MAX).map(p => ({ x: p.t, y: p.equity }));
  }
  if ((!s.analyst || s.analyst.length < 2) && (S.evals || []).length) {
    const evs = (S.evals || []).filter(e => e && e.lore != null && isFinite(e.lore)).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (evs.length) s.analyst = evs.slice(-SPARK_MAX).map(e => ({ x: e.ts, y: e.lore }));
  }
  SPARKS = s;
  const n = S.universe && S.universe.n;
  if (n != null) sparkPush('scanner', n);
  const ac = auditorCounts();
  sparkPush('auditor_k', ac.kills);
  sparkPush('auditor_p', ac.passes);
  const ev = lastEval();
  if (ev && ev.lore != null) sparkPush('analyst', ev.lore, ev.ts);
  const eq = S.pot && S.pot.equity;
  if (eq != null) sparkPush('risk', eq);
  const copies = ((S.copy && (S.copy.trades || S.copy.copied)) || []).length;
  sparkPush('copy', copies);
  const ds = dipData();
  sparkPush('dipscalp', (ds.stats && ds.stats.pnl_usd) || 0);
  const o = openPos();
  if (o && o.upnl_usd_est != null && isFinite(o.upnl_usd_est)) sparkPush('executor', o.upnl_usd_est);
  else if (S.today && S.today.trades != null) sparkPush('executor', S.today.trades);
}

function squareData(id) {
  if (id === 'scanner') {
    const n = S && S.universe && S.universe.n;
    return { val: n != null ? String(n) : '–', sub: 'in view', spark: 'scanner', tone: '' };
  }
  if (id === 'auditor') {
    const ac = auditorCounts();
    return { val: ac.kills + ' vs ' + ac.passes, sub: 'kills · passes', spark: 'auditor_k', tone: ac.kills ? 'red' : '' };
  }
  if (id === 'analyst') {
    const ev = lastEval();
    const lore = ev && ev.lore;
    const sym = ev && cleanText(ev.symbol || '');
    return { val: lore != null ? String(lore) : '–', sub: lore != null ? ('lore' + (sym ? ' · $' + sym : '')) : 'no score yet', spark: 'analyst', tone: '' };
  }
  if (id === 'brain') {
    const latest = ((((S && S.agents) || {}).brain || {}).latest || [])[0];
    let dec = '';
    if (latest && (latest.verdict || latest.reason)) dec = latest.verdict || latest.reason;
    else {
      const ev = lastEval();
      if (ev && ev.decision) dec = ev.decision;
    }
    dec = cleanText(String(dec || ''));
    const tone = /kill/i.test(dec) ? 'red' : (/buy|go\b|pass/i.test(dec) ? 'green' : '');
    return { val: dec || '–', sub: dec ? 'last decision' : 'waiting', spark: null, tone };
  }
  if (id === 'executor') {
    const o = openPos();
    if (o) {
      const pnl = o.upnl_usd_est, move = o.move_pct, sym = o.symbol || '';
      if (pnl != null && isFinite(pnl)) return { val: usd(pnl, 1), sub: 'open PnL' + (sym ? ' · $' + cleanText(sym) : ''), spark: 'executor', tone: cls(pnl) };
      if (move != null && isFinite(move)) return { val: (move > 0 ? '+' : '') + Number(move).toFixed(1) + '%', sub: 'open' + (sym ? ' · $' + cleanText(sym) : ''), spark: 'executor', tone: cls(move) };
      return { val: usd(o.size_usd), sub: 'holding' + (sym ? ' · $' + cleanText(sym) : ''), spark: 'executor', tone: 'green' };
    }
    const today = S && S.today && S.today.trades;
    return { val: today != null ? String(today) : '–', sub: 'trades today', spark: 'executor', tone: '' };
  }
  if (id === 'risk') {
    const n = potNums();
    return { val: usd(n.eq), sub: 'vs start ' + usd(n.start), spark: 'risk', tone: cls(n.pnl) };
  }
  if (id === 'copy') {
    const c = copyData();
    const who = (c.traders || []).map(tr => cleanText(tr.handle || tr.name || '')).filter(h => h && !isJunk(h) && h[0] !== '@');
    const n = (c.trades || []).length;
    return { val: String(n), sub: (who[0] || 'copy') + ' copies', spark: 'copy', tone: n ? 'green' : '' };
  }
  return { val: '–', sub: '', spark: null, tone: '' };
}

function squareCard(id) {
  const d = squareData(id);
  const spark = d.spark ? `<div class="sqspark"><canvas id="spark-${esc(id)}" data-spark="${esc(d.spark)}"></canvas></div>` : '';
  return `<div class="sqcard" data-bot="${esc(id)}">
    <div class="sqhead">
      <img class="botav sqav" src="${esc(botIcon(id))}" width="26" height="26" alt="">
      <div class="sqname"><span class="live-dot" title="Running"></span>${esc(BOT_NAMES[id] || id)}</div>
    </div>
    <div class="sqval ${d.tone || ''}">${esc(d.val)}</div>
    <div class="sqsub">${esc(d.sub)}</div>
    ${spark}
  </div>`;
}

function deskGrid() {
  const top = ['scanner', 'auditor', 'analyst'];
  const bot = ['brain', 'executor', 'risk'];
  if (hasCopy() || copyPaused()) bot.push('copy');
  if (hasDip()) bot.push('dipscalp');
  return `<div class="deskgrid" id="deskgrid">
    <div class="sqrow sqrow-top">${top.map(squareCard).join('')}</div>
    <div class="sqchart">${liveChart()}</div>
    <div class="sqrow sqrow-bot${bot.length === 4 ? ' n4' : ''}">${bot.map(squareCard).join('')}</div>
  </div>`;
}

function home() {
  const bags = (S && S.moonbags) || [];
  let extra = '';
  if (bags.length) {
    extra = card('Moonbags', bags.filter(b => !isJunk(b.symbol)).map(b => `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(b))}" target="_blank" rel="noopener">$${esc(b.symbol)}</a> ${pill(b.tag || 'moon', 'pp')} <span class="r ${cls(b.moon_value_usd)}">${usd(b.moon_value_usd)}</span></div></div>`).join(''));
  }
  return hero() + deskGrid() +
    `<div class="sec-head"><h2>Activity</h2><button type="button" class="seeall" data-go="activity">See all</button></div>` +
    activityBlock(8) + extra;
}

function activity() {
  return `<button type="button" class="back" data-go="home">← Home</button>
    <div class="sec-head"><h2>Activity</h2></div>${activityBlock()}`;
}

function agents() {
  let h = headerStatus() + '<div class="sub">Bots — each bot’s latest verdict, Kloud mode data only.</div>';
  const A = (S && S.agents) || {};
  const labels = {
    scanner: 'Scanner', auditor: 'Auditor · rug + RugCheck', analyst: 'Analyst',
    brain: 'Brain · sizing & bets', executor: 'Executor', risk: 'Risk'
  };
  const ids = ['scanner', 'auditor', 'analyst', 'brain', 'executor', 'risk'];
  if (hasCopy() || copyPaused()) { ids.push('copy'); labels.copy = copyPaused() ? 'Copy · paused' : 'Copy'; }
  if (hasDip()) { ids.push('dipscalp'); labels.dipscalp = 'Dip scalp'; }
  for (const n of ids) {
    const a = A[n] || { latest: [] };
    let rows = (a.latest || []).slice(0, 12).map(v => {
      if (isJunk(v.symbol) || isJunk(v.reason)) return '';
      return `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(v))}" target="_blank" rel="noopener">$${esc(v.symbol || v.mint && v.mint.slice(0, 4) || '?')}</a> ${pill(String(v.verdict||'').replace(/_/g,' '), v.verdict === 'kill' ? 'pr' : v.verdict === 'paper_buy' ? 'pg' : '')}</div><div class="evl sec">${esc(v.stage || '')} · ${esc(cleanText((v.reason || '').slice(0, 180)))} · ${tm(v.ts)}</div></div>`;
    }).join('') || '<div class="empty">No verdicts yet</div>';
    if (n === 'copy') {
      const c = copyData();
      const tradeRows = c.trades.slice(0, 12).filter(t => !isJunk(t.symbol)).map(t => `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(t))}" target="_blank" rel="noopener">$${esc(t.symbol || '?')}</a> ${pill('copied', 'pb')} ${insiderPills(t)}</div><div class="evl sec">${tm(t.ts || t.opened_at)} · ${usd(t.size_usd)}</div></div>`).join('');
      rows = (copyPaused() ? `<div class="evl">${pill('paused', 'paused')} Copy is paused — it only lost money.</div>` : '') + (tradeRows || rows);
    }
    if (n === 'dipscalp') {
      const d = dipData();
      const tradeRows = d.trades.slice(0, 12).filter(t => !isJunk(t.symbol)).map(t => `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(t))}" target="_blank" rel="noopener">$${esc(t.symbol || '?')}</a> ${pill('dipscalp', 'pp')} ${pill(t.status || '')} ${insiderPills(t)} <span class="${cls(t.pnl_usd)} r">${t.status === 'open' ? usd(t.upnl_usd_est || t.pnl_usd, 1) : usd(t.pnl_usd, 1)}</span></div><div class="evl sec">${tm(t.opened_at)} · ${usd(t.size_usd)}${t.exit_reason || t.exit ? ' · ' + esc(t.exit_reason || t.exit) : ''}</div></div>`).join('');
      const st = d.stats || {};
      rows = `<div class="statrow"><span>${st.trades || 0} trades</span><span>${st.wins || 0} wins</span><span class="${cls(st.pnl_usd)}">${usd(st.pnl_usd)}</span><span>fees ${usd(st.fees_usd)}</span></div>` + (tradeRows || rows);
    }
    let extra = '';
    if (n === 'risk' && a.pot) extra = row('Equity', usd(a.pot.equity)) + row('Cash', usd(a.pot.cash));
    h += card(labels[n], extra + rows);
  }
  return h;
}

function evRow(e, full) {
  const dec = e.bought ? pill('BOUGHT', 'pg') : pill(e.decision || 'skip', e.verdict === 'kill' || (e.decision || '').indexOf('kill') === 0 ? 'pr' : '');
  const res = e.resolved ? (e.hit ? `<span class="green">HIT</span> · peak ${k(e.peak_mcap)}${e.graduated ? ' · graduated' : ''}` : `<span class="red">MISS</span> · peak ${k(e.peak_mcap)} (${esc(e.actual || '')})`) : '<span class="sec">grading…</span>';
  let h = `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(e))}" target="_blank" rel="noopener">$${esc(e.symbol || '?')}</a> <span class="sec">${esc(e.name || e.class || '')}</span> ${pill((e.profile || 'fast'), e.profile === 'slow' ? 'pb' : 'pp')} ${e.tag ? pill(e.tag, e.tag === 'bet' ? 'po' : e.tag === 'dipscalp' ? 'pp' : '') : ''} ${insiderPills(e)} ${dec}</div>`;
  h += `<div class="evl">${esc(PRED[e.pred] || e.pred || '')} · ${res} · ${tm(e.ts || e.opened_at)}</div>`;
  if (full) {
    const rc = e.rugcheck;
    if (rc) h += `<div class="evl sec">rugcheck ${esc(rc.score != null ? rc.score : (rc.verdict || ''))}</div>`;
    const parts = [['story', 'story'], ['wallets', 'holders'], ['ca', 'CA'], ['ticker', 'ticker']];
    if (e.package) {
      const bits = parts.map(([k, lab]) => {
        const p = e.package[k] || {};
        return `${lab} ${p.pass === false || p.ok === false ? '✗' : '✓'}`;
      });
      h += `<div class="evl sec">${bits.join(' · ')}</div>`;
    }
    const c = e.components || {};
    if (Object.keys(c).length) h += `<div class="evl sec comps">${esc(JSON.stringify(c).slice(0, 240))}</div>`;
  }
  return h + '</div>';
}

function evals() {
  let h = headerStatus();
  h += `<div class="filters">
    <button type="button" data-f="all" class="${FILTER === 'all' ? 'on' : ''}">All</button>
    <button type="button" data-f="bought" class="${FILTER === 'bought' ? 'on' : ''}">Bought</button>
    <button type="button" data-f="kills" class="${FILTER === 'kills' ? 'on' : ''}">Kills</button>
    <button type="button" data-f="rejects" class="${FILTER === 'rejects' ? 'on' : ''}">Rejects</button>
  </div>`;
  if (FILTER === 'kills') {
    const kls = (S && S.kills) || [];
    return h + card(`${kls.length} kills`, kls.map(killRow).join('') || '<div class="empty">None</div>');
  }
  if (FILTER === 'rejects') {
    const r = (S && S.rejects) || [];
    return h + card(`${r.length} rejects`, r.map(killRow).join('') || '<div class="empty">None</div>');
  }
  let e = (S && S.evals) || [];
  if (FILTER === 'bought') e = e.filter(x => x.bought);
  return h + card(`${e.length} predictions`, e.map(x => evRow(x, true)).join('') || '<div class="empty">No evals yet</div>');
}

function killRow(e) {
  return `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(e))}" target="_blank" rel="noopener">$${esc(e.symbol || (e.mint || '').slice(0, 4) || '?')}</a> ${pill(e.verdict, e.verdict === 'kill' ? 'pr' : '')} ${pill(e.check || e.stage || '', 'po')} ${insiderPills(e)}</div><div class="evl sec">${esc(cleanText((e.reason || '').slice(0, 240)))} · ${tm(e.ts)}</div></div>`;
}

function sessionTs() {
  return (S && ((S.pot && S.pot.session_ts) || S.paper_since)) || 0;
}
function tradeRow(x) {
  return `<div class="ev"><div class="evh"><a class="coin" href="${esc(dexLink(x))}" target="_blank" rel="noopener">$${esc(x.symbol)}</a> ${pill(x.tag || x.profile || 'fast', x.tag === 'bet' ? 'po' : x.tag === 'dipscalp' ? 'pp' : '')} ${pill(x.status)} ${insiderPills(x)} <span class="${cls(x.pnl_usd)} r">${x.status === 'open' ? usd(x.upnl_usd_est, 1) + ' est.' : usd(x.pnl_usd, 1)}</span></div>` +
    `<div class="evl sec">${tm(x.opened_at)} · ${usd(x.size_usd)} @ ${k(x.entry_mcap)}${x.exit ? ' · ' + esc(x.exit) : ''}${x.reason ? ' · ' + esc(cleanText(x.reason)) : (x.size_reason ? ' · ' + esc(cleanText(x.size_reason)) : '')}${x.fees_usd ? ' · fee ' + usd(x.fees_usd) : ''}${x.lore != null ? ' · lore ' + x.lore : ''}</div></div>`;
}
function cleanTrades(list) {
  return (list || []).filter(x => !isJunk(x.symbol) && !isJunk(x.source));
}
function trades() {
  const ts = sessionTs();
  const all = cleanTrades((S && S.trades) || []);
  const cur = ts ? all.filter(x => (x.opened_at || 0) >= ts) : all;
  const d = dipData();
  const st = d.stats || {};
  const pot = (d.pot && d.pot.equity != null) ? d.pot : ((S && S.pot) || {});
  const dips = cur.filter(x => (x.tag || '') === 'dipscalp');
  const copies = cur.filter(x => (x.tag || '') === 'copy');
  const rest = cur.filter(x => (x.tag || '') !== 'dipscalp' && (x.tag || '') !== 'copy');
  let h = headerStatus();
  h += card('Dip scalp (paper)',
    `<div class="statrow"><span>pot ${usd(pot.equity)} <span class="${cls(pot.pnl_usd)}">${usd(pot.pnl_usd)}</span></span>` +
    `<span>${st.trades || dips.filter(t=>t.status!=='open').length} trades</span><span>${st.wins || 0} wins</span>` +
    `<span class="${cls(st.pnl_usd)}">${usd(st.pnl_usd)}</span><span>fees 0.45% · ${usd(st.fees_usd)}</span>` +
    `<span>${st.open || dips.filter(t=>t.status==='open').length} open / 3</span></div>` +
    (dips.map(tradeRow).join('') || '<div class="empty">No dip-scalp trades yet — watching $20k+ coins for an 8–25% dip</div>'));
  if (!scalpOnly()) {
    h += card(copyPaused() ? 'Copy · paused' : 'Copy',
      (copyPaused() ? `<div class="evl">${pill('paused', 'paused')} Copy is paused — it only lost money. Past post-reset copy trades stay visible.</div>` : '') +
      (copies.map(tradeRow).join('') || '<div class="empty">No copy trades this session</div>'));
    h += card(`${rest.length} other trades`, rest.map(tradeRow).join('') || '<div class="empty">No trades yet</div>');
  } else {
    h += card('Other sleeves', `<div class="evl">${pill('off', 'paused')} Copy, Kloud, wide and pump.fun are off — dip scalp only this session.</div>`);
  }
  return h;
}

function rules() {
  const r = (S && S.rules) || {};
  const fr = r.size_fracs || { normal: 0.10, conviction: 0.15, bet: 0.25 };
  const L = [
    ['Pot', 'paper pot starts at $' + ((S && S.pot && S.pot.start_usd) || r.pot_start_usd || 100)],
    ['Take profit', '+' + (r.tp_pct || 35) + '% sell ' + Math.round((r.tp_frac != null ? r.tp_frac : 0.75) * 100) + '%, trail the last 25%'],
    ['Stop', (r.stop_pcts && r.stop_pcts.normal != null && r.stop_pcts.conviction != null)
      ? (r.stop_pcts.normal + '% on normal and copy, ' + r.stop_pcts.conviction + '% on conviction and bet')
      : ((r.stop_pct != null ? r.stop_pct : -10) + '%')],
    ['Time exit', ((r.time_exit_s || 1500) / 60).toFixed(0) + ' min if still open'],
    ['Sizing', `from the pot: normal ${(fr.normal * 100).toFixed(0)}%, conviction ${(fr.conviction * 100).toFixed(0)}%, bet up to ${(fr.bet * 100).toFixed(0)}% (cap 25%, min $1)`],
    ['Sell in parts', 'strong volume + healthy chart: take initials (~cost back) at +100–200%, further parts up, trail the rest'],
    ['Unhealthy chart', 'sell 100% (peak drop ~22%, ≥60% sells, volume < 1/3 of the pump, dev dump, or stacked red candles)'],
    ['No daily stop', 'keeps trading regardless of the day’s loss; $1 minimum size'],
  ];
  let h = headerStatus();
  if (scalpOnly()) {
    h += card('Kloud / copy / wide / pump.fun', row('Status', 'OFF — running dip scalp only'));
  } else {
    h += card('Kloud mode rules', L.map(x => row(esc(x[0]), esc(x[1]))).join(''));
  }
  const dr = ((S && S.dipscalp && S.dipscalp.rules) || {});
  const D = [
    ['Strong coin', 'full rug + insider, $20k+ liquidity, +1h trend, rising holders and volume'],
    ['Entry', '8–25% pullback from the recent 1m/5m high, selling volume fading, green 1m candle'],
    ['Exits', 'take +12% then +20% in two parts, stop −8%, time stop 20 min'],
    ['Size', '5–25% of the pot by confidence and liquidity, never more than 2% of pool liquidity, total open at most 60% of the pot, max 3, fee 0.45%'],
    ['Lessons', 'each loss writes one line; lessons are read before the next buy'],
  ];
  h += card('Dip scalp rules (paper)', D.map(x => row(esc(x[0]), esc(x[1]))).join(''));
  h += card('Copy', (copyPaused() || scalpOnly()) ? row('Status', 'PAUSED — copy only lost money') : row('Status', 'running (paper)'));
  const log = (S && S.learn_log) || [];
  if (log.length) {
    h += card('Learn log', log.map(x => `<div class="ev"><div class="evh">${pill(x.tag || 'learn', 'pb')} <span class="sec">${tm(x.ts)}</span><span class="r sec">after ${x.closed_n || 0} closes</span></div><div class="evl">${esc(x.reason || '')}</div></div>`).join(''));
  }
  return h;
}


function drawSpark(canvas, points, opts) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w < 8 || h < 8) return;
  points = (points || []).filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (!points.length) return;
  if (points.length === 1) points = [points[0], { x: points[0].x + 1, y: points[0].y }];
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 2;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const guides = (opts && opts.guides) || [];
  guides.forEach(g => { if (isFinite(g.y)) ys.push(g.y); });
  let minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const padY = (maxY - minY) * 0.12;
  minY -= padY; maxY += padY;
  const X = x => pad + (x - minX) / (maxX - minX) * (w - pad * 2);
  const Y = y => h - pad - (y - minY) / (maxY - minY) * (h - pad * 2);
  const color = (opts && opts.color) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#e8eaee' : '#161616');
  if (color.charAt(0) === '#') {
    const hex = color.slice(1);
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    ctx.beginPath();
    points.forEach((p, i) => { const x = X(p.x), y = Y(p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    const last = points[points.length - 1], first = points[0];
    ctx.lineTo(X(last.x), h - pad);
    ctx.lineTo(X(first.x), h - pad);
    ctx.closePath();
    ctx.fillStyle = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.14)`;
    ctx.fill();
  }
  guides.forEach(g => {
    if (!isFinite(g.y)) return;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = g.color || 'rgba(90,110,140,.55)';
    ctx.lineWidth = 1;
    ctx.moveTo(pad, Y(g.y)); ctx.lineTo(w - pad, Y(g.y));
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.beginPath();
  points.forEach((p, i) => { const x = X(p.x), y = Y(p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function paintSparks() {
  recordSparks();
  document.querySelectorAll('#deskgrid canvas[data-spark]').forEach(cv => {
    const id = cv.getAttribute('data-spark');
    const pts = sparkPts(id);
    if (!pts.length) return;
    const last = pts[pts.length - 1] && pts[pts.length - 1].y;
    let color = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#c9d0da' : '#161616');
    const guides = [];
    if (id === 'risk') {
      const start = (S && S.pot && S.pot.start_usd) || 100;
      color = (last >= start) ? '#1aa36a' : '#d04a5a';
      guides.push({ y: start, color: 'rgba(90,110,140,.55)' });
    } else if (id === 'scanner') color = '#3b8bff';
    else if (id === 'auditor_k') color = '#ef4444';
    else if (id === 'analyst') color = '#ff8a1f';
    else if (id === 'executor') color = (last > 0 ? '#1aa36a' : last < 0 ? '#d04a5a' : '#14b8a6');
    else if (id === 'copy') color = '#facc15';
    else if (id === 'dipscalp') color = '#38bdf8';
    drawSpark(cv, pts, { color, guides });
  });
}

function drawLine(canvas, points, opts) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w < 8 || h < 8) return;
  points = (points || []).filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (!points.length) return;
  if (points.length === 1) points = [points[0], { x: points[0].x + 1, y: points[0].y }];
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 12, xs = points.map(p => p.x), ys = points.map(p => p.y);
  const guides = (opts && opts.guides) || [];
  guides.forEach(g => { if (isFinite(g.y)) ys.push(g.y); });
  let minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const padY = (maxY - minY) * 0.08;
  minY -= padY; maxY += padY;
  const X = x => pad + (x - minX) / (maxX - minX) * (w - pad * 2);
  const Y = y => h - pad - (y - minY) / (maxY - minY) * (h - pad * 2);
  const color = (opts && opts.color) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#e8eaee' : '#161616');
  // fill
  ctx.beginPath();
  points.forEach((p, i) => { const x = X(p.x), y = Y(p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  const last = points[points.length - 1], first = points[0];
  ctx.lineTo(X(last.x), h - pad);
  ctx.lineTo(X(first.x), h - pad);
  ctx.closePath();
  ctx.fillStyle = color.replace(')', ',0.12)').replace('rgb', 'rgba').replace('#', '');
  // simple hex to rgba fill
  if (color.charAt(0) === '#') {
    const hex = color.slice(1);
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    ctx.fillStyle = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.12)`;
  }
  ctx.fill();
  guides.forEach(g => {
    if (!isFinite(g.y)) return;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = g.color || 'rgba(90,110,140,.55)';
    ctx.lineWidth = 1;
    ctx.moveTo(pad, Y(g.y)); ctx.lineTo(w - pad, Y(g.y));
    ctx.stroke();
    ctx.setLineDash([]);
    if (g.label) {
      ctx.font = '11px ' + (window.getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.fillStyle = g.color || 'rgba(90,110,140,.8)';
      ctx.fillText(g.label, pad + 2, Y(g.y) - 3);
    }
  });
  ctx.beginPath();
  points.forEach((p, i) => { const x = X(p.x), y = Y(p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(last.x), Y(last.y), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function paintCharts() {
  const o = openPos();
  const pc = $('poschart');
  if (pc && o) {
    const pts = (o.chart || []).map(p => ({ x: p.t, y: p.px }));
    if (o.entry_px && !pts.length) pts.push({ x: o.opened_at || Date.now() / 1000, y: o.entry_px });
    if (o.entry_px && pts.length) {
      const lastPx = o.mcap_now && o.entry_mcap ? o.entry_px * (o.mcap_now / o.entry_mcap) : pts[pts.length - 1].y;
      if (pts[pts.length - 1].y !== lastPx) pts.push({ x: Date.now() / 1000, y: lastPx });
    }
    const entry = o.entry_px || (pts[0] && pts[0].y);
    const guides = [];
    if (entry) {
      const tp = o.tp_pct != null ? o.tp_pct : 35, st = o.stop_pct != null ? o.stop_pct : -10;
      guides.push({ y: entry, label: 'entry', color: 'rgba(90,110,140,.7)' });
      guides.push({ y: entry * (1 + tp / 100), label: 'TP +' + tp + '%', color: 'rgba(26,163,106,.85)' });
      guides.push({ y: entry * (1 + st / 100), label: 'stop ' + st + '%', color: 'rgba(208,74,90,.85)' });
    }
    if (pts.length) drawLine(pc, pts, { color: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#e8eaee' : '#161616'), guides });
  } else if (pc) {
    const pts = ((S && S.equity_curve) || []).map(p => ({ x: p.t, y: p.equity }));
    const start = (S && S.pot && S.pot.start_usd) || 100;
    if (!pts.length && S && S.pot) pts.push({ x: S.pot.session_ts || Date.now() / 1000, y: start }, { x: Date.now() / 1000, y: S.pot.equity || start });
    if (!pts.length) pts.push({ x: 0, y: start }, { x: 1, y: start });
    const up = (S && S.pot && S.pot.equity >= start);
    drawLine(pc, pts, { color: up ? '#1aa36a' : '#d04a5a', guides: [{ y: start, label: 'start $' + start, color: 'rgba(90,110,140,.55)' }] });
  }
  const eq = $('eqchart');
  if (eq) {
    const pts = ((S && S.equity_curve) || []).map(p => ({ x: p.t, y: p.equity }));
    const start = (S && S.pot && S.pot.start_usd) || 100;
    if (!pts.length && S && S.pot) pts.push({ x: S.pot.session_ts || Date.now() / 1000, y: start }, { x: Date.now() / 1000, y: S.pot.equity || start });
    drawLine(eq, pts, { color: (S && S.pot && S.pot.equity >= start) ? '#1aa36a' : '#d04a5a', guides: [{ y: start, label: 'start $' + start, color: 'rgba(90,110,140,.55)' }] });
  }
  paintSparks();
}

function render(force) {
  applyLivePot();
  const el = $('screen');
  if (!el) return;
  if ($('banner')) { $('banner').hidden = !ERR; $('banner').textContent = ERR; }
  const key = TAB + '|' + ERR + '|' + (S ? JSON.stringify({
    g: S.generated_at, p: S.pot, o: S.open, n: (S.trades || []).length,
    k: (S.kills || []).length, c: S.copy && (S.copy.trades || S.copy.copied || []).length,
    a: S.status, f: FILTER
  }) : '0');
  if (!force && key === LAST_KEY && TAB === LAST_TAB) { requestAnimationFrame(paintCharts); return; }
  LAST_KEY = key; LAST_TAB = TAB;
  el.innerHTML = ({ home, agents, evals, trades, rules, activity }[TAB] || home)();
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB && TAB !== 'activity'));
  requestAnimationFrame(paintCharts);
}

document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (b) { TAB = b.dataset.tab; render(true); window.scrollTo(0, 0); }
});
document.addEventListener('click', e => {
  const f = e.target.closest('[data-f]'); if (f) { FILTER = f.dataset.f; render(true); }
  const g = e.target.closest('[data-go]'); if (g) { TAB = g.dataset.go; render(true); window.scrollTo(0, 0); }
});
syncThemeColor();
if (window.matchMedia) {
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor); } catch (e) {}
}
load();
setInterval(load, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
window.addEventListener('resize', () => requestAnimationFrame(paintCharts));

window.addEventListener('hashchange', () => { if (urlParam('d') || urlParam('t')) location.reload(); });
