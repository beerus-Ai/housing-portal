// Screenshots each slide of out/deck.html (made by preview_pptx.py) for visual checks.
const path = require('path');
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const p = await b.newPage({ viewport: { width: 1300, height: 740 } });
  await p.goto('file:///' + path.join(__dirname, 'out', 'deck.html').split(path.sep).join('/'));
  const els = await p.$$('body>div');
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: path.join(__dirname, 'out', 's' + String(i + 1).padStart(2, '0') + '.png') });
  await b.close();
})();
