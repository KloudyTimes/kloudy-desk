/* Hand-drawn canvas charts. No chart library. devicePixelRatio aware. */
(function () {
  const C = { green: '#00d35a', red: '#ff453a', orange: '#ff9f0a', cyan: '#64d2ff', blue: '#0a84ff', yellow: '#ffd60a', card2: '#2c2c2e',
    ter: 'rgba(235,235,245,0.3)', sec: 'rgba(235,235,245,0.6)', sep: 'rgba(84,84,88,0.55)' };
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

  function setup(canvas, h) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const hh = h || canvas.clientHeight || 200;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
    canvas.style.height = hh + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    return { ctx, w, h: hh };
  }

  /* Home line chart. opts: {points:[[ts,v]], marks:[{ts,label,color,born}], start, empty, slide:{from:[ts,v],t:0..1}, now} */
  function drawLine(canvas, o) {
    const { ctx, w, h } = setup(canvas, 210);
    const padT = 44, padB = 8, padX = 16;
    let pts = o.points.slice();
    if (o.slide && pts.length) {      // newest point slides in from the previous one over 250ms
      const last = pts[pts.length - 1], f = o.slide.from, t = o.slide.t;
      pts[pts.length - 1] = [f[0] + (last[0] - f[0]) * t, f[1] + (last[1] - f[1]) * t];
    }
    const start = o.start;
    const vals = pts.map(p => p[1]).concat([start]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
    const t0 = pts.length ? pts[0][0] : 0, t1 = pts.length ? pts[pts.length - 1][0] : 1;
    const X = t => padX + (t1 === t0 ? (w - 2 * padX) : (t - t0) / (t1 - t0) * (w - 2 * padX));
    const Y = v => padT + (hi - v) / (hi - lo) * (h - padT - padB);
    // dashed start line
    ctx.setLineDash([4, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(start)); ctx.lineTo(w, Y(start)); ctx.stroke(); ctx.setLineDash([]);
    if (o.empty) {
      ctx.fillStyle = C.sec; ctx.font = `400 14px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('Waiting for the first trade', w / 2, Y(start) - 14);
    }
    if (pts.length < 2) { return; }
    // gradient fill (the only gradient: under the line, not on a card)
    const g = ctx.createLinearGradient(0, padT, 0, h);
    g.addColorStop(0, 'rgba(0,211,90,0.28)'); g.addColorStop(1, 'rgba(0,211,90,0)');
    ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    pts.forEach(p => ctx.lineTo(X(p[0]), Y(p[1])));
    ctx.lineTo(X(t1), h); ctx.lineTo(X(t0), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
    ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    // marks above the line, never overlapping; a later mark moves up a row
    const yAt = ts => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= ts) { const a = pts[i - 1], b = pts[i], f = b[0] === a[0] ? 0 : (ts - a[0]) / (b[0] - a[0]); return Y(a[1] + (b[1] - a[1]) * f); } return Y(pts[pts.length - 1][1]); };
    const placed = [];
    ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
    (o.marks || []).filter(m => m.ts >= t0 && m.ts <= t1 + 1).sort((a, b) => a.ts - b.ts).forEach(m => {
      const tw = ctx.measureText(m.label).width + 14, x = Math.min(Math.max(X(m.ts) - tw / 2, 4), w - tw - 4);
      let row = 0, y;
      for (;;) { y = Math.max(2, yAt(m.ts) - 24 - row * 20); const r = { x, y, w: tw, h: 17 };
        if (!placed.some(q => r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x && r.y < q.y + q.h + 3 && r.y + r.h + 3 > q.y)) { placed.push(r); break; }
        if (++row > 6) { placed.push({ x, y, w: tw, h: 17 }); break; } }
      const col = { blue: C.blue, green: C.green, red: C.red }[m.color] || C.blue;
      ctx.globalAlpha = Math.min(1, Math.max(0, m.alpha === undefined ? 1 : m.alpha));      // fades in over 200ms
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, tw, 17, 8.5) : ctx.rect(x, y, tw, 17); ctx.fill();
      ctx.fillStyle = m.color === 'green' ? '#000' : '#fff'; ctx.fillText(m.label, x + 7, y + 12.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(m.ts), yAt(m.ts), 3, 0, 7); ctx.fill();
    });
    const lp = pts[pts.length - 1]; ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(X(lp[0]), Y(lp[1]), 4, 0, 7); ctx.fill();
  }

  /* Coin candles with volume bars and the orange dashed Risk trailing stop line */
  function drawCandles(canvas, candles, exitLine) {
    const { ctx, w, h } = setup(canvas, 240);
    if (!candles || !candles.length) { ctx.fillStyle = C.sec; ctx.font = `400 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Collecting prices…', w / 2, h / 2); return; }
    const volH = 44, padT = 14, padR = 8, chartH = h - volH - padT - 6;
    let lo = Math.min(...candles.map(c => c.l)), hi = Math.max(...candles.map(c => c.h));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const n = Math.max(candles.length, 24), bw = (w - padR) / n, Y = v => padT + (hi - v) / (hi - lo) * chartH;
    const vmax = Math.max(1e-9, ...candles.map(c => c.v));
    candles.forEach((c, i) => {
      const x = i * bw + bw / 2, up = c.c >= c.o, col = up ? C.green : C.red;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      const top = Y(Math.max(c.o, c.c)), bh = Math.max(1.5, Math.abs(Y(c.o) - Y(c.c)));
      ctx.fillRect(x - bw * 0.32, top, bw * 0.64, bh);
      ctx.globalAlpha = 0.45; const vh = c.v / vmax * volH; ctx.fillRect(x - bw * 0.32, h - vh, bw * 0.64, vh); ctx.globalAlpha = 1;
    });
    if (exitLine) {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, Y(exitLine)); ctx.lineTo(w, Y(exitLine)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.orange; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('Risk trailing stop', 8, Y(exitLine) - 5);
    }
  }

  /* score ring 0-100, green from threshold */
  function drawRing(canvas, score, threshold) {
    const { ctx, w, h } = setup(canvas, 96);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 7;
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.strokeStyle = C.card2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (score != null) {
      ctx.strokeStyle = score >= threshold ? C.green : C.yellow;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.005, score / 100)); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = `600 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(score == null ? '–' : String(score), cx, cy + 1);
  }

  /* 8 discs + cyan beam. state[i] = 'pending'|'ok'|'bad'|'skip'|'beam'. beamPos: 0..8 float */
  function drawDiscs(canvas, states, beamPos, labels) {
    const { ctx, w, h } = setup(canvas, 300);
    const n = 8, cx = w / 2, rx = Math.min(w * 0.34, 130), ry = 15, gap = (h - 40) / n, top = 24;
    for (let i = n - 1; i >= 0; i--) {
      const y = top + i * gap + 14, st = states[i];
      const fill = st === 'ok' ? 'rgba(0,211,90,0.9)' : st === 'bad' ? 'rgba(255,69,58,0.92)' : st === 'beam' ? 'rgba(100,210,255,0.55)' : st === 'skip' ? '#232325' : '#2c2c2e';
      ctx.fillStyle = '#141416'; ctx.beginPath(); ctx.ellipse(cx, y + 9, rx, ry, 0, 0, Math.PI * 2); ctx.fill();   // thickness
      ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st === 'ok' || st === 'bad' ? '#000' : C.sec; ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(st === 'ok' ? '✓' : st === 'bad' ? '✕' : String(i + 1), cx, y + 1);
      if (labels && labels[i]) { ctx.textAlign = 'left'; ctx.fillStyle = C.ter; ctx.font = `400 11px ${FONT}`; ctx.fillText(labels[i], cx + rx + 8, y); }
    }
    if (beamPos != null && beamPos >= 0 && beamPos <= n) {      // cyan beam reads the layer top to bottom
      const y = top + Math.min(beamPos, n - 0.01) * gap + 14;
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - rx - 14, y); ctx.lineTo(cx + rx + 14, y); ctx.stroke();
    }
  }

  window.Charts = { drawLine, drawCandles, drawRing, drawDiscs };
})();
