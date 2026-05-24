const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isValidLead } = require('../filter');
const { notify } = require('../notifier');
const { isDuplicate, saveLead } = require('../db');

// VK public groups to monitor (add more as needed)
const VK_GROUPS = [
  'wall-nedvizhimost_krym',
  'wall-krymskaya_nedvizhimost',
  'wall-kupit_kvartiru_krym',
];

// VK public wall search queries (via VK search page)
const SEARCH_QUERIES = [
  'куплю квартиру крым',
  'куплю дом крым',
  'ищу недвижимость крым',
  'хочу купить крым',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

async function parseGroupWall(groupSlug) {
  try {
    const url = `https://vk.com/${groupSlug}`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const items = [];
    $('.wall_post_text, [class*="PostTextContent"]').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30) items.push({ text, link: url });
    });

    for (const item of items) {
      if (!isValidLead(item.text)) continue;

      const hash = crypto.createHash('md5').update(item.text.slice(0, 200)).digest('hex');
      if (isDuplicate(hash)) continue;

      saveLead(hash, 'ВКонтакте', item.text.slice(0, 800), item.link);
      await notify('ВКонтакте', item.text, item.link);
    }

    console.log(`[VK] ${groupSlug} → ${items.length} posts`);
  } catch (e) {
    console.error(`[VK] Group error ${groupSlug}:`, e.message);
  }
}

async function searchPosts(query) {
  try {
    const url = `https://vk.com/search?c%5Bq%5D=${encodeURIComponent(query)}&c%5Bsection%5D=posts`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const items = [];
    $('.wall_post_text, .search_item_text').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30) items.push({ text, link: url });
    });

    for (const item of items) {
      if (!isValidLead(item.text)) continue;

      const hash = crypto.createHash('md5').update(item.text.slice(0, 200)).digest('hex');
      if (isDuplicate(hash)) continue;

      saveLead(hash, 'ВКонтакте', item.text.slice(0, 800), item.link);
      await notify('ВКонтакте', item.text, item.link);
    }

    console.log(`[VK] Search "${query}" → ${items.length} posts`);
  } catch (e) {
    console.error(`[VK] Search error "${query}":`, e.message);
  }
}

async function parse() {
  for (const group of VK_GROUPS) {
    await parseGroupWall(group);
    await sleep(5000);
  }

  for (const query of SEARCH_QUERIES) {
    await searchPosts(query);
    await sleep(5000);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { parse };
