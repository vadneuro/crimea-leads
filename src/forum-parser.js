import axios from 'axios';
import * as cheerio from 'cheerio';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// forum.kvartira-bez-agenta.ru — f=10: покупка вторичка, f=9: новостройки
async function parseKvartiraBezAgenta() {
  for (const f of [10, 9]) {
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

// Яндекс.Кью — поиск вопросов про покупку недвижимости в Крыму
async function parseYandexQ() {
  const queries = [
    'купить квартиру крым',
    'купить дом крым',
    'переезд в крым недвижимость',
    'недвижимость ялта купить',
  ];

  let found = 0;
  for (const q of queries) {
    try {
      const { data } = await axios.get(
        `https://yandex.ru/q/search/?text=${encodeURIComponent(q)}`,
        { headers: HEADERS, timeout: 12000 }
      );
      const $ = cheerio.load(data);

      // Яндекс.Кью: вопросы в выдаче
      $('a[href*="/question/"]').each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (!title || title.length < 15) return;
        const url = href.startsWith('http') ? href : `https://yandex.ru${href}`;
        if (isLead(title, '')) {
          const isNew = saveLead('Яндекс.Кью', title, url);
          if (isNew) { notify('Яндекс.Кью', title, url); found++; }
        }
      });
    } catch (e) {
      // Яндекс часто отдаёт captcha — не шумим в логах
      if (!e.message.includes('403') && !e.message.includes('timeout')) {
        console.error(`[yandex-q] Error "${q}": ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
  }
  if (found > 0) console.log(`[yandex-q] Found ${found} new leads`);
}

// Пикабу — поиск постов по тегам про переезд/покупку в Крыму
async function parsePikabu() {
  const tags = ['Крым', 'Переезд', 'Недвижимость'];
  let found = 0;

  for (const tag of tags) {
    try {
      const { data } = await axios.get(
        `https://pikabu.ru/tag/${encodeURIComponent(tag)}/new`,
        { headers: HEADERS, timeout: 12000 }
      );
      const $ = cheerio.load(data);

      // Pikabu: заголовки постов
      $('h2.story__title a, .story__title-link').each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (!title || title.length < 15) return;
        const url = href.startsWith('http') ? href : `https://pikabu.ru${href}`;
        if (isLead(title, tag)) {
          const isNew = saveLead('Пикабу', title, url);
          if (isNew) { notify('Пикабу', title, url); found++; }
        }
      });
    } catch (e) {
      if (!e.message.includes('timeout') && !e.message.includes('403')) {
        console.error(`[pikabu] Error tag "${tag}": ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
  }
  if (found > 0) console.log(`[pikabu] Found ${found} new leads`);
}

async function parseAll() {
  await parseKvartiraBezAgenta();
  await parseYandexQ();
  await parsePikabu();
}

export function startForumParsers(intervalMs = 60 * 60 * 1000) {
  console.log('[forums] Starting parsers (interval: 1h)');
  parseAll();
  setInterval(parseAll, intervalMs);
}
