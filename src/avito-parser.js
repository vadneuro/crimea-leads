import axios from 'axios';
import * as cheerio from 'cheerio';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

const URLS = [
  'https://www.avito.ru/krym?q=%D0%BA%D1%83%D0%BF%D0%BB%D1%8E+%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80%D1%83&s=104',
  'https://www.avito.ru/krym?q=%D0%BA%D1%83%D0%BF%D0%BB%D1%8E+%D0%B4%D0%BE%D0%BC&s=104',
  'https://www.avito.ru/krym?q=%D0%BA%D1%83%D0%BF%D0%BB%D1%8E+%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BE%D0%BA&s=104',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function parseAvito() {
  let found = 0;
  for (const url of URLS) {
    try {
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(data);

      $('[data-marker="item"]').each((_, el) => {
        const title = $(el).find('[itemprop="name"]').text().trim();
        const desc = $(el).find('[class*="description"]').text().trim();
        const href = $(el).find('a[itemprop="url"]').attr('href') || '';
        const link = href ? `https://www.avito.ru${href}` : '';
        const text = `${title}. ${desc}`;

        if (isLead(text)) {
          const isNew = saveLead('Авито', text, link);
          if (isNew) {
            notify('Авито', text, link);
            found++;
          }
        }
      });
    } catch (e) {
      console.error(`[avito] Error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  if (found > 0) console.log(`[avito] Found ${found} new leads`);
}

export function startAvitoParser(intervalMs = 30 * 60 * 1000) {
  console.log('[avito] Starting parser (interval: 30min)');
  parseAvito();
  setInterval(parseAvito, intervalMs);
}
