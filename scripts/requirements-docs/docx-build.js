// Word version: native headings and tables (editable), with the designed panels as pictures.
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, BorderStyle, PageBreak, Footer, Header, PageNumber, LevelFormat, VerticalAlign, TableLayoutType,
} = require('docx');
const { C, groups, counts } = require('./common');

const W = 9746; // A4 width minus 0.75" margins, in DXA
const PX = 650; // same width in pixels for pictures
const FONT = 'Calibri';
const HFONT = 'Arial';
const PRI = { M: ['Must', C.teal, C.white], S: ['Should', C.coral, C.white], C: ['Could', C.lime, '333333'] };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const thin = { style: BorderStyle.SINGLE, size: 4, color: 'E2DFD3' };

const t = (text, o = {}) => new TextRun({ text, font: o.font || FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color || C.ink });
const p = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { before: o.before || 0, after: o.after ?? 80 }, alignment: o.align, keepNext: o.keepNext, numbering: o.numbering });
const img = (panel, width = PX) => new Paragraph({
  spacing: { before: 60, after: 120 },
  children: [new ImageRun({ type: 'png', data: fs.readFileSync(panel.file), transformation: { width, height: Math.round((panel.h / panel.w) * width) } })],
});
const cell = (children, o = {}) => new TableCell({
  children: Array.isArray(children) ? children : [children],
  width: { size: o.w, type: WidthType.DXA },
  shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
  margins: { top: o.pad ?? 60, bottom: o.pad ?? 60, left: 100, right: 100 },
  verticalAlign: o.v || VerticalAlign.TOP,
  borders: o.borders,
});

function heading(num, title, lead) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: ` ${num} `, font: HFONT, bold: true, color: C.white, shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.teal } }), new TextRun({ text: `  ${title}`, font: HFONT })],
    }),
    p(t(lead, { color: '666666' }), { after: 160 }),
  ];
}

function frTable(items) {
  const cols = [1150, 5400, 2096, 1100];
  const head = new TableRow({
    tableHeader: true,
    children: ['ID', 'Requirement', 'Role', 'Priority'].map((h, i) => cell(p(t(h, { bold: true, color: C.white, size: 17, font: HFONT }), { after: 0 }), { w: cols[i], fill: C.navy })),
  });
  const rows = items.map((f, i) => {
    const [label, fill, color] = PRI[f.priority];
    const text = f.text.replace(/ \((?:not built|online payment not built|WhatsApp not connected)[^)]*\)/i, '');
    const band = i % 2 ? 'FAF9F5' : undefined;
    return new TableRow({
      cantSplit: true,
      children: [
        cell(p(t(f.id, { bold: true, color: C.navy, size: 17, font: HFONT }), { after: 0 }), { w: cols[0], fill: band }),
        cell(p([t(text, { size: 19 }), ...(f.status !== 'Built' ? [t(`  ${f.status.toUpperCase()}`, { bold: true, color: C.coral, size: 15 })] : [])], { after: 0 }), { w: cols[1], fill: band }),
        cell(p(t(f.role, { size: 17, color: '555555' }), { after: 0 }), { w: cols[2], fill: band }),
        cell(p(t(label, { bold: true, color, size: 16, font: HFONT }), { after: 0, align: AlignmentType.CENTER }), { w: cols[3], fill, v: VerticalAlign.CENTER }),
      ],
    });
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: cols, layout: TableLayoutType.FIXED,
    borders: { top: thin, bottom: thin, left: none, right: none, insideHorizontal: thin, insideVertical: none },
    rows: [head, ...rows],
  });
}

function bullets(items, ref) {
  return items.map((x) => p(t(x, { size: 19 }), { numbering: { reference: ref, level: 0 }, after: 30 }));
}

module.exports = async function buildDocx(d, panels, outFile) {
  const k = counts(d);
  const kids = [];

  // Cover
  kids.push(p(t('DELIVERABLE 1  ·  BUSINESS PROCESS AUTOMATION USING AI', { bold: true, color: C.dteal, size: 20, font: HFONT }), { before: 1800, after: 200 }));
  kids.push(p(t('Requirements Document', { bold: true, color: C.navy, size: 72, font: HFONT }), { after: 120 }));
  kids.push(p(t('Sahyadri Heights Housing Society Portal', { color: '555555', size: 32 }), { after: 600 }));
  const tiles = [['1', 'Scope', 'What the portal covers and what it does not'], ['2', 'Personas', 'The six roles from the whiteboard'],
    ['3', 'Functional Requirements', `${d.frs.length} needs, by process and role`], ['4', 'Non-Functional Requirements', `${d.nfrs.length} quality needs`]];
  const tw = W / 4;
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [tw, tw, tw, tw], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: C.white } },
    rows: [new TableRow({
      height: { value: 1700, rule: 'atLeast' },
      children: tiles.map(([n, title, sub]) => cell([
        p(t(n, { bold: true, color: C.lime, size: 40, font: HFONT }), { after: 60 }),
        p(t(title, { bold: true, color: C.white, size: 24, font: HFONT }), { after: 60 }),
        p(t(sub, { color: 'CFD3F0', size: 18 }), { after: 0 }),
      ], { w: tw, fill: C.navy, pad: 160 })),
    })],
  }));
  kids.push(p(t(`Version ${d.version}  ·  ${d.date}`, { color: '777777', size: 19 }), { before: 900, after: 40 }));
  kids.push(p(t('Sources: Session 3 assignment brief; faculty whiteboards of 21 and 25 November 2026', { color: '777777', size: 19 }), { after: 0 }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // At a glance
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'At a glance', font: HFONT })] }));
  kids.push(img(panels.glance));
  kids.push(p([t('Status. ', { bold: true }), t(`All requirements are built in the web app except WhatsApp intake and replies (FR-WR-07, FR-WR-11) and online payment of dues (part of FR-SM-05). ${k.tested} of ${d.frs.length} functional requirements are linked to test cases; the full trace is in the Excel register.`)]));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // 1 Scope
  kids.push(...heading(1, 'Scope', 'Why the portal exists and where its edges are.'));
  const half = W / 2;
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [half, half], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: C.white } },
    rows: [new TableRow({
      children: [
        cell([p(t('The problem', { bold: true, color: C.navy, font: HFONT })), p(t(d.scope.problem, { size: 19 }), { after: 0 })], { w: half, fill: C.beige, pad: 140 }),
        cell([p(t('The goal', { bold: true, color: C.lime, font: HFONT })), p(t(d.scope.goal, { size: 19, color: C.white }), { after: 0 })], { w: half, fill: C.navy, pad: 140 }),
      ],
    })],
  }));
  kids.push(img(panels.core));
  kids.push(img(panels.layers));
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [half, half], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: C.white } },
    rows: [new TableRow({
      children: [
        cell([p(t('Out of scope', { bold: true, color: C.navy, font: HFONT })), ...bullets(d.scope.out, 'out')], { w: half, fill: C.beige, pad: 140 }),
        cell([p(t('Assumptions', { bold: true, color: C.navy, font: HFONT })), ...bullets(d.scope.assumptions, 'as')], { w: half, fill: C.beige, pad: 140 }),
      ],
    })],
  }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // 2 Personas
  kids.push(...heading(2, 'Personas', 'The six roles on the faculty whiteboard. Names are illustrative; no real resident data is used.'));
  kids.push(img(panels['personas-a']));
  kids.push(img(panels['personas-b']));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // 3 Functional
  kids.push(...heading(3, 'Functional Requirements', 'What the portal must do, organised by the whiteboard process list and then by role.'));
  kids.push(p(t('Process list', { bold: true, color: C.navy, size: 24, font: HFONT }), { keepNext: true }));
  kids.push(img(panels.flow));
  kids.push(p(t('Priorities at a glance (MoSCoW, as in the brief)', { bold: true, color: C.navy, size: 24, font: HFONT }), { keepNext: true, before: 120 }));
  kids.push(img(panels.moscow));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  for (const g of groups(d)) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text: g.area, font: HFONT })] }));
    const subs = [...new Set(g.items.map((f) => f.sub))];
    for (const s of subs) {
      if (s) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun({ text: s.toUpperCase(), font: HFONT })] }));
      kids.push(frTable(g.items.filter((f) => f.sub === s)));
      kids.push(p(t(''), { after: 60 }));
    }
  }
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // 4 Non-functional
  kids.push(...heading(4, 'Non-Functional Requirements', 'How well the portal must work: security, privacy, quality and operation.'));
  const nc = [1000, 2000, 6746];
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: nc, layout: TableLayoutType.FIXED,
    borders: { top: thin, bottom: thin, left: none, right: none, insideHorizontal: { style: BorderStyle.SINGLE, size: 12, color: C.white }, insideVertical: none },
    rows: [
      new TableRow({ tableHeader: true, children: ['ID', 'Area', 'Requirement'].map((h, i) => cell(p(t(h, { bold: true, color: C.white, size: 17, font: HFONT }), { after: 0 }), { w: nc[i], fill: C.navy })) }),
      ...d.nfrs.map((n) => {
        const gap = n.text.match(/(Uptime target not set|No WCAG audit yet|Webhook rate limit not built|No load target set or measured)/);
        const main = gap ? n.text.replace(gap[1], '').replace(/[.;\s]+$/, '') : n.text;
        return new TableRow({
          cantSplit: true,
          children: [
            cell(p(t(n.id, { bold: true, color: C.navy, size: 17, font: HFONT }), { after: 0 }), { w: nc[0], fill: C.beige, v: VerticalAlign.CENTER }),
            cell(p(t(n.area, { bold: true, color: C.white, size: 19, font: HFONT }), { after: 0 }), { w: nc[1], fill: C.dteal, v: VerticalAlign.CENTER }),
            cell(p([t(main ? main + (gap ? '. ' : '') : '', { size: 19 }), ...(gap ? [t(gap[1], { bold: true, color: C.coral, size: 19 })] : [])], { after: 0 }), { w: nc[2], fill: C.beige, v: VerticalAlign.CENTER }),
          ],
        });
      }),
    ],
  }));
  kids.push(p(t('Items in coral are open gaps: a target still has to be agreed or the control is not built yet.', { size: 18, color: '666666' }), { before: 120 }));

  const doc = new Document({
    creator: 'Sahyadri Heights project team',
    title: 'Requirements Document',
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: C.ink } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 44, bold: true, color: C.navy }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 26, bold: true, color: C.navy }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 18, bold: true, color: C.dteal }, paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: ['out', 'as'].map((ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { color: ref === 'out' ? C.grey : C.coral } } }] })),
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 } }, titlePage: true },
      headers: { default: new Header({ children: [p(t('Requirements Document', { size: 16, color: C.grey }), { align: AlignmentType.RIGHT, after: 0 })] }) },
      footers: {
        default: new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: C.navy, space: 4 } }, children: [t('Sahyadri Heights Housing Society Portal  |  Requirements Document        Page ', { size: 16, color: C.coral }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.coral, font: FONT })] })] }),
        first: new Footer({ children: [p(t(''))] }),
      },
      children: kids,
    }],
  });
  fs.writeFileSync(outFile, await Packer.toBuffer(doc));
};
