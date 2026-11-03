// Reactive UI layer: mounts Lottie animations, turns plain "nothing here" text into animated empty states, counts numbers up.
// Runs on top of both apps; no inline scripts (strict CSP). Animations are small JSON files in /anim/.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mount = el => {
    if (el.dataset.mounted || !window.lottie) return;
    el.dataset.mounted = '1';
    const loop = el.dataset.loop !== 'false';
    const a = lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay: !reduce, path: '/anim/' + el.dataset.lottie + '.json' });
    if (reduce) a.addEventListener('DOMLoaded', () => a.goToAndStop(a.totalFrames - 1, true));
  };
  const EMPTY = /^(you have no|no |nothing|the committee has not)/i;
  const emptyState = p => {
    if (p.dataset.enhanced || !EMPTY.test(p.textContent.trim())) return;
    p.dataset.enhanced = '1';
    const box = document.createElement('div'); box.className = 'empty';
    box.innerHTML = '<span class="empty-anim" data-lottie="empty"></span>';
    p.replaceWith(box); box.appendChild(p);
  };
  const count = el => {
    if (el.dataset.counted || reduce) return;
    const m = /^(\d+)(.*)$/.exec(el.textContent.trim()); if (!m) return;
    el.dataset.counted = '1';
    const to = +m[1], tail = m[2], t0 = performance.now(), dur = 700;
    const step = t => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + tail; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const scan = root => {
    root.querySelectorAll('[data-lottie]').forEach(mount);
    root.querySelectorAll('p.muted, p.callout').forEach(emptyState);
    root.querySelectorAll('.fig').forEach(count);
  };
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(document); }); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  scan(document);
})();
