const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const token = process.env.TELEGRAM_BOT_TOKEN;

module.exports = async (req, res) => {
  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const bot = new TelegramBot(token, { polling: false });
    const file = await bot.getFile(id);
    const filePath = file.file_path;
    const fileName = filePath.split('/').pop();

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    https.get(`https://api.telegram.org/file/bot${token}/${filePath}`, (fileRes) => {
      fileRes.pipe(res);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
