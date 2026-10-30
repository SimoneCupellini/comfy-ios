// COMFY web per iPhone – v0.2: configurazione, calibrazione, monitoraggio del suono, promemoria, misure complete, invio dei dati.
// Nessuna azione dell'app cancella dati: misure, calibrazioni e check-in vengono solo aggiunti.
const VQ = new URL(import.meta.url).search;   // stessa versione per tutti i moduli (evita copie vecchie in cache)
const { STR } = await import('./i18n.js' + VQ);
const L = await import('./light.js' + VQ);
const { SoundEngine, AUDIO_SOURCE } = await import('./sound.js' + VQ);
const X = await import('./export.js' + VQ);
const { createDiagram } = await import('./diagram.js' + VQ);
const INS = await import('./instructions.js' + VQ);
const { analyzeSelfie, loadLandmarker, LightError, PERIOCULAR_METHOD_ID, OFFICIAL_EV_METHOD, BILATERAL_METHOD } = L;

export const APP_VERSION = 'web-ios-0.4.1';
const INTERVAL_MIN = 10;
const RESEARCHER_EMAIL = 'simone.cupellini@mail.polimi.it';
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
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
if (!S.participant_id) { S.participant_id = shortId('P'); S.session_id = shortId('S'); S.created = Date.now(); }
for (const k of ['baselines', 'calibrations', 'light_tests', 'measurements', 'reminders', 'sends']) if (!Array.isArray(S[k])) S[k] = [];
if (!S.monitor) S.monitor = { running: false };
save();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const lang = () => S.lang || ((navigator.language || 'it').startsWith('it') ? 'it' : 'en');
const t = (k, ...a) => { const v = STR[lang()][k] ?? STR.it[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
function utcOffset(ms = Date.now()) { const m = -new Date(ms).getTimezoneOffset(), s = m >= 0 ? '+' : '-', a = Math.abs(m); return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; }
function isoLocal(ms = Date.now()) { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${utcOffset(ms)}`; }
const hhmm = ms => isoLocal(ms).slice(11, 16);
const fmt = (x, d = 0) => Number.isFinite(x) ? x.toLocaleString(lang() === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const device = () => S.device || 'Apple iPhone';
const gsvLevel = v => v < 25 ? 0 : v < 50 ? 1 : v < 75 ? 2 : 3;
const GSV_CODE = ['imperceptible', 'noticeable', 'disturbing', 'intolerable'];
const TSV_CODE = ['cold', 'cool', 'slightly_cool', 'neutral', 'slightly_warm', 'warm', 'hot'];
const AC_CODE = ['very_comfortable', 'comfortable', 'slightly_comfortable', 'neutral', 'slightly_uncomfortable', 'uncomfortable', 'very_uncomfortable'];
const sound = new SoundEngine();
sound.restore();

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
const topbar = (menu = false) => `<div class="top">${LOGO}<div class="ttl">COMFY</div>${menu ? `<button class="mbtn" id="menub" type="button" aria-label="${t('menu')}"><i></i></button>` : (inFlow ? '' : `<button class="lang" id="lang" type="button">${lang() === 'it' ? 'IT' : 'EN'}</button>`)}</div>`;
const IC = {
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A7AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  cam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  lib: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>`,
  sun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>`,
  mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>`,
  ok: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E8B57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`
};
function screen(html) { app.innerHTML = html; window.scrollTo(0, 0); const l = $('#lang'); if (l) l.onclick = () => { S.lang = lang() === 'it' ? 'en' : 'it'; save(); route(); }; const m = $('#menub'); if (m) m.onclick = showMenu; }
const card = (ic, h, s, cls = '') => `<div class="card ${cls}"><div class="flex"><div class="ic">${ic}</div><div><div class="h">${h}</div><div class="s">${s}</div></div></div></div>`;
const errBox = msg => `<div class="err" role="alert">${esc(msg)}</div>`;

// ------------------------------------------------------------------ percorso
function isStandalone() { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }
function route() {
  if (!isStandalone() && !DEV) return showInstall();
  if (!S.welcomed) return showWelcome();
  if (!S.instructionsSeen) return showInstructions(0);
  if (!S.profile || !S.profile.age) return showProfile();
  if (!S.profile.seat) return showSeat();
  if (!S.baselines.length) return showCheckin();
  if (!S.calibrations.length) return showCalRef();
  if (M) return;
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

function showWelcome(again = false) {
  screen(`<main class="body">${topbar()}
    <h1>${t('wel_title')}</h1><p class="t">${t('wel_body')}</p>
    ${card(IC.user, t('wel_p1'), t('wel_p1s'))}${card(IC.mic, t('wel_p2'), t('wel_p2s'))}${card(IC.cam, t('wel_p3'), t('wel_p3s'))}
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('wel_start')}</button></main>`);
  $('#go').onclick = () => { if (!S.welcomed) S.welcomed = Date.now(); save(); route(); };
}

let stopArt = null;
function showInstructions(i, fromMenu = false) {
  if (stopArt) { stopArt(); stopArt = null; }
  const P = STR[lang()].ins, n = P.length, [title, body, note] = P[i];
  app.innerHTML = `<main class="ins">
    <div class="instop"><span>${t('ins_label')}</span><button class="inslang" id="lang" type="button">${lang() === 'it' ? 'IT' : 'EN'}</button></div>
    <canvas class="insart" id="art" aria-hidden="true"></canvas>
    <div class="insnum">${i + 1}</div><h1>${title}</h1><p>${body}</p>${note ? `<p class="insnote">${note}</p>` : ''}
    <div class="insfoot"><div class="insdots">${P.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
    <button class="insbtn" id="go" type="button">${i < n - 1 ? t('next') : t('ins_done')}</button>
    ${i > 0 ? `<button class="insback" id="back" type="button">${t('back')}</button>` : ''}</div></main>`;
  window.scrollTo(0, 0);
  stopArt = INS.animate($('#art'), i);
  $('#lang').onclick = () => { S.lang = lang() === 'it' ? 'en' : 'it'; save(); showInstructions(i, fromMenu); };
  const leave = () => { if (stopArt) { stopArt(); stopArt = null; } };
  $('#go').onclick = () => { if (i < n - 1) showInstructions(i + 1, fromMenu); else { leave(); if (!S.instructionsSeen) { S.instructionsSeen = Date.now(); save(); } route(); } };
  if (i > 0) $('#back').onclick = () => showInstructions(i - 1, fromMenu);
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

// ------------------------------------------------------------------ selfie: fotocamera dentro COMFY, con ripiego sull'app Fotocamera
let camStream = null;
function stopCam() { L.stopCamera(camStream); camStream = null; }

function errorText(e) {
  if (e instanceof LightError) {
    if (e.code === 'too_old') return t('e_too_old', Math.round(e.extra.ageMs / 60000));
    return t('e_' + e.code);
  }
  if (e && /decode/.test(e.message || '')) return t('e_decode');
  return t('e_model');
}

/**
 * Schermata del selfie. opts: { eyebrow, title, intro (html), analyze(file) -> Promise<result>, onDone(result, source), onBack }
 * Prima prova lo scatto dentro COMFY (ImageCapture.takePhoto, che conserva ISO ed esposizione);
 * se non e' possibile, o la foto non ha i dati di esposizione, propone l'app Fotocamera + libreria.
 */
// illustrazione: telefono all'altezza degli occhi (giusto) e dal basso (sbagliato)
function selfieIllustration() {
  const person = (x, ok) => {
    const skin = '#E9C2A6', hair = '#4A3A33', shirt = ok ? '#A4472B' : '#B9ACA3', chair = '#D8CCC4';
    const px = ok ? x + 58 : x + 44, py = ok ? 62 : 128;
    return `<rect x="${x - 34}" y="150" width="58" height="8" rx="4" fill="${chair}"/><rect x="${x - 34}" y="104" width="8" height="54" rx="4" fill="${chair}"/><path d="M${x - 16} 152 h44 v34" stroke="#6B625C" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path d="M${x - 16} 94 q16 -8 30 0 l6 62 h-44z" fill="${shirt}"/>
      ${ok ? `<path d="M${x + 4} 104 q22 4 ${px - x - 8} ${py - 98}" stroke="${skin}" stroke-width="9" stroke-linecap="round" fill="none"/>` : `<path d="M${x + 4} 108 q16 10 ${px - x - 8} ${py - 108}" stroke="${skin}" stroke-width="9" stroke-linecap="round" fill="none"/>`}
      <circle cx="${x}" cy="70" r="20" fill="${skin}"/><path d="M${x - 20} 66 q2 -26 24 -24 q16 2 16 18 q-10 -8 -22 -6 q-10 2 -18 12z" fill="${hair}"/><circle cx="${x + 11}" cy="68" r="2.2" fill="#1D1A18"/>
      <line x1="${x + 12}" y1="68" x2="${px - 4}" y2="${py}" stroke="${ok ? '#2E8B57' : '#C0392B'}" stroke-width="2" stroke-dasharray="4 4"/>
      <rect x="${px - 4}" y="${py - 14}" width="8" height="28" rx="3" fill="#1D1A18" transform="rotate(${ok ? 0 : -35} ${px} ${py})"/>`;
  };
  const badge = (x, y, ok) => ok ? `<circle cx="${x}" cy="${y}" r="15" fill="#2E8B57"/><path d="M${x - 7} ${y} l5 5 l9 -10" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${x}" cy="${y}" r="15" fill="#C0392B"/><path d="M${x - 6} ${y - 6} l12 12 M${x + 6} ${y - 6} l-12 12" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`;
  return `<div class="ill"><svg viewBox="0 0 360 230" role="img" aria-label="${esc(t('ill_ok'))} / ${esc(t('ill_bad'))}"><rect width="360" height="230" fill="#FFFFFF"/>
    <rect x="8" y="8" width="168" height="214" rx="14" fill="#EEF7F1"/><rect x="184" y="8" width="168" height="214" rx="14" fill="#FBEDEA"/>
    ${person(70, true)}${person(246, false)}<text x="134" y="98" font-size="10.5" fill="#2E8B57" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">30 cm</text>
    ${badge(158, 30, true)}${badge(334, 30, false)}
    <text x="92" y="212" font-size="12.5" font-weight="700" fill="#1E6B41" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">${esc(t('ill_ok'))}</text>
    <text x="268" y="212" font-size="12.5" font-weight="700" fill="#A93226" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">${esc(t('ill_bad'))}</text></svg></div>`;
}
const GLASSES_ICON = `<svg width="22" height="14" viewBox="0 0 44 28" fill="none" stroke="currentColor" stroke-width="3"><circle cx="11" cy="15" r="8"/><circle cx="33" cy="15" r="8"/><path d="M19 15h6M3 12 1 6M41 12l2-6"/></svg>`;

/**
 * Schermata del selfie. opts: { eyebrow, title, intro (html), analyze(file) -> Promise<result>, onDone(result, source), onBack }
 * 1) illustrazione + «Apri la fotocamera»; 2) anteprima con ovale e «Scatta» (ImageCapture.takePhoto, conserva ISO ed esposizione);
 * se non e' possibile, o la foto non ha i dati di esposizione, propone l'app Fotocamera + libreria.
 * Dopo l'analisi: controllo sperimentale degli occhiali (come Android), con «Non sto indossando occhiali».
 */
function showCamera(opts) {
  const inApp = L.canTakePhoto() && S.cameraMode !== 'library';
  const head = `<main class="body">${topbar()}<div class="step">${opts.eyebrow}</div><h1>${opts.title}</h1>${opts.intro || ''}`;
  const glassNote = `<div class="glass">${GLASSES_ICON}${t('glasses_note')}</div>`;
  const pickLabel = (hidden, out) => `<label class="btn ${out ? 'out' : ''}" for="pick" id="pickl" ${hidden ? 'hidden' : ''}>${inApp ? t('cam_fallback') : t('choose_selfie')}<input id="pick" class="vh" type="file" accept="image/heic,image/heif,image/jpeg"></label>`;
  const back = opts.onBack ? `<button class="btn out" id="back" type="button">${t('back')}</button>` : '';
  const busy = () => { $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('analyzing')}</div>`; return setTimeout(() => { const m = $('#msg .busy'); if (m) m.innerHTML = `<span class="spin"></span>${t('loading_model')}`; }, 2500); };
  function bindCommon() {
    if (opts.onBack) $('#back').onclick = () => { stopCam(); opts.onBack(); };
    $('#pick').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) run(f, 'library'); };
  }
  function failed(err, source) {
    console.error(err);
    if (source === 'in_app_takephoto' && err instanceof LightError && (err.code === 'no_exposure' || err.code === 'no_time')) { S.cameraMode = 'library'; save(); }
    $('#msg').innerHTML = errBox(errorText(err));
    const pl = $('#pickl'); if (pl) pl.hidden = false;
    const sh = $('#shoot'); if (sh) { sh.disabled = false; sh.textContent = t('cam_retake'); }
  }
  async function run(file, source) {
    const slow = busy();
    try {
      const r = await opts.analyze(file);
      clearTimeout(slow);
      if (r.exif.model) S.device = `${r.exif.make} ${r.exif.model}`.trim();
      r.glassesOverride = false;
      const g = r.glasses || { status: 'unknown' };
      if (g.status === 'detected' || g.status === 'possible') {
        $('#msg').innerHTML = `<div class="glass warn">${GLASSES_ICON}<div>${t(g.status === 'detected' ? 'glasses_detected' : 'glasses_possible')}<small>${t('glasses_exp')}</small></div></div>
          <button class="btn out" id="gover" type="button">${t('glasses_override')}</button>`;
        const sh = $('#shoot'); if (sh) { sh.disabled = false; sh.textContent = t('cam_retake'); }
        $('#gover').onclick = () => { r.glassesOverride = true; stopCam(); opts.onDone(r, source); };
        return;
      }
      stopCam(); opts.onDone(r, source);
    } catch (err) { clearTimeout(slow); failed(err, source); }
  }
  function cameraStage() {
    screen(`${head}<div class="camwrap"><video id="vid" playsinline muted autoplay></video><div class="oval" aria-hidden="true"></div></div>
      <p class="t small">${t('cam_body')}</p>${glassNote}<div id="msg"></div><div class="spacer"></div>
      <button class="btn" id="shoot" type="button" disabled>${t('cam_shoot')}</button>${pickLabel(true, true)}${back}</main>`);
    bindCommon();
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('cam_starting')}</div>`;
    L.startCamera($('#vid')).then(st => { camStream = st; $('#msg').innerHTML = ''; $('#shoot').disabled = false; })
      .catch(err => { console.error(err); $('#msg').innerHTML = errBox(t('cam_denied')); $('#pickl').hidden = false; });
    $('#shoot').onclick = async () => {
      if (!camStream) return;
      $('#shoot').disabled = true;
      let file;
      try { file = await L.takePhoto(camStream); }
      catch (err) { console.error(err); $('#msg').innerHTML = errBox(t('cam_denied')); $('#pickl').hidden = false; $('#shoot').disabled = false; return; }
      run(file, 'in_app_takephoto');
    };
  }
  if (inApp) {
    screen(`${head}${selfieIllustration()}<p class="t small">${t('cam_body')}</p>${glassNote}<div id="msg"></div><div class="spacer"></div>
      <button class="btn" id="open" type="button">${t('cam_open')}</button>${pickLabel(true, true)}${back}</main>`);
    bindCommon();
    $('#open').onclick = cameraStage;
  } else {
    screen(`${head}${selfieIllustration()}${card(IC.cam, '1. ' + t('selfie_1'), t('selfie_1s'))}${card(IC.lib, '2. ' + t('selfie_2'), t('selfie_2s'))}${glassNote}
      <p class="t small">${t('selfie_tip')}</p><div id="msg"></div><div class="spacer"></div>${pickLabel(false, false)}${back}</main>`);
    bindCommon();
  }
  loadLandmarker().catch(() => {});
}

// ------------------------------------------------------------------ calibrazione
let pendingRef = null;
function showCalRef(recal = false) {
  screen(`<main class="body">${topbar()}
    <div class="step">${recal ? t('home_recal').toUpperCase() : t('cal_eyebrow')}</div><h1>${t('cal_ref_title')}</h1><p class="t">${t('cal_ref_body')}</p>
    <label class="lab" for="ref">${t('cal_ref_label')}</label>
    <input id="ref" class="field big-input" type="number" inputmode="decimal" min="5" max="5000" step="1" placeholder="104" value="${pendingRef ?? ''}">
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>
    ${recal ? `<button class="btn out" id="back" type="button">${t('back')}</button>` : ''}</main>`);
  if (recal) $('#back').onclick = () => route();
  $('#go').onclick = () => {
    const v = parseFloat(String($('#ref').value).replace(',', '.'));
    if (!(v >= 5 && v <= 5000)) { $('#msg').innerHTML = errBox(t('cal_ref_missing')); return; }
    pendingRef = v;
    showCamera({ eyebrow: t('cal_eyebrow'), title: t('cal_selfie_title'), analyze: f => analyzeSelfie(f, { referenceLux: v }), onDone: (r, src) => saveCalibration(r, v, src), onBack: () => showCalRef(recal) });
  };
  loadLandmarker().catch(() => {});
}

const activeK = () => S.calibrations.length ? S.calibrations[S.calibrations.length - 1].calibration_kprime : null;
const activeKCompact = () => { const c = S.calibrations[S.calibrations.length - 1]; return c && c.calibration_kprime_compact ? c.calibration_kprime_compact : null; };
const hy = s => String(s ?? '').replace(/\u2013/g, '-');
function compactFields(r) {
  const c = r.compact || {};
  return { ym_compact_left: c.ymLeft, ym_compact_right: c.ymRight, ym_compact: c.ym, roi_compact_pixels: c.pixels, roi_compact_clipping_ratio: c.clip,
    roi_compact_left_right_difference: c.lrDiff, ev_compact_lux: c.ev, roi_compact_method: r.compact ? L.COMPACT_METHOD_ID : '' };
}
const flagsOf = r => [r.flags, r.bilateralFlags].filter(x => x && x !== 'ok').join('|') || 'ok';

function resultTable(r, extra = []) {
  const rows = [[t('r_shot'), t('r_ago', Math.max(0, Math.round(r.ageMs / 1000)))], [t('r_camera'), r.isFront ? t('r_front') : '–'], [t('r_face'), t('r_found')],
    [t('r_exp'), `${fmt(r.exif.iso)} · 1/${Math.round(1 / r.exif.exposureS)} s · f/${fmt(r.exif.fNumber, 1)}`], ...extra];
  return `<table class="kv">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

function saveCalibration(r, ref, source) {
  const now = Date.now();
  S.calibrations.push({
    participant_id: S.participant_id, session_id: S.session_id, timestamp: isoLocal(now), device: device(), reference_lux: ref,
    iso: r.exif.iso, exposure_s: r.exif.exposureS, f_number: r.exif.fNumber,
    ym_left: r.ymLeft, ym_right: r.ymRight, ym_combined: r.ym, iod_px: r.iod, roi_clipping_ratio: r.clip, roi_left_right_difference: r.lrDiff, roi_roll_deg: r.roll,
    face_quality_score: '', calibration_kprime: r.kPrime, ym_periocular: r.ym, iod_periocular_px: r.iod, calibration_kprime_periocular: r.kPrime, phone_als_lux: '',
    roi_method: PERIOCULAR_METHOD_ID, periocular_method: PERIOCULAR_METHOD_ID,
    ev_left_lux: r.evLeft, ev_right_lux: r.evRight, ev_bilateral_mean_lux: r.evMean, ev_left_right_asymmetry: r.asymmetry,
    light_aggregation_method: OFFICIAL_EV_METHOD, bilateral_diagnostic_method: BILATERAL_METHOD, light_quality_flags: flagsOf(r),
    periocular_left_clipping_ratio: r.clipLeft, periocular_right_clipping_ratio: r.clipRight, reference_type: 'reference_phone',
    app_version: APP_VERSION, utc_offset: utcOffset(now),
    capture_timestamp: isoLocal(r.shotMs), selfie_age_s: Math.round(r.ageMs / 1000), lens_model: r.exif.lens, image_px: `${r.width}x${r.height}`, selfie_source: source,
    glasses_status: r.glasses ? r.glasses.status : 'unknown', glasses_confidence: r.glasses ? +r.glasses.confidence.toFixed(2) : '', glasses_user_override: !!r.glassesOverride,
    calibration_kprime_compact: r.compact ? r.compact.kPrime : '', ...compactFields(r)
  });
  pendingRef = null; save();
  screen(`<main class="body">${topbar()}
    <div class="step">${t('cal_eyebrow')}</div><h1>${t('cal_done_title')}</h1>
    <img class="roi" src="${r.preview}" alt="">
    <div class="card">${resultTable(r, [[t('r_ref'), fmt(ref) + ' lx'], [t('r_k'), fmt(r.kPrime, 3)]])}</div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('cal_done_go')}</button></main>`);
  $('#go').onclick = () => route();
}

function showLightTest() {
  screen(`<main class="body">${topbar()}
    <div class="step">${t('test_title').toUpperCase()}</div><h1>${t('test_title')}</h1><p class="t">${t('test_body')}</p>
    <label class="lab" for="ref">${t('test_ref_label')}</label><input id="ref" class="field" type="number" inputmode="decimal" min="5" max="5000">
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button><button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = () => route();
  $('#go').onclick = () => {
    const ref = parseFloat(String($('#ref').value).replace(',', '.'));
    showCamera({ eyebrow: t('test_title').toUpperCase(), title: t('cam_title'), analyze: f => analyzeSelfie(f, { kPrime: activeK(), kPrimeCompact: activeKCompact() }), onDone: (r, src) => saveTest(r, ref, src), onBack: showLightTest });
  };
}
function saveTest(r, ref, source) {
  const now = Date.now(), dev = ref > 0 && r.ev > 0 ? (r.ev - ref) / ref : null;
  S.light_tests.push({ participant_id: S.participant_id, session_id: S.session_id, timestamp: isoLocal(now), capture_timestamp: isoLocal(r.shotMs), device: device(),
    reference_lux: ref > 0 ? ref : '', ev_lux: r.ev, deviation_rel: dev ?? '', kprime_used: activeK(), iso: r.exif.iso, exposure_s: r.exif.exposureS, f_number: r.exif.fNumber,
    ym_periocular: r.ym, ym_left: r.ymLeft, ym_right: r.ymRight, iod_px: r.iod, roi_clipping_ratio: r.clip, ev_left_lux: r.evLeft, ev_right_lux: r.evRight,
    ev_left_right_asymmetry: r.asymmetry, light_quality_flags: flagsOf(r), selfie_age_s: Math.round(r.ageMs / 1000), selfie_source: source,
    lens_model: r.exif.lens, app_version: APP_VERSION, utc_offset: utcOffset(now) });
  save();
  const extra = [[t('r_ev'), `<b>${fmt(r.ev)} lx</b>`]];
  if (dev != null) extra.push([t('r_ref'), fmt(ref) + ' lx'], [t('r_dev'), `${dev >= 0 ? '+' : ''}${fmt(dev * 100, 1)} %`]);
  screen(`<main class="body">${topbar()}
    <div class="step">${t('test_title').toUpperCase()}</div><h1>${t('test_saved')}</h1>
    <img class="roi" src="${r.preview}" alt="">
    <div class="card">${resultTable(r, extra)}</div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('cal_done_go')}</button></main>`);
  $('#go').onclick = () => route();
}

// ------------------------------------------------------------------ monitoraggio
let wake = null, inFlow = false, idleTimer = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  if (wake && !wake.released) return;
  try { wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
}
async function startMonitoring() {
  try { await sound.start(); }
  catch (e) { console.error(e); const m = $('#msg'); if (m) m.innerHTML = errBox(t('mon_mic_denied')); return; }
  const now = Date.now();
  if (!S.monitor.running) { S.monitor = { running: true, startedMs: now, nextDueMs: now + INTERVAL_MIN * 60000, pausedSinceMs: null }; }
  else { S.monitor.pausedSinceMs = null; if (!S.monitor.nextDueMs) S.monitor.nextDueMs = now + INTERVAL_MIN * 60000; }
  save(); keepAwake(); showHome(); armIdle();
}
function stopMonitoring() { S.monitor.running = false; S.monitor.endedMs = Date.now(); save(); sound.stop(); try { wake && wake.release(); } catch (e) { } hideBlack(); showHome(); }
function monitoringPaused() { return S.monitor.running && !sound.running(); }

function armIdle() { clearTimeout(idleTimer); idleAt = 0; if (S.monitor.running && !inFlow && !S.monitor.pending && sound.running()) { idleAt = Date.now() + 20000; idleTimer = setTimeout(() => { if (!inFlow && $('#home')) showBlack(); }, 20000); } }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => armIdle(), { passive: true }));

function showBlack() {
  if (!S.monitor.running || inFlow || S.monitor.pending) return;
  let b = $('#black');
  if (!b) { b = document.createElement('div'); b.id = 'black'; document.body.appendChild(b); b.onclick = () => { hideBlack(); showHome(); armIdle(); }; }
  b.hidden = false; renderBlack();
}
function hideBlack() { const b = $('#black'); if (b) b.hidden = true; }
function renderBlack() {
  const b = $('#black'); if (!b || b.hidden) return;
  const la = sound.lastLa, f = Math.round(sound.fracValid(300) * 100);
  b.innerHTML = `<div>${t('black_title')}</div><div class="big">${t('mon_next', hhmm(S.monitor.nextDueMs))}</div>
    <div>${sound.running() ? t('mon_sound', Number.isFinite(la) ? fmt(la, 0) + ' dB' : '–', f) : t('mon_sound_wait')}</div>
    <div class="small">${t('mon_rules')}<br>${t('black_tap')}</div>`;
}

// ------------------------------------------------------------------ promemoria
let reminderOpen = null, reminderEl = null, reminderBeep = null;
const SKIP_AFTER_MS = 10 * 60000;
function closeReminderEl() { clearInterval(reminderBeep); if (reminderEl) reminderEl.remove(); reminderEl = null; reminderOpen = null; }
function logReminder(dueMs, action) {
  const rec = [...S.reminders].reverse().find(r => r.due === isoLocal(dueMs));
  if (rec) { rec.action = action; rec.acted = isoLocal(); } else S.reminders.push({ due: isoLocal(dueMs), shown: '', action, acted: isoLocal() });
}
function showReminder(dueMs) {
  if (reminderOpen) return;
  hideBlack();
  if (!S.monitor.pending || S.monitor.pending.dueMs !== dueMs) { S.monitor.pending = { dueMs, shownMs: Date.now() }; S.reminders.push({ due: isoLocal(dueMs), shown: isoLocal(), action: '' }); }
  S.monitor.snoozed = false; save();
  reminderOpen = dueMs;
  let beeps = 0; sound.beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  reminderBeep = setInterval(() => { if (++beeps >= 3 || !reminderOpen) return clearInterval(reminderBeep); sound.beep(); }, 60000);
  const el = document.createElement('div'); el.id = 'remind'; reminderEl = el;
  el.innerHTML = `${LOGO.replace('width="30" height="30"', 'width="56" height="56"')}<h2>${t('rem_title')}</h2><p>${t('rem_body')}</p>
    <button class="btn light" id="remgo" type="button">${t('rem_go')}</button><button class="btn ghost" id="remlater" type="button">${t('rem_later')}</button>`;
  document.body.appendChild(el);
  $('#remgo').onclick = () => { closeReminderEl(); startMeasurement('scheduled', dueMs); };
  $('#remlater').onclick = () => {
    closeReminderEl(); logReminder(dueMs, 'snoozed');
    S.monitor.pending = null; S.monitor.nextDueMs = Date.now() + 2 * 60000; S.monitor.snoozed = true; save();
    showHome(); armIdle();
  };
}
/** Misura non iniziata ne' rimandata entro 10 minuti: viene registrata come saltata e il ciclo riparte. */
function skipPending() {
  const p = S.monitor.pending; if (!p) return;
  closeReminderEl(); logReminder(p.dueMs, 'skipped');
  const next = p.dueMs + INTERVAL_MIN * 60000;
  S.monitor.pending = null; S.monitor.snoozed = false; S.monitor.lastSkipped = { dueMs: p.dueMs, nextMs: next }; S.monitor.nextDueMs = next; save();
  if ($('#home')) showHome();
}

// ------------------------------------------------------------------ misura: abbigliamento → selfie → abbagliamento → (diagramma) → termico → acustico
let M = null;
function startMeasurement(trigger, reminderMs) {
  if (!activeK()) return showCalRef(true);
  const now = Date.now();
  inFlow = true; hideBlack(); clearTimeout(idleTimer);
  M = { id: uuid(), trigger, anchorMs: trigger === 'scheduled' && reminderMs ? Math.min(reminderMs, now) : now, reminderMs: reminderMs || null };
  if (S.monitor.running) {   // il prossimo promemoria parte da questa misura
    if (S.monitor.pending && trigger === 'scheduled') logReminder(S.monitor.pending.dueMs, 'started');
    S.monitor.pending = null; S.monitor.snoozed = false; S.monitor.lastSkipped = null; S.monitor.nextDueMs = now + INTERVAL_MIN * 60000; save();
  }
  stepClothing();
}
const total = () => M && M.glare === false ? 5 : 6;
const eyebrow = n => t('m_step', n, total());
const cancelBtn = `<button class="btn out" id="cancel" type="button">${t('back')}</button>`;
function bindCancel(fn) { const c = $('#cancel'); if (c) c.onclick = fn; }
const cloLabel = c => t(c === 'light' ? 'clo_l' : c === 'heavy' ? 'clo_h' : 'clo_m');

function stepClothing() {
  const cur = S.profile.clothing;
  let changed = M.clothingChanged ?? null, now = M.clothingNow || null;
  const draw = () => {
    screen(`<main class="body">${topbar()}<div class="step">${eyebrow(1)}</div><h1>${t('clo_title')}</h1><p class="t">${t('clo_current', cloLabel(cur))}</p>
      <div class="seg"><button type="button" data-v="no" class="${changed === false ? 'on' : ''}">${t('no')}</button><button type="button" data-v="yes" class="${changed === true ? 'on' : ''}">${t('yes')}</button></div>
      ${changed ? `<div class="lab">${t('clo_now')}</div><div class="seg" id="clo">${[['light', t('clo_l'), t('clo_ls')], ['medium', t('clo_m'), t('clo_ms')], ['heavy', t('clo_h'), t('clo_hs')]].map(([v, l, s]) => `<button type="button" data-c="${v}" class="${now === v ? 'on' : ''}">${l}<small>${s}</small></button>`).join('')}</div>` : ''}
      <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${cancelBtn}</main>`);
    app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { changed = b.dataset.v === 'yes'; draw(); });
    app.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { now = b.dataset.c; draw(); });
    $('#go').onclick = () => {
      if (changed == null || (changed && !now)) { $('#msg').innerHTML = errBox(t('clo_missing')); return; }
      M.clothingChanged = changed; M.clothingNow = changed ? now : cur; M.clothingPrevious = cur; stepSelfie();
    };
    bindCancel(endFlow);
  };
  draw();
}
function stepSelfie() {
  showCamera({ eyebrow: eyebrow(2), title: t('cam_title'), analyze: f => analyzeSelfie(f, { kPrime: activeK(), kPrimeCompact: activeKCompact() }),
    onDone: (r, src) => { M.light = r; M.selfieSource = src; stepGsv(); }, onBack: stepClothing });
}
function stepGsv() {
  let solar = M.solar ?? null;
  screen(`<main class="body">${topbar()}<div class="step">${eyebrow(3)}</div><h1>${t('gsv_title')}</h1><p class="t">${t('gsv_body')}</p>
    <div class="card">${gsvSlider('gsv', M.gsv ?? 0)}</div>
    <div class="lab">${t('solar_q')}</div><div class="seg" id="sol"><button type="button" data-s="1" class="${solar === true ? 'on' : ''}">${t('yes')}</button><button type="button" data-s="0" class="${solar === false ? 'on' : ''}">${t('no')}</button></div>
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${cancelBtn}</main>`);
  const get = bindGsv('gsv');
  app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { solar = b.dataset.s === '1'; app.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#go').onclick = () => {
    if (solar == null) { $('#msg').innerHTML = errBox(t('solar_missing')); return; }
    M.gsv = get(); M.solar = solar; M.surveyMs = Date.now();
    if (gsvLevel(M.gsv) <= 0) { M.glare = false; M.glareCtx = { shown: false, skip: 'gsv_imperceptible' }; stepThermal(); } else { M.glare = true; stepGlare(); }
  };
  bindCancel(stepSelfie);
}
function stepGlare() {
  let none = false, type = null, area = null;
  const zl = STR[lang()].zone, src = STR[lang()].src;
  screen(`<main class="body">${topbar()}<div class="step">${eyebrow(4)}</div><h1>${t('glare_title')}</h1><p class="t small">${t('glare_body')}</p>
    <div id="diag" class="diagwrap"></div><div class="s" id="zinfo">&nbsp;</div>
    <div id="types" hidden><div class="lab">${t('glare_type_q')}</div><div class="tiles">${Object.entries(src).map(([k, v]) => `<button type="button" data-t="${k}">${v}</button>`).join('')}</div></div>
    <button type="button" class="chk" id="none"><span class="box"></span>${t('glare_none')}</button>
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${cancelBtn}</main>`);
  const d = createDiagram($('#diag'), { ...zl, aria: t('glare_title') }, a => {
    area = a; $('#types').hidden = !a;
    if (a) { none = false; $('#none').classList.remove('on'); $('#zinfo').textContent = t('glare_zone', zl[a.zone], Math.round(a.thetaDeg)); } else $('#zinfo').innerHTML = '&nbsp;';
  });
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { type = b.dataset.t; app.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#none').onclick = () => { none = !none; $('#none').classList.toggle('on', none); if (none) { d.clear(); type = null; app.querySelectorAll('[data-t]').forEach(x => x.classList.remove('on')); } };
  $('#go').onclick = () => {
    if (!none && !area) { $('#msg').innerHTML = errBox(t('glare_draw_first')); return; }
    if (area && !type) { $('#msg').innerHTML = errBox(t('glare_type_missing')); return; }
    M.glareCtx = { shown: true, skip: none ? 'not_identified' : '', area: none ? null : area, type: none ? '' : type };
    stepThermal();
  };
  bindCancel(stepGsv);
}
function scaleSlider(id, value, labels, gradient) {
  return `<div class="gsv"><div class="gsvval" id="${id}v"></div><input type="range" id="${id}" min="-3" max="3" step="0.01" value="${value}" style="--grad:${gradient}">
    <div class="ticks"><span>−3 ${labels[0]}</span><span>0 ${labels[3]}</span><span>+3 ${labels[6]}</span></div></div>`;
}
function bindScale(id, labels) {
  const el = $('#' + id), out = $('#' + id + 'v');
  const upd = () => { const v = +el.value, l = Math.max(-3, Math.min(3, Math.round(v))); out.innerHTML = `<b>${labels[l + 3]}</b> · ${l > 0 ? '+' + l : l}`; };
  el.oninput = upd; upd(); return () => +el.value;
}
function stepThermal() {
  const n = M.glare ? 5 : 4;
  let pref = M.pref ?? null, acc = M.acc ?? null;
  const tsv = STR[lang()].tsv, pl = STR[lang()].pref;
  screen(`<main class="body">${topbar()}<div class="step">${eyebrow(n)}</div><h1>${t('th_title')}</h1>
    <div class="card"><div class="h">${t('tsv_q')}</div>${scaleSlider('tsv', M.tsv ?? 0, tsv, 'linear-gradient(90deg,#4F86C6,#E9E2DC 50%,#D9644A)')}</div>
    <div class="lab">${t('pref_q')}</div><div class="seg">${Object.entries(pl).map(([k, v]) => `<button type="button" data-p="${k}" class="${pref === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="lab">${t('acc_q')}</div><div class="seg"><button type="button" data-a="1" class="${acc === true ? 'on' : ''}">${t('yes')}</button><button type="button" data-a="0" class="${acc === false ? 'on' : ''}">${t('no')}</button></div>
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${cancelBtn}</main>`);
  const get = bindScale('tsv', tsv);
  app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { pref = b.dataset.p; app.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); });
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { acc = b.dataset.a === '1'; app.querySelectorAll('[data-a]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#go').onclick = () => {
    if (!pref || acc == null) { $('#msg').innerHTML = errBox(t('th_missing')); return; }
    M.tsv = get(); M.pref = pref; M.acc = acc; M.thermalMs = Date.now(); stepAcoustic();
  };
  bindCancel(() => M.glare ? stepGlare() : stepGsv());
}
function stepAcoustic() {
  const n = M.glare ? 6 : 5;
  let srcSel = M.acSrc ?? null;
  const ac = STR[lang()].ac, srcs = STR[lang()].ac_src;
  screen(`<main class="body">${topbar()}<div class="step">${eyebrow(n)}</div><h1>${t('ac_title')}</h1>
    <div class="card"><div class="h">${t('ac_q')}</div>${scaleSlider('acd', M.acd ?? 0, ac, 'linear-gradient(90deg,#7FB59A,#EEE7E1 50%,#D9644A)')}</div>
    <div class="lab">${t('ac_src_q')}</div><div class="tiles">${Object.entries(srcs).map(([k, v]) => `<button type="button" data-k="${k}" class="${srcSel === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('save_meas')}</button>${cancelBtn}</main>`);
  const get = bindScale('acd', ac);
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { srcSel = b.dataset.k; app.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#go').onclick = () => {
    if (!srcSel) { $('#msg').innerHTML = errBox(t('ac_missing')); return; }
    M.acd = get(); M.acSrc = srcSel; saveMeasurement();
  };
  bindCancel(stepThermal);
}

function saveMeasurement() {
  const r = M.light, p = S.profile, now = Date.now(), k = activeK();
  const endEpoch = Math.floor(M.anchorMs / 1000) - 1;
  const metrics = sound.computeAll(endEpoch);
  const q = SoundEngine.quality(metrics[5]);
  const status = !S.monitor.running ? 'monitoring_off' : sound.running() ? 'ok' : 'paused';
  const g = M.glareCtx, a = g.area;
  const tl = Math.max(-3, Math.min(3, Math.round(M.tsv))), al = Math.max(-3, Math.min(3, Math.round(M.acd))), gl = gsvLevel(M.gsv);
  if (M.clothingChanged) { S.profile.clothing = M.clothingNow; }
  const rec = {
    participant_id: S.participant_id, session_id: S.session_id, measurement_id: M.id, capture_timestamp: isoLocal(r.shotMs), survey_timestamp: isoLocal(M.surveyMs), trigger_type: M.trigger,
    tair_quality: 'unavailable', tair_quality_flags: 'no_tair|ios_no_battery_temperature', tair_status: 'unavailable_ios', tair_rule: 'none', aggregation_method: 'none',
    ev_left_lux: r.evLeft, ev_right_lux: r.evRight, ev_bilateral_mean_lux: r.evMean, ev_left_right_asymmetry: r.asymmetry,
    light_aggregation_method: OFFICIAL_EV_METHOD, bilateral_diagnostic_method: BILATERAL_METHOD, light_quality_flags: flagsOf(r),
    periocular_left_clipping_ratio: r.clipLeft, periocular_right_clipping_ratio: r.clipRight,
    ev_lux: r.ev, gsv_continuous_0_100: +M.gsv.toFixed(1), gsv_level: gl, gsv_label: GSV_CODE[gl], direct_solar_exposure: M.solar,
    thermal_survey_timestamp: isoLocal(M.thermalMs), tsv_continuous: +M.tsv.toFixed(2), tsv_level: tl, tsv_label: TSV_CODE[tl + 3], thermal_preference: M.pref, thermal_acceptability: M.acc,
    acoustic_discomfort_m3_p3: +M.acd.toFixed(2), acoustic_discomfort_level: al, acoustic_discomfort_label: AC_CODE[al + 3], acoustic_source: M.acSrc,
    age: p.age, sex: p.sex, seat_position: p.seat.zone, clothing: M.clothingNow, clothing_changed: M.clothingChanged, clothing_previous: M.clothingPrevious, measurement_interval_min: INTERVAL_MIN,
    iso: r.exif.iso, exposure_s: r.exif.exposureS, f_number: r.exif.fNumber, ym_left: r.ymLeft, ym_right: r.ymRight, ym_combined: r.ym, iod_px: r.iod,
    face_quality_score: '', roll_deg: r.roll, roi_clipping_ratio: r.clip, roi_left_right_difference: r.lrDiff, roi_roll_deg: r.roll, roi_method: PERIOCULAR_METHOD_ID,
    ym_periocular_left: r.ymLeft, ym_periocular_right: r.ymRight, ym_periocular: r.ym, iod_periocular_px: r.iod, periocular_clipping_ratio: r.clip,
    calibration_kprime_periocular: k, ev_periocular_lux: r.ev, periocular_method: PERIOCULAR_METHOD_ID,
    glasses_status: r.glasses ? r.glasses.status : 'unknown', glasses_confidence: r.glasses ? r.glasses.confidence.toFixed(2) : '',
    glare_diagram_shown: g.shown, glare_skip_reason: g.skip || '', glare_source_type: g.type || '', glare_source_zone: a ? a.zone : '',
    glare_source_x: a ? a.x.toFixed(3) : '', glare_source_y: a ? a.y.toFixed(3) : '', glare_source_theta_deg: a ? a.thetaDeg.toFixed(1) : '', glare_source_phi_deg: a ? a.phiDeg.toFixed(1) : '',
    glare_source_theta_min_deg: a ? a.thetaMinDeg.toFixed(1) : '', glare_source_theta_max_deg: a ? a.thetaMaxDeg.toFixed(1) : '', glare_source_solid_angle_sr: a ? a.solidAngleSr.toFixed(4) : '', glare_source_area_frac: a ? a.areaFraction.toFixed(4) : '',
    glare_source_polygon: a ? a.polygon.map(([x, y]) => `${x.toFixed(3)};${y.toFixed(3)}`).join('|') : '', context_capture_mode: 'none',
    device: device(), calibration_kprime: k, phone_als_lux: '', app_version: APP_VERSION, utc_offset: utcOffset(now),
    ...X.soundFields(metrics, isoLocal(M.anchorMs), status, AUDIO_SOURCE, q),
    platform: 'ios_web', room_id: p.seat.room_id, seat_zone: p.seat.zone, seat_rows: hy(p.seat.rows), seat_seats: hy(p.seat.seats), seat_dist_window_m: p.seat.dist_window_m ?? '',
    selfie_source: M.selfieSource, selfie_capture_timestamp: isoLocal(r.shotMs), selfie_age_s: Math.round(r.ageMs / 1000), lens_model: r.exif.lens, image_px: `${r.width}x${r.height}`,
    reminder_timestamp: M.reminderMs ? isoLocal(M.reminderMs) : '', monitoring_started_timestamp: S.monitor.startedMs ? isoLocal(S.monitor.startedMs) : '',
    glasses_user_override: !!r.glassesOverride, calibration_kprime_compact: activeKCompact() ?? '', ...compactFields(r)
  };
  S.measurements.push(rec); save();
  const m5 = metrics[5] || {};
  screen(`<main class="body">${topbar()}<div class="step">${M.trigger === 'scheduled' ? t('res_sched') : t('res_vol')}</div><h1>${t('res_title')}</h1>
    <div class="tiles2"><div class="tile"><div class="s">${t('res_light')}</div><div class="bignum">${fmt(r.ev)} <small>lx</small></div></div>
    <div class="tile"><div class="s">${t('gsv_title')}</div><div class="bignum sm">${STR[lang()].gsv[gl]}</div></div></div>
    <div class="card"><div class="s">${t('res_sound')}</div><div class="h">${Number.isFinite(m5.laeq) ? `L<sub>Aeq</sub> ${fmt(m5.laeq, 1)} dB · ${Math.round(m5.fracValid * 100)} %` : t('res_na')}</div></div>
    <div class="spacer"></div><button class="btn" id="go" type="button">${S.monitor.running ? t('res_back') : t('cal_done_go')}</button></main>`);
  $('#go').onclick = endFlow;
  M = null;
}
function endFlow() { stopCam(); M = null; inFlow = false; showHome(); if (S.monitor.running && sound.running()) setTimeout(showBlack, 1500); armIdle(); }

// ------------------------------------------------------------------ invio dei dati
function dayStr(ms = Date.now()) { return isoLocal(ms).slice(0, 10); }
function showSend() {
  const n = S.measurements.length;
  const canShare = !!(navigator.canShare && navigator.share);
  screen(`<main class="body">${topbar()}<div class="step">${t('m_data')}</div><h1>${t('send_title')}</h1>
    ${n ? `<p class="t">${t('send_body')}</p><div class="card mail"><span id="addr">${RESEARCHER_EMAIL}</span><button class="lang" id="copy" type="button">${t('send_copy')}</button></div>` : `<p class="t">${t('send_none')}</p>`}
    <div id="msg"></div><div class="spacer"></div>
    ${n ? `<button class="btn" id="share" type="button">${t('send_share')}</button>` : ''}<button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = () => route();
  if (!n) return;
  $('#copy').onclick = () => {
    const done = () => { $('#copy').textContent = t('send_copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(RESEARCHER_EMAIL).then(done, () => {}); else done();
  };
  $('#share').onclick = async () => {
    const day = dayStr(), a = `COMFY_${S.participant_id}_analisi_${day}.csv`, c = `COMFY_${S.participant_id}_completo_${day}.csv`;
    const files = [new File([X.buildAnalysis(S)], a, { type: 'text/csv' }), new File([X.buildComplete(S)], c, { type: 'text/csv' })];
    const data = { files, title: t('send_subject', S.participant_id, new Date().toLocaleDateString('it-IT')), text: t('send_text', S.participant_id, device(), APP_VERSION, n, a, c) };
    if (!canShare || !navigator.canShare({ files })) { $('#msg').innerHTML = errBox(t('send_unsupported')); return; }
    try { await navigator.share(data); S.sends.push({ at: isoLocal(), measurements: n }); save(); showSend(); }
    catch (e) { if (e.name !== 'AbortError') $('#msg').innerHTML = errBox(e.message); }
  };
}

// ------------------------------------------------------------------ Home (proposta B: il suono al centro)
const DIAL_MIN = 0, DIAL_MAX = 80;
function dialSvg(v, dim) {
  const r = 80, cx = 100, cy = 100, p = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - DIAL_MIN) / (DIAL_MAX - DIAL_MIN))) : 0, ang = Math.PI * (1 - p);
  const arc = (f, to, col, w) => `<path d="M${cx + r * Math.cos(f)} ${cy - r * Math.sin(f)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(to)} ${cy - r * Math.sin(to)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg width="200" height="116" viewBox="0 0 200 116" aria-hidden="true">${arc(Math.PI, 0, '#EBD9CF', 12)}${p > 0.005 ? arc(Math.PI, ang, dim ? '#C9BBB2' : '#A4472B', 12) : ''}</svg>`;
}
function sparkSvg() {
  const end = Math.floor(Date.now() / 1000), pts = sound.history.filter(s => s.e > end - 300 && Number.isFinite(s.la));
  if (pts.length < 5) return '<svg class="spark" width="100%" height="34"></svg>';
  const lo = Math.min(...pts.map(s => s.la)) - 2, hi = Math.max(...pts.map(s => s.la)) + 2, W = 300, H = 34;
  const d = pts.map(s => `${((s.e - (end - 300)) / 300 * W).toFixed(1)},${(H - (s.la - lo) / (hi - lo) * H).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}"><polyline fill="none" stroke="#A4472B" stroke-width="1.6" vector-effect="non-scaling-stroke" points="${d}"/></svg>`;
}
function statePill() {
  const mon = S.monitor, now = Date.now();
  if (mon.pending) return `<span class="pl due">${t('b_due', hhmm(mon.pending.dueMs))}</span>`;
  if (mon.lastSkipped && now < mon.lastSkipped.nextMs) return `<span class="pl warn">${t('b_skipped', hhmm(mon.lastSkipped.dueMs), hhmm(mon.lastSkipped.nextMs))}</span>`;
  if (mon.snoozed) return `<span class="pl br">${t('b_snoozed', hhmm(mon.nextDueMs))}</span>`;
  return `<span class="pl br">${t('b_next', hhmm(mon.nextDueMs), Math.max(0, Math.ceil((mon.nextDueMs - now) / 60000)))}</span>`;
}
function showHome() {
  const mon = S.monitor, today = dayStr();
  const todays = S.measurements.filter(m => (m.capture_timestamp || '').startsWith(today)), last = todays[todays.length - 1];
  const paused = monitoringPaused(), live = mon.running && !paused;
  const la = sound.lastLa;
  const pausedHero = `<div class="warnhero"><div class="h">${t('mon_paused', hhmm(mon.pausedSinceMs || Date.now()))}</div><p class="t" style="margin:4px 0 10px">${t('mon_rules')}</p><button class="btn" id="start" type="button">${t('mon_resume')}</button></div>`;
  let hero;
  if (!mon.running) hero = `<div class="hero dialhero"><div class="dial">${dialSvg(NaN)}<div class="v"><b>–</b><span>${t('b_sound_now')}</span></div></div>
      <div class="pillrow"><span class="pl">${t('b_not_active')}</span></div><p class="t small" style="margin:10px 0 2px">${t('mon_start_s')}</p></div>`;
  else if (paused) hero = `${pausedHero}<div class="hero dialhero"><div class="dial">${dialSvg(NaN, true)}<div class="v"><b>–</b><span>${t('b_sound_now')}</span></div></div><div class="pillrow"><span class="pl warn">${t('b_paused')}</span></div></div>`;
  else hero = `<div class="hero dialhero"><div class="dial" id="dial">${dialSvg(la)}<div class="v"><b id="dialv">${Number.isFinite(la) ? fmt(la, 0) : '–'}</b><span>${t('b_sound_now')}</span></div></div>
      <div id="spark">${sparkSvg()}</div><div class="pillrow" id="pills">${statePill()}<span class="pl" id="rec">${t('b_rec', Math.round(sound.fracValid(300) * 100))}</span></div></div>
      ${mon.pending ? `<button class="btn" id="go" type="button">${t('b_go')}</button>` : `<div class="dimhint" id="dimhint">${dimHint()}</div>`}`;
  const sw = `<div class="card swcard"><div class="flex"><div class="ic">${IC.mic}</div><div style="flex:1"><div class="h">${t('mon_switch')}</div><div class="s">${!mon.running ? t('mon_switch_off') : paused ? t('b_paused') : t('mon_switch_on')}</div></div>
      <button class="sw ${mon.running ? 'on' : ''}" id="sw" type="button" role="switch" aria-checked="${mon.running}" aria-label="${t('mon_switch')}"><i></i></button></div></div>`;
  screen(`<main class="body" id="home">${topbar(true)}${hero}${sw}<div id="msg"></div>
    <button class="card action blink" id="vol" type="button"><div class="flex"><div class="ic">${IC.sun}</div><div><div class="h">${t('vol')}</div><div class="s">${t('vol_s')}</div></div></div></button>
    <div class="card"><div class="h">${todays.length ? t('b_today', todays.length) : t('b_today_none')}</div>
      <div class="s">${last ? t('b_last', last.capture_timestamp.slice(11, 16), fmt(+last.ev_lux)) : t('seat_chosen', S.profile.seat.rows, S.profile.seat.seats)}</div></div>
    <div class="foot">${t('version')} ${APP_VERSION} · ${S.participant_id}</div></main>`);
  const st = $('#start'); if (st) st.onclick = startMonitoring;
  const dh = $('#dimhint'); if (dh) dh.onclick = showBlack;
  const go = $('#go'); if (go) go.onclick = () => startMeasurement('scheduled', mon.pending.dueMs);
  $('#vol').onclick = () => startMeasurement('user_initiated');
  $('#sw').onclick = () => mon.running ? confirmStop() : startMonitoring();
}
let sparkTick = 0, idleAt = 0;
function dimHint() { const s = Math.max(0, Math.ceil((idleAt - Date.now()) / 1000)); return idleAt && s > 0 ? t('dim_in', s) : t('dim_tap'); }
function updateHome() {
  if (!$('#home') || !S.monitor.running || monitoringPaused()) return;
  const la = sound.lastLa, v = $('#dialv'), d = $('#dial');
  if (v) v.textContent = Number.isFinite(la) ? fmt(la, 0) : '–';
  if (d) d.firstElementChild.outerHTML = dialSvg(la);
  const p = $('#pills'); if (p) p.innerHTML = `${statePill()}<span class="pl" id="rec">${t('b_rec', Math.round(sound.fracValid(300) * 100))}</span>`;
  const dh = $('#dimhint'); if (dh) dh.textContent = dimHint();
  if (++sparkTick % 5 === 0) { const s = $('#spark'); if (s) s.innerHTML = sparkSvg(); }
}
function confirmStop() {
  const m = $('#msg');
  m.innerHTML = `<div class="card"><p class="t" style="margin-bottom:10px">${t('mon_stop_confirm')}</p><div class="seg"><button type="button" id="sy">${t('mon_stop_yes')}</button><button type="button" id="sn" class="on">${t('mon_stop_no')}</button></div></div>`;
  $('#sy').onclick = stopMonitoring; $('#sn').onclick = () => { m.innerHTML = ''; };
}

// ------------------------------------------------------------------ menu
function showMenu() {
  hideBlack();
  const el = document.createElement('div'); el.id = 'menu';
  el.innerHTML = `<div class="dim"></div><nav class="sheet" aria-label="${t('menu')}">
    <div class="sec">${t('m_data')}</div>
    <button type="button" data-a="send"><span class="ic">${IC.send}</span>${t('send')}</button>
    <div class="sec">${t('m_mon')}</div>
    <button type="button" data-a="test"><span class="ic">${IC.sun}</span>${t('home_test')}</button>
    <button type="button" data-a="recal"><span class="ic">${IC.cam}</span>${t('home_recal')}</button>
    <div class="sec">${t('m_help')}</div>
    <button type="button" data-a="help"><span class="ic">${IC.user}</span>${t('ins_menu')}</button>
    <button type="button" data-a="lang"><span class="ic">${IC.mic}</span>${t('menu_lang')}: ${lang() === 'it' ? 'Italiano' : 'English'}</button>
    <div class="foot">${t('version')} ${APP_VERSION}</div></nav>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('.dim').onclick = close;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    close();
    const a = b.dataset.a;
    if (a === 'send') showSend(); else if (a === 'test') showLightTest(); else if (a === 'recal') showCalRef(true);
    else if (a === 'help') showInstructions(0, true); else if (a === 'lang') { S.lang = lang() === 'it' ? 'en' : 'it'; save(); route(); }
  });
}

// ------------------------------------------------------------------ ciclo di controllo (ogni secondo)
setInterval(() => {
  const mon = S.monitor, now = Date.now();
  if (mon.running) {
    if (!sound.running() && !mon.pausedSinceMs) { mon.pausedSinceMs = now; save(); if ($('#home') && !inFlow) showHome(); }
    if (sound.running() && mon.pausedSinceMs) { mon.pausedSinceMs = null; save(); if ($('#home') && !inFlow) showHome(); }
    if (mon.pending && now - mon.pending.dueMs >= SKIP_AFTER_MS && !inFlow) skipPending();
    else if (!inFlow && sound.running() && !mon.pending && now >= mon.nextDueMs) showReminder(mon.nextDueMs);
    if (mon.lastSkipped && now >= mon.lastSkipped.nextMs + 60000) { mon.lastSkipped = null; save(); }
  }
  if (!inFlow) updateHome();
  renderBlack();
}, 1000);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (S.monitor.running) { await sound.resume(); keepAwake(); }
    if ($('#home')) showHome();
  } else { sound.flush(); }
});
window.addEventListener('pagehide', () => sound.flush());

// ------------------------------------------------------------------ aggiornamenti: controlla version.json a ogni apertura
async function checkUpdate() {
  try {
    const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
    if (v && v.version && ('web-ios-' + v.version) !== APP_VERSION && !inFlow) {
      const bar = document.createElement('div'); bar.className = 'update';
      bar.innerHTML = `<span>${t('update_ready')}</span><button type="button">${t('update_go')}</button>`;
      bar.querySelector('button').onclick = () => { sound.flush(); location.replace('./?v=' + encodeURIComponent(v.version)); };
      document.body.appendChild(bar);
    }
  } catch (e) { }
}

if (S.monitor.running && !S.monitor.pausedSinceMs) { S.monitor.pausedSinceMs = Date.now(); save(); }   // dopo un ricaricamento serve un tocco per riattivare il microfono
route();
checkUpdate();
