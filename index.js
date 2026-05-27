import 'dotenv/config';
import { startTelegramMonitor } from './src/telegram-monitor.js';
import { startTelegramWebScraper } from './src/telegram-web.js';
import { startAvitoParser } from './src/avito-parser.js';
import { startCianParser } from './src/cian-parser.js';
import { startVKMonitor } from './src/vk-monitor.js';
import { startForumParsers } from './src/forum-parser.js';
import { getStats } from './src/database.js';

console.log('🏠 Crimea Real Estate Lead Monitor starting...');
console.log(`📊 Forward chat: ${process.env.FORWARD_CHAT_ID}`);

// Start all monitors
await startTelegramMonitor();  // real-time MTProto + global search
startTelegramWebScraper();     // public channel HTML scraping, every 30 min
startAvitoParser();            // every 30 min
startCianParser();             // every 45 min
startVKMonitor();              // every 20 min (+ newsfeed.search if VK_TOKEN set)
startForumParsers();           // every 60 min (kvartira-bez-agenta + yandex.q + pikabu)

// Print stats every hour
setInterval(() => {
  const stats = getStats();
  console.log(`[stats] Total leads: ${stats.total} | Today: ${stats.today} | TG groups: ${stats.groups}`);
}, 60 * 60 * 1000);

console.log('✅ All monitors started. Waiting for leads...\n');
