const express = require('express');
const app = express();
const { sendMetadata, deleteMessage } = require('./telegram');

app.use(express.json());

app.post('/api/metadata', async (req, res) => {
  try {
    const { name, size, type, folder, chunks } = req.body;
    const meta = JSON.stringify({
      name, size, type,
      folder: folder || 'root',
      chunks: chunks || 1,
      uploadedAt: Date.now(),
      expiry: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    const msgId = await sendMetadata(meta);
    res.json({ success: true, telegramMessageId: msgId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/metadata', async (req, res) => {
  try {
    const id = req.query.id;
    await deleteMessage(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
