// Builds the designed HTML version of the Requirements Document (printed to PDF by build.js).
// Panels with a data-panel attribute are also captured as PNGs for the Word file.
const { C, ICON, esc, groups, counts } = require('./common');

const pill = (p) => `<span class="pill p${p}">${{ M: 'Must', S: 'Should', C: 'Could' }[p]}</span>`;
const icon = (name, color = '#fff', size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

function page(inner, cls = '') {
  return `<section class="page ${cls}">${inner}<footer><span>Sahyadri Heights Housing Society Portal &nbsp;|&nbsp; Requirements Document</span><span class="pn"></span></footer></section>`;
}

function head(num, title, lead) {
  return `<div class="h"><div class="num">${num}</div><div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;
}

module.exports = function html(d) {
  const k = counts(d);
  const css = `
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  body { margin: 0; font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #${C.ink}; font-size: 10.5pt; line-height: 1.35 }
  .page { width: 210mm; height: 297mm; padding: 16mm 16mm 18mm; position: relative; page-break-after: always; overflow: hidden }
  footer { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; border-top: 1px solid #${C.navy}; padding-top: 5px; display: flex; justify-content: space-between; color: #${C.coral}; font-size: 8pt }
  h1 { font-family: Arial, sans-serif; color: #${C.navy}; font-size: 24pt; margin: 0; line-height: 1.1 }
  h2 { font-family: Arial, sans-serif; color: #${C.navy}; font-size: 13pt; margin: 14px 0 7px }
  h3 { font-family: Arial, sans-serif; font-size: 11pt; margin: 0 0 4px; color: #${C.navy} }
  .h { display: flex; gap: 14px; align-items: center; margin-bottom: 12px }
  .num { width: 46px; height: 46px; border-radius: 50%; background: #${C.teal}; color: #fff; font: 700 20pt Arial; display: flex; align-items: center; justify-content: center; flex: none }
  .lead { margin: 3px 0 0; color: #666; font-size: 10.5pt }
  .card { background: #${C.beige}; border-radius: 10px; padding: 12px 14px }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px }
  .pill { display: inline-block; border-radius: 99px; padding: 1px 8px; font: 700 7.5pt Arial; color: #fff; white-space: nowrap }
  .pM { background: #${C.teal} } .pS { background: #${C.coral} } .pC { background: #${C.lime}; color: #333 }
  .tag { display: inline-block; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 0 5px; font-size: 7.5pt; color: #555; margin: 1px 2px 1px 0; white-space: nowrap }
  .nb { color: #${C.coral}; font-weight: 700; font-size: 8pt }

  /* cover */
  .cover { background: #${C.navy}; color: #fff; padding: 26mm 20mm }
  .cover footer { display: none }
  .cover .kicker { color: #${C.lime}; font: 700 11pt Arial; letter-spacing: 1px; text-transform: uppercase }
  .cover h1 { color: #fff; font-size: 42pt; margin: 10px 0 6px }
  .cover .sub { font-size: 16pt; color: #cfd3f0 }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 30mm }
  .tile { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 14px; min-height: 120px }
  .tile .n { width: 34px; height: 34px; border-radius: 50%; background: #${C.teal}; display: flex; align-items: center; justify-content: center; font: 700 14pt Arial; margin-bottom: 10px }
  .tile b { display: block; font: 700 12pt Arial; margin-bottom: 4px }
  .tile span { color: #cfd3f0; font-size: 9.5pt }
  .meta { position: absolute; left: 20mm; right: 20mm; bottom: 20mm; display: flex; justify-content: space-between; color: #cfd3f0; font-size: 10pt; border-top: 1px solid rgba(255,255,255,.25); padding-top: 10px }
  .squares { position: absolute; right: 20mm; top: 24mm; display: grid; grid-template-columns: repeat(3, 26px); gap: 7px }
  .squares i { width: 26px; height: 26px; border-radius: 5px; background: #${C.teal}; opacity: .8 } .squares i:nth-child(3n+2) { background: #${C.dteal} }

  /* glance */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px }
  .stat { background: #${C.beige}; border-radius: 10px; padding: 12px; text-align: left }
  .stat .v { font: 700 28pt Arial; color: #${C.navy}; line-height: 1 }
  .stat .l { color: #555; font-size: 9.5pt; margin-top: 4px }
  .bar { display: flex; height: 26px; border-radius: 6px; overflow: hidden; margin: 6px 0 4px }
  .bar div { display: flex; align-items: center; justify-content: center; color: #fff; font: 700 9pt Arial }
  .legend { display: flex; gap: 14px; font-size: 9pt; color: #555 }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px }
  .hbar { display: grid; grid-template-columns: 170px 1fr 28px; align-items: center; gap: 8px; margin: 4px 0; font-size: 9.5pt }
  .hbar .track { display: flex; height: 14px; border-radius: 3px; overflow: hidden; background: #f2f1ec }

  /* scope */
  .core { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px }
  .core .c { background: #${C.beige}; border-radius: 10px; padding: 10px; text-align: center }
  .core .c .n { margin: 0 auto 6px; width: 30px; height: 30px; border-radius: 50%; background: #${C.teal}; color: #fff; font: 700 12pt Arial; display: flex; align-items: center; justify-content: center }
  .core b { display: block; color: #${C.navy}; font: 700 9.5pt Arial; margin-bottom: 3px }
  .core span { font-size: 8.5pt; color: #555 }
  .layer { display: grid; grid-template-columns: 120px 1fr; gap: 8px; margin-bottom: 6px }
  .layer .lab { background: #${C.navy}; color: #fff; border-radius: 8px; padding: 8px; font: 700 9.5pt Arial; display: flex; align-items: center }
  .layer .chips { background: #${C.beige}; border-radius: 8px; padding: 7px; display: flex; flex-wrap: wrap; gap: 5px }
  .chip { background: #fff; border: 1.5px solid #${C.teal}; color: #${C.navy}; border-radius: 6px; padding: 3px 8px; font-size: 9pt; font-weight: 600 }
  .chip.plan { border-style: dashed; border-color: #999; color: #777 }
  ul.x { margin: 0; padding-left: 0; list-style: none } ul.x li { padding: 2px 0 2px 20px; position: relative; font-size: 9.5pt }
  ul.x li:before { content: ''; position: absolute; left: 2px; top: 7px; width: 9px; height: 9px; border-radius: 50% }
  ul.in li:before { background: #${C.teal} } ul.out li:before { background: #${C.grey} } ul.as li:before { background: #${C.coral} }

  /* personas */
  .persona { background: #${C.beige}; border-radius: 12px; padding: 12px; display: flex; flex-direction: column }
  .persona .top { display: flex; gap: 10px; align-items: center; margin-bottom: 8px }
  .avatar { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none }
  .persona .role { font: 700 7.5pt Arial; text-transform: uppercase; letter-spacing: .6px; color: #${C.dteal} }
  .persona .name { font: 700 12pt Arial; color: #${C.navy} }
  .persona .who { font-size: 8.5pt; color: #666 }
  .persona q { display: block; font-style: italic; color: #${C.navy}; background: #fff; border-radius: 8px; padding: 7px 9px; font-size: 9pt; margin-bottom: 8px; quotes: none }
  .persona .k { font: 700 7.5pt Arial; text-transform: uppercase; color: #888; margin: 4px 0 2px }
  .persona ul { margin: 0; padding-left: 15px; font-size: 9pt } .persona li { margin: 1px 0 }
  .persona .pain li::marker { color: #${C.coral} } .persona .goal li::marker { color: #${C.teal} }

  /* flow */
  .flow { display: flex; gap: 0; align-items: stretch }
  .step { flex: 1; position: relative; padding: 10px 6px 10px 22px; color: #fff; clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%); margin-right: -8px }
  .step:first-child { clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%); padding-left: 12px }
  .step .sn { font: 700 13pt Arial } .step .st { font: 700 9pt Arial; line-height: 1.15 } .step .sr { font-size: 7.5pt; opacity: .85; margin-top: 3px }
  .lifecycle-label { display: flex; margin-top: 4px } .lifecycle-label div { font: 700 8pt Arial; color: #${C.dteal}; text-align: center; border-top: 2px solid #${C.dteal}; padding-top: 3px }

  /* moscow */
  .mos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px }
  .mos .mh { border-radius: 8px; padding: 7px; text-align: center; font: 700 10.5pt Arial; color: #fff }
  .mos .mb { background: #${C.beige}; border-radius: 8px; padding: 8px 9px; margin-top: 6px; font-size: 8.8pt }
  .mos .mb div { padding: 1.5px 0; border-bottom: 1px dotted #d6d3c6 } .mos .mb div:last-child { border: 0 }
  .mos .mb small { color: #999; font-size: 7pt; margin-right: 4px }

  /* FR tables */
  table.fr { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin-bottom: 6px }
  table.fr th { background: #${C.navy}; color: #fff; text-align: left; font: 700 8pt Arial; padding: 5px 6px }
  table.fr td { padding: 4px 6px; border-bottom: 1px solid #e6e3d8; vertical-align: top }
  table.fr tr:nth-child(even) td { background: #faf9f5 }
  table.fr td.id { font: 700 8pt Arial; color: #${C.navy}; white-space: nowrap; width: 62px }
  table.fr td.pr { width: 50px; text-align: center }
  table.fr td.ro { width: 120px }
  .sub { font: 700 9pt Arial; color: #${C.dteal}; margin: 8px 0 3px; text-transform: uppercase; letter-spacing: .5px }
  .area { display: flex; align-items: center; gap: 8px; margin: 12px 0 5px }
  .area .ai { width: 26px; height: 26px; border-radius: 50%; background: #${C.navy}; display: flex; align-items: center; justify-content: center; flex: none }
  .area h2 { margin: 0 }

  /* NFR */
  .nfr { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px }
  .nf { display: flex; gap: 10px; background: #${C.beige}; border-radius: 10px; padding: 9px 11px; align-items: flex-start }
  .nf .ic { width: 34px; height: 34px; border-radius: 50%; background: #${C.dteal}; display: flex; align-items: center; justify-content: center; flex: none }
  .nf b { font: 700 9.5pt Arial; color: #${C.navy} } .nf .id { font: 700 7.5pt Arial; color: #999; margin-left: 4px }
  .nf p { margin: 2px 0 0; font-size: 8.8pt }
  .gap { color: #${C.coral}; font-weight: 700 }
  [data-panel] { background: #fff }
  .capchart { display: flex; align-items: flex-end; gap: 14px; height: 190px; padding: 8px 12px; background: #EEECE3; border-radius: 10px; }
  .capcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 8.5pt; }
  .capbar { width: 100%; max-width: 60px; background: #00B5C3; border-radius: 6px 6px 0 0; }
  .capv { font: 700 9pt Arial; color: #2E3A87 } .capp { font: 700 8pt Arial }
  .ladder { display: flex; flex-direction: column; gap: 8px; }
  .rung { display: flex; gap: 12px; align-items: flex-start; background: #EEECE3; border-radius: 10px; padding: 10px 12px; margin-left: calc(var(--n) * 28px); }
  .rung b { font: 700 10pt Arial; color: #2E3A87 } .rung p { margin: 2px 0 4px; font-size: 9pt }
  .stk { display: flex; flex-direction: column; gap: 6px; }
  .stk-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stk-box { border: 2px solid; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 2px; background: #fff; }
  .stk-box b { font: 700 10pt Arial } .stk-box span { font-size: 8.5pt; color: #555 }
  .stk-api { grid-column: 1 / -1; background: #2E3A87; color: #fff; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .stk-api b { font: 700 13pt Arial } .stk-api span { font-size: 9pt; color: #cfd3f0 }
  .stk-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px } .stk-chips i { font-style: normal; background: rgba(255,255,255,.14); border-radius: 99px; padding: 2px 8px; font-size: 8pt; color: #fff }
  .stk-arrow { text-align: center; font: 700 8.5pt Arial; color: #0F7F7A; padding: 2px 0 } .stk-arrow::before { content: '▼  '; } 
  .stk-flow { margin: 0; padding-left: 18px; font-size: 9.5pt } .stk-flow li { margin: 2px 0 }
  `;

  const cover = `<section class="page cover">
    <div class="squares">${'<i></i>'.repeat(12)}</div>
    <div class="kicker">Deliverable 1 &nbsp;·&nbsp; Business Process Automation Using AI</div>
    <h1>Requirements<br>Document</h1>
    <div class="sub">Sahyadri Heights Housing Society Portal</div>
    <div class="tiles">
      ${[['1', 'Scope', 'What the portal covers and what it does not'], ['2', 'Personas', 'The six roles from the whiteboard'],
         ['3', 'Functional Requirements', `${d.frs.length} needs, by process and role`], ['4', 'Non-Functional Requirements', `${d.nfrs.length} quality needs`]]
        .map(([n, t, s]) => `<div class="tile"><div class="n">${n}</div><b>${t}</b><span>${s}</span></div>`).join('')}
    </div>
    <div class="meta"><span>Version ${d.version} &nbsp;·&nbsp; ${d.date}</span><span>Sources: Session 3 brief · faculty whiteboards 21 and 25 Nov 2026</span></div>
  </section>`;

  const byArea = groups(d);
  const glance = page(`
    <div data-panel="glance">
    <h1 style="margin-bottom:4px">At a glance</h1>
    <p class="lead" style="margin-bottom:12px">What the society needs from the portal, in numbers.</p>
    <div class="stats">
      <div class="stat"><div class="v">${d.personas.length}</div><div class="l">Personas (whiteboard roles)</div></div>
      <div class="stat"><div class="v">${d.frs.length}</div><div class="l">Functional requirements</div></div>
      <div class="stat"><div class="v">${d.nfrs.length}</div><div class="l">Non-functional requirements</div></div>
      <div class="stat"><div class="v">${k.tested}</div><div class="l">Requirements linked to test cases</div></div>
    </div>
    <h2>Priority (MoSCoW)</h2>
    <div class="bar">
      <div style="flex:${k.M};background:#${C.teal}">Must ${k.M}</div>
      <div style="flex:${k.S};background:#${C.coral}">Should ${k.S}</div>
      <div style="flex:${k.C};background:#${C.lime};color:#333">Could ${k.C}</div>
    </div>
    <h2>Requirements by process and role</h2>
    ${byArea.map((g) => `<div class="hbar"><span>${esc(g.label)}</span><div class="track">${['M', 'S', 'C'].map((p) => {
      const n = g.items.filter((f) => f.priority === p).length;
      return n ? `<div style="width:${(n / 17) * 100}%;background:#${{ M: C.teal, S: C.coral, C: C.lime }[p]}"></div>` : '';
    }).join('')}</div><b>${g.items.length}</b></div>`).join('')}
    <div class="legend" style="margin-top:6px"><span><i style="background:#${C.teal}"></i>Must</span><span><i style="background:#${C.coral}"></i>Should</span><span><i style="background:#${C.lime}"></i>Could</span></div>
    </div>
    <h2>Status</h2>
    <p style="margin:0">All requirements are built in the web app except <b>WhatsApp intake and replies</b> (FR-WR-07, FR-WR-11: WhatsApp not connected) and <b>online payment of dues</b> (part of FR-SM-05). Full traceability to user stories and test cases is in the Excel register.</p>
    <h2>Sources: faculty whiteboards</h2>
    <div class="grid2"><figure style="margin:0"><img src="${d.img.roles}" style="width:100%;border-radius:8px"><figcaption style="font-size:8.5pt;color:#666">21 Nov: roles, story format, process list</figcaption></figure>
    <figure style="margin:0"><img src="${d.img.arch}" style="width:100%;border-radius:8px"><figcaption style="font-size:8.5pt;color:#666">25 Nov: product and technology architecture</figcaption></figure></div>
  `);

  const scope = page(`
    ${head(1, 'Scope', 'Why the portal exists and where its edges are.')}
    <div class="grid2">
      <div class="card"><h3>The problem</h3>${esc(d.scope.problem)}</div>
      <div class="card" style="background:#${C.navy};color:#fff"><h3 style="color:#${C.lime}">The goal</h3>${esc(d.scope.goal)}</div>
    </div>
    <div data-panel="core"><h2>Five core requirements (Session 3 brief)</h2>
    <div class="core">${d.scope.core.map(([t, s], i) => `<div class="c"><div class="n">${i + 1}</div><b>${t}</b><span>${s}</span></div>`).join('')}</div></div>
    <div data-panel="layers"><h2>In scope: product architecture (whiteboard, 25 Nov)</h2>
    ${d.scope.layers.map(([l, items]) => `<div class="layer"><div class="lab">${l}</div><div class="chips">${items.map((x) => `<span class="chip${/planned/.test(x) ? ' plan' : ''}">${x}</span>`).join('')}</div></div>`).join('')}</div>
    <div class="grid2" style="margin-top:8px">
      <div class="card"><h3>Out of scope</h3><ul class="x out">${d.scope.out.map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div class="card"><h3>Assumptions</h3><ul class="x as">${d.scope.assumptions.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    </div>
  `);

  const avatarColors = [C.teal, C.navy, C.coral, C.dteal, C.navy, C.teal];
  const personaCard = (p, i) => `<div class="persona">
      <div class="top"><div class="avatar" style="background:#${avatarColors[i]}">${icon(p.icon)}</div>
      <div><div class="role">${i + 1} · ${p.role}</div><div class="name">${p.name}</div><div class="who">${p.who}</div></div></div>
      <q>“${esc(p.quote)}”</q>
      <div class="k">Goals</div><ul class="goal">${p.goals.map((g) => `<li>${g}</li>`).join('')}</ul>
      <div class="k">Pain today</div><ul class="pain">${p.pains.map((g) => `<li>${g}</li>`).join('')}</ul>
    </div>`;
  const personas = page(`
    ${head(2, 'Personas', 'The six roles on the faculty whiteboard. Names are illustrative; no real resident data is used.')}
    <div class="grid3" data-panel="personas-a" style="margin-bottom:10px">${d.personas.slice(0, 3).map((p, i) => personaCard(p, i)).join('')}</div>
    <div class="grid3" data-panel="personas-b">${d.personas.slice(3).map((p, i) => personaCard(p, i + 3)).join('')}</div>
  `);
  const roles = page(`
    <div data-panel="roles"><h1 style="margin-bottom:4px">Owner, tenant, family and committee</h1><p class="lead" style="margin-bottom:12px">Who can do what. Defaults; the committee can change resident access in Settings.</p>
    <table class="fr roles"><tr><th></th>${d.roles.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${d.roles.rows.map(r => `<tr><td class="id" style="width:120px">${esc(r[0])}</td>${r.slice(1).map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>
    <p class="card" style="margin-top:10px;font-size:9.5pt">${esc(d.roles.note)}</p></div>
  `);

  const flowColors = [C.navy, C.navy, C.teal, C.teal, C.teal, C.teal];
  const flow = `<div data-panel="flow"><div class="flow">${d.process.map((s, i) => `<div class="step" style="background:#${flowColors[i]}"><div class="sn">${s.n}</div><div class="st">${s.name}</div><div class="sr">${s.roles}</div></div>`).join('')}</div>
    <div class="lifecycle-label"><div style="flex:2"></div><div style="flex:4">3 · Lifecycle of a resident request</div></div></div>`;
  const mosCol = (p, label, color, dark) => {
    const items = d.frs.filter((f) => f.priority === p);
    return `<div><div class="mh" style="background:#${color};${dark ? 'color:#333' : ''}">${label} · ${items.length}</div><div class="mb">${items.map((f) => `<div><small>${f.id}</small>${esc(f.short)}</div>`).join('')}</div></div>`;
  };
  const moscow = page(`
    ${head(3, 'Functional Requirements', 'What the portal must do, organised by the whiteboard process list and then by role.')}
    <h2>Process list</h2>${flow}
    <h2 style="margin-top:16px">Priorities at a glance (MoSCoW, as in the brief)</h2>
    <div class="mos" data-panel="moscow">${mosCol('M', 'Must have', C.teal)}${mosCol('S', 'Should have', C.coral)}${mosCol('C', 'Could have', C.lime, true)}</div>
    <p style="font-size:8.5pt;color:#666;margin-top:8px">Out of scope items are listed in section 1. Full wording, roles and test links follow on the next pages.</p>
  `);

  // Detailed tables, paged manually (about 34 rows per page).
  const areaIcon = { 'Process 1': 'user-plus', 'Process 2': 'send', 'Process 3': 'refresh', 'Committee': 'users', 'Head': 'award', 'Staff': 'tool', 'IT': 'cpu', 'Society': 'home', 'Resident': 'users' };
  const blocks = [];
  for (const g of byArea) {
    const ic = Object.entries(areaIcon).find(([k2]) => g.area.startsWith(k2))[1];
    let header = `<div class="area"><div class="ai">${icon(ic, '#fff', 15)}</div><h2>${esc(g.area)}</h2></div>`;
    const subs = [...new Set(g.items.map((f) => f.sub))];
    for (const s of subs) {
      const items = g.items.filter((f) => f.sub === s);
      const extra = header ? 2 : 0;
      const wraps = items.filter((f) => f.text.length > 85 || f.role.includes(',')).length;
      blocks.push({ rows: items.length + wraps * 0.6 + (s ? 2 : 1) + extra, html: header + `${s ? `<div class="sub">${esc(s)}</div>` : ''}<table class="fr"><tr><th>ID</th><th>Requirement</th><th>Role</th><th>Priority</th></tr>${items.map((f) => `<tr><td class="id">${f.id}</td><td>${esc(f.text.replace(/ \((?:not built|online payment not built|WhatsApp not connected)[^)]*\)/i, ''))}${f.status !== 'Built' ? ` <span class="nb">${f.status.toUpperCase()}</span>` : ''}</td><td class="ro">${f.role.split(', ').map((r) => `<span class="tag">${r}</span>`).join('')}</td><td class="pr">${pill(f.priority)}</td></tr>`).join('')}</table>` });
      header = '';
    }
  }
  const frPages = [];
  let cur = [], used = 0;
  for (const b of blocks) {
    if (used + b.rows > 36 && cur.length) { frPages.push(cur); cur = []; used = 0; }
    cur.push(b.html); used += b.rows;
  }
  frPages.push(cur);
  const frHtml = frPages.map((p) => page(p.join(''))).join('');

  const nfrIcon = { Security: 'lock', Privacy: 'eye', Transport: 'globe', Availability: 'activity', Accessibility: 'access', Usability: 'phone', Maintainability: 'check', Portability: 'server', 'AI safety': 'bot', Auditability: 'list', 'Abuse protection': 'shield', Performance: 'gauge', 'Email actions': 'mail', Hosting: 'cloud' };
  const nfr = page(`
    ${head(4, 'Non-Functional Requirements', 'How well the portal must work: security, privacy, quality and operation.')}
    <div class="nfr" data-panel="nfr">${d.nfrs.map((n) => `<div class="nf"><div class="ic">${icon(nfrIcon[n.area] || 'check', '#fff', 17)}</div><div><b>${n.area}</b><span class="id">${n.id}</span><p>${esc(n.text).replace(/(Uptime target not set|No WCAG audit yet|Webhook rate limit not built|No load target set or measured)/, '<span class="gap">$1</span>')}</p></div></div>`).join('')}</div>
    <p style="font-size:9pt;color:#666;margin-top:10px">Items in <span class="gap">coral</span> are open gaps: a target still has to be agreed or the control is not built yet.</p>
  `);

  const box = (t, sub, color) => `<div class="stk-box" style="border-color:#${color}"><b style="color:#${color}">${t}</b><span>${sub}</span></div>`;
  const stack = page(`
    ${head(5, 'Technology stack and API connections', 'How the front end and the back-end APIs are connected.')}
    <div data-panel="stack" class="stk">
      <div class="stk-row">${box('Web app', 'vanilla JS at /', C.teal)}${box('Phone app', 'PWA at /m/ · Android', C.teal)}${box('Flutter app', 'Dart, same API', C.teal)}${box('React app', 'TypeScript (migration)', C.teal)}</div>
      <div class="stk-arrow">HTTPS + JSON · session cookie after POST /api/login</div>
      <div class="stk-row"><div class="stk-api"><b>REST API</b><span>Node 22 + Express (system of record) · Java Spring Boot (same URLs, later)</span><span class="stk-chips">${['role check on every route', 'strict allow-lists', 'CSRF origin check', 'audit trail', 'notifications', '/api/pulse live refresh'].map(x => `<i>${x}</i>`).join('')}</span></div></div>
      <div class="stk-arrow">reads and writes · sends</div>
      <div class="stk-row">${box('Database', 'SQLite now · PostgreSQL 16', C.navy)}${box('Messaging', 'Telegram · n8n LLM gate', C.coral)}${box('Email desk', 'n8n + Gmail, signed links', C.coral)}${box('Cards', 'Web NFC · USB reader', C.dteal)}</div>
    </div>
    <h2>How a screen gets its data</h2><ol class="stk-flow">${d.stack.flow.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <h2>API map</h2><table class="fr"><tr><th>Area</th><th>Main routes</th><th>Used by</th><th>Contract</th></tr>${d.stack.apis.map(a => `<tr><td class="id" style="width:140px">${esc(a[0])}</td><td style="font-family:Consolas,monospace;font-size:8pt">${esc(a[1])}</td><td class="ro">${esc(a[2])}</td><td style="width:90px">${esc(a[3])}</td></tr>`).join('')}</table>
  `);
  const T = d.tests, K = d.capacity;
  const maxT = T ? Math.max(...T.suites.map(x => x[1])) : 1;
  const testsPage = !T ? '' : page(`
    ${head(6, 'Tests done', 'What has been tested, automatically and by hand.')}
    <div data-panel="tests"><div class="stats" style="grid-template-columns:repeat(4,1fr)">${T.other.map(([l, v]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>
    <h2>Automated test suites</h2>${T.suites.map(([n, c, w]) => `<div class="hbar" style="grid-template-columns:210px 1fr 40px"><span>${esc(n)}</span><div class="track"><div style="width:${c / maxT * 100}%;background:#${C.teal}"></div></div><b>${c}</b></div><div class="muted" style="font-size:8.5pt;margin:-2px 0 6px 218px">${esc(w)}</div>`).join('')}</div>
    <p class="card" style="margin-top:12px">${esc(T.manual)}</p>
  `);
  const maxR = K ? Math.max(...K.levels.map(l => l.rps)) : 1;
  const capPage = !K ? '' : page(`
    ${head(7, 'Capacity and scaling', 'How many people the portal can serve, and what to change to grow.')}
    <div data-panel="capacity"><div class="stats" style="grid-template-columns:repeat(4,1fr)"><div class="stat"><div class="v">${K.users.toLocaleString('en-IN')}</div><div class="l">people using it at the same moment</div></div><div class="stat"><div class="v">${K.sustained_rps}</div><div class="l">requests per second</div></div><div class="stat"><div class="v">${K.login_per_sec}/s</div><div class="l">sign-ins</div></div><div class="stat"><div class="v">${K.db_mb} MB</div><div class="l">test database</div></div></div>
    <h2>Load test: throughput and response time</h2><div class="capchart">${K.levels.map(l => `<div class="capcol"><span class="capv">${l.rps}/s</span><div class="capbar" style="height:${Math.max(6, l.rps / maxR * 120)}px"></div><span class="capp" style="color:${l.p95_ms < 500 && !l.errors ? '#' + C.dteal : '#' + C.coral}">p95 ${l.p95_ms} ms</span><b>${l.concurrency} in flight</b></div>`).join('')}</div>
    <p class="muted" style="font-size:8.5pt;margin:4px 0 0">${esc(K.model)} Machine: ${esc(K.machine)}.</p></div>
    <div data-panel="scale"><h2>To scale</h2><div class="ladder">${K.scale.map(([w, c, t], i) => `<div class="rung" style="--n:${i}"><span class="num" style="width:30px;height:30px;font-size:12pt">${i + 1}</span><div><b>${esc(w)}</b><p>${esc(c)}</p><span class="tag">${esc(t)}</span></div></div>`).join('')}</div>
    <table class="fr" style="margin-top:10px"><tr><th>Database</th><th></th></tr>${K.db.map(([a, b]) => `<tr><td class="id" style="width:110px">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></div>
  `);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Requirements Document</title><style>${css}</style></head><body>${cover}${glance}${scope}${personas}${roles}${moscow}${frHtml}${nfr}${stack}${testsPage}${capPage}
  <script>document.querySelectorAll('.page:not(.cover) .pn').forEach((e,i)=>e.textContent=i+2)</script></body></html>`;
};
