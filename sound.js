// COMFY web (iPhone) – modulo suono.
// Porting di SoundProcessor.kt e SoundStore.kt dell'app Android 2.19.26 (metodo OpeNoise):
// blocchi FFT di 8192 campioni con finestra di Hann, 32 bande di 1/3 d'ottava, ponderazione A,
// media energetica per secondo; finestre di 1, 5, 10 e 30 minuti con percentili, NCl, Meq, IR3 e variazioni.
// Livelli NON calibrati (stessa scala dB re 20 uPa dell'app Android, valida solo sullo stesso telefono).

export const N_BANDS = 32;
export const BAND_CENTERS = [16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
export const bandLabel = i => String(BAND_CENTERS[i]);
export const WINDOWS_MIN = [1, 5, 10, 30];
export const MIN_VALID_FRACTION = 0.8;
export const AUDIO_SOURCE = 'WEB_ECHO_CANCELLATION_OFF';
const HISTORY_S = 3600;
const LOW = [8, 14], MID = [15, 21], HIGH = [22, 27];

const WORKLET = `
const EDGES=[14.1,17.8,22.4,28.2,35.5,44.7,56.2,70.8,89.1,112,141,178,224,282,355,447,562,708,891,1122,1413,1778,2239,2818,3548,4467,5623,7079,8913,11220,14130,17780,22390];
function aDb(f){const f2=f*f,f4=f2*f2,t1=Math.pow(20.598997*20.598997+f2,2),t2=107.65265*107.65265+f2,t3=737.86223*737.86223+f2,t4=Math.pow(12194.217*12194.217+f2,2);return 10*Math.log10((3.5041384e16*f4*f4)/(t1*t2*t3*t4));}
class Opn extends AudioWorkletProcessor{
  constructor(){super();const n=8192;this.n=n;this.half=n/2;this.buf=new Float64Array(n);this.fill=0;
    this.win=new Float64Array(n);for(let i=0;i<n;i++)this.win[i]=0.5*(1-Math.cos(2*Math.PI*i/(n-1)));
    const df=sampleRate/n;this.aLin=new Float64Array(this.half);this.band=new Int16Array(this.half);
    for(let k=0;k<this.half;k++){const f=k*df;this.aLin[k]=k===0?0:Math.pow(10,aDb(f)/10);let b=-1;for(let j=0;j<32;j++){if(f>=EDGES[j]&&f<EDGES[j+1]){b=j;break}}this.band[k]=b;}
    this.cosT=new Float64Array(this.half);this.sinT=new Float64Array(this.half);for(let i=0;i<this.half;i++){this.cosT[i]=Math.cos(2*Math.PI*i/n);this.sinT[i]=-Math.sin(2*Math.PI*i/n);}
    const bits=Math.round(Math.log2(n));this.rev=new Int32Array(n);for(let i=0;i<n;i++){let x=i,r=0;for(let b=0;b<bits;b++){r=(r<<1)|(x&1);x>>=1}this.rev[i]=r;}
    this.re=new Float64Array(n);this.im=new Float64Array(n);this.reset();this.secSamples=0;}
  reset(){this.sumZ=0;this.sumA=0;this.sumB=new Float64Array(32);this.blocks=0;this.zero=0;}
  block(){const n=this.n,re=this.re,im=this.im;let allZero=true;
    for(let i=0;i<n;i++){const s=this.buf[i];if(s!==0)allZero=false;const j=this.rev[i];re[j]=s*this.win[i];im[j]=0;}
    this.blocks++;if(allZero){this.zero++;return}
    for(let size=2;size<=n;size*=2){const h=size/2,step=n/size;for(let i=0;i<n;i+=size){let k=0;for(let j=i;j<i+h;j++){const l=j+h;const tr=re[l]*this.cosT[k]-im[l]*this.sinT[k],ti=re[l]*this.sinT[k]+im[l]*this.cosT[k];re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti;k+=step;}}}
    let z=0,a=0;const P2=0.00002*0.00002;
    for(let k=1;k<this.half;k++){const mag=2*Math.sqrt(re[k]*re[k]+im[k]*im[k])/n;const lin=mag*mag/P2;z+=lin;a+=lin*this.aLin[k];const b=this.band[k];if(b>=0)this.sumB[b]+=lin;}
    this.sumZ+=z;this.sumA+=a;}
  process(inputs){const ch=inputs[0]&&inputs[0][0];if(!ch)return true;
    for(let i=0;i<ch.length;i++){this.buf[this.fill++]=ch[i];if(this.fill===this.n){this.block();this.fill=0;}}
    this.secSamples+=ch.length;
    if(this.secSamples>=sampleRate){this.secSamples-=sampleRate;
      if(this.blocks>0){const B=this.blocks,db=x=>x>0?10*Math.log10(x/B):NaN;const bands=new Array(32);for(let i=0;i<32;i++)bands[i]=db(this.sumB[i]);
        this.port.postMessage({laeq:db(this.sumA),lzeq:db(this.sumZ),bands,blocks:B,zero:this.zero});}
      this.reset();}
    return true;}
}
registerProcessor('opn',Opn);`;

// ------------------------------------------------------------------ storico (memoria + IndexedDB)
const e = db => Math.pow(10, db / 10);
const dbOf = x => x > 0 ? 10 * Math.log10(x) : NaN;
function groupEnergy(eb, [a, b]) { let s = 0, any = false; for (let i = a; i <= b; i++) { const x = eb[i]; if (Number.isFinite(x)) { s += x; any = true; } } return any ? s : NaN; }

let idb = null;
function openDb() {
  if (idb) return idb;
  idb = new Promise((res, rej) => {
    const r = indexedDB.open('comfy_sound', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sec', { keyPath: 'e' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return idb;
}

export class SoundEngine {
  constructor() {
    this.history = []; this.pending = []; this.status = 'off'; this.lastLa = NaN; this.listeners = new Set();
    this.ctx = null; this.stream = null; this.node = null; this.settings = null;
    this.excluded = []; this.onError = null;   // intervalli [da, a] in ms esclusi dai campioni (bip dei promemoria)
  }
  /** Esclude dai campioni i secondi tra fromMs e toMs (es. i bip del promemoria, che il microfono registrerebbe). */
  exclude(fromMs, toMs, reason = 'beep') { this.excluded.push([fromMs, toMs, reason]); const cut = Date.now() - 120000; this.excluded = this.excluded.filter(x => x[1] > cut); }
  exclusionAt(epochSec) { const a = epochSec * 1000, b = a + 1000; const x = this.excluded.find(([f, to]) => f < b && to > a); return x ? x[2] : null; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(this); } catch (e) { } }); }

  async restore() {
    try {
      const db = await openDb(), cutoff = Math.floor(Date.now() / 1000) - HISTORY_S;
      const all = await new Promise((res, rej) => { const q = db.transaction('sec').objectStore('sec').getAll(IDBKeyRange.lowerBound(cutoff)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      all.forEach(s => this.add(s, false));
    } catch (e) { console.warn('restore sound', e); }
  }

  /** Va chiamato da un tocco dell'utente (iOS consente microfono e audio solo dopo un gesto). */
  async start() {
    if (this.ctx && this.ctx.state === 'running' && this.stream && this.stream.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    const track = this.stream.getAudioTracks()[0];
    this.settings = track.getSettings ? track.getSettings() : {};
    track.onended = () => { this.status = 'mic_ended'; this.emit(); };
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'opn');
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    src.connect(this.node); this.node.connect(mute); mute.connect(this.ctx.destination);
    this.node.port.onmessage = m => this.onSecond(m.data);
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.ctx.onstatechange = () => { this.status = this.ctx.state === 'running' ? 'ok' : 'paused'; this.emit(); };
    this.status = 'ok'; this.emit();
    if (!this.flushTimer) this.flushTimer = setInterval(() => this.flush(), 5000);
  }
  async resume() { if (this.ctx && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { } } this.status = this.ctx && this.ctx.state === 'running' ? 'ok' : 'paused'; this.emit(); }
  stop() {
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); this.ctx && this.ctx.close(); } catch (e) { }
    this.ctx = null; this.stream = null; this.status = 'off'; this.flush(); this.emit();
  }
  running() { return !!(this.ctx && this.ctx.state === 'running' && this.stream && this.stream.active); }

  onSecond(s) {
    const epoch = Math.floor(Date.now() / 1000);
    const ex = this.exclusionAt(epoch) || this.exclusionAt(epoch - 1);   // il secondo appena chiuso copre circa [epoch-1, epoch]
    const valid = Number.isFinite(s.laeq) && !ex;
    const st = ex ? 'excluded_' + ex : Number.isFinite(s.laeq) ? 'ok' : 'invalid';
    const sec = { e: epoch, la: valid ? s.laeq : NaN, lz: valid ? s.lzeq : NaN, b: valid ? s.bands.map(x => Number.isFinite(x) ? +x.toFixed(2) : null) : null, st,
      rawLa: Number.isFinite(s.laeq) ? s.laeq : NaN };
    this.lastLa = Number.isFinite(s.laeq) ? s.laeq : NaN;
    this.add(sec, true); this.emit();
  }
  add(sec, persist) {
    const h = this.history;
    if (h.length && h[h.length - 1].e === sec.e) h.pop();
    const eb = sec.b ? sec.b.map(x => x == null ? NaN : e(x)) : null;
    h.push({ e: sec.e, la: sec.la == null ? NaN : sec.la, eb, low: eb ? groupEnergy(eb, LOW) : NaN, mid: eb ? groupEnergy(eb, MID) : NaN, high: eb ? groupEnergy(eb, HIGH) : NaN });
    while (h.length && h[0].e <= sec.e - HISTORY_S) h.shift();
    if (persist) this.pending.push({ e: sec.e, la: Number.isFinite(sec.la) ? +sec.la.toFixed(2) : null, lz: Number.isFinite(sec.lz) ? +sec.lz.toFixed(2) : null, b: sec.b,
      st: sec.st || 'ok', raw: Number.isFinite(sec.rawLa) ? +sec.rawLa.toFixed(2) : null });
  }
  async flush() {
    if (!this.pending.length) return;
    const batch = this.pending.splice(0);
    try {
      const db = await openDb();
      await new Promise((res, rej) => { const tx = db.transaction('sec', 'readwrite'); const st = tx.objectStore('sec'); batch.forEach(r => st.put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    } catch (e) { console.warn('flush sound', e); this.pending.unshift(...batch); if (this.onError) this.onError(e); }
  }

  /** Frazione di secondi validi negli ultimi n secondi (per l'indicatore). */
  fracValid(n = 300, end = Math.floor(Date.now() / 1000)) { return this.history.filter(s => s.e > end - n && s.e <= end && Number.isFinite(s.la)).length / n; }

  computeAll(endEpoch) { const out = {}; WINDOWS_MIN.forEach(w => out[w] = this.compute(endEpoch, w)); return out; }

  compute(end, wMin) {
    const lenS = wMin * 60, all = this.history;
    const win = (endE) => all.filter(s => s.e > endE - lenS && s.e <= endE);
    const cur = win(end), valid = cur.filter(s => Number.isFinite(s.la));
    const frac = valid.length / lenS;
    const basic = secs => {
      const v = secs.filter(s => Number.isFinite(s.la));
      if (!v.length || v.length < MIN_VALID_FRACTION * lenS) return null;
      const sums = new Array(N_BANDS).fill(0), cnt = new Array(N_BANDS).fill(0);
      v.forEach(s => s.eb && s.eb.forEach((x, i) => { if (Number.isFinite(x)) { sums[i] += x; cnt[i]++; } }));
      const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
      return { laeq: dbOf(v.reduce((a, s) => a + e(s.la), 0) / v.length), lLow: dbOf(avg(v.map(s => s.low).filter(Number.isFinite))), lMid: dbOf(avg(v.map(s => s.mid).filter(Number.isFinite))), lHigh: dbOf(avg(v.map(s => s.high).filter(Number.isFinite))), bands: sums.map((s, i) => cnt[i] ? dbOf(s / cnt[i]) : NaN) };
    };
    const b = basic(cur);
    if (!b) return { windowMin: wMin, nValid: valid.length, fracValid: frac };
    const prev = basic(win(end - lenS));
    const sorted = valid.map(s => s.la).sort((a, c) => a - c);
    const pct = p => { const pos = p / 100 * (sorted.length - 1), lo = Math.floor(pos), hi = Math.min(lo + 1, sorted.length - 1); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
    const la10 = pct(90), la50 = pct(50), la90 = pct(10);
    const k = b.laeq + 3; let eTot = 0, eEv = 0; valid.forEach(s => { const x = e(s.la); eTot += x; if (s.la > k) eEv += x; });
    const shape = q => { const en = [q.lLow, q.lMid, q.lHigh].filter(Number.isFinite).map(e); const tot = en.length ? dbOf(en.reduce((a, c) => a + c, 0)) : NaN; return Number.isFinite(tot) ? [q.lLow - tot, q.lMid - tot, q.lHigh - tot] : [NaN, NaN, NaN]; };
    let dForma = NaN;
    if (prev) { const s1 = shape(b), s0 = shape(prev); const ds = s1.map((x, i) => Number.isFinite(x) && Number.isFinite(s0[i]) ? Math.abs(x - s0[i]) : null).filter(x => x != null); dForma = ds.length ? Math.max(...ds) : NaN; }
    return { windowMin: wMin, nValid: valid.length, fracValid: frac, laeq: b.laeq, la10, la50, la90, ncl: la10 - la90, meq: b.laeq - la90, ir3: eTot > 0 ? 100 * eEv / eTot : NaN,
      lLow: b.lLow, lMid: b.lMid, lHigh: b.lHigh, dLaeq: prev ? b.laeq - prev.laeq : NaN, dLow: prev ? b.lLow - prev.lLow : NaN, dMid: prev ? b.lMid - prev.lMid : NaN, dHigh: prev ? b.lHigh - prev.lHigh : NaN, dForma, bands: b.bands };
  }

  /** Qualita' della finestra di 5 minuti (stesse soglie di ResearchQualityChecks.sound5, senza il criterio dello schermo). */
  static quality(r5) {
    if (!r5) return { level: 'unavailable', flags: 'no_5min_window' };
    if (!Number.isFinite(r5.laeq)) { const f = ['metrics_unavailable']; if (r5.fracValid < MIN_VALID_FRACTION) f.push('valid_fraction_lt_0.80'); return { level: 'low', flags: f.join('|') }; }
    const f = []; if (r5.fracValid < 0.95) f.push('valid_fraction_lt_0.95'); if (r5.fracValid < 0.90) f.push('valid_fraction_lt_0.90');
    return { level: r5.fracValid >= 0.95 ? 'high' : r5.fracValid >= MIN_VALID_FRACTION ? 'medium' : 'low', flags: f.length ? f.join('|') : 'ok' };
  }

  /** Tutti i secondi registrati (IndexedDB), per l'esportazione dello storico sonoro continuo. */
  async allSeconds() {
    await this.flush();
    const db = await openDb();
    return new Promise((res, rej) => { const q = db.transaction('sec').objectStore('sec').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }

  /** Tre bip per il promemoria (stesso AudioContext del microfono); i secondi dei bip sono esclusi dai campioni. */
  beep() {
    if (!this.ctx) return;
    this.exclude(Date.now() - 500, Date.now() + 2500, 'beep');
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t0 = this.ctx.currentTime;
      o.frequency.value = 880; g.gain.setValueAtTime(0, t0);
      [0, 0.35, 0.7].forEach(d => { g.gain.setValueAtTime(0.6, t0 + d); g.gain.setValueAtTime(0, t0 + d + 0.2); });
      o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(t0 + 1.1);
    } catch (e) { }
  }
}
