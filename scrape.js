// scrape.js  – uses stored session (no login)
const { chromium } = require('playwright');

const POST_LIMIT    = 10;  // scrape at most 10 posts
const PROFILE_LIMIT = 10;  // and 10 profiles per run

(async () => {
  const WEBHOOK = process.env.N8N_WEBHOOK_URL;
  if (!WEBHOOK) throw new Error('Missing N8N_WEBHOOK_URL');

  // ─── 1) Launch with your saved cookies ───────────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: 'linkedin-state.json',
  });
  const page = await context.newPage();

  // ─── 2) Go straight to the “AI” search feed ──────────────────
  await page.goto('https://www.linkedin.com/search/results/content/?keywords=AI');
  await autoScroll(page);

  // ─── 3) Find recent posts (≤24h) ────────────────────────────
  const recent = await page.$$eval('div.search-result__wrapper', els =>
    els.map(el => {
      const a = el.querySelector('a.app-aware-link');
      const t = el.querySelector('span.feed-shared-actor__sub-description > span');
      return a && t ? { url: a.href, ts: t.innerText.trim() } : null;
    })
    .filter(Boolean)
    .filter(p => /[0-9]+[hms]/.test(p.ts))
  );

  const output = [];

  // ─── 4) Visit each post, skip if <10 comments, cap at POST_LIMIT ─
  for (const post of recent.slice(0, POST_LIMIT)) {
    await page.goto(post.url, { waitUntil: 'networkidle' });

    const commentText = await page.$$eval('span', els =>
      els.map(e => e.innerText).find(t => /\d+\s+comments?$/i.test(t))
    );
    const count = commentText ? parseInt(commentText) : 0;
    if (count < 10) continue;

    // collect likers + commenters
    const collect = async sel =>
      Array.from(new Set(await page.$$eval(sel, els => els.map(a => a.href))));
    const likers     = await collect('button[aria-label*="reactions"] a.reactor-container__link');
    const commenters = await collect('span.comments-post-meta__name a');
    const profileUrls = Array.from(new Set([...likers, ...commenters]))
                             .slice(0, PROFILE_LIMIT);

    // scrape name & headline for each profile
    for (const url of profileUrls) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const name     = await page.$eval('h1', el => el.innerText.trim());
      const headline = await page.$eval('.text-body-medium', el => el.innerText.trim());
      output.push({ postUrl: post.url, profileUrl: url, name, headline });
    }
  }

  await browser.close();

  // ─── 5) POST everything to n8n ──────────────────────────────
  if (output.length) {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(output),
    });
    console.log(`✅ Sent ${output.length} profiles to n8n`);
  } else {
    console.log('ℹ️  Nothing qualified to send');
  }
})();

// helper to scroll down and load content
async function autoScroll(page) {
  await page.evaluate(() => new Promise(res => {
    let total = 0, step = 400;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      total += step;
      if (total >= document.body.scrollHeight - innerHeight) {
        clearInterval(timer);
        res();
      }
    }, 200);
  }));
}
