// PowerPoint version: a short visual deck (native shapes and a native chart), 16:9 wide.
const path = require('path');
const pptxgen = require('pptxgenjs');
const { chromium } = require('playwright-core');
const { C, ICON, groups, counts } = require('./common');

const SKILL = process.env.PPTX_SKILL || 'C:/Users/Tatianv3/.claude/skills/synced/d4ea58fa-2501-4f9b-b01b-4aeef8ad66f2_1d4ba26e-c022-4896-8e30-e711b56da246/pptx';
const THEME = {
  name: 'Sahyadri Brief', headFontFace: 'Arial', bodyFontFace: 'Calibri',
  colors: { dk1: C.ink, lt1: C.white, dk2: C.navy, lt2: C.beige, accent1: C.teal, accent2: C.coral, accent3: C.lime, accent4: C.dteal, accent5: C.navy, accent6: C.grey, hlink: C.teal, folHlink: C.dteal },
};
const PRI = { M: C.teal, S: C.coral, C: C.lime };
const PRI_LABEL = { M: 'Must', S: 'Should', C: 'Could' };

async function renderIcons(names) {
  const browser = await require('playwright-core').chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  const out = {};
  for (const n of names) {
    await page.setContent(`<html><body style="margin:0;background:transparent"><svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg></body></html>`);
    out[n] = 'image/png;base64,' + (await page.screenshot({ omitBackground: true })).toString('base64');
  }
  await browser.close();
  return out;
}

module.exports = async function buildPptx(d, outFile) {
  const ic = await renderIcons(Object.keys(ICON));
  const k = counts(d);
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pres.title = 'Requirements Document';
  pres.author = 'Sahyadri Heights project team';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const S = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'DARK', background: { color: C.navy },
    objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.2, w: 8.5, h: 1.9, fontFace: 'Arial', fontSize: 48, bold: true, color: S.background1, valign: 'top', margin: 0 }, text: '' } }],
  });
  pres.defineSlideMaster({
    title: 'CONTENT', background: { color: C.white },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontFace: 'Arial', fontSize: 36, bold: true, color: S.text2, valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: 'Sahyadri Heights Housing Society Portal  |  Requirements Document', options: { x: 0.6, y: 7.05, w: 8, h: 0.3, fontSize: 10, color: S.accent2, margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: S.accent6, align: 'right' },
  });

  pres.defineSlideMaster({
    title: 'SECTION', background: { color: C.white },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 1.5, y: 0.35, w: 11.2, h: 0.85, fontFace: 'Arial', fontSize: 36, bold: true, color: S.text2, valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: 'Sahyadri Heights Housing Society Portal  |  Requirements Document', options: { x: 0.6, y: 7.05, w: 8, h: 0.3, fontSize: 10, color: S.accent2, margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: S.accent6, align: 'right' },
  });

  const sections = ['Overview', '1 Scope', '2 Personas', '3 Functional Requirements', '4 Non-Functional Requirements', 'Next steps'];
  let sec = sections[0];
  const slide = (master) => pres.addSlide({ masterName: master, sectionTitle: sec });
  const sslide = () => slide('SECTION');
  const section = (name) => { sec = name; pres.addSection({ title: name }); };
  // Title with an optional numbered teal circle in front (sections 1-4).
  const title = (s, text, num) => {
    if (num) {
      s.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.42, w: 0.72, h: 0.72, fill: { color: S.accent1 }, line: { type: 'none' }, objectName: 'section-number' });
      s.addText(String(num), { x: 0.6, y: 0.42, w: 0.72, h: 0.72, fontFace: 'Arial', fontSize: 26, bold: true, color: S.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(text, { placeholder: 'title' });
    } else s.addText(text, { placeholder: 'title' });
  };
  const card = (s, x, y, w, h, fill = S.background2, name = 'card') =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { type: 'none' }, objectName: name });
  const iconCircle = (s, name, x, y, size, fill) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: fill }, line: { type: 'none' } });
    const pad = size * 0.24;
    s.addImage({ data: ic[name], x: x + pad, y: y + pad, w: size - 2 * pad, h: size - 2 * pad });
  };
  const priDot = (s, pr, x, y) => s.addShape(pres.shapes.OVAL, { x, y, w: 0.16, h: 0.16, fill: { color: PRI[pr] === C.lime ? S.accent3 : PRI[pr] === C.coral ? S.accent2 : S.accent1 }, line: { type: 'none' } });
  // A list of requirements with a priority dot each.
  const frList = (s, items, x, y, w, rowH = 0.42, size = 13) => {
    items.forEach((f, i) => {
      priDot(s, f.priority, x, y + i * rowH + rowH / 2 - 0.08);
      s.addText([{ text: f.short + (f.status !== 'Built' ? ' ' : ''), options: {} }, ...(f.status !== 'Built' ? [{ text: f.status === 'Not built' ? '(not built)' : '(partly)', options: { color: S.accent2, bold: true, fontSize: size - 2 } }] : [])],
        { x: x + 0.28, y: y + i * rowH, w: w - 0.28, h: rowH, fontSize: size, color: S.text1, valign: 'middle', margin: 0, isTextBox: true });
    });
  };
  const legend = (s, x, y) => {
    ['M', 'S', 'C'].forEach((pr, i) => { priDot(s, pr, x + i * 1.25, y + 0.07); s.addText(PRI_LABEL[pr], { x: x + i * 1.25 + 0.24, y, w: 0.9, h: 0.3, fontSize: 12, color: S.accent6, margin: 0, isTextBox: true }); });
  };
  const byArea = groups(d);
  const area = (prefix) => byArea.find((g) => g.area.startsWith(prefix));

  // 1. Title
  pres.addSection({ title: sec });
  let s = slide('DARK');
  s.addText('DELIVERABLE 1  ·  BUSINESS PROCESS AUTOMATION USING AI', { x: 0.8, y: 1.5, w: 9, h: 0.4, fontSize: 14, bold: true, color: S.accent3, charSpacing: 1, margin: 0, isTextBox: true });
  s.addText('Requirements Document', { placeholder: 'title' });
  s.addText('Sahyadri Heights Housing Society Portal', { x: 0.8, y: 4.15, w: 8.5, h: 0.6, fontSize: 24, color: 'CFD3F0', margin: 0, isTextBox: true });
  s.addText(`Version ${d.version}  ·  ${d.date}`, { x: 0.8, y: 6.4, w: 8, h: 0.4, fontSize: 14, color: 'CFD3F0', margin: 0, isTextBox: true });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.6 + c * 1.05, y: 1.4 + r * 1.05, w: 0.85, h: 0.85, rectRadius: 0.1, fill: { color: (r * 3 + c) % 4 === 1 ? S.accent4 : S.accent1 }, line: { type: 'none' }, objectName: 'motif' });
  }
  s.addNotes('Deliverable 1 of the brief: the requirements document. Four parts: scope, personas, functional and non-functional requirements.');

  // 2. Four parts
  s = slide('CONTENT');
  title(s, 'Four parts, as the brief asks');
  const parts = [['Scope', 'Problem, goal, what is in and out', 'home'], ['Personas', 'Six roles from the whiteboard', 'users'],
    ['Functional Requirements', `${d.frs.length} needs by process and role`, 'list'], ['Non-Functional Requirements', `${d.nfrs.length} quality needs`, 'shield']];
  parts.forEach(([h, sub, icn], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.7, 2.84, 4.2);
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: 2.0, w: 0.8, h: 0.8, fill: { color: S.accent1 }, line: { type: 'none' } });
    s.addText(String(i + 1), { x: x + 0.3, y: 2.0, w: 0.8, h: 0.8, fontFace: 'Arial', fontSize: 28, bold: true, color: S.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(h, { x: x + 0.3, y: 3.1, w: 2.3, h: 1.0, fontFace: 'Arial', fontSize: 20, bold: true, color: S.text2, valign: 'top', margin: 0, isTextBox: true });
    s.addText(sub, { x: x + 0.3, y: 4.2, w: 2.3, h: 1.2, fontSize: 15, color: S.text1, valign: 'top', margin: 0, isTextBox: true });
  });
  s.addText('Source: Session 3 brief, "What each group delivers": scope, personas, functional and non-functional needs.', { x: 0.6, y: 6.25, w: 12, h: 0.4, fontSize: 12, italic: true, color: S.accent6, margin: 0, isTextBox: true });

  // 3. At a glance
  s = slide('CONTENT');
  title(s, 'At a glance');
  [[d.personas.length, 'Personas'], [d.frs.length, 'Functional'], [d.nfrs.length, 'Non-functional'], [k.tested, 'Linked to tests']].forEach(([v, l], i) => {
    const y = 1.5 + i * 1.3;
    card(s, 0.6, y, 3.4, 1.1);
    s.addText(String(v), { x: 0.85, y, w: 1.3, h: 1.1, fontFace: 'Arial', fontSize: 40, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(l, { x: 2.15, y, w: 1.8, h: 1.1, fontSize: 15, color: S.text1, valign: 'middle', margin: 0, isTextBox: true });
  });
  s.addChart(pres.charts.BAR, ['M', 'S', 'C'].map((pr) => ({ name: PRI_LABEL[pr], labels: byArea.map((g) => g.label), values: byArea.map((g) => g.items.filter((f) => f.priority === pr).length) })), {
    x: 4.4, y: 1.4, w: 8.4, h: 5.3, barDir: 'bar', barGrouping: 'stacked', chartColors: [C.teal, C.coral, C.lime],
    showTitle: true, title: `Functional requirements by process and role (Must ${k.M} · Should ${k.S} · Could ${k.C})`, titleFontSize: 14, titleColor: C.navy, titleFontFace: '+mn-lt',
    showLegend: true, legendPos: 'b', legendFontSize: 12, legendFontFace: '+mn-lt',
    catAxisLabelColor: '555555', catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', catAxisOrientation: 'maxMin',
    valAxisLabelColor: '888888', valAxisLabelFontSize: 11, valAxisLabelFontFace: '+mn-lt', valAxisMaxVal: 18, valAxisMajorUnit: 3,
    valGridLine: { color: 'E6E3D8', size: 0.5 }, catGridLine: { style: 'none' },
    showValue: true, dataLabelPosition: 'ctr', dataLabelFontSize: 11, dataLabelColor: 'FFFFFF', dataLabelFontFace: '+mn-lt',
  });

  // 4. Scope: problem and goal + five core requirements
  section(sections[1]);
  s = sslide();
  title(s, 'Scope: one portal for the society', 1);
  card(s, 0.6, 1.5, 6.0, 1.9);
  s.addText([{ text: 'The problem', options: { bold: true, color: S.text2, fontFace: 'Arial', fontSize: 16, breakLine: true } }, { text: d.scope.problem, options: { fontSize: 14 } }], { x: 0.85, y: 1.6, w: 5.5, h: 1.7, color: S.text1, valign: 'top', margin: 0, isTextBox: true });
  card(s, 6.75, 1.5, 6.0, 1.9, S.text2);
  s.addText([{ text: 'The goal', options: { bold: true, color: S.accent3, fontFace: 'Arial', fontSize: 16, breakLine: true } }, { text: d.scope.goal, options: { fontSize: 14 } }], { x: 7.0, y: 1.6, w: 5.5, h: 1.7, color: S.background1, valign: 'top', margin: 0, isTextBox: true });
  s.addText('Five core requirements (Session 3 brief)', { x: 0.6, y: 3.65, w: 12, h: 0.4, fontFace: 'Arial', fontSize: 16, bold: true, color: S.text2, margin: 0, isTextBox: true });
  d.scope.core.forEach(([h, sub], i) => {
    const x = 0.6 + i * 2.45;
    card(s, x, 4.2, 2.25, 2.5);
    s.addShape(pres.shapes.OVAL, { x: x + 0.8, y: 4.4, w: 0.65, h: 0.65, fill: { color: S.accent1 }, line: { type: 'none' } });
    s.addText(String(i + 1), { x: x + 0.8, y: 4.4, w: 0.65, h: 0.65, fontFace: 'Arial', fontSize: 20, bold: true, color: S.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(h, { x: x + 0.15, y: 5.15, w: 1.95, h: 0.45, fontFace: 'Arial', fontSize: 14, bold: true, color: S.text2, align: 'center', margin: 0, isTextBox: true });
    s.addText(sub, { x: x + 0.15, y: 5.6, w: 1.95, h: 1.0, fontSize: 12, color: S.text1, align: 'center', valign: 'top', margin: 0, isTextBox: true });
  });

  // 5. Scope: product architecture layers + out of scope
  s = sslide();
  title(s, 'In scope: the product architecture', 1);
  let y = 1.5;
  for (const [layer, items] of d.scope.layers) {
    const rows = Math.ceil(items.length / 4);
    const h = 0.3 + rows * 0.5;
    card(s, 0.6, y, 1.9, h, S.text2);
    s.addText(layer, { x: 0.7, y, w: 1.7, h, fontFace: 'Arial', fontSize: 14, bold: true, color: S.background1, valign: 'middle', margin: 0, isTextBox: true });
    card(s, 2.6, y, 6.6, h);
    items.forEach((it, j) => {
      const cx = 2.75 + (j % 4) * 1.6, cy = y + 0.15 + Math.floor(j / 4) * 0.5;
      const planned = /planned/.test(it);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: cy, w: 1.5, h: 0.4, rectRadius: 0.06, fill: { color: S.background1 }, line: { color: planned ? C.grey : C.teal, width: 1.25, dashType: planned ? 'dash' : 'solid' } });
      s.addText(it.replace(' (suggests only)', '').replace(' (planned)', ''), { x: cx, y: cy, w: 1.5, h: 0.4, fontSize: 11, bold: true, color: planned ? S.accent6 : S.text2, align: 'center', valign: 'middle', margin: 0, isTextBox: true, fit: 'shrink' });
    });
    y += h + 0.15;
  }
  card(s, 9.45, 1.5, 3.3, 5.2);
  s.addText('Out of scope', { x: 9.7, y: 1.65, w: 2.9, h: 0.45, fontFace: 'Arial', fontSize: 16, bold: true, color: S.text2, margin: 0, isTextBox: true });
  s.addText(d.scope.out.map((x, i) => ({ text: x, options: { bullet: true, breakLine: i < d.scope.out.length - 1 } })), { x: 9.7, y: 2.15, w: 2.9, h: 4.3, fontSize: 14, color: S.text1, valign: 'top', paraSpaceAfter: 6, margin: 0, isTextBox: true });
  s.addText('Dashed: planned, not built. Source: faculty whiteboard, 25 Nov 2026.', { x: 0.6, y: 6.45, w: 8.6, h: 0.3, fontSize: 11, italic: true, color: S.accent6, margin: 0, isTextBox: true });

  // 6. Personas
  section(sections[2]);
  s = sslide();
  title(s, 'Six personas from the whiteboard', 2);
  const fills = [S.accent1, S.text2, S.accent2, S.accent4, S.text2, S.accent1];
  d.personas.forEach((p, i) => {
    const x = 0.6 + (i % 3) * 4.1, yy = 1.45 + Math.floor(i / 3) * 2.75;
    card(s, x, yy, 3.9, 2.6);
    iconCircle(s, p.icon, x + 0.2, yy + 0.2, 0.75, fills[i]);
    s.addText([{ text: `${i + 1} · ${p.role.toUpperCase()}`, options: { fontSize: 10, bold: true, color: S.accent4, breakLine: true } }, { text: p.name, options: { fontSize: 16, bold: true, color: S.text2, fontFace: 'Arial' } }],
      { x: x + 1.1, y: yy + 0.18, w: 2.65, h: 0.8, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(`“${p.quote}”`, { x: x + 0.2, y: yy + 1.05, w: 3.5, h: 0.7, fontSize: 12, italic: true, color: S.text2, valign: 'top', margin: 0, isTextBox: true });
    s.addText([{ text: 'Wants: ', options: { bold: true, color: S.accent4 } }, { text: p.goals.slice(0, 3).join(' · ') }], { x: x + 0.2, y: yy + 1.8, w: 3.5, h: 0.7, fontSize: 11, color: S.text1, valign: 'top', margin: 0, isTextBox: true });
  });
  s.addNotes('Names are illustrative; no real resident data is used. Goals and pains for each persona are in the Word document.');

  // 6b. Owner, tenant, family and committee
  s = sslide();
  title(s, 'Owner, tenant, family, committee', 2);
  const head = [{ text: '', options: { fill: { color: C.navy } } }, ...d.roles.cols.map(c => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: C.navy } } }))];
  s.addTable([head, ...d.roles.rows.map((r, i) => r.map((x, j) => ({ text: x, options: { bold: j === 0, color: j === 0 ? C.navy : C.ink, fill: { color: i % 2 ? 'FFFFFF' : C.beige } } })))],
    { x: 0.6, y: 1.45, w: 12.1, colW: [2.1, 2.5, 2.5, 2.5, 2.5], fontFace: 'Calibri', fontSize: 11, border: { type: 'solid', pt: 0.5, color: 'E2DFD3' }, valign: 'middle', rowH: 0.52 });
  s.addText(d.roles.note, { x: 0.6, y: 6.25, w: 12.1, h: 0.6, fontSize: 11, italic: true, color: S.accent6, margin: 0, isTextBox: true });

  // 7. Process list
  section(sections[3]);
  s = sslide();
  title(s, 'Requirements follow the process list', 3);
  const counts3 = { '1': area('Process 1').items, '2': area('Process 2').items };
  const p3 = area('Process 3').items;
  d.process.forEach((st, i) => {
    const x = 0.6 + i * 2.05;
    const items = counts3[st.n] || p3.filter((f) => f.sub && f.sub.startsWith(st.n));
    s.addShape(i === 0 ? pres.shapes.PENTAGON : pres.shapes.CHEVRON, { x, y: 1.7, w: 2.15, h: 1.3, fill: { color: i < 2 ? S.text2 : S.accent1 }, line: { type: 'none' }, objectName: `step-${st.n}` });
    s.addText([{ text: st.n, options: { fontSize: 20, bold: true, breakLine: true } }, { text: st.name, options: { fontSize: 12, bold: true } }],
      { x: x + (i === 0 ? 0.15 : 0.45), y: 1.7, w: 1.5, h: 1.3, fontFace: 'Arial', color: S.background1, valign: 'middle', margin: 0, isTextBox: true });
    card(s, x + 0.05, 3.3, 1.85, 2.3);
    s.addText(String(items.length), { x: x + 0.05, y: 3.4, w: 1.85, h: 0.8, fontFace: 'Arial', fontSize: 36, bold: true, color: S.text2, align: 'center', margin: 0, isTextBox: true });
    s.addText('requirements', { x: x + 0.05, y: 4.15, w: 1.85, h: 0.3, fontSize: 12, color: S.accent6, align: 'center', margin: 0, isTextBox: true });
    s.addText(`${items.filter((f) => f.priority === 'M').length} Must`, { x: x + 0.05, y: 4.5, w: 1.85, h: 0.35, fontSize: 13, bold: true, color: S.accent1, align: 'center', margin: 0, isTextBox: true });
    s.addText(st.roles, { x: x + 0.1, y: 4.9, w: 1.75, h: 0.6, fontSize: 11, color: S.text1, align: 'center', valign: 'top', margin: 0, isTextBox: true });
  });
  s.addShape(pres.shapes.LINE, { x: 4.75, y: 5.95, w: 8.05, h: 0, line: { color: C.dteal, width: 2 } });
  s.addText('3 · Lifecycle of a resident request', { x: 4.75, y: 6.0, w: 8.05, h: 0.35, fontSize: 13, bold: true, color: S.accent4, align: 'center', margin: 0, isTextBox: true });
  s.addText(`Plus ${d.frs.length - area('Process 1').items.length - area('Process 2').items.length - p3.length} role and module requirements (next slides). Source: faculty whiteboard, 21 Nov 2026.`, { x: 0.6, y: 6.45, w: 12, h: 0.3, fontSize: 11, italic: true, color: S.accent6, margin: 0, isTextBox: true });

  // 8. Process 1 and 2
  s = sslide();
  title(s, 'Process 1 and 2: join, then report', 3);
  [[area('Process 1'), 'user-plus', '1 · On-boarding and verification'], [area('Process 2'), 'send', '2 · Raise a request']].forEach(([g, icn, h], i) => {
    const x = 0.6 + i * 6.15;
    card(s, x, 1.45, 5.95, 5.25);
    iconCircle(s, icn, x + 0.25, 1.65, 0.6, S.text2);
    s.addText(h, { x: x + 1.0, y: 1.65, w: 4.8, h: 0.6, fontFace: 'Arial', fontSize: 17, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true });
    frList(s, g.items, x + 0.3, 2.45, 5.4, 0.41, 14);
  });
  legend(s, 9.0, 6.78);

  // 9. Process 3
  s = sslide();
  title(s, 'Process 3: the life of a request', 3);
  const subs = [...new Set(p3.map((f) => f.sub))];
  subs.forEach((sb, i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.45, 2.9, 5.25);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.45, w: 2.9, h: 0.6, rectRadius: 0.12, fill: { color: S.accent1 }, line: { type: 'none' } });
    s.addText(sb, { x: x + 0.2, y: 1.45, w: 2.6, h: 0.6, fontFace: 'Arial', fontSize: 16, bold: true, color: S.background1, valign: 'middle', margin: 0, isTextBox: true });
    frList(s, p3.filter((f) => f.sub === sb), x + 0.2, 2.2, 2.6, 0.62, 13);
  });
  legend(s, 9.0, 6.78);

  // 10. Roles
  s = sslide();
  title(s, 'What each role needs', 3);
  const com = area('Committee');
  card(s, 0.6, 1.45, 6.4, 5.25);
  iconCircle(s, 'users', 0.85, 1.6, 0.55, S.text2);
  s.addText('Committee Member: dashboard, reports, broadcast, monitoring', { x: 1.55, y: 1.6, w: 5.3, h: 0.55, fontFace: 'Arial', fontSize: 14, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true });
  frList(s, com.items, 0.9, 2.3, 5.9, 0.4, 13);
  [[area('Head'), 'award', 'Head of Committee and Admin'], [area('Staff'), 'tool', 'Staff'], [area('IT'), 'cpu', 'IT Staff: support, training, upkeep']].reduce((yy, [g, icn, h]) => {
    const hh = 0.6 + g.items.length * 0.31;
    card(s, 7.2, yy, 5.55, hh);
    iconCircle(s, icn, 7.4, yy + 0.12, 0.42, S.accent4);
    s.addText(h, { x: 7.95, y: yy + 0.08, w: 4.6, h: 0.45, fontFace: 'Arial', fontSize: 13, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true });
    frList(s, g.items, 7.45, yy + 0.52, 5.1, 0.31, 12);
    return yy + hh + 0.12;
  }, 1.45);
  legend(s, 9.0, 6.78);

  // 11. Society modules
  s = sslide();
  title(s, 'Society modules', 3);
  const sm = area('Society').items;
  const mods = [['Amenities', 'home', ['FR-SM-01', 'FR-SM-02']], ['Maintenance dues', 'list', ['FR-SM-03', 'FR-SM-04', 'FR-SM-05']], ['Inventory', 'server', ['FR-SM-06']], ['Waste', 'refresh', ['FR-SM-07', 'FR-SM-08', 'FR-SM-09']]];
  mods.forEach(([h, icn, ids], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.45, 2.9, 4.45);
    iconCircle(s, icn, x + 1.05, 1.7, 0.8, i % 2 ? S.accent2 : S.accent1);
    s.addText(h, { x: x + 0.15, y: 2.65, w: 2.6, h: 0.5, fontFace: 'Arial', fontSize: 17, bold: true, color: S.text2, align: 'center', margin: 0, isTextBox: true });
    frList(s, sm.filter((f) => ids.includes(f.id)), x + 0.25, 3.3, 2.5, 0.62, 13);
  });
  card(s, 0.6, 6.05, 12.15, 0.6, S.text2);
  const home = sm.find((f) => f.id === 'FR-SM-10');
  s.addText(`${home.short}: residents and the committee reach every module in one tap. Payment gateway: planned.`, { x: 0.85, y: 6.05, w: 11.7, h: 0.6, fontSize: 14, color: S.background1, valign: 'middle', margin: 0, isTextBox: true });

  // 12. NFR grid
  section(sections[4]);
  s = sslide();
  title(s, 'Non-functional requirements', 4);
  const nfrIcon = { Security: 'lock', Privacy: 'eye', Transport: 'globe', Availability: 'activity', Accessibility: 'access', Usability: 'phone', Maintainability: 'check', Portability: 'server', 'AI safety': 'bot', Auditability: 'list', 'Abuse protection': 'shield', Performance: 'gauge', 'Email actions': 'mail', Hosting: 'cloud' };
  const gaps = ['NFR-04', 'NFR-05', 'NFR-11', 'NFR-12', 'NFR-14'];
  d.nfrs.forEach((n, i) => {
    const x = 0.6 + (i % 7) * 1.75, yy = 1.45 + Math.floor(i / 7) * 2.65;
    const gap = gaps.includes(n.id);
    card(s, x, yy, 1.62, 2.5, gap ? 'FFE9E4' : S.background2);
    iconCircle(s, nfrIcon[n.area], x + 0.5, yy + 0.18, 0.62, gap ? S.accent2 : S.accent4);
    s.addText(n.area, { x: x + 0.08, y: yy + 0.88, w: 1.46, h: 0.5, fontFace: 'Arial', fontSize: 12, bold: true, color: S.text2, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(n.short, { x: x + 0.1, y: yy + 1.38, w: 1.42, h: 1.05, fontSize: 11, color: S.text1, align: 'center', valign: 'top', margin: 0, isTextBox: true });
  });
  s.addText('Coral tiles: a target still has to be agreed or the control is not built yet.', { x: 0.6, y: 6.75, w: 8, h: 0.3, fontSize: 11, italic: true, color: S.accent2, margin: 0, isTextBox: true });

  // 12b. Technology stack and API connections
  s = slide('CONTENT');
  title(s, 'Stack and API connections');
  const clients = ['Web app', 'Phone app (PWA)', 'Flutter app', 'React app'];
  clients.forEach((c, i) => { card(s, 0.6 + i * 3.08, 1.45, 2.9, 0.9); s.addText(c, { x: 0.6 + i * 3.08, y: 1.45, w: 2.9, h: 0.9, fontFace: 'Arial', fontSize: 16, bold: true, color: S.accent4, align: 'center', valign: 'middle', margin: 0, isTextBox: true }); });
  s.addText('HTTPS + JSON · session cookie after POST /api/login', { x: 0.6, y: 2.45, w: 12.1, h: 0.4, fontSize: 13, bold: true, color: S.accent4, align: 'center', margin: 0, isTextBox: true });
  card(s, 0.6, 2.95, 12.1, 1.45, S.text2);
  s.addText([{ text: 'REST API · Node 22 + Express', options: { fontSize: 22, bold: true, fontFace: 'Arial', breakLine: true } }, { text: 'Role check on every route · strict allow-lists · CSRF check · audit trail · notifications · live refresh (/api/pulse). Java Spring Boot with the same URLs is the migration target.', options: { fontSize: 13, color: 'CFD3F0' } }],
    { x: 0.9, y: 3.0, w: 11.6, h: 1.35, color: S.background1, valign: 'middle', margin: 0, isTextBox: true });
  s.addText('reads and writes · sends', { x: 0.6, y: 4.5, w: 12.1, h: 0.4, fontSize: 13, bold: true, color: S.accent4, align: 'center', margin: 0, isTextBox: true });
  [['Database', 'SQLite now · PostgreSQL 16'], ['Messaging', 'Telegram · n8n LLM gate'], ['Email desk', 'n8n + Gmail, signed links'], ['Community cards', 'Web NFC · USB reader']].forEach(([h, sub], i) => { card(s, 0.6 + i * 3.08, 5.0, 2.9, 1.3); s.addText([{ text: h, options: { bold: true, fontSize: 16, color: S.text2, breakLine: true, fontFace: 'Arial' } }, { text: sub, options: { fontSize: 12 } }], { x: 0.75 + i * 3.08, y: 5.0, w: 2.6, h: 1.3, color: S.text1, valign: 'middle', margin: 0, isTextBox: true }); });
  s.addText('Every client uses the same API, so all screens show the same data. API map: Word, PDF and the Excel register (API map sheet).', { x: 0.6, y: 6.5, w: 12.1, h: 0.35, fontSize: 11, italic: true, color: S.accent6, margin: 0, isTextBox: true });

  if (d.tests) {
    s = slide('CONTENT'); title(s, 'Tests done');
    d.tests.other.forEach(([l, v], i) => { card(s, 0.6, 1.45 + i * 1.25, 3.6, 1.05); s.addText(String(v), { x: 0.85, y: 1.45 + i * 1.25, w: 1.5, h: 1.05, fontFace: 'Arial', fontSize: 30, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true }); s.addText(l, { x: 2.35, y: 1.45 + i * 1.25, w: 1.8, h: 1.05, fontSize: 13, color: S.text1, valign: 'middle', margin: 0, isTextBox: true }); });
    s.addChart(pres.charts.BAR, [{ name: 'Tests', labels: d.tests.suites.map(x => x[0]), values: d.tests.suites.map(x => x[1]) }], { x: 4.5, y: 1.4, w: 8.3, h: 5.2, barDir: 'bar', chartColors: [C.teal], showTitle: true, title: 'Automated tests per suite', titleFontSize: 14, titleColor: C.navy, titleFontFace: '+mn-lt', showLegend: false,
      catAxisLabelColor: '555555', catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', catAxisOrientation: 'maxMin', valAxisLabelColor: '888888', valAxisLabelFontSize: 11, valAxisLabelFontFace: '+mn-lt', valGridLine: { color: 'E6E3D8', size: 0.5 }, catGridLine: { style: 'none' }, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: '333333', dataLabelFontFace: '+mn-lt' });
  }
  if (d.capacity) {
    const K = d.capacity;
    s = slide('CONTENT'); title(s, 'Capacity and scaling');
    [[K.users.toLocaleString('en-IN'), 'people at the same moment'], [K.sustained_rps + '/s', 'requests sustained'], [K.db_mb + ' MB', 'test database']].forEach(([v, l], i) => { card(s, 0.6, 1.45 + i * 1.2, 3.6, 1.0); s.addText(v, { x: 0.85, y: 1.45 + i * 1.2, w: 1.9, h: 1.0, fontFace: 'Arial', fontSize: 26, bold: true, color: S.text2, valign: 'middle', margin: 0, isTextBox: true }); s.addText(l, { x: 2.75, y: 1.45 + i * 1.2, w: 1.4, h: 1.0, fontSize: 12, color: S.text1, valign: 'middle', margin: 0, isTextBox: true }); });
    s.addChart(pres.charts.BAR, [{ name: 'Requests/s', labels: K.levels.map(l => l.concurrency + ' in flight'), values: K.levels.map(l => l.rps) }], { x: 4.5, y: 1.4, w: 8.3, h: 2.9, barDir: 'col', chartColors: [C.teal], showTitle: true, title: 'Requests per second by requests in flight (p95 under 500 ms counts as OK)', titleFontSize: 13, titleColor: C.navy, titleFontFace: '+mn-lt', showLegend: false,
      catAxisLabelColor: '555555', catAxisLabelFontSize: 11, catAxisLabelFontFace: '+mn-lt', valAxisLabelColor: '888888', valAxisLabelFontSize: 10, valAxisLabelFontFace: '+mn-lt', valGridLine: { color: 'E6E3D8', size: 0.5 }, catGridLine: { style: 'none' }, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10, dataLabelColor: '333333', dataLabelFontFace: '+mn-lt' });
    K.scale.forEach(([w, c2, tools], i) => { const y = 4.55 + i * 0.75; card(s, 0.6 + i * 0.3, y, 12.1 - i * 0.3, 0.66, i === 0 ? S.background2 : 'E6F6FB'); s.addText([{ text: `${i + 1}. ${w}: `, options: { bold: true, color: S.text2 } }, { text: tools }], { x: 0.8 + i * 0.3, y, w: 11.8 - i * 0.3, h: 0.66, fontSize: 12, color: S.text1, valign: 'middle', margin: 0, isTextBox: true }); });
  }

  // 13. Next steps
  section(sections[5]);
  s = slide('DARK');
  s.addText('Where the detail lives, and what is open', { x: 0.8, y: 0.9, w: 11.5, h: 1.2, fontFace: 'Arial', fontSize: 36, bold: true, color: S.background1, margin: 0, isTextBox: true });
  const next = [['Word and PDF', 'Full wording of every requirement, role and priority', 'list'], ['Excel register', 'Filterable list; trace to user stories and test cases', 'check'],
    ['Jira (HSP)', 'Epics, stories with acceptance criteria, sprints', 'refresh'], ['Open gaps', 'WhatsApp channel, online payment, NFR targets for uptime and load', 'activity']];
  next.forEach(([h, sub, icn], i) => {
    const x = 0.8 + i * 3.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.6, w: 2.8, h: 3.3, rectRadius: 0.12, fill: { color: '3C4A9E' }, line: { type: 'none' } });
    iconCircle(s, icn, x + 0.3, 2.9, 0.75, i === 3 ? S.accent2 : S.accent1);
    s.addText(h, { x: x + 0.3, y: 3.85, w: 2.3, h: 0.5, fontFace: 'Arial', fontSize: 18, bold: true, color: S.background1, margin: 0, isTextBox: true });
    s.addText(sub, { x: x + 0.3, y: 4.4, w: 2.3, h: 1.3, fontSize: 14, color: 'CFD3F0', valign: 'top', margin: 0, isTextBox: true });
  });

  await pres.writeFile({ fileName: outFile });
  const { applyTheme } = require(path.join(SKILL, 'scripts', 'apply_theme.js'));
  await applyTheme(outFile, THEME);
};
