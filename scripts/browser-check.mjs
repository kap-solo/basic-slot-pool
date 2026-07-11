import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5176/?dev=true&tall=true&sessionID=local-demo&rgs_url=http://127.0.0.1:5176';
const errors = [];
const logs = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  logs.push(`[${msg.type()}] ${msg.text()}`);
});

try {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  console.log('status', response?.status());
  await page.waitForTimeout(4000);
  const canvas = await page.$('#slot-board canvas');
  console.log('canvas', canvas ? 'present' : 'missing');
  console.log('title', await page.title());
  const message = await page.textContent('#message');
  console.log('message', message);
} catch (err) {
  errors.push(`goto: ${err}`);
}

if (errors.length) {
  console.log('\n--- errors ---');
  errors.forEach((e) => console.log(e));
}

await browser.close();
process.exit(errors.length ? 1 : 0);
