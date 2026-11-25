// Palette taken from the Session 3 brief slides (navy titles, teal circles, coral and lime MoSCoW, beige cards).
const C = {
  navy: '2E3A87', teal: '00B5C3', dteal: '0F7F7A', coral: 'FF6B4F', lime: 'B5D97A',
  grey: '9B9B95', beige: 'EEECE3', ink: '3A3A3A', white: 'FFFFFF',
};

// Feather-style icon paths (24x24, stroke).
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 13.6 13.6 22l-2.3-2.3a4 4 0 0 0-5-5L4 12.4 12.4 4z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
  'user-plus': '<circle cx="9" cy="8" r="4"/><path d="M2 21c.7-4 3.5-6 7-6s6.3 2 7 6"/><path d="M19 8v6M16 11h6"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  refresh: '<path d="M21 4v6h-6"/><path d="M3 20v-6h6"/><path d="M20 10a8 8 0 0 0-14.6-3M4 14a8 8 0 0 0 14.6 3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  access: '<circle cx="12" cy="4" r="2"/><path d="M4 8l8 2 8-2M12 10v5l-4 7M12 15l4 7"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  cloud: '<path d="M18 10h-1.3A7 7 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LABEL = {
  'Process 1': 'Process 1 · On-boarding', 'Process 2': 'Process 2 · Raise a request',
  'Process 3': 'Process 3 · Request lifecycle', Committee: 'Committee Member', Head: 'Head of Committee and Admin',
  Staff: 'Staff', IT: 'IT Staff', Society: 'Society modules',
};

function groups(d) {
  const out = [];
  for (const f of d.frs) {
    let g = out.find((x) => x.area === f.area);
    if (!g) {
      const key = Object.keys(LABEL).find((k) => f.area.startsWith(k));
      g = { area: f.area, label: LABEL[key], items: [] };
      out.push(g);
    }
    g.items.push(f);
  }
  return out;
}

function counts(d) {
  const k = { M: 0, S: 0, C: 0, tested: 0 };
  for (const f of d.frs) { k[f.priority]++; if (f.tests.length) k.tested++; }
  return k;
}

module.exports = { C, ICON, esc, groups, counts };
