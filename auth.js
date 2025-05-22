const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto('https://www.linkedin.com/login');
  await page.fill('#username', process.env.LINKEDIN_EMAIL);
  await page.fill('#password', process.env.LINKEDIN_PASSWORD);

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForSelector('header.global-nav', { timeout: 120000 })
  ]);

  await context.storageState({ path: 'linkedin-state.json' });
  await browser.close();
  console.log('✅ Session saved: linkedin-state.json');
})();
