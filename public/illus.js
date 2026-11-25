// Role illustrations for the dashboards (inline SVG, no external files; colours come from the hero theme:
// --ha accent, --hb soft, --hc ink). Each role gets its own scene so every account looks and feels different.
(() => {
  const W = (inner) => `<svg viewBox="0 0 240 200" class="illus" aria-hidden="true">${inner}</svg>`;
  const ground = '<ellipse cx="120" cy="184" rx="96" ry="10" fill="var(--hb)" opacity=".55"/>';
  const ILLUS = {
    // Resident: home with a lit window and a tree
    home: W(`${ground}<rect x="58" y="78" width="104" height="100" rx="8" fill="var(--hb)"/><path d="M48 84 120 30l72 54" fill="none" stroke="var(--ha)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="104" y="128" width="32" height="50" rx="6" fill="var(--ha)"/><rect x="72" y="98" width="24" height="22" rx="4" fill="#fff"/><rect x="144" y="98" width="24" height="22" rx="4" fill="#ffd96a" class="il-blink"/>
      <circle cx="206" cy="128" r="20" fill="var(--ha)" opacity=".85" class="il-sway"/><rect x="203" y="140" width="6" height="40" rx="3" fill="var(--hc)" opacity=".5"/><circle cx="30" cy="40" r="10" fill="#ffd96a" class="il-float"/>`),
    // Committee member: clipboard with ticks
    ops: W(`${ground}<rect x="66" y="34" width="108" height="144" rx="12" fill="#fff"/><rect x="96" y="24" width="48" height="20" rx="6" fill="var(--ha)"/>
      ${[70, 100, 130].map((y, i) => `<circle cx="90" cy="${y}" r="9" fill="var(--ha)" class="il-pop" style="animation-delay:${i * .3}s"/><path d="M86 ${y}l3 3 6-6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="106" y="${y - 5}" width="${54 - i * 10}" height="10" rx="5" fill="var(--hb)"/>`).join('')}
      <rect x="84" y="152" width="72" height="10" rx="5" fill="var(--hb)"/><circle cx="196" cy="60" r="16" fill="var(--hb)" class="il-float"/>`),
    // Head of committee: podium with a seal and a gavel
    gov: W(`${ground}<path d="M70 120h100l-10 58H80z" fill="var(--hb)"/><rect x="60" y="108" width="120" height="16" rx="6" fill="var(--ha)"/>
      <circle cx="120" cy="150" r="14" fill="var(--ha)"/><path d="M113 150l5 5 9-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g class="il-tap"><rect x="150" y="40" width="54" height="22" rx="8" fill="var(--ha)" transform="rotate(-28 177 51)"/><rect x="166" y="58" width="8" height="46" rx="4" fill="var(--hc)" opacity=".6" transform="rotate(-28 170 81)"/></g>
      <path d="M50 70l12-12 12 12-12 12z" fill="var(--ha)" opacity=".6" class="il-float"/>`),
    // Admin: shield, gears and a key (system and access)
    sys: W(`${ground}<path d="M120 26l52 18v40c0 40-26 66-52 80-26-14-52-40-52-80V44z" fill="var(--ha)"/><path d="M104 94l12 12 22-24" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="il-spin" style="transform-origin:46px 150px"><circle cx="46" cy="150" r="18" fill="none" stroke="var(--hc)" stroke-width="7" stroke-dasharray="7 5" opacity=".6"/></g>
      <g class="il-spin-r" style="transform-origin:196px 140px"><circle cx="196" cy="140" r="13" fill="none" stroke="var(--ha)" stroke-width="6" stroke-dasharray="6 4"/></g>`),
    // IT: laptop with a pulse line and a server
    it: W(`${ground}<rect x="44" y="60" width="120" height="80" rx="8" fill="var(--hc)" opacity=".85"/><rect x="52" y="68" width="104" height="64" rx="4" fill="#0e1b26"/>
      <path d="M58 104h20l8-16 10 30 10-22 8 8h36" stroke="var(--ha)" stroke-width="4" fill="none" stroke-linecap="round" class="il-dash"/><rect x="30" y="140" width="148" height="10" rx="5" fill="var(--hb)"/>
      <rect x="182" y="70" width="36" height="104" rx="6" fill="var(--hb)"/>${[90, 116, 142].map(y => `<rect x="190" y="${y}" width="20" height="8" rx="3" fill="var(--hc)" opacity=".35"/><circle cx="212" cy="${y + 4}" r="3" fill="var(--ha)" class="il-blink"/>`).join('')}`),
    // Cleaning staff: bucket, mop and sparkles
    clean: W(`${ground}<path d="M70 110h70l-8 68H78z" fill="var(--ha)"/><rect x="64" y="100" width="82" height="14" rx="6" fill="var(--hc)" opacity=".7"/>
      <g class="il-sway" style="transform-origin:170px 180px"><rect x="166" y="40" width="8" height="120" rx="4" fill="var(--hc)" opacity=".6"/><path d="M150 158h40l6 20h-52z" fill="var(--hb)"/></g>
      ${[[52, 60], [100, 46], [204, 86]].map(([x, y], i) => `<path d="M${x} ${y - 10}l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="var(--ha)" class="il-pop" style="animation-delay:${i * .4}s"/>`).join('')}`),
    // Maintenance staff: toolbox and wrench
    fix: W(`${ground}<rect x="52" y="100" width="136" height="78" rx="10" fill="var(--ha)"/><path d="M92 100V86a10 10 0 0 1 10-10h36a10 10 0 0 1 10 10v14" fill="none" stroke="var(--hc)" stroke-width="8" opacity=".7"/>
      <rect x="52" y="124" width="136" height="10" fill="var(--hc)" opacity=".25"/><rect x="110" y="118" width="20" height="22" rx="4" fill="#fff"/>
      <g class="il-tap" style="transform-origin:176px 56px"><path d="M150 40a16 16 0 0 0 22 22l20 20-8 8-20-20a16 16 0 0 0-22-22l8 8 8-2 2-8z" fill="var(--hc)" opacity=".75"/></g>`),
    // Tuck shop: storefront with awning and a basket
    shop: W(`${ground}<rect x="48" y="80" width="144" height="98" rx="8" fill="var(--hb)"/>
      <path d="M40 80h160l-12-34H52z" fill="var(--ha)"/>${[0, 1, 2, 3].map(i => `<path d="M${52 + i * 36} 80q18 20 36 0" fill="${i % 2 ? '#fff' : 'var(--ha)'}"/>`).join('')}
      <rect x="64" y="104" width="50" height="40" rx="4" fill="#fff"/><rect x="130" y="104" width="44" height="74" rx="4" fill="var(--ha)" opacity=".85"/>
      <g class="il-float"><path d="M74 128h30l-4 14H78z" fill="var(--ha)"/><circle cx="84" cy="122" r="5" fill="#ffd96a"/><circle cx="95" cy="121" r="5" fill="#8bd17c"/></g>`),
    // Laundry: washing machine with a turning drum and bubbles
    wash: W(`${ground}<rect x="62" y="40" width="116" height="138" rx="14" fill="#fff"/><rect x="62" y="40" width="116" height="26" rx="14" fill="var(--hb)"/>
      <circle cx="82" cy="53" r="5" fill="var(--ha)"/><circle cx="98" cy="53" r="5" fill="var(--hc)" opacity=".4"/>
      <circle cx="120" cy="120" r="38" fill="var(--hb)"/><g class="il-spin" style="transform-origin:120px 120px"><circle cx="120" cy="120" r="28" fill="var(--ha)" opacity=".85"/><path d="M98 122q11-14 22 0t22 0" stroke="#fff" stroke-width="5" fill="none"/></g>
      ${[[196, 70, 8], [210, 100, 5], [34, 90, 7]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="var(--ha)" stroke-width="3" class="il-float" style="animation-delay:${i * .5}s"/>`).join('')}`),
    // Guard: gate barrier with an NFC card and waves
    gate: W(`${ground}<rect x="40" y="70" width="22" height="108" rx="6" fill="var(--hc)" opacity=".7"/><g class="il-lift" style="transform-origin:51px 88px"><rect x="51" y="82" width="150" height="12" rx="6" fill="var(--ha)"/>${[0, 1, 2, 3].map(i => `<rect x="${70 + i * 32}" y="82" width="14" height="12" fill="#fff" opacity=".85"/>`).join('')}</g>
      <rect x="126" y="114" width="64" height="42" rx="8" fill="#fff" transform="rotate(-10 158 135)"/><circle cx="146" cy="138" r="6" fill="var(--ha)"/>
      ${[14, 24, 34].map((r, i) => `<path d="M${180 + r} ${126 - r * .2}a${r} ${r} 0 0 0 0 ${r * .9}" stroke="var(--ha)" stroke-width="3" fill="none" class="il-wave" style="animation-delay:${i * .25}s"/>`).join('')}`),
  };
  window.HP_ILLUS = ILLUS;
})();
