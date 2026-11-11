/* Kloudy Desk · Kloud mode bot animations. Client-side only: driven by the trap.json the app already polls
   every 4s (S). Never invents buys, sells or numbers. Cursors rest in their own lane and only move for a real job. */
(function () {
  'use strict';
  if (typeof render !== 'function' || typeof drawLine !== 'function') return;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = !!(mq && mq.matches);
  if (mq) { try { mq.addEventListener('change', function (e) { RM = e.matches; }); } catch (e) {} }
  var V = (typeof ICONV !== 'undefined' ? ICONV : '1');
  var COL = { scanner: '#3b8bff', auditor: '#22c55e', analyst: '#ff8a1f', brain: '#a855f7', executor: '#14b8a6', risk: '#ef4444', copy: '#facc15' };
  var PIPE = ['scanner', 'auditor', 'analyst', 'brain', 'executor', 'risk', 'copy'];
  var WORK = ['scanner', 'auditor', 'analyst', 'brain', 'executor', 'risk'];
  function nowS() { return Date.now() / 1000; }
  function E(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sy(o) { var s = o && (o.symbol || (o.mint && o.mint.slice(0, 4))); s = cleanText(s || ''); return s ? '$' + s : 'coin'; }
  function short(s, n) { s = cleanText(String(s || '')); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function bounce(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function dark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }

  var layer = E('div', 'kanim'); layer.setAttribute('aria-hidden', 'true');
  var marks = E('div', 'kmarks'); layer.appendChild(marks);
  var curs = {};
  var homes = {};
  var B = { w: 340, h: 300, cx0: 10, cy0: 40, cw: 320, ch: 220 };
  var rail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rail.setAttribute('class', 'krail');
  var nodesY = {}; var railX = 7;
  var nodes = {};

  function botIds() { var ids = PIPE.slice(0, 6); if (hasCopy()) ids.push('copy'); return ids; }

  function makeCursor(id) {
    var el = E('div', 'kcur kidle');
    el.style.setProperty('--c', COL[id]);
    el.innerHTML = '<div class="kbody">' +
      '<svg class="karrow" viewBox="0 0 16 18" width="14" height="16"><path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.6 10 L13 10 Z"/></svg>' +
      '<img class="kav" src="icons/bots/' + id + '.png?v=' + V + '" width="22" height="22" alt="">' +
      '<span class="kname">' + esc(BOT_NAMES[id] || id) + '</span><span class="kbub"></span></div>';
    layer.appendChild(el);
    var c = { id: id, el: el, body: el.querySelector('.kbody'), bub: el.querySelector('.kbub'),
      x: 0.5, y: 0.5, fx: 0.5, fy: 0.5, tx: 0.5, ty: 0.5, t0: 0, dur: 0, busy: false,
      q: [], act: null, bubUntil: 0, nextIdle: 0, pose: '' };
    curs[id] = c; return c;
  }

  var KF = null, stopY = null, prevEq = null, prevTrades = null, prevN = null, shownN = null, ticking = null, lastHb = 0;
  /* ---------- chart coordinate map (same math as drawLine) ---------- */
  var _draw = window.drawLine;
  window.drawLine = function (canvas, points, opts) {
    _draw(canvas, points, opts);
    try {
      if (!canvas || canvas.id !== 'poschart') return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var pts = (points || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
      if (!pts.length || w < 8) return;
      if (pts.length === 1) pts = [pts[0], { x: pts[0].x + 1, y: pts[0].y }];
      var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      ((opts && opts.guides) || []).forEach(function (g) { if (isFinite(g.y)) ys.push(g.y); });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      if (minX === maxX) { minX -= 1; maxX += 1; } if (minY === maxY) { minY -= 1; maxY += 1; }
      var py = (maxY - minY) * 0.08; minY -= py; maxY += py; var pad = 12;
      canvas._kmap = { minX: minX, maxX: maxX, pts: pts, X: function (x) { return pad + (x - minX) / (maxX - minX) * (w - pad * 2); },
        Y: function (y) { return h - pad - (y - minY) / (maxY - minY) * (h - pad * 2); }, guides: (opts && opts.guides) || [] };
      placeMarks(canvas);
    } catch (e) {}
  };

  function interpY(pts, x) {
    if (x <= pts[0].x) return pts[0].y;
    for (var i = 1; i < pts.length; i++) if (pts[i].x >= x) { var a = pts[i - 1], b = pts[i]; return a.y + (b.y - a.y) * ((x - a.x) / ((b.x - a.x) || 1)); }
    return pts[pts.length - 1].y;
  }
  var markPts = {};   // trade id -> {x,y} in card px (used to send the executor to the real entry point)
  function placeMarks(canvas) {
    var m = canvas._kmap; if (!m) return;
    var host = layer.parentNode || canvas.closest('.deskgrid') || canvas.closest('.chartcard'); if (!host) return;
    var cr = host.getBoundingClientRect(), r = canvas.getBoundingClientRect();
    var ox = r.left - cr.left, oy = r.top - cr.top;
    var list = [];
    var o = openPos();
    if (o) {
      if (o.entry_px) list.push({ key: 'b' + o.id, kind: 'buy', t: Math.max(m.minX, Math.min(m.maxX, o.opened_at || m.minX)), y: o.entry_px,
        txt: 'Buy ' + usd(o.size_usd) + (o.entry_mcap ? ' @ ' + k(o.entry_mcap) : '') });
    } else {
      ((S && S.trades) || []).forEach(function (t) {
        if (isJunk(t.symbol)) return;
        if (t.opened_at && t.opened_at >= m.minX - 60 && t.opened_at <= m.maxX + 60)
          list.push({ key: 'b' + t.id, kind: 'buy', t: Math.max(m.minX, Math.min(m.maxX, t.opened_at)), txt: 'Buy ' + usd(t.size_usd) + (t.entry_mcap ? ' @ ' + k(t.entry_mcap) : '') });
        if (t.status !== 'open' && t.closed_at && t.closed_at >= m.minX - 60 && t.closed_at <= m.maxX + 60)
          list.push({ key: 's' + t.id, kind: 'sell', t: Math.max(m.minX, Math.min(m.maxX, t.closed_at)),
            txt: 'Sell ' + sy(t) + (t.pnl_usd != null ? ' ' + (t.pnl_usd >= 0 ? '+' : '') + usd(t.pnl_usd) : '') });
      });
      list.sort(function (a, b) { return a.t - b.t; }); list = list.slice(-4);
    }
    stopY = null;
    m.guides.forEach(function (g) { if (/^stop/.test(g.label || '') && isFinite(g.y)) stopY = (oy + m.Y(g.y)) / B.h; });
    marks.innerHTML = '';
    markPts = {};
    list.forEach(function (it, i) {
      var y = it.y != null ? it.y : interpY(m.pts, it.t);
      var x = ox + m.X(it.t), yy = oy + m.Y(y);
      var el = E('div', 'kmark ' + it.kind, '<i></i><span>' + esc(it.txt) + '</span>');
      var up = it.kind === 'sell' ? (i % 2 ? 1 : 0) : 0;
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px,0)';
      if (x > B.w * 0.62) el.classList.add('left');
      if (yy < 60 || up) el.classList.add('below');
      marks.appendChild(el);
      markPts[it.key] = { x: x / B.w, y: yy / B.h };
    });
  }

  function mountRail() {
    var grid = document.getElementById('deskgrid');
    if (grid) {
      rail.setAttribute('class', 'krail kgrid-rail');
      if (rail.parentNode !== grid) grid.appendChild(rail);
      var lr = grid.getBoundingClientRect();
      var w = Math.max(1, Math.round(lr.width)), h = Math.max(1, Math.round(lr.height));
      rail.setAttribute('width', w); rail.setAttribute('height', h); rail.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var chart = grid.querySelector('.chartcard') || grid.querySelector('.sqchart');
      nodes = {}; nodesY = {};
      if (!chart) return;
      var cr = chart.getBoundingClientRect();
      var segs = '';
      grid.querySelectorAll('.sqcard[data-bot]').forEach(function (card) {
        var id = card.getAttribute('data-bot');
        var r = card.getBoundingClientRect();
        var cx = r.left - lr.left + r.width / 2;
        var topRow = (r.bottom <= cr.top + 4);
        var x1 = cx, y1 = topRow ? (r.bottom - lr.top) : (r.top - lr.top);
        var x2 = Math.max(cr.left - lr.left + 18, Math.min(cr.right - lr.left - 18, cx));
        var y2 = topRow ? (cr.top - lr.top) : (cr.bottom - lr.top);
        nodes[id] = { x1: x1, y1: y1, x2: x2, y2: y2 };
        nodesY[id] = y1;
        segs += '<path class="kseg" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>' +
          '<circle class="knode" cx="' + x1.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="2.4" style="fill:' + (COL[id] || '#999') + '"/>';
      });
      var dotsG = rail.querySelector('.kdots');
      rail.innerHTML = segs;
      if (dotsG) rail.appendChild(dotsG); else { dotsG = document.createElementNS('http://www.w3.org/2000/svg', 'g'); dotsG.setAttribute('class', 'kdots'); rail.appendChild(dotsG); }
      return;
    }
    var list = document.querySelector('#screen .botlist');
    if (!list) return;
    rail.setAttribute('class', 'krail');
    list.classList.add('krailed');
    if (rail.parentNode !== list) list.insertBefore(rail, list.firstChild);
    var lr = list.getBoundingClientRect();
    var h = Math.round(lr.height); rail.setAttribute('width', 44); rail.setAttribute('height', h); rail.setAttribute('viewBox', '0 0 44 ' + h);
    var rows = list.querySelectorAll('.botrow'), ids = botIds(), segs = '', y0 = null, y1 = 0;
    nodesY = {}; nodes = {};
    rows.forEach(function (r, i) {
      var av = r.querySelector('.botav'); if (!av) return;
      var ar = av.getBoundingClientRect(); var y = Math.round(ar.top - lr.top + ar.height / 2);
      var id = ids[i] || ('b' + i); nodesY[id] = y; if (y0 == null) y0 = y; y1 = y;
      var x2 = Math.round(ar.left - lr.left) - 2;
      nodes[id] = { x1: railX, y1: y, x2: railX, y2: y };
      segs += '<path class="kseg" d="M' + railX + ' ' + y + ' H' + Math.max(railX + 4, x2) + '"/>' +
        '<circle class="knode" cx="' + railX + '" cy="' + y + '" r="3" style="fill:' + (COL[id] || '#999') + '"/>';
    });
    if (y0 == null) return;
    var dotsG = rail.querySelector('.kdots');
    rail.innerHTML = '<path class="kbus" d="M' + railX + ' ' + y0 + ' V' + y1 + '"/>' + segs;
    if (dotsG) rail.appendChild(dotsG); else { dotsG = document.createElementNS('http://www.w3.org/2000/svg', 'g'); dotsG.setAttribute('class', 'kdots'); rail.appendChild(dotsG); }
  }
  function flow(a, b, color, delay, bad, faint) {
    if (RM || document.hidden) return;
    var g = rail.querySelector('.kdots');
    if (!g || !g.animate) return;
    var A = nodes[a], B = nodes[b];
    if (!A && (nodesY[a] == null || nodesY[b] == null)) return;
    var d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    d.setAttribute('r', faint ? 2 : 3); d.setAttribute('cx', 0); d.setAttribute('cy', 0);
    d.setAttribute('class', 'kdot' + (faint ? ' faint' : '')); d.style.fill = color;
    g.appendChild(d);
    var kf, dur;
    if (A && (B || A)) {
      B = B || A;
      var same = (a === b || !b);
      if (same) {
        dur = 700;
        kf = [
          { transform: 'translate(' + A.x1 + 'px,' + A.y1 + 'px) scale(.4)', opacity: 0 },
          { transform: 'translate(' + A.x1 + 'px,' + A.y1 + 'px) scale(1)', opacity: 1, offset: 0.12 },
          { transform: 'translate(' + A.x2 + 'px,' + A.y2 + 'px) scale(1)', opacity: 1, offset: 0.88 },
          { transform: 'translate(' + A.x2 + 'px,' + A.y2 + 'px) scale(' + (bad ? 1.8 : 0.6) + ')', opacity: 0 }
        ];
      } else {
        dur = 900 + Math.hypot(A.x1 - B.x1, A.y1 - B.y1) * 0.8;
        kf = [
          { transform: 'translate(' + A.x1 + 'px,' + A.y1 + 'px) scale(.4)', opacity: 0 },
          { transform: 'translate(' + A.x1 + 'px,' + A.y1 + 'px) scale(1)', opacity: 1, offset: 0.08 },
          { transform: 'translate(' + A.x2 + 'px,' + A.y2 + 'px) scale(1)', opacity: 1, offset: 0.38 },
          { transform: 'translate(' + B.x2 + 'px,' + B.y2 + 'px) scale(1)', opacity: 1, offset: 0.62 },
          { transform: 'translate(' + B.x1 + 'px,' + B.y1 + 'px) scale(1)', opacity: 1, offset: 0.9 },
          { transform: 'translate(' + B.x1 + 'px,' + B.y1 + 'px) scale(' + (bad ? 1.8 : 0.6) + ')', opacity: 0 }
        ];
      }
    } else {
      var ya = nodesY[a], yb = nodesY[b];
      dur = 500 + Math.abs(yb - ya) * 3.2;
      kf = [{ transform: 'translate(' + railX + 'px,' + ya + 'px) scale(.4)', opacity: 0 },
        { transform: 'translate(' + railX + 'px,' + ya + 'px) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(' + railX + 'px,' + yb + 'px) scale(1)', opacity: 1, offset: 0.9 },
        { transform: 'translate(' + railX + 'px,' + yb + 'px) scale(' + (bad ? 1.8 : 0.6) + ')', opacity: 0 }];
    }
    var an = d.animate(kf, { duration: dur, delay: delay || 0, easing: 'ease-in-out', fill: 'both' });
    an.onfinish = function () { if (d.parentNode) d.parentNode.removeChild(d); };
    if (bad) setTimeout(function () { d.style.fill = '#ef4444'; }, (delay || 0) + dur * 0.85);
  }

  /* ---------- counters + pot flash ---------- */
  function counters() {
    var hv = document.querySelector('#screen .hero-val');
    var eq = S && S.pot && S.pot.equity;
    if (eq != null) {
      if (prevEq != null && Math.abs(eq - prevEq) >= 0.005) KF = { ts: Date.now(), cls: eq > prevEq ? 'kflash-up' : 'kflash-down' };
      prevEq = eq;
    }
    if (hv && KF && Date.now() - KF.ts < 1300 && !hv.classList.contains(KF.cls)) hv.classList.add(KF.cls);
    // scanner count (coins in the live universe right now) ticks up/down to the real number
    var n = S && S.universe && S.universe.n;
    var rows = document.querySelectorAll('#screen .botlist .botrow');
    var sb = rows[0] && rows[0].querySelector('.botbadge');
    if (sb && n != null) {
      if (shownN == null) shownN = RM ? n : Math.max(0, n - Math.min(n, 40));
      prevN = n;
      sb.classList.add('kcount');
      sb.textContent = Math.round(shownN) + ' coins';
      if (!ticking) tick();
    }
  }
  function tick() {
    ticking = true;
    var t0 = performance.now(), from = shownN;
    (function step(t) {
      var target = prevN; if (target == null) { ticking = false; return; }
      var p = Math.min(1, (t - t0) / 900);
      shownN = from + (target - from) * ease(p);
      var rows = document.querySelectorAll('#screen .botlist .botrow');
      var sb = rows[0] && rows[0].querySelector('.botbadge');
      if (sb) sb.textContent = Math.round(shownN) + ' coins';
      if (p < 1 && !RM) requestAnimationFrame(step); else { shownN = target; if (sb) sb.textContent = target + ' coins'; ticking = false; }
    })(t0);
  }


  /* ---------- homes, jobs, cursors ---------- */
  var jobs = [], jobSeen = {}, jobFirst = true, play = null, raf = 0, lastBob = 0;
  var trashEl = null, trashSet = {}, dragChip = null, parked = [];
  var TRASH_LS = 'kanim_trash';
  (function loadTrash() {
    try { (JSON.parse(window.localStorage.getItem(TRASH_LS) || '[]') || []).forEach(function (m) { if (m) trashSet[m] = 1; }); } catch (e) {}
  })();
  function saveTrash() {
    try { window.localStorage.setItem(TRASH_LS, JSON.stringify(Object.keys(trashSet))); } catch (e) {}
  }
  var MIN_GAP = 58; // px, keep cursors from stacking

  function hostRect() {
    var host = layer.parentNode; return host ? host.getBoundingClientRect() : null;
  }
  function chartRect() {
    var host = layer.parentNode; if (!host) return null;
    var el = host.querySelector('.chartcard') || host.querySelector('.sqchart');
    return el ? el.getBoundingClientRect() : null;
  }
  function frac(x, y) {
    return { x: Math.max(0.03, Math.min(0.92, x)), y: Math.max(0.08, Math.min(0.9, y)) };
  }
  function updateHomes() {
    var host = layer.parentNode, hr = hostRect(); if (!host || !hr || B.w < 8) return;
    var cr = chartRect();
    var pts = [];
    host.querySelectorAll('.sqcard[data-bot]').forEach(function (card) {
      var id = card.getAttribute('data-bot');
      var r = card.getBoundingClientRect();
      var topRow = cr ? (r.bottom <= cr.top + 10) : (r.top - hr.top < B.h * 0.4);
      var x = (r.left - hr.left + r.width * 0.58) / B.w;
      var y = topRow ? (r.bottom - hr.top - 8) / B.h : (r.top - hr.top + 6) / B.h;
      pts.push({ id: id, x: x, y: y });
    });
    // push homes apart if two cards land on the same spot
    var i, j, guard = 0;
    while (guard++ < 8) {
      var moved = false;
      for (i = 0; i < pts.length; i++) for (j = i + 1; j < pts.length; j++) {
        var dx = (pts[j].x - pts[i].x) * B.w, dy = (pts[j].y - pts[i].y) * B.h;
        var d = Math.hypot(dx, dy) || 0.01;
        if (d < MIN_GAP) {
          var n = (MIN_GAP - d) / 2 / d;
          pts[i].x -= (dx * n) / B.w; pts[i].y -= (dy * n) / B.h;
          pts[j].x += (dx * n) / B.w; pts[j].y += (dy * n) / B.h;
          moved = true;
        }
      }
      if (!moved) break;
    }
    pts.forEach(function (p) { homes[p.id] = frac(p.x, p.y); });
  }
  function homeOf(id) { return homes[id] || { x: 0.5, y: 0.5 }; }
  function chartSpot() {
    var host = hostRect(), cr = chartRect();
    if (!host || !cr) return { x: 0.5, y: 0.48 };
    return frac(((cr.left + cr.right) / 2 - host.left) / B.w, ((cr.top + cr.bottom) / 2 - host.top) / B.h);
  }
  function feedSpot() {
    var host = hostRect(), cr = chartRect();
    if (!host || !cr) return { x: 0.22, y: 0.38 };
    return frac((cr.left - host.left + cr.width * 0.18) / B.w, (cr.top - host.top + cr.height * 0.22) / B.h);
  }
  function trashPos() {
    var host = hostRect(), cr = chartRect();
    if (!host || !cr) return { x: 0.86, y: 0.62 };
    return frac((cr.right - host.left - 26) / B.w, (cr.bottom - host.top - 16) / B.h);
  }
  function trashSpot() {
    var p = trashPos();
    return { x: p.x, y: Math.max(0.08, p.y - 0.05) };
  }

  function pose(c, name) {
    if (!c) return;
    c.el.classList.remove('kidle', 'kgrab', 'ktoss', 'khop');
    c.pose = name || '';
    if (name) c.el.classList.add(name);
  }
  function startMove(c, tx, ty, now, ms) {
    var h = homeOf(c.id);
    c.fx = c.x; c.fy = c.y;
    c.tx = Math.max(0.03, Math.min(0.94, tx != null ? tx : h.x));
    c.ty = Math.max(0.08, Math.min(0.9, ty != null ? ty : h.y));
    var dist = Math.hypot((c.tx - c.fx) * B.w, (c.ty - c.fy) * B.h);
    c.t0 = now; c.dur = RM ? 0 : (ms != null ? ms : Math.max(420, Math.min(900, dist * 7)));
    c.busy = true;
    pose(c, '');
  }
  function atHome(c) {
    var h = homeOf(c.id);
    return Math.hypot((c.x - h.x) * B.w, (c.y - h.y) * B.h) < 3;
  }
  function separate() {
    var ids = Object.keys(curs), i, j;
    for (i = 0; i < ids.length; i++) {
      for (j = i + 1; j < ids.length; j++) {
        var a = curs[ids[i]], b = curs[ids[j]];
        var dx = (b.x - a.x) * B.w, dy = (b.y - a.y) * B.h;
        var d = Math.hypot(dx, dy) || 0.01;
        if (d >= MIN_GAP) continue;
        var n = (MIN_GAP - d) / 2 / d;
        // prefer to nudge the idle one; if both idle, split
        var pa = a.busy ? 0.15 : 0.5, pb = b.busy ? 0.15 : 0.5;
        var s = pa + pb; pa /= s; pb /= s;
        a.x -= (dx * n * 2 * pa) / B.w; a.y -= (dy * n * 2 * pa) / B.h;
        b.x += (dx * n * 2 * pb) / B.w; b.y += (dy * n * 2 * pb) / B.h;
      }
    }
  }
  function showBubble(c, txt, cls, now, ms) {
    if (!c || !txt) return;
    c.bub.textContent = txt; c.bub.className = 'kbub on ' + (cls || '');
    var bw = c.bub.offsetWidth || 160; c.el.classList.toggle('kflip', c.x * B.w + 12 + bw > B.w - 6 && c.x * B.w > bw * 0.6);
    c.bubUntil = now + (ms || 1800);
  }
  function ripple(c) {
    if (RM || !c) return;
    var r = E('span', 'kripple'); c.body.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 700);
  }

  function verdictPass(id, v) {
    v = String(v || '').toLowerCase().trim();
    if (!v) return null;
    if (v === 'watch_only' || v.indexOf('watch only') === 0) return id === 'scanner';
    if (v === 'paper_buy' || v === 'buy' || v === 'pass' || v === 'ok' || v === 'go') return true;
    if (/^(kill|skip|reject|fail|no|denied|block)\b/.test(v) || /\b(kill|skip)\b/.test(v)) return false;
    return true;
  }
  function addCheck(map, mint, symbol, ts, bot, verdict, reason) {
    if (!mint || !bot) return;
    var o = map[mint] || (map[mint] = { mint: mint, symbol: symbol, ts: 0, checks: {}, bought: false });
    if (symbol) o.symbol = symbol;
    if (ts && ts > o.ts) o.ts = ts;
    var p = verdictPass(bot, verdict);
    if (p === null) return;
    var prev = o.checks[bot];
    if (!prev || (ts || 0) >= (prev.ts || 0)) o.checks[bot] = { pass: p, reason: reason || '', verdict: verdict, ts: ts || 0 };
  }
  function collectCoins() {
    var map = {}, A = (S && S.agents) || {};
    WORK.forEach(function (id) {
      ((A[id] && A[id].latest) || []).forEach(function (it) {
        addCheck(map, it.mint, it.symbol, it.ts, id, it.verdict, it.reason);
      });
    });
    (S.kills || []).forEach(function (k) { addCheck(map, k.mint, k.symbol, k.ts, 'auditor', k.verdict || 'kill', k.reason); });
    (S.rejects || []).forEach(function (k) {
      var st = k.stage || k.check || '';
      var bot = (st === 'lore') ? 'analyst' : (st === 'rug' || st === 'rugcheck') ? 'auditor' : 'scanner';
      addCheck(map, k.mint, k.symbol, k.ts, bot, k.verdict || 'skip', k.reason);
    });
    (S.evals || []).forEach(function (e) {
      var dec = String(e.decision || '');
      if (dec.toLowerCase().indexOf('skip lore') === 0) addCheck(map, e.mint, e.symbol, e.ts, 'analyst', 'skip', e.reason);
      else if (e.lore != null || e.components) addCheck(map, e.mint, e.symbol, e.ts, 'analyst', 'pass', e.reason);
      addCheck(map, e.mint, e.symbol, e.ts, 'brain', dec, e.reason);
      if (e.bought) {
        if (map[e.mint]) map[e.mint].bought = true;
        addCheck(map, e.mint, e.symbol, e.ts, 'executor', 'paper_buy', 'bought');
      }
    });
    function markBuy(t) {
      if (!t || !t.mint) return;
      addCheck(map, t.mint, t.symbol, t.opened_at || t.ts, 'executor', 'paper_buy', '');
      if (map[t.mint]) map[t.mint].bought = true;
    }
    (S.trades || []).forEach(markBuy);
    (S.open_positions || []).forEach(markBuy);
    if (S.open) markBuy(S.open);
    // pre-reset trades stay hidden (t1407u)
    return map;
  }
  function enqueueJobs() {
    if (!S) return;
    var map = collectCoins();
    var list = Object.keys(map).map(function (m) { return map[m]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var fresh = [];
    list.forEach(function (o) {
      var steps = [], i, stopped = false;
      for (i = 0; i < WORK.length; i++) {
        var ch = o.checks[WORK[i]];
        if (!ch) continue;                 // no real result for this bot: skip it
        if (stopped && WORK[i] !== 'executor' && WORK[i] !== 'risk') continue;
        steps.push({ id: WORK[i], pass: !!ch.pass, reason: ch.reason, verdict: ch.verdict });
        if (!ch.pass && WORK[i] !== 'executor' && WORK[i] !== 'risk') stopped = true;
      }
      if (!steps.length) return;
      if (o.mint && trashSet[o.mint]) return;   // user hid this coin locally; trading is unchanged
      var key = o.mint + '|' + Math.round(o.ts || 0) + '|' + steps.map(function (s) { return s.id + (s.pass ? '+' : '-'); }).join('');
      if (jobSeen[key]) return;
      jobSeen[key] = 1;
      fresh.push({ key: key, mint: o.mint, symbol: o.symbol, steps: steps, bought: !!o.bought, ts: o.ts });
    });
    if (jobFirst) { fresh = fresh.slice(0, 5); jobFirst = false; }
    else fresh = fresh.slice(0, 3);
    fresh.forEach(function (j) { jobs.push(j); });
    if (jobs.length) kick();
  }

  function mkChip(sym, x, y, mint) {
    if (mint && trashSet[mint]) return null;
    var el = E('div', 'kchip', esc(sym || 'coin'));
    el.style.touchAction = 'none';
    layer.appendChild(el);
    var c = { el: el, x: x, y: y, held: null, mint: mint || '', drag: false };
    el._chip = c;
    placeChip(c);
    return c;
  }
  function placeChip(ch) {
    if (!ch || !ch.el) return;
    if (ch.held) return; // attached to a cursor
    ch.el.style.transform = 'translate3d(' + (ch.x * B.w).toFixed(1) + 'px,' + (ch.y * B.h).toFixed(1) + 'px,0)';
  }
  function attachChip(ch, c) {
    if (!ch || !c) return;
    ch.held = c.id;
    if (ch.el) ch.el.classList.add('kheld');
    c.body.appendChild(ch.el);
    ch.el.style.transform = '';
  }
  function detachChip(ch, x, y) {
    if (!ch) return;
    ch.held = null; ch.x = x; ch.y = y;
    if (ch.el) ch.el.classList.remove('kheld');
    layer.appendChild(ch.el);
    placeChip(ch);
  }
  function mountTrash() {
    if (!layer) return;
    if (!trashEl) {
      trashEl = E('div', 'ktrash');
      trashEl.setAttribute('aria-hidden', 'true');
      trashEl.innerHTML = '<svg viewBox="0 0 44 52" width="44" height="52">' +
        '<g class="lid">' +
        '<rect x="17" y="3" width="10" height="5" rx="2" fill="#111"/>' +
        '<rect x="7" y="8" width="30" height="6.5" rx="2.6" fill="#111"/>' +
        '</g>' +
        '<path class="body" d="M10 16.5 L12.2 45.5 Q12.4 49.5 16.5 49.5 L27.5 49.5 Q31.6 49.5 31.8 45.5 L34 16.5 Z" fill="#f3f3f3" stroke="#111" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M16.5 22 L17.4 42 M22 22 L22 42 M27.5 22 L26.6 42" fill="none" stroke="#111" stroke-width="1.55" stroke-linecap="round"/>' +
        '<ellipse class="cloud" cx="22" cy="33.5" rx="5.2" ry="3.1" fill="#111" opacity=".14"/>' +
        '</svg>';
      layer.appendChild(trashEl);
    }
    placeTrash();
  }
  function placeTrash() {
    if (!trashEl || !B.w) return;
    var p = trashPos();
    trashEl.style.transform = 'translate3d(' + (p.x * B.w - 22).toFixed(1) + 'px,' + (p.y * B.h - 30).toFixed(1) + 'px,0)';
  }
  function bounceLid() {
    if (!trashEl) return;
    trashEl.classList.remove('kdrop');
    void trashEl.offsetWidth;
    trashEl.classList.add('kdrop');
    setTimeout(function () { if (trashEl) trashEl.classList.remove('kdrop'); }, RM ? 80 : 520);
  }
  function overTrash(ch) {
    if (!ch) return false;
    var p = trashPos();
    return Math.hypot((ch.x - p.x) * B.w, (ch.y - p.y) * B.h) < 42;
  }
  function rememberTrash(mint) {
    if (!mint) return;
    trashSet[mint] = 1;
    saveTrash();
    jobs = jobs.filter(function (j) { return j.mint !== mint; });
  }
  function dropInTrash(ch, mint, now) {
    rememberTrash(mint || (ch && ch.mint));
    bounceLid();
    if (ch && parked.indexOf(ch) >= 0) parked = parked.filter(function (p) { return p !== ch; });
    if (!ch || !ch.el) return;
    var el = ch.el;
    ch.held = null; ch.drag = false;
    el.classList.remove('kheld', 'kdrag');
    layer.appendChild(el);
    var dest = trashPos();
    var x0 = ch.x * B.w, y0 = ch.y * B.h, x1 = dest.x * B.w, y1 = dest.y * B.h;
    if (RM) { if (el.parentNode) el.parentNode.removeChild(el); return; }
    try {
      var an = el.animate([
        { transform: 'translate3d(' + x0 + 'px,' + y0 + 'px,0) scale(1) rotate(0)', opacity: 1 },
        { transform: 'translate3d(' + x1 + 'px,' + (y1 - 12) + 'px,0) scale(.9) rotate(-14deg)', opacity: 1, offset: 0.5 },
        { transform: 'translate3d(' + x1 + 'px,' + (y1 + 8) + 'px,0) scale(.15) rotate(8deg)', opacity: 0 }
      ], { duration: 420, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'forwards' });
      an.onfinish = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    } catch (e) { if (el.parentNode) el.parentNode.removeChild(el); }
  }
  function parkChip(ch) {
    if (!ch || !ch.el) return;
    if (parked.indexOf(ch) < 0) parked.push(ch);
    while (parked.length > 4) {
      var old = parked.shift();
      if (old && old.el && old.el.parentNode && old !== ch) old.el.parentNode.removeChild(old.el);
    }
  }
  function evXY(ev) {
    var host = hostRect(); if (!host) return null;
    var t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    if (!t || t.clientX == null) return null;
    return { x: (t.clientX - host.left) / B.w, y: (t.clientY - host.top) / B.h };
  }
  function onChipDown(ev) {
    var el = ev.target && ev.target.closest && ev.target.closest('.kchip');
    if (!el || !el._chip) return;
    var ch = el._chip;
    if (ch.held) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragChip = ch;
    ch.drag = true;
    el.classList.add('kdrag');
    var p = evXY(ev); if (p) { ch.x = p.x; ch.y = p.y; placeChip(ch); }
  }
  function onChipMove(ev) {
    if (!dragChip) return;
    ev.preventDefault();
    var p = evXY(ev); if (p) { dragChip.x = p.x; dragChip.y = p.y; placeChip(dragChip); }
    if (trashEl) trashEl.classList.toggle('kready', overTrash(dragChip));
  }
  function onChipUp(ev) {
    if (!dragChip) return;
    var ch = dragChip;
    ch.drag = false;
    if (ch.el) ch.el.classList.remove('kdrag');
    if (trashEl) trashEl.classList.remove('kready');
    dragChip = null;
    if (overTrash(ch)) {
      dropInTrash(ch, ch.mint, performance.now());
      if (play && play.chip === ch) { play.chip = null; play.onChart = false; }
      kick();
    }
  }
  if (!window.__kanimTrashBound) {
    window.__kanimTrashBound = 1;
    window.addEventListener('pointerdown', onChipDown, { passive: false });
    window.addEventListener('pointermove', onChipMove, { passive: false });
    window.addEventListener('pointerup', onChipUp);
    window.addEventListener('pointercancel', onChipUp);
  }
  function showBuy(sym) {
    var old = layer.querySelector('.kbuy'); if (old) old.remove();
    var el = E('div', 'kbuy', 'BUY ' + esc(sym || ''));
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
  }

  function beginJob(now) {
    if (play || !jobs.length || document.hidden) return;
    while (jobs.length && jobs[0].mint && trashSet[jobs[0].mint]) jobs.shift();
    if (!jobs.length) return;
    var j = jobs.shift();
    var feed = feedSpot();
    var chip = mkChip(sy(j), feed.x, feed.y, j.mint);
    if (!chip) { beginJob(now); return; }
    play = { job: j, i: 0, phase: 'to-chip', t0: now, wait: 0, chip: chip, onChart: false, cur: null };
    startStep(now);
  }
  function startStep(now) {
    if (!play) return;
    var st = play.job.steps[play.i];
    if (!st) { finishJob(now); return; }
    var c = curs[st.id];
    if (!c) { play.i++; startStep(now); return; }
    play.cur = c;
    if (!play.chip || !play.chip.el || !play.chip.el.parentNode) { finishJob(now); return; }
    var dest = play.chip;
    startMove(c, dest.x - 0.02, dest.y - 0.02, now);
    play.phase = 'to-chip';
    showBubble(c, (play.onChart && !st.pass ? 'Pull ' : 'Grab ') + sy(play.job), st.pass ? '' : 'bad', now, 1400);
  }
  function finishJob(now) {
    var j = play && play.job, ch = play && play.chip;
    var allPass = j && j.steps.length && j.steps.every(function (s) { return s.pass; });
    if (allPass && j.bought) showBuy(sy(j));   // real paper buy only
    if (ch && ch.el && ch.el.parentNode) parkChip(ch);  // stay on the chart/feed so it can be dragged to the trash
    if (play && play.cur) play.cur.busy = false;
    play = null;
  }
  function afterMove(now) {
    if (!play) return;
    var st = play.job.steps[play.i], c = play.cur, ch = play.chip;
    if (play.phase === 'to-chip') {
      pose(c, 'kgrab'); ripple(c);
      attachChip(ch, c);
      play.phase = 'hold'; play.wait = now + (RM ? 40 : 320);
    } else if (play.phase === 'to-dest') {
      if (st.pass) {
        pose(c, 'khop');
        var p = chartSpot();
        detachChip(ch, p.x + (play.i * 0.03 - 0.04), p.y + 0.02);
        parkChip(ch);
        play.onChart = true;
        showBubble(c, 'In ' + sy(play.job), 'good', now, 1200);
        play.phase = 'after'; play.wait = now + (RM ? 40 : 420);
      } else {
        pose(c, 'ktoss');
        detachChip(ch, c.x, c.y);
        dropInTrash(ch, play.job && play.job.mint, now);
        play.chip = null; play.onChart = false;
        showBubble(c, 'Trash ' + sy(play.job), 'bad', now, 1300);
        play.phase = 'after'; play.wait = now + (RM ? 40 : 520);
      }
    } else if (play.phase === 'home') {
      c.busy = false; pose(c, 'kidle');
      play.i += 1;
      if (!st.pass && st.id !== 'executor' && st.id !== 'risk') {
        // earlier bot rejected it: stop the pipeline
        finishJob(now); return;
      }
      startStep(now);
    }
  }
  function pumpJob(now) {
    if (!play) { beginJob(now); return; }
    var c = play.cur, st = play.job.steps[play.i];
    if (play.phase === 'hold' && now >= play.wait) {
      var dest = st.pass ? chartSpot() : trashSpot();
      if (st.pass) startMove(c, dest.x - 0.04, dest.y - 0.04, now);
      else startMove(c, dest.x, dest.y, now, RM ? 0 : 560);
      play.phase = 'to-dest';
      pose(c, '');
    } else if (play.phase === 'after' && now >= play.wait) {
      var h = homeOf(c.id);
      startMove(c, h.x, h.y, now);
      play.phase = 'home';
    }
  }

  function idleLine(id) {
    try {
      var v = botView(id); var l = v.line || '';
      if (id === 'scanner') { var n = S && S.universe && S.universe.n; return n != null ? 'Reading launches · ' + n + ' in view' : 'Reading new launches'; }
      if (id === 'auditor') { var kk = (S && S.kills || [])[0]; return kk ? 'Last kill ' + sy(kk) + ' · ' + short(String(kk.reason || '').split(';')[0], 20) : short(l, 30); }
      if (id === 'analyst') { var r = (S && S.rejects || [])[0]; return r ? 'Last skip ' + sy(r) + ' · ' + short(r.reason, 18) : short(l, 30); }
      if (id === 'brain') { var p = S && S.pot; return p && p.equity != null ? 'Pot ' + usd(p.equity) + ' · waiting' : short(l, 30); }
      if (id === 'risk') { var oo = openPos(); var rr = (S && S.rules) || {}; var sp = rr.stop_pcts || {}; var st = sp.normal != null ? sp.normal + '% / ' + sp.conviction + '%' : (rr.stop_pct || -10) + '%'; return oo ? 'Guarding ' + sy(oo) + ' · stop ' + (oo.stop_pct != null ? oo.stop_pct + '%' : st) : 'Flat · stops ' + st; }
      if (id === 'executor') { var o = openPos(); return o ? 'Holding ' + sy(o) + (o.move_pct != null ? ' ' + (o.move_pct > 0 ? '+' : '') + o.move_pct + '%' : '') : ((S && S.trades || []).length + ' trades · ready'); }
      return short(l, 32);
    } catch (e) { return ''; }
  }

  function loop(now) {
    raf = 0;
    if (document.hidden) return;
    measure();
    pumpJob(now);
    var moving = false, bubbles = 0;
    Object.keys(curs).forEach(function (id) {
      var c = curs[id], h = homeOf(id);
      if (c.t0) {
        var p = c.dur ? Math.min(1, (now - c.t0) / c.dur) : 1;
        var e = bounce(p);
        c.x = c.fx + (c.tx - c.fx) * e;
        c.y = c.fy + (c.ty - c.fy) * e;
        moving = p < 1;
        if (p >= 1) { c.x = c.tx; c.y = c.ty; c.t0 = 0; afterMove(now); }
      } else if (!c.busy) {
        // rest at home — no wander
        c.x += (h.x - c.x) * 0.18;
        c.y += (h.y - c.y) * 0.18;
        if (!c.pose) pose(c, 'kidle');
      }
      if (c.bubUntil && now > c.bubUntil) { c.bub.classList.remove('on'); c.bubUntil = 0; }
      if (c.bubUntil) bubbles++;
      if (play && play.chip && play.chip.held === id) { /* chip is in the cursor DOM */ }
    });
    // occasional idle status while resting, one at a time, never while a job is mid-flight
    if (!play && bubbles < 1 && now > lastBob + 7000) {
      var ids = botIds(), id = ids[Math.floor((now / 8000) % ids.length)];
      var c = curs[id];
      if (c && !c.busy && atHome(c)) {
        var line = idleLine(id);
        if (line) showBubble(c, line, 'idle', now, 2400);
        lastBob = now;
      }
    }
    separate();
    Object.keys(curs).forEach(function (id) {
      var c = curs[id];
      c.el.style.transform = 'translate3d(' + (c.x * B.w).toFixed(1) + 'px,' + (c.y * B.h).toFixed(1) + 'px,0)';
    });
    var need = moving || !!play || jobs.length || Object.keys(curs).some(function (id) { return curs[id].t0 || curs[id].busy || !atHome(curs[id]); });
    if (need) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && layer.isConnected && !document.hidden) raf = requestAnimationFrame(loop); }

  /* keep a light hook so existing rail pulses still run off real events */
  var seen = null;
  function evKey(a) { return [a.kind, a.ts, a.mint, a.verdict].join('|'); }
  function ingest() {
    if (!S) return;
    var act = (S.activity || []).slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var first = !seen; if (first) seen = {};
    var fresh = [];
    act.forEach(function (a) { var kk = evKey(a); if (!seen[kk]) { seen[kk] = 1; fresh.push(a); } });
    var tr = {}; ((S.trades || []).concat(S.open_positions || [])).forEach(function (t) { if (t && t.id != null) tr[t.id] = t; });
    if (prevTrades) {
      Object.keys(tr).forEach(function (id) {
        var t = tr[id], p = prevTrades[id];
        if (!p) flow('scanner', 'executor', COL.executor, 0);
        else if (p.status === 'open' && t.status && t.status !== 'open') flow('executor', 'risk', COL.risk, 0);
      });
    }
    prevTrades = tr;
    var hb = S.heartbeat_age_s;
    if (hb != null && hb < 30 && S.generated_at !== lastHb && !fresh.length) flow('scanner', 'auditor', 'rgba(150,160,175,.6)', 0, false, true);
    lastHb = S.generated_at;
    enqueueJobs();
  }

  function measure() {
    var card = layer.parentNode; if (!card) return;
    B.w = card.clientWidth; B.h = card.clientHeight;
    updateHomes();
    placeTrash();
  }

  function mount() {
    var host = document.getElementById('deskgrid') || document.querySelector('#screen .chartcard');
    if (host) {
      host.classList.add('kanim-host');
      if (layer.parentNode !== host) host.appendChild(layer);
      mountTrash();
      var ids = botIds();
      ids.forEach(function (id) {
        if (!curs[id]) {
          var c = makeCursor(id);
          var h = homeOf(id);
          c.x = c.fx = c.tx = h.x; c.y = c.fy = c.ty = h.y;
        }
      });
      Object.keys(curs).forEach(function (id) { if (ids.indexOf(id) < 0) { curs[id].el.remove(); delete curs[id]; } });
      measure();
      Object.keys(curs).forEach(function (id) {
        if (curs[id].busy || curs[id].t0) return;
        var h = homeOf(id);
        curs[id].x = curs[id].tx = h.x; curs[id].y = curs[id].ty = h.y;
        pose(curs[id], 'kidle');
      });
    }
    mountRail();
    counters();
    kick();
  }

  var _render = window.render;
  window.render = function (force) {
    var r = _render.apply(this, arguments);
    try { mount(); ingest(); } catch (e) { if (window.console) console.warn('kanim', e); }
    return r;
  };
  window.addEventListener('resize', function () { measure(); mountRail(); kick(); });
  document.addEventListener('visibilitychange', kick);
  try { mount(); } catch (e) {}
  window.__kanim = { curs: curs, layer: layer, flow: flow, homes: homes };
})();
