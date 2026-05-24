import axios from 'axios';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

// Public VK groups about real estate and Crimea (numeric IDs or screen names)
const VK_GROUPS = [
  'krymrealty', 'nedvigimost_krym', 'yaltarealty',
  'sevrealty', 'crimea_estate', 'kupit_kvartiru_krym'
];

const SEARCH_QUERIES = [
  'куплю квартиру Крым', 'куплю дом Крым', 'куплю участок Крым',
  'куплю недвижимость Ялта', 'куплю квартиру Севастополь',
  'куплю квартиру Симферополь', 'ищу квартиру Крым'
];

async function searchVK() {
  const token = process.env.VK_TOKEN;
  if (!token) {
    await searchVKPublic();
    return;
  }

  let found = 0;
  for (const q of SEARCH_QUERIES) {
    try {
      const { data } = await axios.get('https://api.vk.com/method/newsfeed.search', {
        params: {
          q,
          count: 50,
          access_token: token,
          v: '5.199'
        },
        timeout: 10000
      });

      const items = data?.response?.items || [];
      for (const item of items) {
        const text = item.text || '';
        if (isLead(text)) {
          const url = `https://vk.com/wall${item.owner_id}_${item.id}`;
          const isNew = saveLead('ВКонтакте', text, url);
          if (isNew) {
            notify('ВКонтакте', text, url);
            found++;
          }
        }
      }
    } catch (e) {
      console.error(`[vk] API error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (found > 0) console.log(`[vk] Found ${found} new leads`);
}

async function searchVKPublic() {
  // Fallback: parse public VK search without token
  for (const q of SEARCH_QUERIES.slice(0, 3)) {
    try {
      const { data } = await axios.get(
        `https://vk.com/search?c[q]=${encodeURIComponent(q)}&c[section]=posts`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 10000
        }
      );
      // VK public search is JS-rendered, limited usefulness without token
    } catch {}
  }
}

export function startVKMonitor(intervalMs = 20 * 60 * 1000) {
  console.log('[vk] Starting monitor (interval: 20min)');
  searchVK();
  setInterval(searchVK, intervalMs);
}
