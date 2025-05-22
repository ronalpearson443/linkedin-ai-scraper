// scrape.js
const { chromium } = require('playwright');

(async () => {
  const EMAIL = process.env.LINKEDIN_EMAIL;
  const PASS  = process.env.LINKEDIN_PASSWORD;
  const WEBHOOK = process.env.N8N_WEBHOOK_URL;

  if (!EMAIL || !PASS || !WEBHOOK) {
    console.error('❌ Missing env vars: LINKEDIN_EMAIL, LINKEDIN_PASSWORD, N8N_WEBHOOK_URL');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1) Login
  await page.goto('https://www.linkedin.com/login');
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASS);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  // 2) Search "AI" posts from last 24h
  await page.goto('https://www.linkedin.com/search/results/content/?keywords=AI');
  await autoScroll(page);

  // Collect candidate posts + timestamp text
  const posts = await page.$$eval('div.search-result__wrapper', els =>
    els.map(el => {
      const a = el.querySelector('a.app-aware-link');
      const t = el.querySelector('span.feed-shared-actor__sub-description > span');
      return a && t ? { url: a.href, ts: t.innerText.trim() } : null;
    }).filter(Boolean)
  );

  // Keep only posts with "h"/"m"/"s" in their timestamp (last 24h)
  const recent = posts.filter(p => /[0-9]+[hms]/.test(p.ts));

  const output = [];
  for (const post of recent) {
    await page.goto(post.url);
    await page.waitForLoadState('networkidle');

    // Likers
    let likers = [];
    try {
      await page.click('button[aria-label*="reactions"]');
      await page.waitForSelector('div.reactors-list', { timeout: 5000 });
      likers = await page.$$eval('div.reactors-list a.reactor-container__link', els =>
        els.map(x => x.href)
      );
    } catch {}

    // Commenters
    let commenters = [];
    try {
      const loadMore = await page.$('button.comments-comments-list__load-more-button');
      if (loadMore) await loadMore.click();
      commenters = await page.$$eval(
        'span.comments-post-meta__name a',
        els => els.map(x => x.href)
      );
    } catch {}

    output.push({ postUrl: post.url, likers, commenters });
  }

  await browser.close();

  // 3) POST to n8n
  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(output),
  });
  console.log(`✅ Sent ${output.length} posts to n8n`);
})();

// helper: scroll down page gradually
async function autoScroll(page) {
  await page.evaluate(() => new Promise(res => {
    let total = 0, dist = 100;
    const timer = setInterval(() => {
      window.scrollBy(0, dist);
      total += dist;
      if (total >= document.body.scrollHeight - window.innerHeight) {
        clearInterval(timer);
        return res();
      }
    }, 200);
  }));
}
