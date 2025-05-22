// scrape.js
const { chromium } = require('playwright');

const POST_LIMIT    = 10;  // scrape at most 10 posts
const PROFILE_LIMIT = 10;  // and 10 unique profiles per run

(async () => {
  const EMAIL   = process.env.LINKEDIN_EMAIL;
  const PASS    = process.env.LINKEDIN_PASSWORD;
  const WEBHOOK = process.env.N8N_WEBHOOK_URL;
  if (!EMAIL || !PASS || !WEBHOOK) {
    console.error('❌ Missing env vars');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  /* ─── 1. Login ───────────────────────────────────────────── */
  await page.goto('https://www.linkedin.com/login');
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASS);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  /* ─── 2. Search for "AI" posts (24 h) ────────────────────── */
  await page.goto('https://www.linkedin.com/search/results/content/?keywords=AI');
  await autoScroll(page);

  const recent = await page.$$eval(
    'div.search-result__wrapper',
    els => els
      .map(el => {
        const a = el.querySelector('a.app-aware-link');
        const t = el.querySelector('span.feed-shared-actor__sub-description > span');
        return a && t ? { url: a.href, ts: t.innerText.trim() } : null;
      })
      .filter(Boolean)
      .filter(p => /[0-9]+[hms]/.test(p.ts))                    // <= 24 h
  );

  const output = [];

  /* ─── 3. Visit each post, skip if < 10 comments ──────────── */
  for (const post of recent.slice(0, POST_LIMIT)) {
    await page.goto(post.url, { waitUntil: 'networkidle' });

    // comment count text e.g. "23 comments"
    const commentText = await page.$$eval('span', els =>
      els.map(e => e.innerText).find(t => /\d+\s+comments?$/i.test(t))
    );
    const commentCount = commentText ? parseInt(commentText) : 0;
    if (commentCount < 10) {
      console.log(`⏭  Skipping (only ${commentCount} comments): ${post.url}`);
      continue;
    }

    // 4. gather unique likers + commenters
    const collect = async sel =>
      Array.from(new Set(await page.$$eval(sel, l => l.map(a => a.href))));

    const likers     = await collect('button[aria-label*="reactions"] a.reactor-container__link');
    const commenters = await collect('span.comments-post-meta__name a');
    const profileUrls = Array.from(new Set([...likers, ...commenters])).slice(0, PROFILE_LIMIT);

    /* 5. scrape name & headline for each profile */
    for (const url of profileUrls) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const name     = await page.$eval('h1', el => el.innerText.trim());
      const headline = await page.$eval('.text-body-medium', el => el.innerText.trim());
      output.push({ postUrl: post.url, profileUrl: url, name, headline });
    }
  }

  await browser.close();

  /* ─── 6. POST once to n8n ────────────────────────────────── */
  if (output.length) {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(output),
    });
    console.log(`✅ Sent ${output.length} profiles to n8n`);
  } else {
    console.log('ℹ️  Nothing to send – no qualifying posts.');
  }
})();

/* helper: slow scroll to load search results */
async function autoScroll(page) {
  await page.evaluate(() => new Promise(res => {
    let total = 0, step = 400;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      total += step;
      if (total >= document.body.scrollHeight - window.innerHeight) {
        clearInterval(timer); res();
      }
    }, 200);
  }));
}
