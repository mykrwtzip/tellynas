const formidable = require('formidable');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(token, { polling: false });

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = files.file && files.file[0];
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const folder = (fields.folder && fields.folder[0]) || 'root';
    const chunkSize = 20 * 1024 * 1024;
    const filepath = file.filepath || file.path;

    try {
      const chunks = [];
      const totalChunks = Math.ceil(file.size / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunkBuffer = fs.readFileSync(filepath, { start, end });
        const msg = await bot.sendDocument(chatId, chunkBuffer, {
          caption: `CHUNK:${file.originalFilename || file.name}:${i}:${totalChunks}`
        });
        chunks.push(msg.message_id);
      }

      // Save metadata
      const meta = JSON.stringify({
        name: file.originalFilename || file.name,
        size: file.size,
        type: file.mimetype || 'application/octet-stream',
        folder: folder,
        chunks: chunks,
        totalChunks: totalChunks,
        uploadedAt: Date.now(),
        expiry: Date.now() + 30 * 24 * 60 * 60 * 1000
      });
      const metaMsg = await bot.sendMessage(chatId, `META:${meta}`);

      res.json({ success: true, name: file.originalFilename || file.name, chunks: chunks.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
