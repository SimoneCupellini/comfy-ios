// COMFY web (iPhone) – file per il ricercatore: stessi due CSV dell'app Android 2.19.26.
//  - analisi: le 69 colonne di AnalysisExport.kt, con check-in iniziale e calibrazione uniti per partecipante;
//  - completo: tutte le colonne del file delle misure di DataLogger.kt (temperatura vuota) + colonne della versione iPhone.
import { N_BANDS, bandLabel } from './sound.js';

const SOUND_FULL = ['frac_valid', 'screen_on_frac', 'laeq', 'la10', 'la50', 'la90', 'ncl', 'meq', 'ir3', 'dlaeq_prev', 'dl_low_prev', 'dl_mid_prev', 'dl_high_prev', 'dshape_prev'];
const SOUND_SHORT = ['frac_valid', 'laeq', 'ncl', 'meq', 'dlaeq_prev'];
export const SOUND_COLUMNS = ['sound_anchor_timestamp', 'sound_status', 'sound_audio_source', ...SOUND_FULL.map(x => 'sound5_' + x),
  ...[1, 10, 30].flatMap(w => SOUND_SHORT.map(x => `sound${w}_${x}`)), ...Array.from({ length: N_BANDS }, (_, i) => `sound5_lzeq_${bandLabel(i)}`)];

export const COMPLETE_COLUMNS = [
  'participant_id', 'session_id', 'measurement_id', 'capture_timestamp', 'survey_timestamp', 'trigger_type',
  'tair_c', 'tair_timestamp', 'tair_battery_c', 'tair_screen_off_s', 'tair_project_rest_criterion_met', 'tair_status', 'tair_age_s',
  'tair_rule', 'tair_episode_off_s', 'tair_latest_off_estimate_c',
  'tair_5min_median_c', 'tair_5min_mean_c', 'tair_5min_sd_c', 'tair_5min_battery_mean_c', 'tair_5min_battery_drift_c_per_min', 'tair_5min_tair_drift_c_per_min', 'tair_5min_samples',
  'aggregation_method', 'robust5_tair_c', 'plateau_tair_c', 'plateau_age_s', 'robust_vs_plateau_delta_c', 'battery_transition_pending',
  'tair_last_valid_before_charge_c', 'tair_last_valid_before_charge_timestamp', 'tair_last_valid_before_charge_epoch_ms', 'tair_last_valid_before_charge_age_s', 'tair_last_valid_before_charge_aggregation_method', 'tair_last_valid_before_charge_reference', 'tair_before_charge_status',
  'tair_quality', 'tair_quality_flags', 'sound5_quality', 'sound5_quality_flags',
  'ev_left_lux', 'ev_right_lux', 'ev_bilateral_mean_lux', 'ev_left_right_asymmetry', 'light_aggregation_method', 'bilateral_diagnostic_method', 'light_quality_flags', 'periocular_left_clipping_ratio', 'periocular_right_clipping_ratio',
  'ev_lux', 'gsv_continuous_0_100', 'gsv_level', 'gsv_label', 'direct_solar_exposure',
  'thermal_survey_timestamp', 'tsv_continuous', 'tsv_level', 'tsv_label', 'thermal_preference', 'thermal_acceptability',
  'acoustic_discomfort_m3_p3', 'acoustic_discomfort_level', 'acoustic_discomfort_label', 'acoustic_source',
  'age', 'sex', 'seat_position', 'clothing', 'clothing_changed', 'clothing_previous', 'measurement_interval_min',
  'iso', 'exposure_s', 'f_number', 'ym_left', 'ym_right', 'ym_combined', 'iod_px',
  'face_quality_score', 'center_score', 'size_score', 'stability_score', 'yaw_deg', 'pitch_proxy', 'roll_deg',
  'roi_clipping_ratio', 'roi_left_right_difference', 'roi_roll_deg', 'roi_method',
  'ym_periocular_left', 'ym_periocular_right', 'ym_periocular', 'iod_periocular_px', 'periocular_clipping_ratio',
  'calibration_kprime_periocular', 'ev_periocular_lux', 'periocular_method',
  'glasses_status', 'glasses_confidence',
  'glare_diagram_shown', 'glare_skip_reason', 'glare_source_type', 'glare_source_zone',
  'glare_source_x', 'glare_source_y', 'glare_source_theta_deg', 'glare_source_phi_deg',
  'glare_source_theta_min_deg', 'glare_source_theta_max_deg', 'glare_source_solid_angle_sr', 'glare_source_area_frac',
  'glare_source_polygon', 'context_capture_mode',
  'device', 'calibration_kprime', 'phone_als_lux', 'app_version', 'utc_offset',
  ...SOUND_COLUMNS,
  // colonne della versione iPhone (web)
  'platform', 'room_id', 'seat_zone', 'seat_rows', 'seat_seats', 'seat_dist_window_m', 'selfie_source', 'selfie_capture_timestamp', 'selfie_age_s', 'lens_model', 'image_px',
  'reminder_timestamp', 'monitoring_started_timestamp', 'glasses_user_override',
  // ROI alta-guancia compatta (solo confronto, non usata per Ev)
  'ym_compact_left', 'ym_compact_right', 'ym_compact', 'roi_compact_pixels', 'roi_compact_clipping_ratio', 'roi_compact_left_right_difference', 'calibration_kprime_compact', 'ev_compact_lux', 'roi_compact_method',
  'seat_changed', 'seat_previous', 'clothing_garment', 'clothing_garment_previous'
];

export const ANALYSIS_COLUMNS = [
  'participant_id', 'session_id', 'measurement_id', 'capture_timestamp', 'survey_timestamp', 'utc_offset', 'trigger_type', 'device',
  'age', 'sex', 'seat_position', 'clothing', 'clothing_changed', 'glasses_status',
  'baseline_timestamp', 'baseline_gsv_continuous_0_100', 'baseline_gsv_level',
  'ev_lux', 'light_quality_flags', 'gsv_continuous_0_100', 'gsv_level', 'direct_solar_exposure',
  'glare_diagram_shown', 'glare_skip_reason', 'glare_source_type', 'glare_source_zone',
  'glare_source_theta_deg', 'glare_source_phi_deg', 'glare_source_solid_angle_sr', 'glare_source_area_frac',
  'calibration_kprime', 'calibration_timestamp', 'calibration_reference_lux', 'calibration_reference_type',
  'tair_c', 'tair_quality', 'tair_quality_flags', 'tair_rule', 'aggregation_method', 'tair_screen_off_s',
  'tair_status', 'tair_before_charge_status', 'tair_last_valid_before_charge_c', 'tair_last_valid_before_charge_age_s',
  'tsv_continuous', 'tsv_level', 'thermal_preference', 'thermal_acceptability',
  'acoustic_discomfort_m3_p3', 'acoustic_discomfort_level', 'acoustic_source',
  'sound5_quality', 'sound5_quality_flags', 'sound5_frac_valid', 'sound5_screen_on_frac', 'sound5_laeq', 'sound5_la10', 'sound5_la50', 'sound5_la90',
  'sound5_ncl', 'sound5_meq', 'sound5_dlaeq_prev',
  'sound1_frac_valid', 'sound1_laeq', 'sound10_frac_valid', 'sound10_laeq', 'sound30_frac_valid', 'sound30_laeq',
  'app_version'
];

function cell(v) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}
const toCsv = (cols, rows) => cols.join(',') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n') + (rows.length ? '\n' : '');
const epoch = ts => { const t = Date.parse(ts || ''); return Number.isFinite(t) ? t : null; };

export function buildAnalysis(S) {
  const rows = S.measurements.map(m => {
    const base = [...S.baselines].reverse().find(b => b.session_id === m.session_id) || S.baselines[S.baselines.length - 1];
    const t = epoch(m.survey_timestamp) ?? epoch(m.capture_timestamp);
    const cal = [...S.calibrations].filter(c => t == null || (epoch(c.timestamp) ?? Infinity) <= t).pop();
    return { ...m, baseline_timestamp: base?.timestamp, baseline_gsv_continuous_0_100: base?.gsv_continuous_0_100, baseline_gsv_level: base?.gsv_level,
      calibration_timestamp: cal?.timestamp, calibration_reference_lux: cal?.reference_lux, calibration_reference_type: cal?.reference_type };
  });
  return toCsv(ANALYSIS_COLUMNS, rows);
}
export const buildComplete = S => toCsv(COMPLETE_COLUMNS, S.measurements);
export const buildCalibrations = S => {
  const cols = ['participant_id', 'session_id', 'timestamp', 'device', 'reference_lux', 'iso', 'exposure_s', 'f_number', 'ym_left', 'ym_right', 'ym_combined', 'iod_px', 'roi_clipping_ratio', 'roi_left_right_difference', 'roi_roll_deg', 'face_quality_score', 'calibration_kprime', 'ym_periocular', 'iod_periocular_px', 'calibration_kprime_periocular', 'phone_als_lux', 'roi_method', 'periocular_method', 'ev_left_lux', 'ev_right_lux', 'ev_bilateral_mean_lux', 'ev_left_right_asymmetry', 'light_aggregation_method', 'bilateral_diagnostic_method', 'light_quality_flags', 'periocular_left_clipping_ratio', 'periocular_right_clipping_ratio', 'reference_type', 'app_version', 'utc_offset', 'capture_timestamp', 'selfie_age_s', 'lens_model', 'image_px', 'selfie_source'];
  return toCsv(cols, S.calibrations);
};

/** Riga del file completo a partire dalle parti della misura. */
export function soundFields(metrics, anchorIso, status, source, quality) {
  const f = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d) : '';
  const out = { sound_anchor_timestamp: anchorIso, sound_status: status, sound_audio_source: source, sound5_quality: quality.level, sound5_quality_flags: quality.flags };
  const r5 = metrics[5] || {};
  const full = [['frac_valid', r5.fracValid, 2], ['screen_on_frac', NaN, 3], ['laeq', r5.laeq], ['la10', r5.la10], ['la50', r5.la50], ['la90', r5.la90], ['ncl', r5.ncl], ['meq', r5.meq], ['ir3', r5.ir3, 0],
    ['dlaeq_prev', r5.dLaeq], ['dl_low_prev', r5.dLow], ['dl_mid_prev', r5.dMid], ['dl_high_prev', r5.dHigh], ['dshape_prev', r5.dForma]];
  full.forEach(([k, v, d]) => out['sound5_' + k] = f(v, d ?? 1));
  [1, 10, 30].forEach(w => { const r = metrics[w] || {}; [['frac_valid', r.fracValid, 2], ['laeq', r.laeq], ['ncl', r.ncl], ['meq', r.meq], ['dlaeq_prev', r.dLaeq]].forEach(([k, v, d]) => out[`sound${w}_${k}`] = f(v, d ?? 1)); });
  for (let i = 0; i < N_BANDS; i++) out[`sound5_lzeq_${bandLabel(i)}`] = f(r5.bands ? r5.bands[i] : NaN);
  return out;
}

/** Storico sonoro continuo al secondo (come il file sound_s dell'app Android): un secondo per riga. */
export function buildSoundSeconds(secs, utc) {
  const p = n => String(n).padStart(2, '0');
  const cols = ['date', 'time', 'epoch_s', 'utc_offset', 'state', 'laeq_1s', 'lzeq_1s', 'laeq_1s_raw', ...Array.from({ length: N_BANDS }, (_, i) => `lzeq_${bandLabel(i)}`)];
  const rows = secs.slice().sort((a, b) => a.e - b.e).map(s => {
    const d = new Date(s.e * 1000);
    const r = { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, epoch_s: s.e,
      utc_offset: utc(s.e * 1000), state: s.st || (s.la == null ? 'invalid' : 'ok'), laeq_1s: s.la, lzeq_1s: s.lz, laeq_1s_raw: s.raw ?? s.la };
    for (let i = 0; i < N_BANDS; i++) r[`lzeq_${bandLabel(i)}`] = s.b ? s.b[i] : '';
    return r;
  });
  return toCsv(cols, rows);
}
/** Tabella generica (registro dei promemoria, modifiche del profilo, misure di prova, calibrazioni). */
export function buildTable(rows) {
  const cols = []; rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
  return toCsv(cols.length ? cols : ['empty'], rows);
}
