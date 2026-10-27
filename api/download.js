const express = require('express');
const app = express();
const { downloadFile } = require('./telegram');

const handler = async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const file = await downloadFile(id);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    file.stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/download', handler);
app.get('/api/download', handler);

module.exports = app;
