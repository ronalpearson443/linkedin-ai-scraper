// scrape.js  (only the main changes shown)
const POST_LIMIT   = 10;
const PROFILE_LIMIT = 10;

...
// after you have `recent` array:
const output = [];

for (const post of recent.slice(0, POST_LIMIT)) {
  await page.goto(post.url, { waitUntil: 'networkidle' });

  // 1) grab unique likers + commenters
  const getUrls = async (selector) =>
    Array.from(new Set(
      await page.$$eval(selector, els => els.map(a => a.href))
    ));

  const likers     = await getUrls('button[aria-label*="reactions"] a.reactor-container__link');
  const commenters = await getUrls('span.comments-post-meta__name a');

  const profileUrls = Array.from(new Set([...likers, ...commenters])).slice(0, PROFILE_LIMIT);

  // 2) scrape minimal data from each profile (name, headline)
  const profiles = [];
  for (const url of profileUrls) {
    await page.goto(url, { waitUntil: 'networkidle' });
    const name = await page.$eval('h1', el => el.innerText.trim());
    const headline = await page.$eval('.text-body-medium', el => el.innerText.trim());
    profiles.push({ postUrl: post.url, profileUrl: url, name, headline });
  }
  output.push(...profiles);
}
await browser.close();

// POST once
await fetch(process.env.N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(output)
});
