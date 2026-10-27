const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(token, { polling: false });

async function getChatHistory(limit = 100) {
  const messages = [];
  let offset = null;

  while (messages.length < limit) {
    const url = `https://api.telegram.org/bot${token}/getChatHistory?chat_id=${chatId}&limit=100${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok || data.result.length === 0) break;
    messages.push(...data.result);
    offset = messages[messages.length - 1].message_id;
  }
  return messages;
}

async function uploadFile(file, folder, chunkSize) {
  const chunks = [];
  const totalChunks = Math.ceil(file.size / chunkSize);
  const filepath = file.filepath || file.path;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBuffer = fs.readFileSync(filepath, { start, end });

    const msg = await bot.sendDocument(chatId, chunkBuffer, {
      caption: `CHUNK:${file.originalFilename || file.name}:${i}:${totalChunks}`
    });
    chunks.push(msg.message_id);
  }

  return { chunks, totalChunks, name: file.originalFilename || file.name, size: file.size };
}

async function sendMetadata(meta) {
  const msg = await bot.sendMessage(chatId, `META:${meta}`);
  return msg.message_id;
}

async function deleteMessage(messageId) {
  await bot.deleteMessage(chatId, messageId);
}

async function downloadFile(messageId) {
  const file = await bot.getFile(messageId);
  const stream = https.get(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`
  );
  return {
    stream,
    name: file.file_path.split('/').pop(),
    mime: 'application/octet-stream'
  };
}

module.exports = { getChatHistory, uploadFile, sendMetadata, deleteMessage, downloadFile };
