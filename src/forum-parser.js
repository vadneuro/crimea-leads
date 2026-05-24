import axios from 'axios';
import * as cheerio from 'cheerio';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
};

async function parseRestate() {
  // restate.ru returns HTTP 403 for automated requests — disabled
}

async function parseMoveRu() {
  // krim.move.ru returns HTTP 515 (server down) — disabled
}

async function parseKvartiraBezAgenta() {
  // f=10: buying secondary market, f=9: buying new construction
  const sections = [10, 9];
  for (const f of sections) {
    try {
      const { data } = await axios.get(
        `https://forum.kvartira-bez-agenta.ru/viewforum.php?f=${f}`,
        { headers: HEADERS, timeout: 15000 }
      );
      const $ = cheerio.load(data);
      let found = 0;

      $('li.row').each((_, el) => {
        const titleEl = $(el).find('a.topictitle').first();
        const title = titleEl.text().trim();
        const href = titleEl.attr('href') || '';
        const url = href.startsWith('http') ? href : `https://forum.kvartira-bez-agenta.ru/${href}`;

        if (isLead(title)) {
          const isNew = saveLead('Квартира без агента', title, url);
          if (isNew) { notify('Квартира без агента', title, url); found++; }
        }
      });

      if (found > 0) console.log(`[kvartira-bez-agenta] Found ${found} new leads in f=${f}`);
    } catch (e) {
      console.error(`[kvartira-bez-agenta] Error f=${f}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function parseAll() {
  await parseRestate();
  await parseMoveRu();
  await parseKvartiraBezAgenta();
}

export function startForumParsers(intervalMs = 60 * 60 * 1000) {
  console.log('[forums] Starting parsers (interval: 1h)');
  parseAll();
  setInterval(parseAll, intervalMs);
}
