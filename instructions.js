// COMFY web (iPhone) – illustrazioni animate delle istruzioni.
// Porting di InstructionMotionView.kt (Android 2.19.26): tratto bianco su terracotta, riempimenti bianchi trasparenti,
// frecce color pesca, badge di conferma. Scene: 0 cos'e' COMFY · 1 telefono sul banco a schermo nero · 2 occhiali tolti · 3 sondaggio e selfie.
const PERIOD = [4200, 4800, 2600, 5200];
const WHITE = '#FFFFFF', ACCENT = '#FFD8CC', BRAND = '#A4472B';
const ease = x => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
const phase = (t, a, b) => ease((t - a) / (b - a));
const rgba = a => `rgba(255,255,255,${Math.max(0, Math.min(1, a))})`;

function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else g.rect(x, y, w, h); }
function stroke(g, w, col = WHITE, a = 1) { g.lineWidth = w; g.strokeStyle = col; g.globalAlpha = a; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1; }
function fill(g, col, a = 1) { g.fillStyle = col; g.globalAlpha = a; g.fill(); g.globalAlpha = 1; }
const line = (g, x0, y0, x1, y1, w, col = WHITE, a = 1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); stroke(g, w, col, a); };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };
const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
function arcDeg(g, cx, cy, rx, ry, startDeg, sweepDeg) { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, startDeg * Math.PI / 180, (startDeg + sweepDeg) * Math.PI / 180); }

function phoneRect(w, h, dx = 0, ratio = 0.5) { const ph = h * 0.74, pw = ph * ratio, cx = w * 0.5 + dx, cy = h * 0.47; return { l: cx - pw / 2, t: cy - ph / 2, r: cx + pw / 2, b: cy + ph / 2 }; }
const screenRect = r => ({ l: r.l + 7, t: r.t + 14, r: r.r - 7, b: r.b - 12 });
function phone(g, r, screenAlpha) {
  rr(g, r.l, r.t, r.r - r.l, r.b - r.t, 18); stroke(g, 2.2);
  const s = screenRect(r); rr(g, s.l, s.t, s.r - s.l, s.b - s.t, 10); fill(g, WHITE, screenAlpha);
  circle(g, (r.l + r.r) / 2, r.t + 7.5, 1.8); fill(g, WHITE);
}
function checkBadge(g, ox, oy, a) {
  if (a <= 0.01) return;
  circle(g, ox, oy, 13); fill(g, WHITE, a);
  g.beginPath(); g.moveTo(ox - 6, oy); g.lineTo(ox - 1.5, oy + 5); g.lineTo(ox + 7, oy - 5); stroke(g, 3, BRAND, a);
}

// ---- 0 · cos'e' COMFY: selfie sul telefono, attorno luce, suono e sensazioni
function drawActivation(g, w, h, t) {
  const fadeOut = 1 - phase(t, 0.90, 1.0), r = phoneRect(w, h, 0, 0.5);
  phone(g, r, (40 * fadeOut + 20) / 255);
  const s = screenRect(r), faceA = phase(t, 0.06, 0.20) * fadeOut;
  if (faceA > 0.01) {
    const fx = (s.l + s.r) / 2, fy = (s.t + s.b) / 2 - 2, fw = (s.r - s.l) * 0.32, fh = fw * 1.3;
    ellipse(g, fx, fy, fw, fh); stroke(g, 2.2, WHITE, faceA);
    circle(g, fx - fw * 0.38, fy - fh * 0.12, 1.8); fill(g, WHITE, faceA); circle(g, fx + fw * 0.38, fy - fh * 0.12, 1.8); fill(g, WHITE, faceA);
    arcDeg(g, fx, fy + fh * 0.275, fw * 0.45, fh * 0.225, 20, 140); stroke(g, 1.6, WHITE, faceA);
  }
  const items = [[-0.33, -0.10, 0.30], [0.33, -0.18, 0.42], [0.33, 0.22, 0.54]];
  items.forEach((it, i) => {
    const a = phase(t, it[2], it[2] + 0.08) * fadeOut; if (a <= 0.01) return;
    const ix = w * 0.5 + w * it[0], iy = h * 0.47 + h * it[1];
    const pulse = 1 + 0.08 * Math.sin((t - it[2]) * 2 * Math.PI * 2) * a;
    const ex = it[0] < 0 ? r.l - 4 : r.r + 4; let x = ix + (it[0] < 0 ? 16 : -16); const step = it[0] < 0 ? 6 : -6;
    while ((it[0] < 0 && x < ex) || (it[0] > 0 && x > ex)) { circle(g, x, iy, 1.2); fill(g, WHITE, a); x += step; }
    g.save(); g.translate(ix, iy); g.scale(pulse, pulse); g.translate(-ix, -iy);
    if (i === 0) { circle(g, ix, iy, 7); stroke(g, 2.2, WHITE, a); for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; line(g, ix + 10 * Math.cos(an), iy + 10 * Math.sin(an), ix + 14 * Math.cos(an), iy + 14 * Math.sin(an), 1.6, WHITE, a); } }
    else if (i === 1) { rr(g, ix - 12, iy - 4, 6, 8, 1.5); stroke(g, 2.2, WHITE, a); for (let k = 1; k <= 3; k++) { arcDeg(g, ix - 6, iy, 5 * k, 5 * k, -40, 80); stroke(g, 1.6, WHITE, a); } }
    else { circle(g, ix, iy, 11); stroke(g, 2.2, WHITE, a); circle(g, ix - 4, iy - 3, 1.6); fill(g, WHITE, a); circle(g, ix + 4, iy - 3, 1.6); fill(g, WHITE, a); arcDeg(g, ix, iy + 1.5, 6, 4.5, 20, 140); stroke(g, 1.6, WHITE, a); }
    g.restore();
  });
}

// ---- 1 · il telefono si appoggia sul banco, lo schermo si oscura (resta acceso), "10 min"
function drawTable(g, w, h, t) {
  const tableTop = h * 0.74;
  g.beginPath(); g.moveTo(w * 0.10, tableTop); g.lineTo(w * 0.90, tableTop); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); fill(g, WHITE, 0x1F / 255);
  line(g, w * 0.10, tableTop, w * 0.90, tableTop, 1.6, WHITE, 200 / 255);
  const lay = phase(t, 0.14, 0.40), upH = h * 0.58, upW = upH * 0.5, flatH = h * 0.15, flatW = upW * 1.25;
  const ph = upH + (flatH - upH) * lay, pw = upW + (flatW - upW) * lay, upCy = h * 0.36, flatCy = tableTop + (h - tableTop) * 0.45, cy = upCy + (flatCy - upCy) * lay, cx = w * 0.5;
  const r = { l: cx - pw / 2, t: cy - ph / 2, r: cx + pw / 2, b: cy + ph / 2 }, rad = Math.min(16, ph * 0.22);
  if (lay > 0.6) { ellipse(g, (r.l + r.r) / 2 + 1, r.b + 2, (r.r - r.l) / 2 + 5, 5); fill(g, '#000', 50 * (lay - 0.6) / 0.4 / 255); }
  rr(g, r.l, r.t, r.r - r.l, r.b - r.t, rad); stroke(g, 2.2);
  const inset = 5 + 4 * (1 - lay), sr = { l: r.l + inset, t: r.t + inset * (1 - 0.5 * lay) + 4 * (1 - lay), r: r.r - inset, b: r.b - inset * (1 - 0.5 * lay) };
  const dark = phase(t, 0.50, 0.62);
  rr(g, sr.l, sr.t, sr.r - sr.l, sr.b - sr.t, rad * 0.6); fill(g, WHITE, 110 / 255 * (1 - dark));
  if (dark > 0.01) { rr(g, sr.l, sr.t, sr.r - sr.l, sr.b - sr.t, rad * 0.6); fill(g, '#000', 0.85 * dark); }
  if (lay < 0.01) { const sw = sr.r - sr.l; line(g, sr.l + 5, sr.t + (sr.b - sr.t) * 0.25, sr.r - 5, sr.t + (sr.b - sr.t) * 0.25, 2.2); line(g, sr.l + 5, sr.t + (sr.b - sr.t) * 0.40, sr.r - 9, sr.t + (sr.b - sr.t) * 0.40, 1.6); line(g, sr.l + 5, sr.t + (sr.b - sr.t) * 0.52, sr.l + sw - 13, sr.t + (sr.b - sr.t) * 0.52, 1.6); }
  const arrowA = phase(t, 0.10, 0.16) * (1 - phase(t, 0.36, 0.42));
  if (arrowA > 0.01) { const ax = w * 0.5 + upW * 0.5 + 26, ay0 = upCy - 10, ay1 = flatCy - 12; line(g, ax, ay0, ax, ay1, 3, ACCENT, arrowA); line(g, ax, ay1, ax - 6, ay1 - 7, 3, ACCENT, arrowA); line(g, ax, ay1, ax + 6, ay1 - 7, 3, ACCENT, arrowA); }
  // suono registrato: onde sopra il telefono quando lo schermo e' scuro
  const waveA = dark * (1 - phase(t, 0.92, 1.0));
  if (waveA > 0.01) for (let k = 1; k <= 3; k++) { const rr2 = 9 * k + 3 * Math.sin(t * 2 * Math.PI * 3 + k); arcDeg(g, cx, flatCy - 6, rr2, rr2, 220, 100); stroke(g, 1.8, ACCENT, waveA * (1 - k * 0.22)); }
  const waitA = phase(t, 0.66, 0.74) * (1 - phase(t, 0.94, 1.0));
  if (waitA > 0.01) { g.globalAlpha = waitA; g.fillStyle = WHITE; g.font = '600 22px -apple-system,system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('10 min', w * 0.5, tableTop - h * 0.30); g.globalAlpha = 1; }
}

// ---- 2 · occhiali tolti dal volto
function drawGlasses(g, w, h, t) {
  const cx = w * 0.5, cy = h * 0.52, faceW = h * 0.36, faceH = h * 0.46;
  ellipse(g, cx, cy, faceW, faceH); fill(g, WHITE, 0x22 / 255); ellipse(g, cx, cy, faceW, faceH); stroke(g, 2.2);
  arcDeg(g, cx - faceW - 1, cy - 1, 8, 13, 90, 180); stroke(g, 2.2); arcDeg(g, cx + faceW + 1, cy - 1, 8, 13, -90, 180); stroke(g, 2.2);
  const eyeY = cy - faceH * 0.12, eyeDx = faceW * 0.42;
  line(g, cx, eyeY + 6, cx - 5, cy + faceH * 0.22, 1.6); line(g, cx - 5, cy + faceH * 0.22, cx + 3, cy + faceH * 0.24, 1.6);
  arcDeg(g, cx, cy + faceH * 0.40, 16, faceH * 0.10, 20, 140); stroke(g, 1.6);
  const removed = phase(t, 0.25, 0.55) * (1 - phase(t, 0.86, 1.0));
  [-1, 1].forEach(sx => { circle(g, cx + sx * eyeDx, eyeY, 2.6 + 1.2 * removed); fill(g, WHITE); });
  const lift = removed * h * 0.28, gy = eyeY - lift, gdx = removed * w * 0.20, a = 1 - 0.75 * removed;
  const lensW = faceW * 0.62, lensH = faceH * 0.30, gcx = cx + gdx;
  const L = { l: gcx - eyeDx - lensW / 2, t: gy - lensH / 2 }, R = { l: gcx + eyeDx - lensW / 2, t: gy - lensH / 2 };
  [L, R].forEach(q => { rr(g, q.l, q.t, lensW, lensH, 8); fill(g, BRAND, a * 0.55); rr(g, q.l, q.t, lensW, lensH, 8); stroke(g, 2.2, WHITE, a); line(g, q.l + 6, q.t + 6, q.l + 13, q.t + 3, 1.6, WHITE, a); });
  g.beginPath(); g.moveTo(L.l + lensW, gy - 2); g.quadraticCurveTo(gcx, gy - 9, R.l, gy - 2); stroke(g, 2.2, WHITE, a);
  line(g, L.l, gy - 3, L.l - faceW * 0.30, gy - 1, 2.2, WHITE, a); line(g, R.l + lensW, gy - 3, R.l + lensW + faceW * 0.30, gy - 1, 2.2, WHITE, a);
  if (removed > 0.9) checkBadge(g, cx + faceW + 22, cy + faceH - 16, 1);
}

// ---- 3 · sondaggio, poi selfie con l'ovale che si riempie e lo scatto
function drawSurvey(g, w, h, t) {
  const r = phoneRect(w, h, 0, 0.52); phone(g, r, 34 / 255);
  const s = screenRect(r), surveyA = 1 - phase(t, 0.44, 0.52), selfieA = phase(t, 0.48, 0.56) * (1 - phase(t, 0.94, 1.0));
  if (surveyA > 0.01) {
    const a = surveyA;
    line(g, s.l + 10, s.t + 22, s.r - 18, s.t + 22, 1.6, WHITE, a); line(g, s.l + 10, s.t + 32, s.r - 34, s.t + 32, 1.6, WHITE, a);
    const sy = s.t + (s.b - s.t) * 0.44, x0 = s.l + 6, x1 = s.r - 6;
    line(g, x0, sy, x1, sy, 2.2, WHITE, a); for (let k = 0; k <= 4; k++) { const x = x0 + (x1 - x0) * k / 4; line(g, x, sy - 3, x, sy + 3, 1.6, WHITE, a); }
    const kx = x0 + (x1 - x0) * (0.5 + 0.25 * phase(t, 0.10, 0.28));
    circle(g, kx, sy, 5.5); fill(g, BRAND, a); circle(g, kx, sy, 2.2); fill(g, WHITE, a);
    line(g, s.l + 10, sy + 26, s.r - 22, sy + 26, 1.6, WHITE, a);
    const press = phase(t, 0.32, 0.36) * (1 - phase(t, 0.40, 0.44));
    rr(g, s.l + 10, s.b - 30, s.r - s.l - 20, 20, 8); fill(g, BRAND, a * (0.45 + 0.55 * press));
  }
  if (selfieA > 0.01) {
    const a = selfieA, fx = (s.l + s.r) / 2, fy = (s.t + s.b) / 2 - 6, ow = (s.r - s.l) * 0.34, oh = ow * 1.34, fw = ow * 0.72, fh = oh * 0.74;
    ellipse(g, fx, fy, fw, fh); stroke(g, 1.6, WHITE, a);
    circle(g, fx - fw * 0.38, fy - fh * 0.12, 1.8); fill(g, WHITE, a); circle(g, fx + fw * 0.38, fy - fh * 0.12, 1.8); fill(g, WHITE, a);
    arcDeg(g, fx, fy + fh * 0.29, fw * 0.40, fh * 0.19, 20, 140); stroke(g, 1.6, WHITE, a);
    ellipse(g, fx, fy, ow, oh); stroke(g, 1.6, WHITE, a * 0.5);
    const fp = phase(t, 0.56, 0.80);
    if (fp > 0) { g.beginPath(); g.ellipse(fx, fy, ow, oh, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fp); stroke(g, 3, ACCENT, a); }
    const flash = phase(t, 0.80, 0.82) * (1 - phase(t, 0.82, 0.88));
    if (flash > 0.01) { rr(g, s.l, s.t, s.r - s.l, s.b - s.t, 10); fill(g, WHITE, 200 / 255 * flash * selfieA); }
    checkBadge(g, r.r + 24, r.b - 14, phase(t, 0.84, 0.90) * selfieA);
  }
}

const SCENES = [drawActivation, drawTable, drawGlasses, drawSurvey];

/** Avvia l'animazione della scena `mode` nel canvas; restituisce una funzione per fermarla. */
export function animate(canvas, mode) {
  const g = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, stopped = false;
  function frame(now) {
    if (stopped) return;
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0) {
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const tt = reduce ? 0.86 : (now % PERIOD[mode]) / PERIOD[mode];
      SCENES[mode](g, w, h, tt);
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
