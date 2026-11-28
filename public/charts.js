// Small SVG chart renderer for the portal (no library: the CSP allows only 'self'). HP.chart(el, spec) draws a line,
// bar, stacked-bar or horizontal-bar chart with recessive axes, a legend for 2+ series, a hover tooltip (crosshair on
// lines, per mark on bars) and a "Show as table" view. Colours come from series[].color; text stays in text tokens.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const niceMax = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const fmtN = (v, f) => (f ? f(v) : Number(v).toLocaleString('en-IN'));

  function chart(el, spec) {
    if (!el) return;
    // No data at all: say so instead of drawing an empty axis.
    if (!spec || !spec.labels || !spec.labels.length || spec.series.every(x => x.values.every(v => !v))) { el.innerHTML = `<p class="muted sm ch-empty">${esc((spec && spec.empty) || 'Nothing to show yet.')}</p>`; return; }
    const { type, labels, series, yFmt, yMax: forceMax, title, tableHead = 'Period', fullLabels } = spec;
    // Draw at the container's real width so text stays at its true size (no scaling of the whole drawing).
    const W = Math.max(300, Math.round(el.clientWidth || 640)), H = type === 'hbar' ? Math.max(120, 34 * labels.length + 20) : 220;
    const pad = type === 'hbar' ? { l: 120, r: 56, t: 8, b: 8 } : { l: 46, r: type === 'line' ? 86 : 14, t: 12, b: 30 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vals = series.flatMap(s => s.values.filter(v => v != null));
    const total = i => series.reduce((t, s) => t + (s.values[i] || 0), 0);
    const max = forceMax || niceMax(type === 'stacked' ? Math.max(0, ...labels.map((_, i) => total(i))) : Math.max(0, ...vals));
    const n = labels.length, band = (type === 'hbar' ? ih : iw) / n;
    const y = v => pad.t + ih - (v / max) * ih;
    const x = i => pad.l + band * i + band / 2;
    let svg = '';

    // Recessive grid and axis labels (4 steps).
    if (type === 'hbar') {
      labels.forEach((l, i) => {
        const v = series[0].values[i] || 0, yy = pad.t + band * i + band * 0.2, h = band * 0.6, w = Math.max(v ? 3 : 0, (v / max) * iw);
        svg += `<text x="${pad.l - 10}" y="${yy + h / 2}" class="ch-lab" text-anchor="end" dominant-baseline="middle">${esc(l)}</text>`;
        svg += `<path d="M${pad.l} ${yy}h${Math.max(0, w - 4)}a4 4 0 0 1 4 4v${Math.max(0, h - 8)}a4 4 0 0 1 -4 4h${-Math.max(0, w - 4)}z" fill="${series[0].color}" class="ch-mark" data-i="${i}"/>`;
        svg += `<text x="${pad.l + w + 8}" y="${yy + h / 2}" class="ch-val" dominant-baseline="middle">${esc(fmtN(v, yFmt))}</text>`;
        svg += `<rect x="0" y="${pad.t + band * i}" width="${W}" height="${band}" class="ch-hit" data-i="${i}"/>`;
      });
    } else {
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k, yy = y(v);
        svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="${k ? 'ch-gl' : 'ch-base'}"/><text x="${pad.l - 8}" y="${yy}" class="ch-lab" text-anchor="end" dominant-baseline="middle">${esc(fmtN(Math.round(v * 100) / 100, yFmt))}</text>`;
      }
      const every = Math.ceil(n / Math.max(3, Math.floor(iw / 70)));
      labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="ch-lab" text-anchor="middle">${esc(l)}</text>`; });
      if (type === 'line') {
        series.forEach(s => {
          let d = '', pen = false;
          s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)} ${y(v)}`; pen = true; });
          svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
          s.values.forEach((v, i) => { if (v != null) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}" stroke="var(--ch-surface)" stroke-width="2"/>`; });
          const li = s.values.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0).pop();
          if (li != null) svg += `<text x="${x(li) + 10}" y="${y(s.values[li])}" class="ch-direct" dominant-baseline="middle">${esc(s.label)}</text>`; // direct label at the line end
        });
        svg += `<line class="ch-cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>`;
      } else {
        const bw = Math.min(36, band * 0.62);
        labels.forEach((_, i) => {
          let base = 0;
          series.forEach((s, si) => {
            const v = s.values[i] || 0; if (!v) return;
            const top = y(base + v), bot = y(base), h = Math.max(1, bot - top - (type === 'stacked' && si > 0 ? 2 : 0)); // 2px surface gap between segments
            const r = si === series.length - 1 || type !== 'stacked' ? Math.min(4, h) : 0, x0 = x(i) - bw / 2;
            svg += r ? `<path d="M${x0} ${bot}v${-(h - r)}a${r} ${r} 0 0 1 ${r} ${-r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r}z" fill="${s.color}" class="ch-mark"/>`
              : `<rect x="${x0}" y="${bot - h}" width="${bw}" height="${h}" fill="${s.color}" class="ch-mark"/>`;
            base += v;
          });
        });
      }
      labels.forEach((_, i) => { svg += `<rect x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih}" class="ch-hit" data-i="${i}"/>`; });
    }

    const legend = series.length > 1 ? `<div class="ch-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>` : '';
    const rowsT = labels.map((l, i) => `<tr><th scope="row">${esc((fullLabels || labels)[i])}</th>${series.map(s => `<td>${s.values[i] == null ? '–' : esc(fmtN(s.values[i], yFmt))}</td>`).join('')}${type === 'stacked' ? `<td>${esc(fmtN(total(i), yFmt))}</td>` : ''}</tr>`).join('');
    el.innerHTML = `${legend}<div class="ch-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '')}">${svg}</svg><div class="ch-tip" hidden></div></div>
      <details class="ch-table"><summary>Show as table</summary><div class="table-wrap"><table class="table"><thead><tr><th scope="col">${esc(tableHead)}</th>${series.map(s => `<th scope="col">${esc(s.label)}</th>`).join('')}${type === 'stacked' ? '<th scope="col">Total</th>' : ''}</tr></thead><tbody>${rowsT}</tbody></table></div></details>`;

    // Hover: one tooltip with every series for that period (crosshair on lines).
    const plot = el.querySelector('.ch-plot'), tip = el.querySelector('.ch-tip'), svgEl = el.querySelector('svg'), cross = el.querySelector('.ch-cross');
    const show = (i, evt) => {
      tip.innerHTML = `<b>${esc((fullLabels || labels)[i])}</b>${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}<b>${s.values[i] == null ? '–' : esc(fmtN(s.values[i], yFmt))}</b></span>`).join('')}${type === 'stacked' ? `<span>Total<b>${esc(fmtN(total(i), yFmt))}</b></span>` : ''}`;
      tip.hidden = false;
      const pr = plot.getBoundingClientRect(), sx = pr.width / W;
      const px = type === 'hbar' ? Math.min(pr.width - 10, (evt.clientX - pr.left) + 14) : x(i) * sx;
      tip.style.left = Math.min(Math.max(px, 70), pr.width - 70) + 'px';
      tip.style.top = (type === 'hbar' ? (pad.t + band * i) * sx : 4) + 'px';
      if (cross) { cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible'); }
      svgEl.querySelectorAll('.ch-hit').forEach(h => h.classList.toggle('on', Number(h.dataset.i) === i));
    };
    const hide = () => { tip.hidden = true; if (cross) cross.setAttribute('visibility', 'hidden'); svgEl.querySelectorAll('.ch-hit.on').forEach(h => h.classList.remove('on')); };
    svgEl.addEventListener('mousemove', e => { const h = e.target.closest('.ch-hit'); if (h) show(Number(h.dataset.i), e); else hide(); });
    svgEl.addEventListener('mouseleave', hide);
    svgEl.addEventListener('click', e => { const h = e.target.closest('.ch-hit'); if (h) show(Number(h.dataset.i), e); }); // touch
  }
  window.HP = window.HP || {};
  window.HP.chart = chart;
})();
