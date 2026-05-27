import axios from 'axios';
import * as cheerio from 'cheerio';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

// Public Telegram channels scraped via t.me/s/ (no auth required)
// Focus: channels that collect BUYER requests or have relocation/buying discussions
const CHANNELS = [
  // Агрегаторы заявок покупателей
  { name: 'nedvigimost_krym',   label: 'Крым заявки покупателей' },
  { name: 'krymrealty',         label: 'Недвижимость Крым' },
  { name: 'nedvigimost_yalta',  label: 'Недвижимость Ялта' },
  { name: 'crimea_real_estate', label: 'Недвижимость Крыма' },
  { name: 'crimea_invest',      label: 'Крым участки' },
  { name: 'krym_kupit',         label: 'Крым купить' },
  { name: 'kupit_krym',         label: 'Купить Крым' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

async function scrapeChannel({ name, label }) {
  try {
    const { data } = await axios.get(`https://t.me/s/${name}`, {
      headers: HEADERS,
      timeout: 12000,
    });
    const $ = cheerio.load(data);
    let found = 0;

    $('.tgme_widget_message').each((_, el) => {
      const text = $(el).find('.tgme_widget_message_text').text().trim();
      if (!text || text.length < 20) return;

      const dataPost = $(el).attr('data-post') || '';
      const url = dataPost ? `https://t.me/${dataPost}` : '';

      if (isLead(text, label)) {
        const isNew = saveLead(`Telegram: ${label}`, text, url);
        if (isNew) { notify(`Telegram: ${label}`, text, url); found++; }
      }
    });

    return found;
  } catch (e) {
    if (!e.message.includes('timeout') && !e.message.includes('403')) {
      console.error(`[tg-web] Error ${name}: ${e.message}`);
    }
    return 0;
  }
}

async function scrapeAll() {
  let total = 0;
  for (const ch of CHANNELS) {
    total += await scrapeChannel(ch);
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
  }
  if (total > 0) console.log(`[tg-web] Found ${total} new leads`);
}

export function startTelegramWebScraper(intervalMs = 30 * 60 * 1000) {
  console.log('[tg-web] Starting Telegram web channel scraper (interval: 30min)');
  scrapeAll();
  setInterval(scrapeAll, intervalMs);
}
