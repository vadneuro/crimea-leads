const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isValidLead } = require('../filter');
const { notify } = require('../notifier');
const { isDuplicate, saveLead } = require('../db');

const URLS = [
  'https://restate.ru/geo/crimea/',
  'https://restate.ru/forum/',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

async function parsePage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(res.data);

  const items = [];

  // Forum posts
  $('.td-post-text, .message-text, .post_body, [class*="message"], article').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 30) items.push({ text, link: url });
  });

  // Thread titles (to check for relevant topics)
  $('a[href*="/forum/"]').each((i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href');
    if (title.length > 15 && href) {
      const link = href.startsWith('http') ? href : `https://restate.ru${href}`;
      items.push({ text: title, link });
    }
  });

  return items;
}

async function parse() {
  for (const url of URLS) {
    try {
      const items = await parsePage(url);
      console.log(`[Restate] ${url.slice(0, 60)} → ${items.length} items`);

      for (const item of items) {
        if (!isValidLead(item.text)) continue;

        const hash = crypto.createHash('md5').update(item.text.slice(0, 200)).digest('hex');
        if (isDuplicate(hash)) continue;

        saveLead(hash, 'Restate.ru', item.text.slice(0, 800), item.link);
        await notify('Restate.ru', item.text, item.link);
      }

    } catch (e) {
      console.error('[Restate] Error:', e.message);
    }

    await sleep(8000);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { parse };
