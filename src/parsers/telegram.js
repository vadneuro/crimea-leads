const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { Api } = require('telegram');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const config = require('../config');
const { isValidLead } = require('../filter');
const { notify } = require('../notifier');
const { isDuplicate, saveLead, saveGroup } = require('../db');

const SESSION_FILE = path.join(__dirname, '../../data/telegram.session');

const SEARCH_QUERIES = [
  'недвижимость крым',
  'купить квартиру крым',
  'переезд в крым',
  'инвестиции крым',
  'куплю дом крым',
  'ялта недвижимость',
  'симферополь квартира',
  'севастополь купить',
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return fs.readFileSync(SESSION_FILE, 'utf-8').trim();
    }
  } catch (e) {}
  return '';
}

function saveSessionString(session) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, session);
}

async function discoverGroupsViaTgstat(client) {
  const queries = ['крым недвижимость', 'купить квартиру крым', 'переезд крым'];

  for (const q of queries) {
    try {
      const res = await axios.get(`https://tgstat.ru/search?q=${encodeURIComponent(q)}&type=channel`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(res.data);
      const usernames = new Set();

      $('a[href*="t.me/"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/t\.me\/([a-zA-Z0-9_]{5,})/);
        if (match) usernames.add(match[1]);
      });

      for (const username of usernames) {
        await tryJoinGroup(client, username);
        await sleep(2000);
      }

      await sleep(5000);
    } catch (e) {
      console.error('[TG] tgstat error:', e.message);
    }
  }
}

async function tryJoinGroup(client, username) {
  try {
    const entity = await client.getEntity(username);
    const title = entity.title || entity.firstName || username;
    const lower = title.toLowerCase();

    const isRelevant = ['крым', 'недвижимость', 'квартир', 'переезд', 'инвестиц', 'жильё', 'жилье', 'дом'].some(kw => lower.includes(kw));
    if (!isRelevant) return;

    await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
    saveGroup(username, title);
    console.log(`[TG] Joined: ${title} (@${username})`);
    await sleep(3000);
  } catch (e) {
    // ignore: already member, private, not found
  }
}

async function discoverViaSearch(client) {
  for (const query of SEARCH_QUERIES) {
    try {
      const result = await client.invoke(new Api.contacts.Search({ q: query, limit: 20 }));
      for (const chat of (result.chats || [])) {
        if (chat.username) {
          await tryJoinGroup(client, chat.username);
        }
      }
      await sleep(3000);
    } catch (e) {
      console.error(`[TG] Search error "${query}":`, e.message);
    }
  }
}

async function start() {
  const stringSession = new StringSession(loadSession());

  const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => config.phone,
    password: async () => ask('2FA пароль (если есть, иначе Enter): '),
    phoneCode: async () => ask('Код из Telegram: '),
    onError: err => console.error('[TG] Auth error:', err),
  });

  saveSessionString(client.session.save());
  console.log('[TG] Connected');

  // Discover and join relevant groups
  await discoverViaSearch(client);
  await discoverGroupsViaTgstat(client);

  // Monitor all incoming messages in real-time
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !message.text) return;

    const text = message.text;
    if (!isValidLead(text)) return;

    const hash = crypto.createHash('md5').update(text).digest('hex');
    if (isDuplicate(hash)) return;

    let link = null;
    try {
      const chat = await event.message.getChat();
      if (chat && chat.username) {
        link = `https://t.me/${chat.username}/${message.id}`;
      }
    } catch (e) {}

    saveLead(hash, 'Telegram', text, link);
    await notify('Telegram', text, link);

  }, new NewMessage({}));

  console.log('[TG] Monitoring messages...');

  // Re-discover new groups every 6 hours
  setInterval(async () => {
    console.log('[TG] Re-discovering groups...');
    await discoverViaSearch(client);
  }, 6 * 60 * 60 * 1000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { start };
