// COMFY web per iPhone – blocco 1: installazione, configurazione, calibrazione della luce, misura di prova.
import { STR } from './i18n.js';
import { analyzeSelfie, loadLandmarker, LightError, PERIOCULAR_METHOD_ID, OFFICIAL_EV_METHOD, BILATERAL_METHOD } from './light.js';

export const APP_VERSION = 'web-ios-0.1.0';
const KEY = 'comfy_web_v1';
const $ = s => document.querySelector(s);
const app = $('#app');
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');

// ------------------------------------------------------------------ dati (solo in aggiunta: nulla viene mai cancellato)
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('storage', e); } }
const shortId = p => `${p}-${(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + '00000000').slice(0, 8).toUpperCase()}`;
if (!S.participant_id) { S.participant_id = shortId('P'); S.session_id = shortId('S'); S.created = Date.now(); S.baselines = []; S.calibrations = []; S.light_tests = []; save(); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const lang = () => S.lang || ((navigator.language || 'it').startsWith('it') ? 'it' : 'en');
const t = (k, ...a) => { const v = STR[lang()][k] ?? STR.it[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
function utcOffset(ms = Date.now()) { const m = -new Date(ms).getTimezoneOffset(), s = m >= 0 ? '+' : '-', a = Math.abs(m); return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; }
function isoLocal(ms = Date.now()) { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${utcOffset(ms)}`; }
const fmt = (x, d = 0) => Number.isFinite(x) ? x.toLocaleString(lang() === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const device = () => S.device || 'Apple iPhone';
const gsvLevel = v => v < 25 ? 0 : v < 50 ? 1 : v < 75 ? 2 : 3;
const GSV_CODE = ['imperceptible', 'noticeable', 'disturbing', 'intolerable'];

// ------------------------------------------------------------------ pianta dell'aula
let ROOM = null;
async function room() { if (!ROOM) ROOM = await (await fetch('room.json', { cache: 'no-cache' })).json(); return ROOM; }
function zoneInfo(r, i, j) {
  const rows = r.rows_range[i], seats = r.seat_groups_range[j];
  let dist = null;
  if (seats[1] != null) { const mid = (seats[0] + seats[1]) / 2; dist = Math.round((r.first_seat_from_window_m + (mid - 1) * r.seat_width_m) * 10) / 10; }
  return { zone: `r${rows[0]}-${rows[1]}_s${seats[0]}-${seats[1] ?? 'plus'}`, rows: r.rows[i], seats: r.seat_groups[j], row_min: rows[0], row_max: rows[1], seat_min: seats[0], seat_max: seats[1], dist_window_m: dist };
}
function roomSvg(r, sel) {
  const W = 300, H = 360, x0 = 30, y0 = 40, nB = r.rows.length, nC = r.seat_groups.length;
  const top = y0 + 26, bottom = H - 34, band = (bottom - top) / nB, colW = (W - x0 - 58) / nC, rad = Math.min(band, colW) / 2 - 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(t('seat_title'))}">`;
  s += `<rect x="${x0}" y="${y0 - 28}" width="${W - x0 - 8}" height="${H - y0 + 20}" fill="var(--bgapp)" stroke="var(--ink)" stroke-width="1.5"/>`;
  s += `<rect x="${x0 + (W - x0 - 8) / 2 - 40}" y="${y0 - 22}" width="80" height="16" rx="3" fill="#DCE6F1" stroke="#1F4E79"/><text x="${x0 + (W - x0 - 8) / 2}" y="${y0 - 10.5}" font-size="9.5" text-anchor="middle" fill="#1F4E79">${esc(t('seat_cattedra'))}</text>`;
  const wl = (H - y0 + 4) / 5;
  for (let k = 0; k < 5; k++) { const a = y0 - 20 + k * wl, b = a + wl - 12; s += `<line x1="${x0}" y1="${a}" x2="${x0}" y2="${b}" stroke="#5DA9E9" stroke-width="5"/>`; }
  s += `<text x="${x0 - 9}" y="${H / 2 + 22}" font-size="9" fill="#2a78d6" transform="rotate(-90 ${x0 - 9} ${H / 2 + 22})">${esc(t('seat_windows'))}</text>`;
  const R = W - 8, d = 20;
  s += `<line x1="${R}" y1="${y0 - 24}" x2="${R}" y2="${y0 - 24 + d}" stroke="var(--bgapp)" stroke-width="4"/><path d="M${R} ${y0 - 24} A${d} ${d} 0 0 0 ${R - d} ${y0 - 24 + d}" fill="none" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
  s += `<line x1="${R}" y1="${H - 12 - d}" x2="${R}" y2="${H - 12}" stroke="var(--bgapp)" stroke-width="4"/><path d="M${R} ${H - 12} A${d} ${d} 0 0 1 ${R - d} ${H - 12 - d}" fill="none" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
  s += `<text x="${R - 6}" y="${top - 8}" font-size="8.5" text-anchor="end" fill="var(--mute)">${esc(t('seat_rows'))}</text>`;
  for (let i = 0; i < nB; i++) {
    const cy = top + band * (i + 0.5);
    s += `<text x="${R - 6}" y="${cy + 3}" font-size="8.5" text-anchor="end" fill="var(--mute)">${r.rows[i]}</text>`;
    for (let j = 0; j < nC; j++) {
      const cx = x0 + 14 + colW * (j + 0.5), on = sel && sel.i === i && sel.j === j;
      s += `<g class="zone" data-i="${i}" data-j="${j}" role="button" tabindex="0" aria-label="${esc(t('seat_chosen', r.rows[i], r.seat_groups[j]))}">
        <circle cx="${cx}" cy="${cy}" r="${rad}" fill="${on ? 'var(--brand)' : 'var(--soft)'}" stroke="${on ? 'var(--brand)' : '#E3C9BC'}" stroke-width="1.6"/>
        ${on ? `<path d="M${cx - 7} ${cy} l5 5 l9 -10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</g>`;
    }
  }
  for (let j = 0; j < nC; j++) s += `<text x="${x0 + 14 + colW * (j + 0.5)}" y="${bottom + 16}" font-size="8.5" text-anchor="middle" fill="var(--mute)">${esc(t('seat_seats'))} ${r.seat_groups[j]}</text>`;
  return s + '</svg>';
}

// ------------------------------------------------------------------ interfaccia
const LOGO = `<svg viewBox="0 0 108 108" width="30" height="30" aria-hidden="true"><rect width="108" height="108" rx="26" fill="#A4472B"/><path d="M37.4 39.57A22 22 0 0 1 70.6 39.57" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M74.8 46.84A22 22 0 0 1 58.2 75.6" stroke="#FFD9C7" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M49.8 75.6A22 22 0 0 1 33.2 46.84" stroke="#F7B49B" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="54" cy="54" r="6.5" fill="#fff"/></svg>`;
const topbar = () => `<div class="top">${LOGO}<div class="ttl">COMFY</div><button class="lang" id="lang" type="button">${lang() === 'it' ? 'IT' : 'EN'}</button></div>`;
const IC = {
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A7AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  cam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  lib: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>`,
  sun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>`,
  mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>`,
  ok: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E8B57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`
};
function screen(html) { app.innerHTML = html; window.scrollTo(0, 0); const l = $('#lang'); if (l) l.onclick = () => { S.lang = lang() === 'it' ? 'en' : 'it'; save(); route(); }; }
const card = (ic, h, s, cls = '') => `<div class="card ${cls}"><div class="flex"><div class="ic">${ic}</div><div><div class="h">${h}</div><div class="s">${s}</div></div></div></div>`;
const errBox = msg => `<div class="err" role="alert">${esc(msg)}</div>`;

// ------------------------------------------------------------------ percorso
function isStandalone() { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }
function route() {
  if (!isStandalone() && !DEV) return showInstall();
  if (!S.welcomed) return showWelcome();
  if (!S.profile || !S.profile.age) return showProfile();
  if (!S.profile.seat) return showSeat();
  if (!S.baselines.length) return showCheckin();
  if (!S.calibrations.length) return showCalRef();
  return showHome();
}

function showInstall() {
  const other = /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  screen(`<main class="body">${topbar()}
    <h1>${t('inst_title')}</h1><p class="t">${t('inst_body')}</p>
    ${other ? errBox(t('inst_notsafari')) : ''}
    ${card(IC.share, '1. ' + t('inst_1'), t('inst_1s'))}
    ${card(IC.plus, '2. ' + t('inst_2'), t('inst_2s'))}
    ${card(LOGO, '3. ' + t('inst_3'), t('inst_3s'))}
    <div class="arrow" aria-hidden="true">↓</div></main>`);
}

function showWelcome() {
  screen(`<main class="body">${topbar()}
    <h1>${t('wel_title')}</h1><p class="t">${t('wel_body')}</p>
    ${card(IC.user, t('wel_p1'), t('wel_p1s'))}${card(IC.mic, t('wel_p2'), t('wel_p2s'))}${card(IC.cam, t('wel_p3'), t('wel_p3s'))}
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('wel_start')}</button></main>`);
  $('#go').onclick = () => { S.welcomed = Date.now(); save(); route(); };
}

function showProfile() {
  const p = S.profile || {};
  const ages = Array.from({ length: 63 }, (_, i) => i + 16).map(a => `<option value="${a}" ${p.age == a ? 'selected' : ''}>${a} ${t('age_unit')}</option>`).join('');
  const seg = (name, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l, s]) => `<button type="button" role="radio" aria-checked="${p[name] === v}" class="${p[name] === v ? 'on' : ''}" data-f="${name}" data-v="${v}">${l}${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`;
  screen(`<main class="body">${topbar()}
    <div class="step">${t('step', 1)}</div><h1>${t('prof_title')}</h1>
    <label class="lab" for="age">${t('age')}</label>
    <select id="age" class="field"><option value="">–</option>${ages}</select>
    <div class="lab">${t('sex')}</div>${seg('sex', [['female', t('sex_f')], ['male', t('sex_m')], ['other', t('sex_o')]])}
    <div class="lab">${t('clo')}</div>${seg('clothing', [['light', t('clo_l'), t('clo_ls')], ['medium', t('clo_m'), t('clo_ms')], ['heavy', t('clo_h'), t('clo_hs')]])}
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button></main>`);
  app.querySelectorAll('.seg button').forEach(b => b.onclick = () => { p[b.dataset.f] = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); });
  $('#age').onchange = e => p.age = +e.target.value || null;
  $('#go').onclick = () => {
    if (!p.age || !p.sex || !p.clothing) { $('#msg').innerHTML = errBox(t('prof_missing')); return; }
    S.profile = { ...(S.profile || {}), age: p.age, sex: p.sex, clothing: p.clothing, saved: Date.now() }; save(); route();
  };
}

async function showSeat() {
  const r = await room();
  let sel = S.profile.seatSel || null;
  const draw = () => {
    const z = sel ? zoneInfo(r, sel.i, sel.j) : null;
    screen(`<main class="body">${topbar()}
      <div class="step">${t('step', 2)}</div><h1>${t('seat_title')}</h1><p class="t">${t('seat_body')}</p>
      <div class="map">${roomSvg(r, sel)}</div>
      <div class="card chosen">${z ? `<div class="flex"><span class="chip o">✓</span><div class="s"><b>${t('seat_chosen', z.rows, z.seats)}</b>${t('seat_dist', z.dist_window_m != null ? fmt(z.dist_window_m, 1) : null)}</div></div>` : `<div class="s">${t('seat_missing')}</div>`}</div>
      <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button></main>`);
    app.querySelectorAll('.zone').forEach(g => {
      const pick = () => { sel = { i: +g.dataset.i, j: +g.dataset.j }; draw(); };
      g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(); });
    });
    $('#go').onclick = () => {
      if (!sel) { $('#msg').innerHTML = errBox(t('seat_missing')); return; }
      S.profile.seatSel = sel; S.profile.seat = { ...zoneInfo(r, sel.i, sel.j), room_id: r.id }; save(); route();
    };
  };
  draw();
}

function gsvSlider(id, value) {
  return `<div class="gsv"><div class="gsvval" id="${id}v"></div>
    <input type="range" id="${id}" min="0" max="100" step="0.1" value="${value}" aria-label="GSV">
    <div class="ticks">${STR[lang()].gsv.map(x => `<span>${x}</span>`).join('')}</div></div>`;
}
function bindGsv(id) {
  const el = $('#' + id), out = $('#' + id + 'v');
  const upd = () => { const v = +el.value; out.innerHTML = `<b>${STR[lang()].gsv[gsvLevel(v)]}</b> · ${fmt(v, 0)} / 100`; el.style.setProperty('--p', v + '%'); };
  el.oninput = upd; upd(); return () => +el.value;
}

function showCheckin() {
  screen(`<main class="body">${topbar()}
    <div class="step">${t('step', 3)}</div><h1>${t('chk_title')}</h1><p class="t">${t('chk_body')}</p>
    <div class="card">${gsvSlider('gsv', 0)}</div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button></main>`);
  const get = bindGsv('gsv');
  $('#go').onclick = () => {
    const v = get(), lvl = gsvLevel(v), now = Date.now(), p = S.profile;
    S.baselines.push({ participant_id: S.participant_id, session_id: S.session_id, timestamp: isoLocal(now), gsv_continuous_0_100: +v.toFixed(1), gsv_level: lvl, gsv_label: GSV_CODE[lvl],
      age: p.age, sex: p.sex, seat_position: p.seat.zone, clothing: p.clothing, measurement_interval_min: 20, device: device(), app_version: APP_VERSION, utc_offset: utcOffset(now) });
    save(); route();
  };
  loadLandmarker().catch(() => {});  // precarica il modello mentre lo studente prosegue
}

// ------------------------------------------------------------------ calibrazione
let pendingRef = null;
function showCalRef(recal = false) {
  screen(`<main class="body">${topbar()}
    <div class="step">${recal ? t('home_recal').toUpperCase() : t('cal_eyebrow')}</div><h1>${t('cal_ref_title')}</h1><p class="t">${t('cal_ref_body')}</p>
    <label class="lab" for="ref">${t('cal_ref_label')}</label>
    <input id="ref" class="field big-input" type="number" inputmode="decimal" min="5" max="5000" step="1" placeholder="104" value="${pendingRef ?? ''}">
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button></main>`);
  $('#go').onclick = () => {
    const v = parseFloat(String($('#ref').value).replace(',', '.'));
    if (!(v >= 5 && v <= 5000)) { $('#msg').innerHTML = errBox(t('cal_ref_missing')); return; }
    pendingRef = v; showSelfie('cal');
  };
  loadLandmarker().catch(() => {});
}

function errorText(e) {
  if (e instanceof LightError) {
    if (e.code === 'too_old') return t('e_too_old', Math.round(e.extra.ageMs / 60000));
    return t('e_' + e.code);
  }
  if (e && /decode/.test(e.message)) return t('e_decode');
  return t('e_model');
}

function showSelfie(mode) {
  const title = mode === 'cal' ? t('cal_selfie_title') : t('test_title');
  screen(`<main class="body">${topbar()}
    <div class="step">${mode === 'cal' ? t('cal_eyebrow') : t('test_title').toUpperCase()}</div><h1>${title}</h1>
    ${mode === 'test' ? `<p class="t">${t('test_body')}</p><label class="lab" for="ref">${t('test_ref_label')}</label><input id="ref" class="field" type="number" inputmode="decimal" min="5" max="5000">` : ''}
    ${card(IC.cam, '1. ' + t('selfie_1'), t('selfie_1s'), 'new')}
    ${card(IC.lib, '2. ' + t('selfie_2'), t('selfie_2s'), 'new')}
    <p class="t small">${t('selfie_tip')}</p>
    <div id="msg"></div><div class="spacer"></div>
    <label class="btn" for="pick">${t('choose_selfie')}<input id="pick" class="vh" type="file" accept="image/heic,image/heif,image/jpeg"></label>
    <button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = () => mode === 'cal' ? showCalRef(S.calibrations.length > 0) : route();
  $('#pick').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const ref = mode === 'test' ? parseFloat(String($('#ref').value).replace(',', '.')) : pendingRef;
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('analyzing')}</div>`;
    const slow = setTimeout(() => { const m = $('#msg .busy'); if (m) m.innerHTML = `<span class="spin"></span>${t('loading_model')}`; }, 2500);
    try {
      const r = await analyzeSelfie(f, mode === 'cal' ? { referenceLux: ref } : { kPrime: activeK() });
      clearTimeout(slow);
      if (r.exif.model) { S.device = `${r.exif.make} ${r.exif.model}`.trim(); }
      if (mode === 'cal') saveCalibration(r, ref); else saveTest(r, ref);
    } catch (err) {
      clearTimeout(slow); console.error(err);
      $('#msg').innerHTML = errBox(errorText(err));
    }
  };
}

const activeK = () => S.calibrations.length ? S.calibrations[S.calibrations.length - 1].calibration_kprime : null;

function resultTable(r, extra = []) {
  const rows = [[t('r_shot'), t('r_ago', Math.max(0, Math.round(r.ageMs / 1000)))], [t('r_camera'), r.isFront ? t('r_front') : '–'], [t('r_face'), t('r_found')],
    [t('r_exp'), `${fmt(r.exif.iso)} · 1/${Math.round(1 / r.exif.exposureS)} s · f/${fmt(r.exif.fNumber, 1)}`], ...extra];
  return `<table class="kv">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

function saveCalibration(r, ref) {
  const now = Date.now();
  const rec = {
    participant_id: S.participant_id, session_id: S.session_id, timestamp: isoLocal(now), device: device(), reference_lux: ref,
    iso: r.exif.iso, exposure_s: r.exif.exposureS, f_number: r.exif.fNumber,
    ym_left: r.ymLeft, ym_right: r.ymRight, ym_combined: r.ym, iod_px: r.iod, roi_clipping_ratio: r.clip, roi_left_right_difference: r.lrDiff, roi_roll_deg: r.roll,
    face_quality_score: '', calibration_kprime: r.kPrime, ym_periocular: r.ym, iod_periocular_px: r.iod, calibration_kprime_periocular: r.kPrime, phone_als_lux: '',
    roi_method: PERIOCULAR_METHOD_ID, periocular_method: PERIOCULAR_METHOD_ID,
    ev_left_lux: r.evLeft, ev_right_lux: r.evRight, ev_bilateral_mean_lux: r.evMean, ev_left_right_asymmetry: r.asymmetry,
    light_aggregation_method: OFFICIAL_EV_METHOD, bilateral_diagnostic_method: BILATERAL_METHOD, light_quality_flags: [r.flags, r.bilateralFlags].filter(x => x && x !== 'ok').join('|') || 'ok',
    periocular_left_clipping_ratio: r.clipLeft, periocular_right_clipping_ratio: r.clipRight, reference_type: 'reference_phone',
    app_version: APP_VERSION, utc_offset: utcOffset(now),
    // colonne in piu' della versione iPhone
    capture_timestamp: isoLocal(r.shotMs), selfie_age_s: Math.round(r.ageMs / 1000), lens_model: r.exif.lens, image_px: `${r.width}x${r.height}`
  };
  S.calibrations.push(rec); pendingRef = null; save();
  screen(`<main class="body">${topbar()}
    <div class="step">${t('cal_eyebrow')}</div><h1>${t('cal_done_title')}</h1>
    <img class="roi" src="${r.preview}" alt="">
    <div class="card">${resultTable(r, [[t('r_ref'), fmt(ref) + ' lx'], [t('r_k'), fmt(r.kPrime, 3)]])}</div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('cal_done_go')}</button></main>`);
  $('#go').onclick = () => route();
}

function saveTest(r, ref) {
  const now = Date.now();
  const dev = ref > 0 && r.ev > 0 ? (r.ev - ref) / ref : null;
  const rec = { participant_id: S.participant_id, session_id: S.session_id, timestamp: isoLocal(now), capture_timestamp: isoLocal(r.shotMs), device: device(),
    reference_lux: ref > 0 ? ref : '', ev_lux: r.ev, deviation_rel: dev ?? '', kprime_used: activeK(), iso: r.exif.iso, exposure_s: r.exif.exposureS, f_number: r.exif.fNumber,
    ym_periocular: r.ym, ym_left: r.ymLeft, ym_right: r.ymRight, iod_px: r.iod, roi_clipping_ratio: r.clip, ev_left_lux: r.evLeft, ev_right_lux: r.evRight,
    ev_left_right_asymmetry: r.asymmetry, light_quality_flags: [r.flags, r.bilateralFlags].filter(x => x && x !== 'ok').join('|') || 'ok', selfie_age_s: Math.round(r.ageMs / 1000),
    lens_model: r.exif.lens, app_version: APP_VERSION, utc_offset: utcOffset(now) };
  S.light_tests.push(rec); save();
  const extra = [[t('r_ev'), `<b>${fmt(r.ev)} lx</b>`]];
  if (dev != null) extra.push([t('r_ref'), fmt(ref) + ' lx'], [t('r_dev'), `${dev >= 0 ? '+' : ''}${fmt(dev * 100, 1)} %`]);
  screen(`<main class="body">${topbar()}
    <div class="step">${t('test_title').toUpperCase()}</div><h1>${t('test_saved')}</h1>
    <img class="roi" src="${r.preview}" alt="">
    <div class="card">${resultTable(r, extra)}</div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('cal_done_go')}</button></main>`);
  $('#go').onclick = () => route();
}

// ------------------------------------------------------------------ Home (blocco 1)
function showHome() {
  const p = S.profile, k = activeK();
  const tests = S.light_tests.slice(-6).reverse().map(x => `<tr><td>${x.timestamp.slice(11, 16)}</td><td>${fmt(x.ev_lux)} lx</td><td>${x.reference_lux ? fmt(x.reference_lux) + ' lx' : '–'}</td><td>${x.deviation_rel !== '' ? (x.deviation_rel >= 0 ? '+' : '') + fmt(x.deviation_rel * 100, 1) + ' %' : ''}</td></tr>`).join('');
  screen(`<main class="body">${topbar()}
    <div class="hero"><div class="s strong">${t('home_ready')}</div><p class="t" style="margin-top:6px">${t('home_soon')}</p></div>
    <div class="card"><div class="h">${t('home_profile')}</div>
      <div class="s">${p.age} ${t('age_unit')} · ${t(p.sex === 'female' ? 'sex_f' : p.sex === 'male' ? 'sex_m' : 'sex_o')} · ${t(p.clothing === 'light' ? 'clo_l' : p.clothing === 'medium' ? 'clo_m' : 'clo_h')}<br>
      ${t('seat_chosen', p.seat.rows, p.seat.seats)}<br>${t('home_cal', fmt(k, 3))} · ${esc(device())}</div></div>
    <button class="card action" id="test" type="button"><div class="flex"><div class="ic">${IC.sun}</div><div><div class="h">${t('home_test')}</div><div class="s">${t('home_test_s')}</div></div></div></button>
    <button class="card action" id="recal" type="button"><div class="flex"><div class="ic">${IC.cam}</div><div><div class="h">${t('home_recal')}</div><div class="s">${t('home_recal_s')}</div></div></div></button>
    <div class="card"><div class="h">${t('home_tests')}</div>${tests ? `<table class="kv four">${tests}</table>` : `<div class="s">${t('home_none')}</div>`}</div>
    <div class="foot">${t('version')} ${APP_VERSION} · ${S.participant_id}</div></main>`);
  $('#test').onclick = () => showSelfie('test');
  $('#recal').onclick = () => showCalRef(true);
}

window.addEventListener('pageshow', () => { S = load(); });
route();
