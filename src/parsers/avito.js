const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isValidLead } = require('../filter');
const { notify } = require('../notifier');
const { isDuplicate, saveLead } = require('../db');

// Avito search: Крым + "куплю" / "ищу"
const SEARCH_URLS = [
  'https://www.avito.ru/krym/nedvizhimost?q=%D0%BA%D1%83%D0%BF%D0%BB%D1%8E',
  'https://www.avito.ru/krym/nedvizhimost?q=%D0%B8%D1%89%D1%83+%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D1%83',
  'https://www.avito.ru/rossiya/nedvizhimost?q=%D0%BA%D1%83%D0%BF%D0%BB%D1%8E+%D0%BA%D1%80%D1%8B%D0%BC',
  'https://www.avito.ru/rossiya/nedvizhimost?q=%D0%B8%D1%89%D1%83+%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D1%83+%D0%BA%D1%80%D1%8B%D0%BC',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://www.avito.ru/',
};

async function parse() {
  for (const url of SEARCH_URLS) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(res.data);

      const items = [];

      // Current Avito markup
      $('[data-marker="item"]').each((i, el) => {
        const title = $(el).find('[itemprop="name"], [data-marker="item-title"] span').first().text().trim();
        const desc = $(el).find('[data-marker="item-specific-params"]').text().trim();
        const href = $(el).find('a[data-marker="item-title"]').attr('href');
        const link = href ? `https://www.avito.ru${href}` : url;

        const text = [title, desc].filter(Boolean).join(' ');
        if (text.length > 10) items.push({ text, link });
      });

      console.log(`[Avito] ${url.slice(0, 60)} → ${items.length} items`);

      for (const item of items) {
        if (!isValidLead(item.text)) continue;

        const hash = crypto.createHash('md5').update(item.text).digest('hex');
        if (isDuplicate(hash)) continue;

        saveLead(hash, 'Авито', item.text, item.link);
        await notify('Авито', item.text, item.link);
        await sleep(500);
      }

    } catch (e) {
      console.error('[Avito] Error:', e.message);
    }

    await sleep(10000);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { parse };
