const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [,, file, out, scale, query] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: Number(scale || 1) });
  await page.goto('file://' + path.resolve(file) + (query ? '?' + query : ''));
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  if (out.endsWith('.pdf')) {
    await page.emulateMedia({ media: 'screen' });
    await page.pdf({ path: out, width: '24in', height: '36in', printBackground: true, scale: 1.92, pageRanges: '1' });
  } else {
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 1800 } });
  }
  await browser.close();
})();
