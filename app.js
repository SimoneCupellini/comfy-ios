// COMFY web per iPhone – v0.2: configurazione, calibrazione, monitoraggio del suono, promemoria, misure complete, invio dei dati.
// Nessuna azione dell'app cancella dati: misure, calibrazioni e check-in vengono solo aggiunti.
const VQ = new URL(import.meta.url).search;   // stessa versione per tutti i moduli (evita copie vecchie in cache)
const { STR } = await import('./i18n.js' + VQ);
const L = await import('./light.js' + VQ);
const { SoundEngine, AUDIO_SOURCE } = await import('./sound.js' + VQ);
const X = await import('./export.js' + VQ);
const { createDiagram } = await import('./diagram.js' + VQ);
const INS = await import('./instructions.js' + VQ);
const C = await import('./coach.js' + VQ);
const { analyzeSelfie, loadLandmarker, LightError, PERIOCULAR_METHOD_ID, OFFICIAL_EV_METHOD, BILATERAL_METHOD } = L;

export const APP_VERSION = 'web-ios-0.9.0';
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
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); hideSaveError(); return true; }
  catch (e) { console.error('storage', e); showSaveError(e); return false; }
}
function showSaveError(e) {
  let b = document.getElementById('saveerr');
  if (!b) { b = document.createElement('div'); b.id = 'saveerr'; b.setAttribute('role', 'alert'); document.body.appendChild(b); }
  b.innerHTML = `<b>${STR[(S && S.lang) || 'it'].save_err_t}</b><span>${STR[(S && S.lang) || 'it'].save_err_b}</span><button type="button" id="saveretry">${STR[(S && S.lang) || 'it'].save_retry}</button>`;
  b.querySelector('#saveretry').onclick = () => { if (save()) b.remove(); };
}
function hideSaveError() { const b = document.getElementById('saveerr'); if (b) b.remove(); }
const shortId = p => `${p}-${(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + '00000000').slice(0, 8).toUpperCase()}`;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
if (!S.participant_id) { S.participant_id = shortId('P'); S.session_id = shortId('S'); S.created = Date.now(); }
for (const k of ['baselines', 'calibrations', 'light_tests', 'measurements', 'reminders', 'sends']) if (!Array.isArray(S[k])) S[k] = [];
if (!S.monitor) S.monitor = { running: false };
save();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const lang = () => S.lang || ((navigator.language || 'it').startsWith('it') ? 'it' : 'en');
// tema: automatico (come l'iPhone), chiaro o scuro; si cambia dalla Home (luna / sole) o dal menu
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const themeEff = () => (S.theme === 'dark' || (S.theme !== 'light' && darkMQ.matches)) ? 'dark' : 'light';
function applyTheme() {
  const th = themeEff(); document.documentElement.dataset.theme = th;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = th === 'dark' ? '#141110' : '#FAF6F3';
}
applyTheme();
try { darkMQ.addEventListener('change', () => { applyTheme(); if ($('#home') && !inFlow) showHome(); }); } catch (e) { }
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
sound.onError = e => showSaveError(e);
sound.restore();

// ------------------------------------------------------------------ pianta dell'aula
let ROOM = null;
async function room() { if (!ROOM) ROOM = await (await fetch('room.json', { cache: 'no-cache' })).json(); return ROOM; }
function zoneInfo(r, i, j) {
  const rows = r.rows_range[i], seats = r.seat_groups_range[j];
  let dist = null;
  const aisle = r.aisle_after_group != null && j > r.aisle_after_group ? (r.aisle_width_m || 0) : 0;
  if (seats[1] != null) { const mid = (seats[0] + seats[1]) / 2; dist = Math.round((r.first_seat_from_window_m + (mid - 1) * r.seat_width_m + aisle) * 10) / 10; }
  return { zone: `r${rows[0]}-${rows[1]}_s${seats[0]}-${seats[1] ?? 'plus'}`, rows: r.rows[i], seats: r.seat_groups[j], row_min: rows[0], row_max: rows[1], seat_min: seats[0], seat_max: seats[1], dist_window_m: dist };
}
function roomSvg(r, sel) {
  const W = 300, H = 360, x0 = 30, y0 = 40, nB = r.rows.length, nC = r.seat_groups.length, R = W - 8;
  const top = y0 + 26, bottom = H - 34, band = (bottom - top) / nB;
  const hasAisle = r.aisle_after_group != null, aisleW = hasAisle ? 22 : 0;
  const colW = (W - x0 - 58 - aisleW) / nC, rad = Math.min(band, colW) / 2 - 4;
  const cxOf = j => x0 + 14 + colW * (j + 0.5) + (hasAisle && j > r.aisle_after_group ? aisleW : 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(t('seat_title'))}">`;
  s += `<rect x="${x0}" y="${y0 - 28}" width="${W - x0 - 8}" height="${H - y0 + 20}" fill="var(--bgapp)" stroke="var(--ink)" stroke-width="1.5"/>`;
  if (hasAisle) {
    const ax = x0 + 14 + colW * (r.aisle_after_group + 1);
    s += `<rect x="${ax}" y="${top - 6}" width="${aisleW}" height="${bottom - top + 12}" fill="#EFE7E1"/>`;
    s += `<text x="${ax + aisleW / 2}" y="${(top + bottom) / 2}" font-size="8" fill="var(--mute)" text-anchor="middle" transform="rotate(-90 ${ax + aisleW / 2} ${(top + bottom) / 2})">${esc(t('seat_aisle'))}</text>`;
  }
  const mid = x0 + (W - x0 - 8) / 2;
  s += `<rect x="${mid - 40}" y="${y0 - 22}" width="80" height="16" rx="3" fill="#DCE6F1" stroke="#1F4E79"/><text x="${mid}" y="${y0 - 10.5}" font-size="9.5" text-anchor="middle" fill="#1F4E79">${esc(t('seat_cattedra'))}</text>`;
  const wl = (H - y0 + 4) / 5;
  for (let k = 0; k < 5; k++) { const a = y0 - 20 + k * wl, b = a + wl - 12; s += `<line x1="${x0}" y1="${a}" x2="${x0}" y2="${b}" stroke="#5DA9E9" stroke-width="5"/>`; }
  s += `<text x="${x0 - 9}" y="${H / 2 + 22}" font-size="9" fill="#2a78d6" transform="rotate(-90 ${x0 - 9} ${H / 2 + 22})">${esc(t('seat_windows'))}</text>`;
  const d = 20;
  s += `<line x1="${R}" y1="${y0 - 24}" x2="${R}" y2="${y0 - 24 + d}" stroke="var(--bgapp)" stroke-width="4"/><path d="M${R} ${y0 - 24} A${d} ${d} 0 0 0 ${R - d} ${y0 - 24 + d}" fill="none" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
  s += `<line x1="${R}" y1="${H - 12 - d}" x2="${R}" y2="${H - 12}" stroke="var(--bgapp)" stroke-width="4"/><path d="M${R} ${H - 12} A${d} ${d} 0 0 1 ${R - d} ${H - 12 - d}" fill="none" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
  s += `<text x="${R - 6}" y="${top - 8}" font-size="8.5" text-anchor="end" fill="var(--mute)">${esc(t('seat_rows'))}</text>`;
  for (let i = 0; i < nB; i++) {
    const cy = top + band * (i + 0.5);
    s += `<text x="${R - 6}" y="${cy + 3}" font-size="8.5" text-anchor="end" fill="var(--mute)">${r.rows[i]}</text>`;
    for (let j = 0; j < nC; j++) {
      const cx = cxOf(j), on = sel && sel.i === i && sel.j === j;
      s += `<g class="zone" data-i="${i}" data-j="${j}" role="button" tabindex="0" aria-label="${esc(t('seat_chosen', r.rows[i], r.seat_groups[j]))}">
        <circle cx="${cx}" cy="${cy}" r="${rad}" fill="${on ? 'var(--brand)' : 'var(--soft)'}" stroke="${on ? 'var(--brand)' : '#E3C9BC'}" stroke-width="1.6"/>
        ${on ? `<path d="M${cx - 7} ${cy} l5 5 l9 -10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</g>`;
    }
  }
  for (let j = 0; j < nC; j++) s += `<text x="${cxOf(j)}" y="${bottom + 16}" font-size="8.5" text-anchor="middle" fill="var(--mute)">${esc(t('seat_seats'))} ${r.seat_groups[j]}</text>`;
  return s + '</svg>';
}

// ------------------------------------------------------------------ interfaccia
const LOGO = `<svg viewBox="0 0 108 108" width="30" height="30" aria-hidden="true"><rect width="108" height="108" rx="26" fill="#A4472B"/><path d="M37.4 39.57A22 22 0 0 1 70.6 39.57" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M74.8 46.84A22 22 0 0 1 58.2 75.6" stroke="#FFD9C7" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M49.8 75.6A22 22 0 0 1 33.2 46.84" stroke="#F7B49B" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="54" cy="54" r="6.5" fill="#fff"/></svg>`;
const MOON_I = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`;
const SUN_I = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>`;
const langBtn = (cls = '') => `<button class="lang ${cls}" id="lang" type="button" aria-label="${t('lang_btn')}">${lang() === 'it' ? 'IT' : 'EN'}</button>`;
const topbar = (menu = false) => `<div class="top">${LOGO}<div class="ttl">COMFY</div>${menu === 'home'
  ? `<div class="flex" id="tlbox" style="gap:8px"><button class="tbtn" id="themeb" type="button" aria-label="${themeEff() === 'dark' ? t('th_to_light') : t('th_to_dark')}">${themeEff() === 'dark' ? SUN_I : MOON_I}</button>${langBtn('h36')}</div>` : ''}${menu
  ? `<button class="mbtn" id="menub" type="button" aria-label="${t('menu')}"><i></i></button>` : (inFlow ? '' : langBtn())}</div>`;
const IC = {
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A7AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  cam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  lib: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>`,
  sun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>`,
  mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  eye: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>`,
  ok: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E8B57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`,
  face: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".8"/><circle cx="15" cy="10" r=".8"/><path d="M8.5 14.5q3.5 3 7 0"/></svg>`,
  moon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
  globe: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`,
  help: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4472B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14"/><circle cx="12" cy="17.2" r=".6"/></svg>`
};
function screen(html) {
  app.innerHTML = html; window.scrollTo(0, 0);
  const l = $('#lang'); if (l) l.onclick = () => { S.lang = lang() === 'it' ? 'en' : 'it'; save(); route(); };
  const m = $('#menub'); if (m) m.onclick = showMenu;
  const th = $('#themeb'); if (th) th.onclick = () => { S.theme = themeEff() === 'dark' ? 'light' : 'dark'; save(); applyTheme(); route(); };
}
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
  if (!S.calibrations.length) return showCalGuide(false);
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

// ------------------------------------------------------------------ abbigliamento a immagini: T-shirt e camicia leggero, maglione medio, giacca pesante
const GARMENTS = [['tshirt', 'light'], ['shirt', 'light'], ['sweater', 'medium'], ['jacket', 'heavy']];
const garClass = g => (GARMENTS.find(x => x[0] === g) || [])[1] || null;
const GSVG = {
  tshirt: `<svg viewBox="0 0 104 96" fill="none" stroke="#A4472B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M36 12 L20 18 L6 34 L18 44 L26 37 L26 86 L78 86 L78 37 L86 44 L98 34 L84 18 L68 12 Q52 24 36 12 Z" fill="#F6E3DB"/><path d="M40 13 Q52 21 64 13"/></svg>`,
  shirt: `<svg viewBox="0 0 104 96" fill="none" stroke="#A4472B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M38 10 L20 16 L8 50 L18 54 L26 34 L26 88 L78 88 L78 34 L86 54 L96 50 L84 16 L66 10 Z" fill="#FFFFFF"/><path d="M38 10 L52 26 L66 10"/><path d="M38 10 L44 24 L52 26 L60 24 L66 10" fill="#F6E3DB"/><path d="M52 26 L52 88"/><circle cx="56" cy="40" r="1.6" fill="#A4472B"/><circle cx="56" cy="54" r="1.6" fill="#A4472B"/><circle cx="56" cy="68" r="1.6" fill="#A4472B"/><path d="M30 46 h12 v10 h-12z"/></svg>`,
  sweater: `<svg viewBox="0 0 104 96" fill="none" stroke="#A4472B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M38 10 L20 16 L8 76 L20 78 L26 36 L26 82 L78 82 L78 36 L84 78 L96 76 L84 16 L66 10 Q52 20 38 10 Z" fill="#E9B9A5"/><path d="M38 10 Q52 22 66 10"/><path d="M26 82 v6 h52 v-6"/><path d="M9 74 l11 2 M8 80 l11 2"/><path d="M95 74 l-11 2 M96 80 l-11 2"/></svg>`,
  jacket: `<svg viewBox="0 0 104 96" fill="none" stroke="#A4472B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M36 8 L18 14 L6 80 L18 82 L24 40 L24 90 L80 90 L80 40 L86 82 L98 80 L86 14 L68 8 Z" fill="#B8573A"/><path d="M36 8 L44 30 L52 90 M68 8 L60 30 L52 90" stroke="#fff"/><path d="M36 8 L30 24 L44 30 M68 8 L74 24 L60 30" stroke="#fff"/><circle cx="57" cy="56" r="2" fill="#fff" stroke="none"/><circle cx="57" cy="70" r="2" fill="#fff" stroke="none"/><path d="M30 62 h12 M62 62 h12" stroke="#fff"/></svg>`
};
function garmentPicker(id, sel) {
  return `<div class="car" id="${id}" role="radiogroup" aria-label="${esc(t('clo'))}">${GARMENTS.map(([k, c]) => `<button type="button" role="radio" aria-checked="${k === sel}" class="gar ${k === sel ? 'on' : ''}" data-g="${k}">${GSVG[k]}<span class="n">${t('g_' + k)}</span><span class="w">${cloLabel(c)}</span></button>`).join('')}</div>
    <div class="cdots" id="${id}d" aria-hidden="true">${GARMENTS.map(([k]) => `<span class="${k === sel ? 'on' : ''}"></span>`).join('')}</div>`;
}
function bindGarments(id, onPick) {
  const c = $('#' + id), dots = $('#' + id + 'd'); if (!c) return;
  c.querySelectorAll('.gar').forEach((b, i) => b.onclick = () => {
    c.querySelectorAll('.gar').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
    b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    onPick(b.dataset.g);
  });
  const on = c.querySelector('.gar.on'); if (on) c.scrollLeft = on.offsetLeft - (c.clientWidth - on.offsetWidth) / 2;
}

function showProfile(onDone = null) {
  const p = S.profile || {};
  const ages = Array.from({ length: 63 }, (_, i) => i + 16).map(a => `<option value="${a}" ${p.age == a ? 'selected' : ''}>${a} ${t('age_unit')}</option>`).join('');
  const seg = (name, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l, s]) => `<button type="button" role="radio" aria-checked="${p[name] === v}" class="${p[name] === v ? 'on' : ''}" data-f="${name}" data-v="${v}">${l}${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`;
  screen(`<main class="body">${topbar()}
    <div class="step">${onDone ? t('menu_profile').toUpperCase() : t('step', 1)}</div><h1>${t('prof_title')}</h1>
    <label class="lab" for="age">${t('age')}</label>
    <select id="age" class="field"><option value="">–</option>${ages}</select>
    <div class="lab">${t('sex')}</div>${seg('sex', [['female', t('sex_f')], ['male', t('sex_m')], ['other', t('sex_o')]])}
    <div class="lab">${t('clo_pick')}</div>${garmentPicker('car', p.garment)}
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${onDone ? `<button class="btn out" id="back" type="button">${t('back')}</button>` : ''}</main>`);
  if (onDone) $('#back').onclick = () => route();
  app.querySelectorAll('.seg button').forEach(b => b.onclick = () => { p[b.dataset.f] = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); });
  $('#age').onchange = e => p.age = +e.target.value || null;
  bindGarments('car', g => { p.garment = g; p.clothing = garClass(g); });
  $('#go').onclick = () => {
    if (!p.age || !p.sex || !p.garment) { $('#msg').innerHTML = errBox(t('prof_missing')); return; }
    S.profile = { ...(S.profile || {}), age: p.age, sex: p.sex, clothing: garClass(p.garment), garment: p.garment, saved: Date.now() };
    if (onDone) logProfileChange('profile'); save(); onDone ? onDone() : route();
  };
}

async function showSeat(opts = {}) {
  const r = await room();
  let sel = opts.fresh ? null : (S.profile.seatSel || null);
  const draw = () => {
    const z = sel ? zoneInfo(r, sel.i, sel.j) : null;
    screen(`<main class="body">${topbar()}
      <div class="step">${opts.eyebrow || t('step', 2)}</div><h1>${opts.title || t('seat_title')}</h1><p class="t">${t('seat_body')}</p>
      <div class="map">${roomSvg(r, sel)}</div>
      <div class="card chosen">${z ? `<div class="flex"><span class="chip o">✓</span><div class="s"><b>${t('seat_chosen', z.rows, z.seats)}</b>${t('seat_dist', z.dist_window_m != null ? fmt(z.dist_window_m, 1) : null)}</div></div>` : `<div class="s">${t('seat_missing')}</div>`}</div>
      <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${opts.onBack ? `<button class="btn out" id="back" type="button">${t('back')}</button>` : ''}</main>`);
    if (opts.onBack) $('#back').onclick = opts.onBack;
    app.querySelectorAll('.zone').forEach(g => {
      const pick = () => { sel = { i: +g.dataset.i, j: +g.dataset.j }; draw(); };
      g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(); });
    });
    $('#go').onclick = () => {
      if (!sel) { $('#msg').innerHTML = errBox(t('seat_missing')); return; }
      const prev = S.profile.seat ? S.profile.seat.zone : '';
      S.profile.seatSel = sel; S.profile.seat = { ...zoneInfo(r, sel.i, sel.j), room_id: r.id };
      if (opts.log && prev !== S.profile.seat.zone) logProfileChange('seat', prev);
      save(); opts.onDone ? opts.onDone(prev) : route();
    };
  };
  draw();
}

function logProfileChange(what, prev = '') {
  if (!Array.isArray(S.profile_changes)) S.profile_changes = [];
  S.profile_changes.push({ at: isoLocal(), what, previous: prev, age: S.profile.age, sex: S.profile.sex, clothing: S.profile.clothing, clothing_garment: S.profile.garment || '', seat: S.profile.seat ? S.profile.seat.zone : '' });
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
      age: p.age, sex: p.sex, seat_position: p.seat.zone, clothing: p.clothing, clothing_garment: p.garment || '', measurement_interval_min: 20, device: device(), app_version: APP_VERSION, utc_offset: utcOffset(now) });
    save(); route();
  };
  loadLandmarker().catch(() => {});  // precarica il modello mentre lo studente prosegue
}

// ------------------------------------------------------------------ selfie: fotocamera dentro COMFY, con ripiego sull'app Fotocamera
let camStream = null, liveTimer = null;
function stopLive() { clearTimeout(liveTimer); liveTimer = null; }
function stopCam() { stopLive(); L.stopCamera(camStream); camStream = null; }

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
// illustrazione 3D (stesso modello della guida alla calibrazione): lo studente porta il telefono all'altezza degli occhi
function selfieIllustration() {
  return `<div class="ill3d"><video src="video/selfie3d_v1.mp4" poster="video/selfie3d_v1.jpg" autoplay muted loop playsinline preload="auto" aria-label="${esc(t('ill_3d'))}"></video><div class="lbl">${esc(t('ill_3d'))}</div></div>`;
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
    const sh = $('#shoot'); if (sh) { sh.disabled = false; sh.classList.remove('busy'); delete sh.dataset.busy; }
    if (camStream) startLive();
  }
  async function run(file, source) {
    const slow = busy();
    try {
      const r = await opts.analyze(file);
      clearTimeout(slow);
      if (r.exif.model) S.device = `${r.exif.make} ${r.exif.model}`.trim();
      r.glassesOverride = liveOverride;
      const g = r.glasses || { status: 'unknown' };
      if (!liveOverride && (g.status === 'detected' || g.status === 'possible')) {
        $('#msg').innerHTML = `<div class="glass warn">${GLASSES_ICON}<div>${t(g.status === 'detected' ? 'glasses_detected' : 'glasses_possible')}<small>${t('glasses_exp')}</small></div></div>
          <button class="btn out" id="gover" type="button">${t('glasses_override')}</button>`;
        const sh = $('#shoot'); if (sh) { sh.disabled = false; sh.classList.remove('busy'); delete sh.dataset.busy; }
        if (camStream) startLive();
        $('#gover').onclick = () => { r.glassesOverride = true; stopCam(); opts.onDone(r, source); };
        return;
      }
      stopCam(); opts.onDone(r, source);
    } catch (err) { clearTimeout(slow); failed(err, source); }
  }
  let liveOverride = false, liveGlasses = false;
  function cameraStage() {
    screen(`${head}<div class="camwrap"><video id="vid" playsinline muted autoplay></video><div class="oval" id="oval" aria-hidden="true"></div><div class="livebar" id="live" role="status" aria-live="polite"></div></div>
      <div id="gwarn"></div><div id="msg"></div><div class="spacer"></div>
      <div class="shutrow"><button class="shside" id="libb" type="button" aria-label="${t('cam_fallback')}">${IC.lib}</button>
        <button class="shutter" id="shoot" type="button" disabled aria-label="${t('cam_shoot')}"><i></i></button>
        ${opts.onBack ? `<button class="shside txt" id="back" type="button">${t('back')}</button>` : '<span class="shside"></span>'}</div>
      ${pickLabel(true, true)}</main>`);
    bindCommon();
    $('#libb').onclick = () => $('#pick').click();
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('cam_starting')}</div>`;
    L.startCamera($('#vid')).then(st => { camStream = st; $('#msg').innerHTML = ''; $('#shoot').disabled = false; startLive(); if (M) setTimeout(() => startCoach('cam', '.camwrap'), 500); })
      .catch(err => { console.error(err); $('#msg').innerHTML = errBox(t('cam_denied')); $('#pickl').hidden = false; });
    $('#shoot').onclick = async () => {
      if (!camStream) return;
      $('#shoot').disabled = true; $('#shoot').classList.add('busy'); $('#shoot').dataset.busy = '1';
      let file;
      try { file = await L.takePhoto(camStream); }
      catch (err) { console.error(err); $('#msg').innerHTML = errBox(t('cam_denied')); $('#pickl').hidden = false; $('#shoot').disabled = false; $('#shoot').classList.remove('busy'); delete $('#shoot').dataset.busy; return; }
      stopLive(); run(file, 'in_app_takephoto');
    };
  }
  // controllo dal vivo ogni ~0,7 s: volto nell'ovale e occhiali (come l'app Android: «toglili per continuare»)
  function startLive() {
    stopLive();
    const tick = async () => {
      if (!camStream || !$('#vid')) return stopLive();
      try {
        const q = await L.liveCheck($('#vid'));
        const live = $('#live'), ov = $('#oval'), sh = $('#shoot'), gw = $('#gwarn');
        if (!live) return stopLive();
        const g = q.glasses.status;
        liveGlasses = q.face && (g === 'detected' || g === 'possible') && !liveOverride;
        if (!q.face) { live.className = 'livebar'; live.textContent = t('live_noface'); ov.classList.remove('ok', 'bad'); }
        else if (liveGlasses) { live.className = 'livebar bad'; live.textContent = t(g === 'detected' ? 'glasses_detected_live' : 'glasses_possible_live'); ov.classList.add('bad'); ov.classList.remove('ok'); }
        else { live.className = 'livebar ok'; live.textContent = t('live_ready'); ov.classList.add('ok'); ov.classList.remove('bad'); }
        if (sh && !sh.dataset.busy) sh.disabled = liveGlasses;
        if (gw) gw.innerHTML = liveGlasses ? `<div class="glass warn">${GLASSES_ICON}<div>${t(g === 'detected' ? 'glasses_detected_live' : 'glasses_possible_live')}<small>${t('glasses_exp')}</small></div></div><button class="btn out" id="lover" type="button">${t('glasses_override')}</button>` : '';
        const lo = $('#lover'); if (lo) lo.onclick = () => { liveOverride = true; liveGlasses = false; gw.innerHTML = ''; if (sh) sh.disabled = false; };
      } catch (e) { console.warn('live', e); }
      liveTimer = setTimeout(tick, 700);
    };
    liveTimer = setTimeout(tick, 400);
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
let pendingRef = null, stopGuide = null;
const CAL_CLIPS = [1, 2, 3, 4].map(n => `video/cal3d_phone_step${n}.mp4`);
/** Animazione 3D della calibrazione con il telefono taratore: gli stessi 4 video dell'app Android (cal3d_phone_stepN). */
function showCalGuide(recal = false) {
  let step = 0, locked = false;
  const steps = STR[lang()].cal3d;
  app.innerHTML = `<main class="calguide">
    <div class="cgvideo"><video id="cgv" playsinline muted autoplay preload="auto"></video>
      <button class="cgback" id="cgx" type="button" aria-label="${t('back')}">‹</button></div>
    <div class="cgsheet"><div class="step">${t('cal3d_eyebrow')}</div><div class="cgcount" id="cgc"></div>
      <h1 id="cgt"></h1><p class="t" id="cgb"></p>
      <div class="cgnav"><button class="cgarrow" id="cgp" type="button" aria-label="${t('cal3d_prev')}">‹</button><div class="insdots dark" id="cgd"></div><button class="cgarrow" id="cgn" type="button" aria-label="${t('cal3d_next')}">›</button></div>
      <button class="btn" id="go" type="button">${t('cal3d_continue')}</button><button class="linkbtn" id="rep" type="button">${t('cal3d_replay')}</button></div></main>`;
  window.scrollTo(0, 0);
  const v = $('#cgv');
  const render = () => {
    $('#cgc').textContent = t('cal3d_counter', step + 1, 4); $('#cgt').textContent = steps[step][0]; $('#cgb').textContent = steps[step][1];
    $('#cgd').innerHTML = [0, 1, 2, 3].map(k => `<span class="${k === step ? 'on' : ''}"></span>`).join('');
    $('#cgp').disabled = step === 0; $('#cgn').disabled = step === 3;
  };
  const play = () => { v.src = CAL_CLIPS[step]; v.play().catch(() => {}); render(); };
  v.onended = () => { if (locked) { v.currentTime = 0; v.play().catch(() => {}); } else { step = (step + 1) % 4; play(); } };
  $('#cgp').onclick = () => { if (step > 0) { step--; locked = true; play(); } };
  $('#cgn').onclick = () => { if (step < 3) { step++; locked = true; play(); } };
  $('#rep').onclick = () => { step = 0; locked = false; play(); };
  $('#go').onclick = () => { v.pause(); showCalRef(recal); };
  $('#cgx').onclick = () => { v.pause(); recal ? route() : showCheckin(); };
  play();
}
function showCalRef(recal = false) {
  screen(`<main class="body">${topbar()}
    <div class="step">${recal ? t('home_recal').toUpperCase() : t('cal_eyebrow')}</div><h1>${t('cal_ref_title')}</h1><p class="t">${t('cal_ref_body')}</p>
    <label class="lab" for="ref">${t('cal_ref_label')}</label>
    <input id="ref" class="field big-input" type="number" inputmode="decimal" min="5" max="5000" step="1" placeholder="104" value="${pendingRef ?? ''}">
    <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>
    <button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = () => showCalGuide(recal);
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

function armIdle() { clearTimeout(idleTimer); idleAt = 0; if (C.isActive()) return; if (S.monitor.running && !inFlow && !S.monitor.pending && sound.running()) { idleAt = Date.now() + 20000; idleTimer = setTimeout(() => { if (!inFlow && $('#home')) showBlack(); }, 20000); } }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => armIdle(), { passive: true }));

function showBlack() {
  if (!S.monitor.running || inFlow || S.monitor.pending || C.isActive()) return;
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
  C.stop(); hideBlack();
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
  if (!activeK()) return showCalGuide(true);
  const now = Date.now();
  inFlow = true; C.stop(); hideBlack(); clearTimeout(idleTimer);
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
const cloText = (c, g) => g ? `${t('g_' + g)} (${cloLabel(c).toLowerCase()})` : cloLabel(c);

function stepClothing() {
  const cur = S.profile.clothing, curG = S.profile.garment || '', seat = S.profile.seat;
  let changed = M.clothingChanged ?? null, now = M.garmentNow || null, moved = M.seatChanged ?? null;
  const yn = (k, v) => `<div class="seg"><button type="button" data-${k}="no" class="${v === false ? 'on' : ''}">${t('no')}</button><button type="button" data-${k}="yes" class="${v === true ? 'on' : ''}">${t('yes')}</button></div>`;
  const draw = () => {
    screen(`<main class="body">${topbar()}<div class="step">${eyebrow(1)}</div>
      <div id="cloyn"><h1>${t('clo_title')}</h1><p class="t">${t('clo_current', cloText(cur, curG))}</p>${yn('v', changed)}</div>
      ${changed ? `<div class="lab">${t('clo_now')}</div>${garmentPicker('car', now)}` : ''}
      <h2 class="q2">${t('pos_title')}</h2><p class="t">${t('pos_current', t('seat_chosen', seat.rows, seat.seats))}</p>${yn('m', moved)}
      ${moved ? `<p class="t small">${t('pos_next')}</p>` : ''}
      <div id="msg"></div><div class="spacer"></div><button class="btn" id="go" type="button">${t('next')}</button>${cancelBtn}</main>`);
    app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { changed = b.dataset.v === 'yes'; draw(); });
    bindGarments('car', g => { now = g; });
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { moved = b.dataset.m === 'yes'; draw(); });
    $('#go').onclick = () => {
      if (changed == null || (changed && !now)) { $('#msg').innerHTML = errBox(t('clo_missing')); return; }
      if (moved == null) { $('#msg').innerHTML = errBox(t('pos_missing')); return; }
      M.clothingChanged = changed; M.clothingNow = changed ? garClass(now) : cur; M.garmentNow = changed ? now : curG; M.clothingPrevious = cur; M.garmentPrevious = curG; M.seatChanged = moved; M.seatPrevious = seat.zone;
      if (moved) showSeat({ fresh: true, eyebrow: eyebrow(1), title: t('pos_now'), onBack: stepClothing, onDone: () => stepSelfie() });
      else stepSelfie();
    };
    bindCancel(endFlow);
  };
  draw();
  setTimeout(() => startCoach('pre', '#cloyn'), 350);
}
function stepSelfie() {
  showCamera({ eyebrow: eyebrow(2), title: t('cam_title'), analyze: f => analyzeSelfie(f, { kPrime: activeK(), kPrimeCompact: activeKCompact() }),
    onDone: (r, src) => { M.light = r; M.selfieSource = src; stepGsv(); }, onBack: stepClothing });
}
function stepGsv() {
  let solar = M.solar ?? null;
  screen(`<main class="body">${topbar()}<div class="step">${eyebrow(3)}</div><h1>${t('gsv_title')}</h1><p class="t">${t('gsv_body')}</p>
    <div class="card" id="gsvcard">${gsvSlider('gsv', M.gsv ?? 0)}</div>
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
  setTimeout(() => startCoach('gsv', '#gsvcard'), 350);
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
    <div class="card" id="tsvcard"><div class="h">${t('tsv_q')}</div>${scaleSlider('tsv', M.tsv ?? 0, tsv, 'linear-gradient(90deg,#4F86C6,#E9E2DC 50%,#D9644A)')}</div>
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
  setTimeout(() => startCoach('tsv', '#tsvcard'), 350);
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
  if (M.clothingChanged) { S.profile.clothing = M.clothingNow; S.profile.garment = M.garmentNow; }
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
    glasses_user_override: !!r.glassesOverride, calibration_kprime_compact: activeKCompact() ?? '', ...compactFields(r),
    seat_changed: !!M.seatChanged, seat_previous: M.seatPrevious || '',
    clothing_garment: M.garmentNow || '', clothing_garment_previous: M.garmentPrevious || ''
  };
  S.measurements.push(rec); save();
  showResult(rec, metrics);
  M = null;
}
const soundWord = ncl => !Number.isFinite(ncl) || ncl < 6 ? t('sw_steady') : ncl < 12 ? t('sw_variable') : t('sw_very');
function showResult(rec, metrics) {
  const m5 = metrics[5] || {}, d = new Date(Date.parse(rec.capture_timestamp));
  const loc = lang() === 'it' ? 'it-IT' : 'en-GB';
  let date = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  date = date.charAt(0).toUpperCase() + date.slice(1);
  const sw = Number.isFinite(m5.laeq) ? soundWord(m5.ncl) : t('res_na');
  screen(`<main class="body result">
    <div class="badge" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="ck" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>
    <h1 class="rtitle">${t('res_done')}</h1><div class="rdate">${date}</div>
    <div class="rchip">${rec.trigger_type === 'scheduled' ? t('res_sched') : t('res_vol')}</div>
    <div class="rtiles"><div class="rtile"><span class="ric" style="background:#FBEFD9">${IC.sun.replace('#A4472B', '#C98A1E')}</span><div class="rl">${t('res_light')}</div><div class="rv">${fmt(+rec.ev_lux)}<small>lux</small></div></div>
      <div class="rtile"><span class="ric" style="background:#F6E4DC">${IC.eye}</span><div class="rl">${t('gsv_title')}</div><div class="rv sm">${STR[lang()].gsv[rec.gsv_level]}</div></div></div>
    <div class="rcard"><span class="ric" style="background:#E3EFE7">${IC.mic.replace('#A4472B', '#2E7D55')}</span><div><div class="rl">${t('res_sound')}</div><div class="rv2">${sw.charAt(0).toUpperCase() + sw.slice(1)}</div></div></div>
    ${S.monitor.running ? `<div class="rnext">${t('res_next', INTERVAL_MIN)}</div>` : ''}
    <div class="spacer"></div><button class="btn" id="go" type="button">${t('back_home')}</button>
    <button class="linkbtn" id="det" type="button">${t('res_details')}</button></main>`);
  $('#go').onclick = endFlow;
  $('#det').onclick = () => showDetails(rec, () => showResult(rec, metrics));
  setTimeout(() => startCoach('result', '.result'), 900);
}
function showDetails(rec, back) {
  const n = (x, dd = 0) => x === '' || x == null ? '–' : fmt(+x, dd);
  const rows = [['E<sub>v</sub>', n(rec.ev_lux) + ' lx'], ['E<sub>v</sub> sx · dx', n(rec.ev_left_lux) + ' · ' + n(rec.ev_right_lux) + ' lx'], ['ISO · t · f', `${rec.iso} · 1/${Math.round(1 / rec.exposure_s)} s · f/${n(rec.f_number, 1)}`],
    ['GSV', n(rec.gsv_continuous_0_100, 1) + ' / 100'], [t('glare_title'), rec.glare_source_type ? `${STR[lang()].src[rec.glare_source_type] || rec.glare_source_type} · ${n(rec.glare_source_theta_deg)}° · ${n(rec.glare_source_solid_angle_sr, 3)} sr` : '–'],
    ['TSV', n(rec.tsv_continuous, 2)], [t('ac_title'), n(rec.acoustic_discomfort_m3_p3, 2) + ' · ' + (STR[lang()].ac_src[rec.acoustic_source] || '')],
    ['L<sub>Aeq,5min</sub>', rec.sound5_laeq ? rec.sound5_laeq + ' dB' : '–'], ['L<sub>A10</sub> · L<sub>A50</sub> · L<sub>A90</sub>', [rec.sound5_la10, rec.sound5_la50, rec.sound5_la90].map(x => x || '–').join(' · ')],
    [t('rec_frac'), rec.sound5_frac_valid ? Math.round(rec.sound5_frac_valid * 100) + ' %' : '–'], ['k′', n(rec.calibration_kprime, 3)], [t('seat_title'), hy(rec.seat_rows) + ' · ' + hy(rec.seat_seats)]];
  screen(`<main class="body">${topbar()}<div class="step">${t('res_details').replace(' ›', '').toUpperCase()}</div><h1>${t('res_title')}</h1>
    <div class="card"><table class="kv">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>
    <p class="t small">${t('det_note')}</p><div id="msg"></div><div class="spacer"></div>
    <button class="btn" id="exp" type="button">${t('det_export')}</button><button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = back;
  $('#exp').onclick = async () => {
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('send_preparing')}</div>`;
    try { const pack = await researcherFiles(); $('#msg').innerHTML = ''; await shareFiles(pack.files, `COMFY – ${S.participant_id}`, '', $('#msg')); }
    catch (e) { $('#msg').innerHTML = errBox(t('export_err') + ' ' + e.message); }
  };
}
function endFlow() { C.stop(); stopCam(); M = null; inFlow = false; showHome(); if (S.monitor.running && sound.running()) setTimeout(showBlack, 1500); armIdle(); }

// ------------------------------------------------------------------ invio dei dati
function dayStr(ms = Date.now()) { return isoLocal(ms).slice(0, 10); }
function stamp(ms = Date.now()) { const s = isoLocal(ms); return s.slice(0, 10) + '_' + s.slice(11, 13) + s.slice(14, 16); }
function fileNames(ms = Date.now()) {
  const st = stamp(ms), p = S.participant_id;
  return { a: `COMFY_${p}_analisi_${st}.csv`, c: `COMFY_${p}_completo_${st}.csv`, s: `COMFY_${p}_suono_s_${st}.csv` };
}
async function researcherFiles() {
  const nm = fileNames(), secs = await sound.allSeconds();
  return { nm, files: [new File([X.buildAnalysis(S)], nm.a, { type: 'text/csv' }), new File([X.buildComplete(S)], nm.c, { type: 'text/csv' }), new File([X.buildSoundSeconds(secs, utcOffset)], nm.s, { type: 'text/csv' })] };
}
async function shareFiles(files, title, text, msgEl) {
  if (!(navigator.canShare && navigator.share) || !navigator.canShare({ files })) { msgEl.innerHTML = errBox(t('send_unsupported')); return false; }
  try { await navigator.share({ files, title, text }); return true; }
  catch (e) { if (e.name !== 'AbortError') msgEl.innerHTML = errBox(e.message); return false; }
}
function showSend(back = () => route()) {
  const n = S.measurements.length;
  screen(`<main class="body">${topbar()}<div class="step">${t('m_data')}</div><h1>${t('send_title')}</h1>
    ${n ? `<p class="t">${t('send_body')}</p><div class="card mail"><span id="addr">${RESEARCHER_EMAIL}</span><button class="lang" id="copy" type="button">${t('send_copy')}</button></div>
      <p class="t small">${t('send_files_note')}</p>` : `<p class="t">${t('send_none')}</p>`}
    <div id="msg"></div><div class="spacer"></div>
    ${n ? `<button class="btn" id="share" type="button">${t('send_share')}</button>` : ''}<button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = back;
  if (!n) return;
  $('#copy').onclick = () => {
    const done = () => { $('#copy').textContent = t('send_copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(RESEARCHER_EMAIL).then(done, () => {}); else done();
  };
  $('#share').onclick = async () => {
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('send_preparing')}</div>`;
    let pack; try { pack = await researcherFiles(); } catch (e) { $('#msg').innerHTML = errBox(t('export_err') + ' ' + e.message); return; }
    $('#msg').innerHTML = '';
    const ok = await shareFiles(pack.files, t('send_subject', S.participant_id, new Date().toLocaleDateString('it-IT')), t('send_text', S.participant_id, device(), APP_VERSION, n, pack.nm.a, pack.nm.c) + '\n' + t('send_text_sound', pack.nm.s), $('#msg'));
    if (ok) { S.sends.push({ at: isoLocal(), measurements: n }); save(); showSend(back); }
  };
}

// ------------------------------------------------------------------ dati di ricerca (come la «vista ricerca» Android)
function showResearch() {
  const ms = S.measurements.slice().reverse(), last = ms[0];
  const n = (x, d = 0) => x === '' || x == null ? '–' : fmt(+x, d);
  const key = last ? `<div class="kgrid"><div><span>E<sub>v</sub></span><b>${n(last.ev_lux)} lx</b></div><div><span>GSV</span><b>${n(last.gsv_continuous_0_100)}</b></div>
    <div><span>${t('tsv_q')}</span><b>${n(last.tsv_continuous, 1)}</b></div><div><span>${t('res_metric_ac')}</span><b>${n(last.acoustic_discomfort_m3_p3, 1)}</b></div>
    <div><span>L<sub>Aeq,5min</sub></span><b>${last.sound5_laeq ? last.sound5_laeq + ' dB' : '–'}</b></div><div><span>${t('rec_frac')}</span><b>${last.sound5_frac_valid ? Math.round(last.sound5_frac_valid * 100) + ' %' : '–'}</b></div></div>` : `<p class="t">${t('send_none')}</p>`;
  const list = ms.map((m, i) => `<button class="mrow" data-i="${S.measurements.length - 1 - i}" type="button"><span class="mt">${m.capture_timestamp.slice(11, 16)}</span>
    <span class="mi">${m.trigger_type === 'scheduled' ? t('res_sched') : t('res_vol')}<small>${n(m.ev_lux)} lx · GSV ${n(m.gsv_continuous_0_100)} · TSV ${n(m.tsv_continuous, 1)} · ${m.sound5_laeq ? m.sound5_laeq + ' dB' : '–'}</small></span><span class="mc">›</span></button>`).join('');
  const rem = S.reminders.length, started = S.reminders.filter(r => r.action === 'started').length, skipped = S.reminders.filter(r => r.action === 'skipped').length;
  screen(`<main class="body">${topbar()}<div class="step">${t('research_eyebrow')}</div><h1>${t('research_title')}</h1><p class="t">${t('research_sub')}</p>
    <div class="lab">${t('research_key')}${last ? ' · ' + last.capture_timestamp.slice(11, 16) : ''}</div><div class="card">${key}</div>
    <div class="lab">${t('research_list', S.measurements.length)}</div><div class="card list">${list || `<div class="s">${t('send_none')}</div>`}</div>
    <div class="card"><table class="kv"><tr><td>ID</td><td>${S.participant_id}</td></tr><tr><td>k′</td><td>${n(activeK(), 3)}</td></tr>
      <tr><td>${t('research_rem')}</td><td>${rem} · ${started} ${t('research_started')} · ${skipped} ${t('research_skipped')}</td></tr>
      <tr><td>${t('research_sound_s')}</td><td id="nsec">…</td></tr><tr><td>${t('version')}</td><td>${APP_VERSION}</td></tr></table></div>
    <div class="lab">${t('research_tools')}</div>
    <button class="card action" id="rsend" type="button"><div class="flex"><div class="ic">${IC.send}</div><div><div class="h">${t('send')}</div><div class="s">${t('research_send_s')}</div></div></div></button>
    <button class="card action" id="rall" type="button"><div class="flex"><div class="ic">${IC.lib}</div><div><div class="h">${t('research_all')}</div><div class="s">${t('research_all_s')}</div></div></div></button>
    <div id="msg"></div><button class="btn out" id="back" type="button">${t('back')}</button></main>`);
  $('#back').onclick = () => route();
  sound.allSeconds().then(s => { const el = $('#nsec'); if (el) el.textContent = `${s.length} s (${fmt(s.length / 3600, 1)} h)`; }).catch(() => {});
  app.querySelectorAll('.mrow').forEach(b => b.onclick = () => showDetails(S.measurements[+b.dataset.i], showResearch));
  $('#rsend').onclick = () => showSend(showResearch);
  $('#rall').onclick = async () => {
    $('#msg').innerHTML = `<div class="busy"><span class="spin"></span>${t('send_preparing')}</div>`;
    try {
      const pack = await researcherFiles(), st = stamp(), p = S.participant_id, f = (name, csv) => new File([csv], `COMFY_${p}_${name}_${st}.csv`, { type: 'text/csv' });
      const files = [...pack.files, f('calibrazioni', X.buildCalibrations(S)), f('promemoria', X.buildTable(S.reminders)), f('misure_prova_luce', X.buildTable(S.light_tests)),
        f('profilo', X.buildTable(S.profile_changes || [])), f('checkin', X.buildTable(S.baselines))];
      $('#msg').innerHTML = '';
      await shareFiles(files, `COMFY – ${p} – ${t('research_all')}`, '', $('#msg'));
    } catch (e) { $('#msg').innerHTML = errBox(t('export_err') + ' ' + e.message); }
  };
}

// ------------------------------------------------------------------ Home (proposta C: il quadrante dei 10 minuti)
const BELL = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`;
const MOON_S = MOON_I.replace(/width="18" height="18"/, 'width="13" height="13"');
function ringSvg(p, col, dim) {
  const size = 204, sw = 11, c0 = size / 2, r = c0 - sw / 2 - 2, c = 2 * Math.PI * r;
  return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${sw}"/>${p > 0.003
    ? `<circle cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${c0} ${c0})"${dim ? ' opacity=".35"' : ''}/>` : ''}</svg>`;
}
function ringState() {
  const mon = S.monitor, now = Date.now();
  if (!mon.running) return { p: 0, inner: `<div class="rlbl">${t('c_off')}</div><div class="roff">${t('c_off_b')}</div>` };
  if (mon.pending) {
    const m = Math.max(0, Math.floor((now - mon.pending.dueMs) / 60000));
    return { p: 1, col: 'var(--due)', inner: `<div class="bell">${BELL}</div><div class="rdue">${t('c_due')}</div><div class="rat">${t('c_due_s', hhmm(mon.pending.dueMs), m)}</div>` };
  }
  const tot = (mon.snoozed ? 2 : INTERVAL_MIN) * 60000, rem = Math.max(0, (mon.nextDueMs || now) - now), p = Math.max(0, Math.min(1, 1 - rem / tot));
  if (monitoringPaused()) return { p, col: 'var(--mute)', dim: true, inner: `<div class="rlbl">${t('c_paused')}</div><div class="roff">${t('c_paused_b')}</div>` };
  const big = rem >= 60000 ? `${Math.ceil(rem / 60000)}<small> min</small>` : `${Math.ceil(rem / 1000)}<small> s</small>`;
  return { p, col: 'var(--brand)', inner: `<div class="rlbl br">${t('c_next')}</div><div class="rmin">${big}</div><div class="rat">${t('c_at', hhmm(mon.nextDueMs))}</div>` };
}
function ringHtml() { const rs = ringState(); return `<div class="ringbox" id="ring" role="timer">${ringSvg(rs.p, rs.col, rs.dim)}<div class="ringin">${rs.inner}</div></div>`; }
function barsSvg() {
  // ultimi 5 minuti: 60 barre da 5 s (media energetica dei livelli al secondo)
  const n = 60, step = 5, end = Math.floor(Date.now() / 1000), W = 600, H = 40, bw = W / n;
  const acc = new Map();
  for (const x of sound.history) {
    if (x.e <= end - n * step || x.e > end || !Number.isFinite(x.la)) continue;
    const k = Math.floor((x.e - (end - n * step) - 1) / step), a = acc.get(k) || [0, 0];
    a[0] += Math.pow(10, x.la / 10); a[1]++; acc.set(k, a);
  }
  const m = new Map([...acc].map(([k, [e, c]]) => [end - n + 1 + k, 10 * Math.log10(e / c)]));
  // scala adattiva sugli ultimi 30 s (almeno 12 dB): le variazioni del suono si vedono anche in un'aula tranquilla
  const vals = [...m.values()].filter(Number.isFinite), lo = vals.length ? Math.min(...vals) - 2 : 30, hi = Math.max(lo + 12, vals.length ? Math.max(...vals) + 1 : 42);
  let o = '';
  for (let i = 0; i < n; i++) {
    const la = m.get(end - n + 1 + i), ok = Number.isFinite(la), v = ok ? Math.max(0.12, Math.min(1, (la - lo) / (hi - lo))) : 0.06, h = Math.max(3, H * v);
    o += `<rect x="${(i * bw + bw * 0.2).toFixed(1)}" y="${((H - h) / 2).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${h.toFixed(1)}" rx="${(bw * 0.3).toFixed(1)}" fill="var(--brand)" opacity="${ok ? (0.35 + 0.65 * v).toFixed(2) : 0.2}"/>`;
  }
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${o}</svg>`;
}
const laText = () => Number.isFinite(sound.lastLa) ? fmt(sound.lastLa, 0) + ' dB' : '– dB';
const recPct = () => Math.round(sound.fracValid(300) * 100);
const sndCard = () => `<div class="card sndcard" id="snd"><div class="sndrow"><span class="s"><span class="dot"></span>${t('c_listen')}</span><span class="sndv" id="sndv">${laText()}</span></div>
  <div id="bars">${barsSvg()}</div><div class="sndax tiny"><span>${t('c_5min')}</span><span id="recf">${t('c_rec', recPct())}</span><span>${t('c_now')}</span></div></div>`;
function chipText() {
  const mon = S.monitor, now = Date.now();
  if (!mon.running || monitoringPaused() || mon.pending) return '';
  if (mon.lastSkipped && now < mon.lastSkipped.nextMs) return t('c_skipped', hhmm(mon.lastSkipped.dueMs));
  if (mon.snoozed) return t('c_snoozed', hhmm(mon.nextDueMs));
  return '';
}
const homeSigNow = () => [S.monitor.running, monitoringPaused(), !!S.monitor.pending, chipText(), lang(), themeEff()].join('|');
let homeSig = '', ringInner = '';
function showHome() {
  const mon = S.monitor;
  const paused = monitoringPaused(), live = mon.running && !paused, chip = chipText();
  const pausedHero = `<div class="warnhero"><div class="h">${t('mon_paused', hhmm(mon.pausedSinceMs || Date.now()))}</div><p class="t" style="margin:4px 0 10px">${t('mon_rules')}</p><button class="btn" id="start" type="button">${t('mon_resume')}</button></div>`;
  const sw = `<div class="card swcard"><div class="flex"><div class="ic">${IC.mic}</div><div style="flex:1"><div class="h">${t('mon_switch')}</div><div class="s">${!mon.running ? t('mon_switch_off') : paused ? t('b_paused') : t('mon_switch_on')}</div></div>
      <button class="sw ${mon.running ? 'on' : ''}" id="sw" type="button" role="switch" aria-checked="${mon.running}" aria-label="${t('mon_switch')}"><i></i></button></div></div>`;
  const vol = `<button class="card volb ${live ? 'glow' : ''}" id="vol" type="button"><div class="flex"><div class="ic">${IC.face.replace('#A4472B', '#fff')}</div><div><div class="h">${t('vol')}</div><div class="s">${t('vol_s')}</div></div><span class="chev" aria-hidden="true">›</span></div></button>`;
  const dim = `<button class="dimhint" id="dimhint" type="button">${MOON_S}<span id="dimt">${dimText()}</span></button>`;
  const off = navigator.onLine === false ? `<div class="offchip">${t('offline_home')}</div>` : '';
  // Home A: anello che riempie l'altezza disponibile, «Segnala» grande, suono compatto
  const grow = inner => `<div class="hgrow">${inner}</div>`;
  const body = live && mon.pending
    ? `${grow(`${ringHtml()}<button class="btn big" id="go" type="button">${t('b_go')}</button>${sndCard()}`)}${sw}<div id="msg"></div>`
    : live ? `${grow(`${ringHtml()}${chip ? `<div class="cchip" id="cchip">${chip}</div>` : ''}${vol}${sndCard()}`)}${sw}<div id="msg"></div>${dim}`
    : `${paused ? pausedHero : ''}${grow(`${ringHtml()}${vol}`)}${sw}<div id="msg"></div>`;
  screen(`<main class="body homea ${paused ? 'paused' : ''} ${chip && live && !mon.pending ? 'haschip' : ''}" id="home">${topbar('home')}${off}${body}
    <div class="foot">${t('version')} ${APP_VERSION} · ${S.participant_id}</div></main>`);
  homeSig = homeSigNow(); ringInner = ringState().inner;
  const st = $('#start'); if (st) st.onclick = startMonitoring;
  const dh = $('#dimhint'); if (dh) dh.onclick = showBlack;
  const go = $('#go'); if (go) go.onclick = () => startMeasurement('scheduled', mon.pending.dueMs);
  const v = $('#vol'); if (v) v.onclick = () => startMeasurement('user_initiated');
  $('#sw').onclick = () => mon.running ? confirmStop() : startMonitoring();
  if (!(S.coachSeen && S.coachSeen.home)) setTimeout(() => startCoach('home', '#home'), 500);
}
let idleAt = 0;
function dimText() { const s = Math.max(0, Math.ceil((idleAt - Date.now()) / 1000)); return idleAt && s > 0 ? t('c_dim', s) : t('c_dim_now'); }
function updateHome() {
  if (!$('#home')) return;
  if (homeSigNow() !== homeSig) { if (!document.getElementById('menu') && !($('#msg') && $('#msg').innerHTML)) showHome(); return; }
  if (!S.monitor.running) return;
  const rs = ringState(), r = $('#ring');
  if (r) { r.firstElementChild.outerHTML = ringSvg(rs.p, rs.col, rs.dim); if (rs.inner !== ringInner) { r.lastElementChild.innerHTML = rs.inner; ringInner = rs.inner; } }
  const v = $('#sndv'); if (v) v.textContent = laText();
  const b = $('#bars'); if (b) b.innerHTML = barsSvg();
  const f = $('#recf'); if (f) f.textContent = t('c_rec', recPct());
  const d = $('#dimt'); if (d) d.textContent = dimText();
}

// ------------------------------------------------------------------ tutorial (come i CoachMarks dell'app Android)
const COACH_SEQ = {
  home: [['#ring', 'home_ring'], ['.swcard', 'home_monitor'], ['#snd', 'home_sound'], ['#vol', 'home_voluntary'], ['#tlbox', 'home_look'], ['#menub', 'home_menu']],
  pre: [['#cloyn', 'pre']], cam: [['.camwrap', 'cam']], gsv: [['#gsvcard', 'gsv']], tsv: [['#tsvcard', 'tsv']],
  result: [['#det', 'res_data'], ['#go', 'res_home'], [null, 'res_wait']]
};
function startCoach(key, guard) {
  if (!S.coachSeen) S.coachSeen = {};
  if (S.coachSeen[key] || C.isActive() || reminderOpen || document.getElementById('menu') || (guard && !document.querySelector(guard))) return;
  const bl = $('#black'); if (bl && !bl.hidden) return;
  let seq = COACH_SEQ[key];
  if (key === 'result' && !S.monitor.running) seq = seq.slice(0, 2);
  const co = STR[lang()].coach;
  const ok = C.run(seq.map(([sel, k]) => ({ sel, title: co[k][0], body: co[k][1] })),
    { skip: t('coach_skip'), next: t('coach_next'), done: t('coach_done'), counter: (n, N) => t('coach_counter', n, N) },
    completed => { if (completed) { S.coachSeen[key] = Date.now(); save(); } armIdle(); });
  if (ok) { clearTimeout(idleTimer); idleAt = 0; }
}

function confirmStop() {
  const m = $('#msg');
  m.innerHTML = `<div class="card"><p class="t" style="margin-bottom:10px">${t('mon_stop_confirm')}</p><div class="seg"><button type="button" id="sy">${t('mon_stop_yes')}</button><button type="button" id="sn" class="on">${t('mon_stop_no')}</button></div></div>`;
  $('#sy').onclick = stopMonitoring; $('#sn').onclick = () => { m.innerHTML = ''; };
}

// ------------------------------------------------------------------ menu
function showMenu() {
  hideBlack();
  C.stop();
  const el = document.createElement('div'); el.id = 'menu';
  el.innerHTML = `<div class="dim"></div><nav class="sheet" aria-label="${t('menu')}">
    <div class="sec">${t('m_data')}</div>
    <button type="button" data-a="send"><span class="ic">${IC.send}</span>${t('send')}</button>
    <button type="button" data-a="research"><span class="ic">${IC.lib}</span>${t('research_title')}</button>
    <div class="sec">${t('m_mon')}</div>
    <button type="button" data-a="profile"><span class="ic">${IC.user}</span>${t('menu_profile')}</button>
    <button type="button" data-a="test"><span class="ic">${IC.sun}</span>${t('home_test')}</button>
    <button type="button" data-a="recal"><span class="ic">${IC.cam}</span>${t('home_recal')}</button>
    <div class="sec">${t('m_help')}</div>
    <button type="button" data-a="tutorial"><span class="ic">${IC.help}</span>${t('tut_menu')}</button>
    <button type="button" data-a="help"><span class="ic">${IC.user}</span>${t('ins_menu')}</button>
    <button type="button" data-a="lang"><span class="ic">${IC.globe}</span>${t('menu_lang')}: ${lang() === 'it' ? 'Italiano' : 'English'}</button>
    <button type="button" data-a="theme"><span class="ic">${IC.moon}</span>${t('th_title_menu')}: ${t(S.theme === 'dark' ? 'th_dark' : S.theme === 'light' ? 'th_light' : 'th_auto')}</button>
    <div class="foot">${t('version')} ${APP_VERSION}</div></nav>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('.dim').onclick = close;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    close();
    const a = b.dataset.a;
    if (a === 'send') showSend(); else if (a === 'research') showResearch(); else if (a === 'test') showLightTest(); else if (a === 'recal') showCalGuide(true);
    else if (a === 'profile') showProfile(() => showSeat({ eyebrow: t('menu_profile').toUpperCase(), log: true, onDone: () => route(), onBack: () => showProfile(() => route()) }));
    else if (a === 'help') showInstructions(0, true); else if (a === 'lang') { S.lang = lang() === 'it' ? 'en' : 'it'; save(); route(); }
    else if (a === 'theme') { S.theme = !S.theme || S.theme === 'auto' ? 'light' : S.theme === 'light' ? 'dark' : 'auto'; save(); applyTheme(); route(); showMenu(); }
    else if (a === 'tutorial') { S.coachSeen = {}; save(); route(); }
  });
}

// ------------------------------------------------------------------ gesto indietro: scorri dal bordo sinistro verso destra, come nelle app Apple
(() => {
  let on = false, decided = false, sx = 0, sy = 0, st = 0, dx = 0, target = null;
  const backTarget = () => {
    if (document.getElementById('menu')) return 'menu';
    for (const sel of ['#back', '#cancel', '#cgx']) { const b = document.querySelector(sel); if (b && !b.disabled && b.offsetParent !== null) return b; }
    return null;
  };
  const reset = (anim) => { app.style.transition = anim ? 'transform .2s ease-out' : ''; app.style.transform = ''; if (anim) setTimeout(() => { app.style.transition = ''; }, 220); };
  document.addEventListener('touchstart', e => {
    on = false;
    if (e.touches.length !== 1 || C.isActive() || reminderOpen) return;
    const p = e.touches[0];
    if (p.clientX > 24 || (e.target.closest && e.target.closest('input[type=range],canvas,.car'))) return;
    const bl = $('#black'); if (bl && !bl.hidden) return;
    target = backTarget(); if (!target) return;
    on = true; decided = false; sx = p.clientX; sy = p.clientY; st = Date.now(); dx = 0;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!on) return;
    const p = e.touches[0]; dx = p.clientX - sx; const dy = p.clientY - sy;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) { on = false; return; }
      decided = true;
    }
    if (e.cancelable) e.preventDefault();
    if (target !== 'menu') { app.style.transition = 'none'; app.style.transform = `translateX(${Math.max(0, dx)}px)`; }
  }, { passive: false });
  const end = () => {
    if (!on) return; on = false;
    if (!decided) return;
    const v = dx / Math.max(1, Date.now() - st), go = dx > Math.min(120, window.innerWidth * 0.3) || (dx > 40 && v > 0.5);
    if (target === 'menu') { if (go) { const m = document.getElementById('menu'); if (m) m.remove(); } return; }
    if (!go) return reset(true);
    app.style.transition = 'transform .18s ease-in'; app.style.transform = `translateX(${window.innerWidth}px)`;
    const tg = target;
    setTimeout(() => { app.style.transition = 'none'; app.style.transform = ''; if (tg.isConnected) tg.click(); setTimeout(() => { app.style.transition = ''; }, 30); }, 180);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (on && decided) reset(true); on = false; }, { passive: true });
})();

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

window.addEventListener('online', () => { if ($('#home') && !inFlow) showHome(); });
window.addEventListener('offline', () => { if ($('#home') && !inFlow) showHome(); });
