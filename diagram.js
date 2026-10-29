// COMFY web (iPhone) – diagramma angolare del campo visivo per la fonte di abbagliamento.
// Porting di ViewDiagramView.kt (Android 2.19.26): proiezione equidistante (r = theta/90°),
// tocco = cerchio di raggio 0.13, contorno ricampionato (max 48 punti), statistiche su griglia 120 x 120.
const MAX_POINTS = 48, SAMPLES = 120, MIN_AREA = 0.008, TAP_RADIUS = 0.13;

export function zoneOf(x, y) {
  if (Math.abs(x) <= 0.24 && y >= -0.12 && y <= 0.26) return 'screen';
  if (y >= 0.38) return 'ceiling';
  if (y <= -0.38) return 'desk';
  return x < 0 ? 'left' : 'right';
}
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function resample(pts) {
  if (pts.length < 3) return pts;
  const closed = [...pts, pts[0]];
  let length = 0; for (let i = 1; i < closed.length; i++) length += Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]);
  if (length <= 0) return pts;
  const count = Math.min(MAX_POINTS, Math.max(12, Math.floor(length / 0.02))), step = length / count;
  const out = []; let target = 0, walked = 0;
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1], b = closed[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (seg > 0 && target <= walked + seg && out.length < count) { const t = (target - walked) / seg; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); target += step; }
    walked += seg;
  }
  return out;
}
function polygonArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2; }
const circle = (cx, cy, r) => Array.from({ length: 36 }, (_, k) => { const t = 2 * Math.PI * k / 36; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });

export function areaStats(poly) {
  if (poly.length < 3) return null;
  const n = SAMPLES, cell = 2 / n;
  let inDisc = 0, count = 0, sx = 0, sy = 0, omega = 0, tMin = 90, tMax = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -1 + (i + 0.5) * cell, y = -1 + (j + 0.5) * cell, r = Math.hypot(x, y);
    if (r > 1) continue;
    inDisc++;
    if (!inside(poly, x, y)) continue;
    count++; sx += x; sy += y;
    const theta = r * Math.PI / 2, jac = r < 1e-6 ? (Math.PI / 2) ** 2 : Math.sin(theta) * (Math.PI / 2) / r;
    omega += jac * cell * cell;
    const deg = r * 90; tMin = Math.min(tMin, deg); tMax = Math.max(tMax, deg);
  }
  if (!count) return null;
  const cx = sx / count, cy = sy / count;
  return { polygon: poly, x: cx, y: cy, thetaDeg: Math.min(1, Math.hypot(cx, cy)) * 90, phiDeg: Math.atan2(cy, cx) * 180 / Math.PI,
    thetaMinDeg: tMin, thetaMaxDeg: tMax, solidAngleSr: omega, areaFraction: count / Math.max(1, inDisc), zone: zoneOf(cx, cy) };
}

/** Crea il diagramma dentro `host`. labels: {screen, ceiling, desk, left, right}. onChange(area|null). */
export function createDiagram(host, labels, onChange) {
  const cv = document.createElement('canvas');
  cv.className = 'diagram'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', labels.aria || '');
  host.appendChild(cv);
  const g = cv.getContext('2d');
  let polygon = [], drawing = [], mode = null, area = null, last = null, down = null;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function size() { const w = cv.clientWidth, dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = w * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  const geo = () => { const w = cv.clientWidth, pad = 8, r = w / 2 - pad; return { cx: w / 2, cy: w / 2, r }; };
  const toNorm = (px, py) => { const { cx, cy, r } = geo(); return [(px - cx) / r, (cy - py) / r]; };
  const toScr = ([x, y]) => { const { cx, cy, r } = geo(); return [cx + x * r, cy - y * r]; };

  function draw() {
    const w = cv.clientWidth, { cx, cy, r } = geo();
    if (w < 40 || r <= 0) return;
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = '#E6DAD2'; g.lineWidth = 1;
    [1 / 3, 2 / 3].forEach(f => { g.beginPath(); g.arc(cx, cy, r * f, 0, 2 * Math.PI); g.stroke(); });
    g.beginPath(); g.moveTo(cx - r * 0.88, cy); g.lineTo(cx + r * 0.88, cy); g.moveTo(cx, cy - r * 0.88); g.lineTo(cx, cy + r * 0.88); g.stroke();
    g.fillStyle = '#9A8E86'; g.font = '11px -apple-system,system-ui,sans-serif'; g.textAlign = 'left';
    [[1 / 3, '30°'], [2 / 3, '60°'], [0.94, '90°']].forEach(([f, t]) => g.fillText(t, cx + r * f * 0.7 + 3, cy - r * f * 0.7));
    // monitor al centro: 0° = direzione dello sguardo
    const P = (x, y) => [cx + x * r, cy - y * r];
    g.strokeStyle = '#B9ACA3'; g.lineWidth = 1.6;
    const [sx0, sy0] = P(-0.25, 0.22), [sx1, sy1] = P(0.25, -0.10);
    g.beginPath(); g.roundRect ? g.roundRect(sx0, sy0, sx1 - sx0, sy1 - sy0, 7) : g.rect(sx0, sy0, sx1 - sx0, sy1 - sy0); g.stroke();
    const [dx0, dy0] = P(-0.30, -0.20), [dx1, dy1] = P(0.30, -0.28);
    g.beginPath(); g.roundRect ? g.roundRect(dx0, dy0, dx1 - dx0, dy1 - dy0, 5) : g.rect(dx0, dy0, dx1 - dx0, dy1 - dy0); g.stroke();
    g.beginPath(); g.moveTo(cx, sy1); g.lineTo(cx, P(0, -0.18)[1]); g.stroke();
    g.fillStyle = '#6B625C'; g.font = '600 12.5px -apple-system,system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText(labels.screen, cx, P(0, 0.02)[1] + 4);
    g.fillStyle = '#9A8E86'; g.font = '11px -apple-system,system-ui,sans-serif'; g.fillText('0°', cx, P(0, -0.07)[1] + 4);
    g.fillStyle = '#6B625C'; g.font = '600 13px -apple-system,system-ui,sans-serif';
    g.fillText(labels.ceiling, cx, P(0, 0.80)[1] + 4); g.fillText(labels.desk, cx, P(0, -0.82)[1] + 4);
    g.fillText(labels.left, P(-0.70, 0)[0], cy - 6); g.fillText(labels.right, P(0.70, 0)[0], cy - 6);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.clip();
    if (polygon.length >= 3) {
      g.beginPath(); polygon.forEach((p, i) => { const [x, y] = toScr(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = 'rgba(242,179,61,0.35)'; g.fill(); g.strokeStyle = '#E39A3B'; g.lineWidth = 2.5; g.stroke();
    }
    if (drawing.length >= 2) { g.beginPath(); drawing.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.strokeStyle = '#A4472B'; g.lineWidth = 3; g.stroke(); }
    g.restore();
    g.strokeStyle = '#1D1A18'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
    if (area) { const [bx, by] = toScr([area.x, area.y]); g.fillStyle = '#A4472B'; g.beginPath(); g.arc(bx, by, 6, 0, 2 * Math.PI); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  }
  function update() { area = areaStats(polygon); if (!area) polygon = []; draw(); onChange && onChange(area); }
  const pos = ev => { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
  cv.addEventListener('pointerdown', ev => {
    const [px, py] = pos(ev), [nx, ny] = toNorm(px, py);
    if (Math.hypot(nx, ny) > 1.03) return;
    ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
    down = [px, py]; last = [px, py];
    mode = polygon.length >= 3 && inside(polygon, nx, ny) ? 'move' : 'draw';
    drawing = mode === 'draw' ? [[px, py]] : [];
  });
  cv.addEventListener('pointermove', ev => {
    if (!mode) return; ev.preventDefault();
    const [px, py] = pos(ev);
    if (mode === 'draw') { if (Math.hypot(px - last[0], py - last[1]) >= 2) { drawing.push([px, py]); last = [px, py]; draw(); } }
    else { const { r } = geo(); const dx = (px - last[0]) / r, dy = -(py - last[1]) / r; last = [px, py]; polygon = polygon.map(([x, y]) => [x + dx, y + dy]); draw(); }
  });
  const up = ev => {
    if (!mode) return;
    const [px, py] = pos(ev), moved = Math.hypot(px - down[0], py - down[1]) > 8;
    if (mode === 'draw') {
      const pts = drawing.map(p => toNorm(p[0], p[1])); drawing = [];
      const cand = resample(pts), tap = !moved && pts.length < 6;
      if (tap || cand.length < 3 || polygonArea(cand) < MIN_AREA) { const [nx, ny] = toNorm(px, py); if (Math.hypot(nx, ny) > 1.05) { mode = null; draw(); return; } polygon = circle(nx, ny, TAP_RADIUS); }
      else polygon = cand;
      if (navigator.vibrate) navigator.vibrate(10);
      update();
    } else if (moved) update(); else draw();
    mode = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';
  new ResizeObserver(size).observe(cv);
  return { area: () => area, clear: () => { polygon = []; area = null; draw(); onChange && onChange(null); } };
}
