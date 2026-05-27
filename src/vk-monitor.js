import axios from 'axios';
import { isLead } from './filter.js';
import { saveLead } from './database.js';
import { notify } from './notifier.js';

// Global newsfeed queries (require user VK_TOKEN with wall permission)
const SEARCH_QUERIES = [
  'куплю квартиру Крым', 'куплю дом Крым', 'куплю участок Крым',
  'куплю квартиру Ялта', 'куплю квартиру Севастополь',
  'куплю квартиру Симферополь', 'куплю квартиру Алушта',
  'куплю квартиру Феодосия', 'куплю квартиру Евпатория',
  'куплю дом Ялта', 'куплю дом Севастополь',
  'ищу квартиру Крым', 'ищу жильё Крым', 'ищу недвижимость Крым',
  'нужна квартира Крым', 'нужна квартира Ялта',
  'хочу купить квартиру Крым', 'хочу купить дом Крым',
  'рассматриваю недвижимость Крым',
  'переезжаю в Крым квартира', 'переезжаем в Крым',
  'ипотека Крым квартира',
];

// Public groups scanned for buyer posts in their "others" wall section
// Works with service token OR without token for public groups
const WALL_GROUPS = [
  // Недвижимость Крыма
  'krymrealty', 'nedvigimost_krym', 'kupit_kvartiru_krym',
  'yaltarealty', 'sevrealty', 'crimea_estate',
  // Переезд — аудитория будущих покупателей
  'pereezd_v_krym', 'krym_pereezd',
  'jizn_v_krymu', 'krym_novosely',
];

const VK_API = 'https://api.vk.com/method';
const VK_VER = '5.199';

async function vkGet(method, params, token) {
  const { data } = await axios.get(`${VK_API}/${method}`, {
    params: { ...params, v: VK_VER, ...(token ? { access_token: token } : {}) },
    timeout: 10000,
  });
  if (data.error) {
    const code = data.error.error_code;
    if (code === 6) throw new Error('RATE_LIMIT');
    if (code === 15) throw new Error('TOKEN_REQUIRED');
    throw new Error(`VK_${code}: ${data.error.error_msg}`);
  }
  return data.response;
}

async function globalNewsfeedSearch(token) {
  let found = 0;
  for (const q of SEARCH_QUERIES) {
    try {
      const resp = await vkGet('newsfeed.search', { q, count: 50, extended: 0 }, token);
      for (const item of resp?.items || []) {
        const text = item.text || '';
        if (text.length < 20) continue;
        if (isLead(text, '')) {
          const url = `https://vk.com/wall${item.owner_id}_${item.id}`;
          const isNew = saveLead('ВКонтакте', text, url);
          if (isNew) { await notify('ВКонтакте', text, url); found++; }
        }
      }
    } catch (e) {
      if (e.message === 'RATE_LIMIT') await new Promise(r => setTimeout(r, 5000));
      else if (e.message !== 'TOKEN_REQUIRED') console.error(`[vk] search "${q}": ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
  }
  return found;
}

async function scanGroupWalls(token) {
  let found = 0;
  for (const group of WALL_GROUPS) {
    try {
      const resp = await vkGet('wall.get', {
        domain: group,
        count: 100,
        filter: 'others', // posts by others (visitors), not the group admins
      }, token);
      for (const item of resp?.items || []) {
        const text = item.text || '';
        if (text.length < 20) continue;
        if (isLead(text, group)) {
          const url = `https://vk.com/wall${item.owner_id}_${item.id}`;
          const isNew = saveLead(`ВКонтакте: ${group}`, text, url);
          if (isNew) { await notify(`ВКонтакте: ${group}`, text, url); found++; }
        }
      }
    } catch (e) {
      if (e.message === 'RATE_LIMIT') await new Promise(r => setTimeout(r, 5000));
      // VK_100 = invalid group, VK_203 = private group — skip silently
      else if (!e.message.startsWith('VK_100') && !e.message.startsWith('VK_203') && !e.message.includes('TOKEN_REQUIRED')) {
        console.error(`[vk] wall scan "${group}": ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
  }
  return found;
}

async function searchVK() {
  const token = process.env.VK_TOKEN;
  let found = 0;

  if (token) {
    found += await globalNewsfeedSearch(token);
  } else {
    console.log('[vk] VK_TOKEN not set — only scanning group walls');
  }

  found += await scanGroupWalls(token);
  if (found > 0) console.log(`[vk] Found ${found} new leads`);
}

export function startVKMonitor(intervalMs = 20 * 60 * 1000) {
  console.log('[vk] Starting VK monitor (interval: 20min)');
  searchVK();
  setInterval(searchVK, intervalMs);
}
