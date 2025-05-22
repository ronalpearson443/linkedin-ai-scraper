// scrape.js  – uses stored session
const { chromium } = require('playwright');

const POST_LIMIT = 10;
const PROFILE_LIMIT = 10;

(async () => {
  const WEBHOOK = process.env.N8N_WEBHOOK_URL;
  if (!WEBHOOK) throw new Error('Missing N8N_WEBHOOK_URL');

  /* 1) launch with saved cookies */
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: 'linkedin-state.json' });
  const page    = await context.newPage();

  /* 2) go straight to search */
  await page.goto('https://www.linkedin.com/search/results/content/?keywords=AI');
  await autoScroll(page);

  /* …rest of your code unchanged… */
})();
