const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(token, { polling: false });

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
      await bot.deleteMessage(chatId, id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const meta = JSON.stringify({
          name: data.name,
          size: data.size,
          type: data.type,
          folder: data.folder || 'root',
          chunks: data.chunks || 1,
          uploadedAt: Date.now(),
          expiry: Date.now() + 30 * 24 * 60 * 60 * 1000
        });
        const msg = await bot.sendMessage(chatId, `META:${meta}`);
        res.json({ success: true, telegramMessageId: msg.message_id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
