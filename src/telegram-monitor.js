import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import input from 'input';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isLead, isCrimeaGroup } from './filter.js';
import { saveLead, saveGroup } from './database.js';
import { notify } from './notifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, '../data/session.txt');

// Queries to find new groups to join
const SEARCH_QUERIES = [
  // Крым — недвижимость
  'недвижимость крым', 'квартиры крым', 'купить квартиру крым',
  'недвижимость ялта', 'недвижимость севастополь', 'недвижимость симферополь',
  'недвижимость феодосия', 'недвижимость евпатория', 'недвижимость керчь',
  // Переезд и жизнь
  'переезд крым', 'жизнь в крыму', 'переезд в крым', 'релокация крым',
  'переехать в крым', 'переезд ялта', 'крым чат жители',
  // Города Крыма
  'ялта чат', 'севастополь чат', 'симферополь чат', 'алушта чат',
  'феодосия чат', 'евпатория чат', 'керчь чат',
  // Россия — покупатели у моря
  'недвижимость у моря', 'купить квартиру у моря', 'переезд на юг',
  'переезд море', 'недвижимость сочи', 'недвижимость краснодар',
  'инвестиции в недвижимость', 'куплю квартиру', 'ищу недвижимость',
];

// Known groups to join immediately (only those that actually exist)
const SEED_GROUPS = [
  // Крым — недвижимость
  'krimrealty', 'nedvigimost_krym', 'krym_kvartiry',
  'yalta_realty', 'sevastopol_nedvigimost', 'crimea_invest',
  // Крым — переезд и жизнь (там живут будущие покупатели)
  'pereezd_krym',       // Переезд в Крым
  'krym_pereezd',       // Крым — переезд
  'jizn_v_krymu',       // Жизнь в Крыму
  'crimea_life_chat',   // Жизнь в Крыму чат
  'krym_novosely',      // Новосёлы Крыма
  // Крым — общие чаты с живой аудиторией
  'mosttalk',           // Общий чат Крыма
  'crimea_topchat',     // Крым. Чат
  'Krym_Turist_chat',   // Жильё и отдых
  // Города Крыма — местные чаты
  'yalta_chat',         // Ялта чат
  'alushta_chat',       // Алушта
  'feodosiya_chat',     // Феодосия
  'evpatoria_chat',     // Евпатория
  // Россия — покупатели у моря
  'realty_moscow', 'nedvigimost_rossii', 'investicii_nedvigimost',
  'pereezd_na_yug', 'kvartira_u_morya', 'realty_invest_ru',
  'kupit_kvartiru_more', // Купить квартиру у моря
];

// Targeted global search queries — combined buyer intent + Crimea
const GLOBAL_QUERIES = [
  // Прямые запросы покупки — квартиры
  'куплю квартиру крым',
  'куплю квартиру ялта',
  'куплю квартиру севастополь',
  'куплю квартиру симферополь',
  'куплю квартиру алушта',
  'куплю квартиру феодосия',
  'куплю квартиру евпатория',
  'куплю квартиру керчь',
  // Прямые запросы покупки — дома и участки
  'куплю дом крым',
  'куплю дом ялта',
  'куплю дом севастополь',
  'куплю участок крым',
  'куплю участок ялта',
  // Поиск жилья
  'ищу квартиру крым',
  'ищу жильё крым',
  'ищу недвижимость крым',
  'нужна квартира крым',
  'нужна квартира ялта',
  // Намерение купить
  'купить недвижимость крым',
  'хочу купить крым',
  'хочу купить квартиру ялта',
  'хочу купить квартиру севастополь',
  'рассматриваю крым',
  'рассматриваю недвижимость крым',
  // Ипотека
  'ипотека крым квартира',
  'ипотека ялта купить',
  // Переезд с покупкой жилья
  'переезжаем в крым',
  'переезжаю в крым',
  'переезжаю ялта жильё',
  'переезд крым купить квартиру',
  // Бюджет
  'бюджет крым квартира',
  'бюджет ялта купить',
];

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('QUERY_TIMEOUT')), ms)),
]);

async function globalSearch(client) {
  console.log('[telegram] Running global search...');
  let found = 0;

  const forwardChatId = process.env.FORWARD_CHAT_ID;
  // Strip -100 prefix to get raw MTProto channel_id for comparison
  const ownChatIdStr = forwardChatId ? String(forwardChatId).replace(/^-100/, '') : '';

  // Reconnect before search — update loop timeouts can leave connection stale
  try { await client.connect(); } catch {}

  for (const query of GLOBAL_QUERIES) {
    try {
      // No minDate — deduplication is handled by hash in DB.
      // Buyer messages appear every few days, not hourly.
      const result = await withTimeout(
        client.invoke(new Api.messages.SearchGlobal({
          q: query,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit: 100,
        })),
        20000 // 20s per query max
      );

      for (const msg of result.messages || []) {
        if (!msg.message) continue;
        const peerId = msg.peerId;
        const chatId = peerId?.channelId || peerId?.chatId;

        // Skip our own notification group to avoid circular re-notification
        if (ownChatIdStr && String(chatId) === ownChatIdStr) continue;

        const chat = (result.chats || []).find(c => c.id?.toString() === chatId?.toString());
        const groupTitle = chat?.title || '';
        const username = chat?.username || '';
        const url = username ? `https://t.me/${username}/${msg.id}` : '';

        if (isLead(msg.message, groupTitle)) {
          const src = `Telegram: ${groupTitle || 'публичный'}`;
          const isNew = saveLead(src, msg.message, url);
          if (isNew) {
            await notify(src, msg.message, url);
            found++;
          }
        }
      }
    } catch (e) {
      const msg = e.message || '';
      if (!msg.includes('FLOOD') && !msg.includes('slowmode') && !msg.includes('QUERY_TIMEOUT')) {
        console.error(`[telegram] Global search error "${query}": ${msg}`);
      }
    }
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
  }

  console.log(`[telegram] Global search done — found ${found} new leads`);
}

async function findAndJoinGroups(client) {
  console.log('[telegram] Searching for real estate groups...');
  const joined = [];

  for (const query of SEARCH_QUERIES) {
    try {
      const result = await client.invoke(new Api.contacts.Search({
        q: query,
        limit: 20,
      }));

      const chats = result.chats || [];
      for (const chat of chats) {
        if (!chat.username) continue;
        try {
          await client.invoke(new Api.channels.JoinChannel({ channel: chat }));
          saveGroup(chat.id, chat.title);
          joined.push(chat.title);
          console.log(`[telegram] Joined: ${chat.title}`);
          await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));
        } catch {}
      }
    } catch (e) {
      console.error(`[telegram] Search error for "${query}": ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log(`[telegram] Joined ${joined.length} new groups`);
}

async function joinSeedGroups(client) {
  for (const username of SEED_GROUPS) {
    try {
      const entity = await client.getEntity(username);
      await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
      saveGroup(entity.id, entity.title || username);
      console.log(`[telegram] Joined seed group: ${username}`);
      await new Promise(r => setTimeout(r, 4000));
    } catch {}
  }
}

export async function startTelegramMonitor() {
  const apiId = parseInt(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  const phone = process.env.PHONE;

  if (!apiId || !apiHash || !phone) {
    console.log('[telegram] API_ID, API_HASH or PHONE not set — skipping Telegram monitor');
    return;
  }

  const sessionStr = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, 'utf8').trim() : '';
  const session = new StringSession(sessionStr);

  // USE_WARP_PROXY=1 routes through Cloudflare WARP SOCKS5 on port 40000
  // Required on Beget VPS where Telegram MTProto is blocked by DPI
  const useProxy = process.env.USE_WARP_PROXY === '1';
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
    ...(useProxy ? { proxy: { socksType: 5, ip: '127.0.0.1', port: 40000, timeout: 2 } } : {}),
  });

  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => await input.text('Введи код из SMS: '),
    onError: (err) => console.error('[telegram] Auth error:', err),
  });

  const newSession = client.session.save();
  writeFileSync(SESSION_FILE, newSession);
  console.log('[telegram] Authorized. Session saved.');

  const forwardChatId = process.env.FORWARD_CHAT_ID;

  // Real-time listener for groups we're in
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg || !msg.text) return;

      const chat = await event.message.getChat();
      // Skip our own notification group to avoid reading back our own alerts
      if (forwardChatId && String(chat?.id) === String(forwardChatId).replace('-100', '')) return;
      if (forwardChatId && String(chat?.id) === String(forwardChatId)) return;

      const groupTitle = chat?.title || '';

      if (isLead(msg.text, groupTitle)) {
        const source = `Telegram: ${groupTitle || 'группа'}`;
        const url = chat?.username ? `https://t.me/${chat.username}/${msg.id}` : '';

        const isNew = saveLead(source, msg.text, url);
        if (isNew) {
          await notify(source, msg.text, url);
        }
      }
    } catch (e) {
      console.error('[telegram] Handler error:', e.message);
    }
  }, new NewMessage({}));

  console.log('[telegram] Listening for messages...');

  // Join seed groups and search for more
  await joinSeedGroups(client);
  await findAndJoinGroups(client);

  // Global search — run immediately and every 30 min
  await globalSearch(client);
  setInterval(() => globalSearch(client), 30 * 60 * 1000);

  // Re-scan for new groups every 6 hours
  setInterval(() => findAndJoinGroups(client), 6 * 60 * 60 * 1000);
}
