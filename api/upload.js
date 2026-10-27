const express = require('express');
const app = express();
const formidable = require('formidable');
const { uploadFile } = require('./telegram');

const handler = (req, res) => {
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = files.file && files.file[0];
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const folder = (fields.folder && fields.folder[0]) || 'root';
    const chunkSize = 20 * 1024 * 1024;

    try {
      const result = await uploadFile(file, folder, chunkSize);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};

app.post('/upload', handler);
app.post('/api/upload', handler);

module.exports = app;
