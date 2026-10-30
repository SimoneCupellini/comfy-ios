// COMFY web (iPhone) – modulo luce.
// Porting di SalmeronRoi.kt / SalmeronMath.kt / BilateralLight.kt dell'app Android 2.19.26:
// stessa ROI perioculare (0.30 x 0.12 IOD, offset 0.04 IOD), stessa luma 8 bit, stesso k' ed Ev.

export const PERIOCULAR_METHOD_ID = 'periocular_thesis_v4_0.30x0.12_off0.04';
export const OFFICIAL_EV_METHOD = 'periocular_pixel_weighted_common_kprime';
export const BILATERAL_METHOD = 'bilateral_common_kprime_diagnostic';
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// ------------------------------------------------------------------ EXIF (JPEG o HEIC)
function findTiff(u) {
  for (let i = 0; i < u.length - 10; i++) {
    if (u[i] === 0x45 && u[i + 1] === 0x78 && u[i + 2] === 0x69 && u[i + 3] === 0x66 && u[i + 4] === 0 && u[i + 5] === 0) {
      const t = i + 6;
      if ((u[t] === 0x49 && u[t + 1] === 0x49 && u[t + 2] === 0x2A) || (u[t] === 0x4D && u[t + 1] === 0x4D && u[t + 3] === 0x2A)) return t;
    }
  }
  return -1;
}
export function parseExif(buf) {
  const u = new Uint8Array(buf);
  const t = findTiff(u);
  if (t < 0) return null;
  const dv = new DataView(buf);
  const le = dv.getUint16(t) === 0x4949;
  const u16 = o => dv.getUint16(t + o, le), u32 = o => dv.getUint32(t + o, le), s32 = o => dv.getInt32(t + o, le);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function val(type, count, off) {
    if (!size[type]) return null;
    const n = size[type] * count, p = n <= 4 ? off : u32(off);
    const one = k => {
      const q = p + k * size[type];
      switch (type) {
        case 1: case 7: return dv.getUint8(t + q);
        case 3: return u16(q);
        case 4: return u32(q);
        case 9: return s32(q);
        case 5: { const d = u32(q + 4); return d ? u32(q) / d : null; }
        case 10: { const d = s32(q + 4); return d ? s32(q) / d : null; }
      }
    };
    if (type === 2) { let s = ''; for (let k = 0; k < count - 1; k++) { const c = dv.getUint8(t + p + k); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
    return count === 1 ? one(0) : Array.from({ length: Math.min(count, 8) }, (_, k) => one(k));
  }
  function ifd(off) { const n = u16(off), o = {}; for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; o[u16(e)] = val(u16(e + 2), u32(e + 4), e + 8); } return o; }
  const i0 = ifd(u32(4));
  const ex = i0[0x8769] ? ifd(i0[0x8769]) : {};
  const r = v => Array.isArray(v) && v.length === 2 && v[1] ? v[0] / v[1] : v;
  const first = v => Array.isArray(v) ? v[0] : v;
  return {
    make: i0[0x10F] || '', model: i0[0x110] || '', software: i0[0x131] || '',
    exposureS: r(ex[0x829A]), fNumber: r(ex[0x829D]), iso: first(ex[0x8827]),
    exposureBias: r(ex[0x9204]), brightness: r(ex[0x9203]), focalMm: r(ex[0x920A]),
    lens: ex[0xA434] || '', dateTimeOriginal: ex[0x9003] || '', offsetTime: ex[0x9011] || ex[0x9010] || ''
  };
}
/** Istante dello scatto (ms) da DateTimeOriginal + OffsetTimeOriginal. */
export function captureEpochMs(exif) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(exif.dateTimeOriginal || '');
  if (!m) return null;
  const off = /^([+-])(\d{2}):(\d{2})$/.exec(exif.offsetTime || '');
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off ? off[0] : ''}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// ------------------------------------------------------------------ immagine
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;   // il browser applica gia' l'orientamento EXIF
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------------------------ MediaPipe Face Landmarker
let landmarkerPromise = null;
export function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 1,
        minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55, minTrackingConfidence: 0.55
      });
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

// ------------------------------------------------------------------ ROI perioculari (porting 1:1)
const LOWER_A = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LOWER_B = [362, 382, 381, 380, 374, 373, 390, 249, 263];
const V = (x, y) => ({ x, y });
const add = (a, b) => V(a.x + b.x, a.y + b.y), sub = (a, b) => V(a.x - b.x, a.y - b.y), mul = (a, s) => V(a.x * s, a.y * s);
const norm = a => Math.hypot(a.x, a.y);
const meanPt = ps => V(ps.reduce((s, p) => s + p.x, 0) / ps.length, ps.reduce((s, p) => s + p.y, 0) / ps.length);

export function buildPeriocular(xy) {
  const aC = mul(add(xy(33), xy(133)), 0.5), bC = mul(add(xy(362), xy(263)), 0.5);
  const iod = norm(sub(bC, aC));
  if (!(iod > 0)) throw new Error('roi_iod');
  const eyeAxis = mul(sub(bC, aC), 1 / iod);
  let down = V(-eyeAxis.y, eyeAxis.x); if (down.y < 0) down = mul(down, -1);
  const width = 0.30 * iod, height = 0.12 * iod, offset = 0.04 * iod;
  const rect = top => { const p1 = sub(top, mul(eyeAxis, width / 2)), p2 = add(top, mul(eyeAxis, width / 2)); return [p1, p2, add(p2, mul(down, height)), add(p1, mul(down, height))]; };
  const a = rect(add(meanPt(LOWER_A.map(xy)), mul(down, offset)));
  const b = rect(add(meanPt(LOWER_B.map(xy)), mul(down, offset)));
  const aIsLeft = a.reduce((s, p) => s + p.x, 0) <= b.reduce((s, p) => s + p.x, 0);
  const roll = Math.atan2(eyeAxis.y, eyeAxis.x) * 180 / Math.PI;
  return aIsLeft ? { left: a, right: b, iod, roll } : { left: b, right: a, iod, roll };
}

/** Luma 8 bit come cv2.COLOR_RGB2YUV (virgola fissa). */
export const luma8 = (r, g, b) => (r * 4899 + g * 9617 + b * 1868 + 8192) >> 14;

export function meanLuma(canvas, poly) {
  const xs = poly.map(p => Math.trunc(p.x)), ys = poly.map(p => Math.trunc(p.y));
  const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(canvas.width - 1, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(canvas.height - 1, Math.max(...ys));
  if (x1 < x0 || y1 < y0) return { mean: 0, count: 0, clipped: 0 };
  let area = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; area += xs[i] * ys[j] - xs[j] * ys[i]; }
  const orient = area >= 0 ? 1 : -1;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
  let sum = 0, n = 0, clipped = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const px = x0 + xx, py = y0 + yy;
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      const j = (i + 1) % 4, dx = xs[j] - xs[i], dy = ys[j] - ys[i];
      const cross = dx * (py - ys[i]) - dy * (px - xs[i]);
      if (2 * orient * cross < -Math.max(Math.abs(dx), Math.abs(dy))) ok = false;
    }
    if (!ok) continue;
    const k = (yy * w + xx) * 4, l = luma8(d[k], d[k + 1], d[k + 2]);
    sum += l; n++; if (l <= 5 || l >= 250) clipped++;
  }
  return { mean: n ? sum / n : 0, count: n, clipped };
}

export const calibrateKPrime = (refLux, iso, t, N, ym) => refLux * t * iso / (N * N * ym);
export const estimateEv = (k, iso, t, N, ym) => k * N * N * ym / (t * iso);

// ------------------------------------------------------------------ analisi completa di un selfie
export class LightError extends Error { constructor(code, extra) { super(code); this.code = code; this.extra = extra; } }

/**
 * Analizza un selfie scelto dalla libreria.
 * opts: { maxAgeMs, kPrime (per Ev), referenceLux (per k') }
 */
export async function analyzeSelfie(file, opts = {}) {
  const buf = await file.arrayBuffer();
  const exif = parseExif(buf);
  if (!exif || !(exif.iso > 0) || !(exif.exposureS > 0) || !(exif.fNumber > 0)) throw new LightError('no_exposure');
  const shotMs = captureEpochMs(exif);
  if (shotMs == null) throw new LightError('no_time');
  const ageMs = Date.now() - shotMs;
  const maxAge = opts.maxAgeMs ?? 3 * 60 * 1000;
  if (ageMs > maxAge) throw new LightError('too_old', { ageMs });
  if (ageMs < -2 * 60 * 1000) throw new LightError('clock', { ageMs });
  const isFront = /front/i.test(exif.lens);
  if (exif.lens && !isFront) throw new LightError('not_front');

  const canvas = await loadImage(file);
  const fl = await loadLandmarker();
  const res = fl.detect(canvas);
  const faces = res.faceLandmarks || [];
  if (faces.length === 0) throw new LightError('no_face');
  if (faces.length > 1) throw new LightError('multiple_faces');
  const lm = faces[0];
  if (lm.length < 468) throw new LightError('landmarks');
  const W = canvas.width, H = canvas.height;
  const xy = i => V(lm[i].x * W, lm[i].y * H);
  const peri = buildPeriocular(xy);
  if (!(peri.iod > 20)) throw new LightError('face_small');
  const L = meanLuma(canvas, peri.left), R = meanLuma(canvas, peri.right);
  if (L.count <= 80 || R.count <= 80) throw new LightError('roi_small');
  const n = L.count + R.count;
  const ym = (L.mean * L.count + R.mean * R.count) / n;
  if (!(ym > 0)) throw new LightError('dark');
  const clip = (L.clipped + R.clipped) / n;
  const lr = Math.abs(L.mean - R.mean) / Math.max(1, ym);

  const out = {
    exif, shotMs, ageMs, isFront, width: W, height: H,
    iod: peri.iod, roll: peri.roll, ymLeft: L.mean, ymRight: R.mean, ym, pixels: n,
    clip, clipLeft: L.clipped / L.count, clipRight: R.clipped / R.count, lrDiff: lr,
    preview: renderPreview(canvas, peri)
  };
  // ROI alta-guancia compatta (solo confronto, come la v2.19.3 Android): non invalida mai Ev
  try {
    const c = buildCompactCheek(xy);
    const cl = meanLuma(canvas, c.left), cr = meanLuma(canvas, c.right);
    if (cl.count > 0 && cr.count > 0) {
      const cn = cl.count + cr.count, cym = (cl.mean * cl.count + cr.mean * cr.count) / cn;
      out.compact = { ym: cym, ymLeft: cl.mean, ymRight: cr.mean, pixels: cn, clip: (cl.clipped + cr.clipped) / cn, lrDiff: Math.abs(cl.mean - cr.mean) / Math.max(1, cym) };
      if (opts.referenceLux > 0) out.compact.kPrime = calibrateKPrime(opts.referenceLux, exif.iso, exif.exposureS, exif.fNumber, cym);
      const kc = out.compact.kPrime ?? opts.kPrimeCompact;
      if (kc > 0) out.compact.ev = estimateEv(kc, exif.iso, exif.exposureS, exif.fNumber, cym);
    }
  } catch (e) { out.compact = null; }
  out.glasses = detectGlasses(canvas, lm);
  const flags = [];
  if (clip > 0.02) flags.push('clipping_gt_0.02');
  if (!isFront) flags.push('lens_unknown');
  if (opts.referenceLux > 0) {
    out.kPrime = calibrateKPrime(opts.referenceLux, exif.iso, exif.exposureS, exif.fNumber, ym);
  }
  const k = out.kPrime ?? opts.kPrime;
  if (k > 0) {
    out.ev = estimateEv(k, exif.iso, exif.exposureS, exif.fNumber, ym);
    out.evLeft = estimateEv(k, exif.iso, exif.exposureS, exif.fNumber, L.mean);
    out.evRight = estimateEv(k, exif.iso, exif.exposureS, exif.fNumber, R.mean);
    out.evMean = (out.evLeft + out.evRight) / 2;
    out.asymmetry = out.evMean > 0 ? Math.abs(out.evLeft - out.evRight) / out.evMean : NaN;
    const bf = [];
    if (out.asymmetry > 0.30) bf.push('left_right_asymmetry_gt_0.30');
    if (out.clipLeft > 0.02) bf.push('left_clipping_gt_0.02');
    if (out.clipRight > 0.02) bf.push('right_clipping_gt_0.02');
    out.bilateralFlags = bf.length ? bf.join('|') : 'ok';
  }
  out.flags = flags.length ? flags.join('|') : 'ok';
  return out;
}

/** Ritaglio della zona occhi con le ROI perioculari (ambra), come l'anteprima dell'app Android. */
function renderPreview(src, peri) {
  const pts = [...peri.left, ...peri.right];
  const m = 0.35 * peri.iod;
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x)) - m));
  const x1 = Math.min(src.width, Math.ceil(Math.max(...pts.map(p => p.x)) + m));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y)) - m * 1.6));
  const y1 = Math.min(src.height, Math.ceil(Math.max(...pts.map(p => p.y)) + m));
  const s = Math.min(1, 700 / (x1 - x0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((x1 - x0) * s)); c.height = Math.max(1, Math.round((y1 - y0) * s));
  const g = c.getContext('2d');
  g.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  for (const poly of [peri.left, peri.right]) {
    g.beginPath(); poly.forEach((p, i) => { const X = (p.x - x0) * s, Y = (p.y - y0) * s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
    g.fillStyle = 'rgba(242,179,61,0.25)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgb(242,179,61)'; g.stroke();
  }
  return c.toDataURL('image/jpeg', 0.8);
}

// ------------------------------------------------------------------ fotocamera dentro COMFY (ImageCapture.takePhoto)
export const canTakePhoto = () => 'ImageCapture' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true;
  await video.play().catch(() => {});
  return stream;
}
export function stopCamera(stream) { try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
/** Scatta una foto vera (con EXIF) dal flusso della fotocamera frontale. */
export async function takePhoto(stream) {
  const track = stream.getVideoTracks()[0];
  const ic = new ImageCapture(track);
  const blob = await ic.takePhoto();
  return new File([blob], 'selfie.jpg', { type: blob.type || 'image/jpeg', lastModified: Date.now() });
}

// ------------------------------------------------------------------ ROI alta-guancia compatta (porting di buildCompactCheek, Android v2.19.3)
export const COMPACT_METHOD_ID = 'upper_cheek_wide_v2.19.3_eye_centered_gap0.22_w0.40_h0.22';
const EYE_1 = [33, 160, 158, 133, 153, 144], EYE_2 = [362, 385, 387, 263, 373, 380], NOSE_BOTTOM = [2, 97, 326];
const dot = (a, b) => a.x * b.x + a.y * b.y;
export function buildCompactCheek(xy) {
  const c1 = meanPt(EYE_1.map(xy)), c2 = meanPt(EYE_2.map(xy)), firstIsLeft = c1.x < c2.x;
  const eyeL = firstIsLeft ? c1 : c2, eyeR = firstIsLeft ? c2 : c1;
  const contourL = (firstIsLeft ? EYE_1 : EYE_2).map(xy), contourR = (firstIsLeft ? EYE_2 : EYE_1).map(xy);
  const iod = norm(sub(eyeR, eyeL)); if (!(iod > 0)) throw new Error('iod');
  const ex = mul(sub(eyeR, eyeL), 1 / iod); let dn = V(-ex.y, ex.x); if (dn.y < 0) dn = mul(dn, -1);
  const origin = mul(add(eyeL, eyeR), 0.5);
  const u = p => dot(sub(p, origin), ex), v = p => dot(sub(p, origin), dn), toImg = (uu, vv) => add(add(origin, mul(ex, uu)), mul(dn, vv));
  const noseU = NOSE_BOTTOM.map(xy).map(u).reduce((a, b) => a + b, 0) / 3;
  const sA = u(xy(234)), sB = u(xy(454)), fL = Math.min(sA, sB), fR = Math.max(sA, sB), inset = (fR - fL) * 0.07;
  const topL = Math.max(...contourL.map(v)) + 0.07 * iod, topR = Math.max(...contourR.map(v)) + 0.07 * iod, half = 0.40 * iod / 2;
  const lIn = Math.min(u(eyeL) + half, noseU - 0.22 * iod), rIn = Math.max(u(eyeR) - half, noseU + 0.22 * iod);
  const lOut = Math.max(fL + inset, u(eyeL) - half), rOut = Math.min(fR - inset, u(eyeR) + half);
  const bL = topL + 0.22 * iod, bR = topR + 0.22 * iod, tp = 0.018 * iod;
  if (lIn - lOut < 0.14 * iod || rOut - rIn < 0.14 * iod) throw new Error('narrow');
  return { left: [toImg(lOut, topL), toImg(lIn, topL), toImg(lIn - tp, bL), toImg(lOut + tp, bL)], right: [toImg(rIn, topR), toImg(rOut, topR), toImg(rOut - tp, bR), toImg(rIn + tp, bR)], iod };
}

// ------------------------------------------------------------------ occhiali (porting di HeuristicGlassesDetector: controllo visivo sperimentale)
export function detectGlasses(src, lm) {
  try {
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    lm.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const cl = x => Math.max(0, Math.min(1, x)), px = (maxX - minX) * 0.06, py = (maxY - minY) * 0.04;
    const left = Math.floor(cl(minX - px) * src.width), top = Math.floor(cl(minY - py) * src.height);
    const right = Math.ceil(cl(maxX + px) * src.width), bottom = Math.ceil(cl(maxY + py) * src.height);
    const fw = right - left, fh = bottom - top;
    if (fw < 80 || fh < 80) return { status: 'unknown', confidence: 0 };
    const w = fw > 260 ? 260 : fw, h = fw > 260 ? Math.max(80, Math.round(fh * 260 / fw)) : fh;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, left, top, fw, fh, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, Y = (x, y) => { const k = (y * w + x) * 4; return 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]; };
    function region(l0, t0, r0, b0) {
      let edges = 0, hor = 0, ver = 0, hi = 0, n = 0;
      const l = Math.max(1, Math.min(l0, w - 2)), r = Math.max(l + 2, Math.min(r0, w - 1)), t = Math.max(1, Math.min(t0, h - 2)), b = Math.max(t + 2, Math.min(b0, h - 1));
      for (let y = t; y < b; y += 2) for (let x = l; x < r; x += 2) {
        const cc = Y(x, y), dx = Math.abs(Y(Math.min(x + 2, r), y) - Y(Math.max(x - 2, l), y)), dy = Math.abs(Y(x, Math.min(y + 2, b)) - Y(x, Math.max(y - 2, t)));
        if (dx + dy > 48) edges++; if (dx > 30) ver++; if (dy > 30) hor++; if (cc > 238) hi++; n++;
      }
      return { edge: edges / Math.max(1, n), hor: hor / Math.max(1, n), ver: ver / Math.max(1, n), hi: hi / Math.max(1, n), n };
    }
    const x0 = Math.floor(w * 0.08), x1 = Math.floor(w * 0.92);
    const eye = region(x0, Math.floor(h * 0.24), x1, Math.floor(h * 0.58)), cheek = region(x0, Math.floor(h * 0.58), x1, Math.floor(h * 0.82));
    if (eye.n < 100 || cheek.n < 100) return { status: 'unknown', confidence: 0 };
    const edgeRatio = eye.edge / Math.max(0.015, cheek.edge), structured = (eye.hor + eye.ver) / 2, hiBoost = Math.max(0, eye.hi - cheek.hi);
    const c01 = x => Math.max(0, Math.min(1, x));
    const conf = c01(0.58 * c01((edgeRatio - 1.05) / 1.15) + 0.30 * c01((structured - 0.055) / 0.09) + 0.12 * c01(hiBoost / 0.045));
    return { status: conf >= 0.72 ? 'detected' : conf >= 0.52 ? 'possible' : 'not_detected', confidence: conf };
  } catch (e) { return { status: 'unknown', confidence: 0 }; }
}

// ------------------------------------------------------------------ controllo dal vivo durante l'anteprima (come LiveFaceAnalyzer Android)
let liveCanvas = null;
/** Analizza un fotogramma dell'anteprima: volto presente e occhiali (controllo sperimentale). */
export async function liveCheck(video) {
  if (!video || !video.videoWidth) return { face: false, glasses: { status: 'unknown', confidence: 0 } };
  const fl = await loadLandmarker();
  const w = 480, h = Math.round(480 * video.videoHeight / video.videoWidth);
  if (!liveCanvas) liveCanvas = document.createElement('canvas');
  liveCanvas.width = w; liveCanvas.height = h;
  liveCanvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, w, h);
  const res = fl.detect(liveCanvas), faces = res.faceLandmarks || [];
  if (faces.length !== 1) return { face: false, glasses: { status: 'unknown', confidence: 0 } };
  return { face: true, glasses: detectGlasses(liveCanvas, faces[0]) };
}
