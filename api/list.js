const { getChatHistory } = require('./telegram');

module.exports = async (req, res) => {
  try {
    const folder = (req.query && req.query.folder) || 'root';
    const messages = await getChatHistory(200);
    const files = messages
      .filter(m => m.text && m.text.startsWith('META:'))
      .map(m => {
        try {
          const meta = JSON.parse(m.text.replace('META:', ''));
          return { ...meta, telegramMessageId: m.message_id };
        } catch { return null; }
      })
      .filter(Boolean)
      .filter(f => (f.folder || 'root') === folder);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
