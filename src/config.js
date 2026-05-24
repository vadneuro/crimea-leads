require('dotenv').config();

module.exports = {
  apiId: parseInt(process.env.API_ID),
  apiHash: process.env.API_HASH,
  phone: process.env.PHONE,
  forwardChatId: parseInt(process.env.FORWARD_CHAT_ID) || -1003766315731,
  notificationBotToken: process.env.NOTIFICATION_BOT_TOKEN,
};
