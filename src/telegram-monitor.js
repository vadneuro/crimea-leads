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
  // Крым
  'недвижимость крым', 'квартиры крым', 'купить квартиру крым',
  'недвижимость ялта', 'недвижимость севастополь', 'недвижимость симферополь',
  'переезд крым', 'релокация крым', 'жизнь в крыму', 'переезд в крым',
  // Москва и вся Россия
  'недвижимость москва', 'купить квартиру москва', 'недвижимость инвестиции',
  'переезд юг', 'переезд море', 'недвижимость у моря',
  'инвестиции в недвижимость', 'купить квартиру у моря',
  'недвижимость краснодар', 'недвижимость сочи', 'недвижимость санкт петербург',
  'переезд на юг', 'куплю квартиру', 'ищу недвижимость',
  // Города Крыма (для поиска местных чатов)
  'ялта чат', 'севастополь чат', 'симферополь чат', 'алушта чат',
];

// Known groups to join immediately (only those that actually exist)
const SEED_GROUPS = [
  // Крым — недвижимость
  'krimrealty', 'nedvigimost_krym', 'krym_kvartiry',
  'yalta_realty', 'sevastopol_nedvigimost', 'crimea_invest',
  // Крым — общие чаты с живой аудиторией
  'mosttalk',         // Общий чат Крыма — туристы и переезжающие
  'crimea_topchat',   // Крым. Чат
  'Krym_Turist_chat', // Жильё и отдых
  // Москва и общероссийские
  'realty_moscow', 'nedvigimost_rossii', 'investicii_nedvigimost',
  'pereezd_na_yug', 'kvartira_u_morya', 'realty_invest_ru',
];

// Targeted global search queries — combined buyer + Crimea
const GLOBAL_QUERIES = [
  'куплю квартиру крым',
  'куплю дом крым',
  'ищу квартиру крым',
  'купить недвижимость крым',
  'ищу жильё крым',
  'куплю квартиру ялта',
  'куплю квартиру севастополь',
  'куплю квартиру симферополь',
  'куплю квартиру алушта',
  'хочу купить крым',
  'переезжаем в крым',
  'переезжаю в крым',
  'рассматриваю крым',
  'бюджет крым квартира',
  'бюджет ялта купить',
  'ищу участок крым',
  'куплю дом ялта',
];

async function globalSearch(client) {
  console.log('[telegram] Running global search...');
  let found = 0;
  const since = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000); // last 48h

  for (const query of GLOBAL_QUERIES) {
    try {
      const result = await client.invoke(new Api.messages.SearchGlobal({
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: since,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit: 100,
      }));

      for (const msg of result.messages || []) {
        if (!msg.message) continue;
        const peerId = msg.peerId;
        const chatId = peerId?.channelId || peerId?.chatId;
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
      if (e.message && !e.message.includes('FLOOD') && !e.message.includes('slowmode')) {
        console.error(`[telegram] Global search error "${query}": ${e.message}`);
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

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
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
