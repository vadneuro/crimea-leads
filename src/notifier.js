import axios from 'axios';

const TOKEN = process.env.NOTIFICATION_BOT_TOKEN;
const CHAT_ID = process.env.FORWARD_CHAT_ID;

function escape(text) {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function notify(source, text, url = '') {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const preview = text.length > 600 ? text.slice(0, 600) + '…' : text;

  const msg =
    `🏠 <b>Новая заявка</b>\n\n` +
    `<b>Источник:</b> ${escape(source)}\n` +
    `<b>Текст:</b> ${escape(preview)}\n` +
    (url ? `<b>Ссылка:</b> <a href="${url}">открыть</a>\n` : '') +
    `<b>Время:</b> ${time}`;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text: msg, parse_mode: 'HTML', disable_web_page_preview: false },
      { timeout: 10000 }
    );
    console.log(`[notifier] Sent lead from ${source}`);
  } catch (e) {
    console.error(`[notifier] Error: ${e.message}`);
  }
}
