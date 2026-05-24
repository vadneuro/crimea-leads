import axios from 'axios';
import * as cheerio from 'cheerio';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://www.cian.ru/',
};

// CIAN forum — questions to realtors, region 25 = Crimea
const FORUM_PAGES = [
  'https://www.cian.ru/forum-rieltorov/?type=1&region=25&p=1',
  'https://www.cian.ru/forum-rieltorov/?type=1&region=25&p=2',
];

async function parseCianForum() {
  let found = 0;

  for (const url of FORUM_PAGES) {
    try {
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(data);

      // CIAN forum topics: links containing /forum-rieltorov-
      $('a[href*="/forum-rieltorov-"]').each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (title.length < 10) return;

        const fullUrl = href.startsWith('http') ? href : `https://www.cian.ru${href}`;

        if (isLead(title, 'ЦИАН форум Крым')) {
          const isNew = saveLead('ЦИАН форум', title, fullUrl);
          if (isNew) { notify('ЦИАН форум', title, fullUrl); found++; }
        }
      });
    } catch (e) {
      console.error(`[cian] Error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (found > 0) console.log(`[cian] Found ${found} new leads`);
}

export function startCianParser(intervalMs = 45 * 60 * 1000) {
  console.log('[cian] Starting parser (interval: 45min)');
  parseCianForum();
  setInterval(parseCianForum, intervalMs);
}
