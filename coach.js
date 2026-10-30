// Tutorial a «coach mark», come CoachMarks.kt dell'app Android:
// lo schermo si scurisce, l'elemento viene illuminato con un anello che pulsa e un fumetto spiega a cosa serve.
// «Avanti» (o un tocco sull'elemento illuminato) passa al successivo, «Salta tutorial» chiude.
let active = null;
export const isActive = () => !!active;
export function stop() { if (active) active.close(false); }

/**
 * steps: [{ sel: selettore CSS o null (fumetto al centro), title, body }]
 * txt: { skip, next, done, counter(n, N) }; onEnd(completed) viene chiamato alla chiusura.
 */
export function run(steps, txt, onEnd = () => {}) {
  if (active) return false;
  steps = steps.filter(s => !s.sel || document.querySelector(s.sel));
  if (!steps.length) return false;
  let i = 0, timer = null;
  const el = document.createElement('div'); el.id = 'coach'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="hole"></div><div class="bub" aria-live="polite"><div class="cnt"></div><h3></h3><p></p>
    <div class="cbar"><button class="cskip" type="button">${txt.skip}</button><button class="cnext" type="button"></button></div></div>`;
  document.body.appendChild(el);
  const hole = el.querySelector('.hole'), bub = el.querySelector('.bub');
  const place = () => {
    const s = steps[i], t = s.sel && document.querySelector(s.sel);
    const vh = window.innerHeight, bh = bub.offsetHeight;
    if (!t) {
      hole.className = 'hole none'; hole.removeAttribute('style');
      bub.style.top = Math.max(16, (vh - bh) / 2) + 'px'; return;
    }
    const r = t.getBoundingClientRect(), pad = 6;
    hole.className = 'hole';
    Object.assign(hole.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + 2 * pad) + 'px', height: (r.height + 2 * pad) + 'px',
      borderRadius: t.classList.contains('ringbox') ? '50%' : Math.min(26, (r.height + 2 * pad) / 2) + 'px' });
    const below = r.bottom + pad + 14, above = r.top - pad - 14 - bh;
    bub.style.top = (below + bh <= vh - 12 ? below : above >= 12 ? above : Math.max(12, vh - bh - 12)) + 'px';
  };
  const show = () => {
    const s = steps[i];
    el.querySelector('.cnt').textContent = steps.length > 1 ? txt.counter(i + 1, steps.length) : '';
    el.querySelector('h3').textContent = s.title;
    el.querySelector('p').textContent = s.body;
    el.querySelector('.cnext').textContent = i < steps.length - 1 ? txt.next : txt.done;
    const t = s.sel && document.querySelector(s.sel);
    if (t) {
      const r = t.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 200) t.scrollIntoView({ block: 'center' });
    }
    place();
  };
  const next = () => { if (i < steps.length - 1) { i++; show(); } else close(true); };
  function close(completed) {
    clearInterval(timer); window.removeEventListener('resize', place);
    el.remove(); active = null; onEnd(completed);
  }
  el.querySelector('.cskip').onclick = () => close(true);
  el.querySelector('.cnext').onclick = next;
  hole.onclick = next;
  // segue l'elemento se la schermata viene ridisegnata; se l'elemento sparisce (cambio schermata) il tutorial si chiude
  timer = setInterval(() => { const s = steps[i]; if (s.sel && !document.querySelector(s.sel)) close(false); else place(); }, 400);
  window.addEventListener('resize', place);
  active = { close };
  show();
  return true;
}
