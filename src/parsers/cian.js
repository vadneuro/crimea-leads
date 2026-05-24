const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isValidLead } = require('../filter');
const { notify } = require('../notifier');
const { isDuplicate, saveLead } = require('../db');

// CIAN buyer forum and demand section
const URLS = [
  'https://www.cian.ru/ask/?deal_type=sale&region=4778',     // Крым
  'https://www.cian.ru/forum-rieltorov/?topicId=14',         // Куплю недвижимость
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function parse() {
  for (const url of URLS) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(res.data);

      const items = [];

      // CIAN forum/ask posts
      $('[class*="post"], [class*="message"], [class*="comment"], article').each((i, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text.length > 30) items.push({ text, link: url });
      });

      // Fallback: paragraphs
      if (items.length === 0) {
        $('p').each((i, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.length > 50) items.push({ text, link: url });
        });
      }

      console.log(`[CIAN] ${url.slice(0, 60)} → ${items.length} items`);

      for (const item of items) {
        if (!isValidLead(item.text)) continue;

        const hash = crypto.createHash('md5').update(item.text.slice(0, 200)).digest('hex');
        if (isDuplicate(hash)) continue;

        saveLead(hash, 'ЦИАН', item.text.slice(0, 800), item.link);
        await notify('ЦИАН', item.text, item.link);
      }

    } catch (e) {
      console.error('[CIAN] Error:', e.message);
    }

    await sleep(8000);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { parse };
