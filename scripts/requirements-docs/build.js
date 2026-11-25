// node build.js  ->  PDF (designed HTML printed by Chrome), panel PNGs, Word and PowerPoint.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'Requirements Documents');
const TMP = path.join(__dirname, 'out');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const IMG = path.join(ROOT, 'docs', 'images');
const fileUrl = (f) => 'file:///' + f.split(path.sep).join('/');
d.img = { roles: fileUrl(path.join(IMG, 'whiteboard-roles-process.jpg')), arch: fileUrl(path.join(IMG, 'whiteboard-architecture.jpg')) };
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function renderPdf() {
  fs.mkdirSync(TMP, { recursive: true });
  const htmlFile = path.join(TMP, 'requirements.html');
  fs.writeFileSync(htmlFile, require('./html')(d));
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ deviceScaleFactor: 2.5, viewport: { width: 794, height: 1123 } });
  await page.goto('file:///' + htmlFile.replace(/\\/g, '/'));
  await page.pdf({ path: path.join(OUT, 'Requirements Document.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  // Panels reused as pictures in the Word file.
  const panels = {};
  for (const el of await page.$$('[data-panel]')) {
    const name = await el.getAttribute('data-panel');
    const file = path.join(TMP, `${name}.png`);
    await el.screenshot({ path: file });
    const box = await el.boundingBox();
    panels[name] = { file, w: box.width, h: box.height };
  }
  await browser.close();
  return panels;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const panels = await renderPdf();
  console.log('PDF done; panels:', Object.keys(panels).join(', '));
  if (process.argv.includes('--pdf-only')) return;
  await require('./docx-build')(d, panels, path.join(OUT, 'Requirements Document.docx'));
  console.log('Word done');
  await require('./pptx-build')(d, path.join(OUT, 'Requirements Presentation.pptx'));
  console.log('PowerPoint done');
})().catch((e) => { console.error(e); process.exit(1); });
