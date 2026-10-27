const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const formidable = require('formidable');
const { getChatHistory, uploadFile, sendMetadata, deleteMessage, downloadFile } = require('./telegram');

app.use(express.json());
app.use(cookieParser());

// Auth routes
const loginHandler = (req, res) => {
  const { username, password } = req.body || {};
  const validUser = process.env.APP_USERNAME || 'admin';
  const validPass = process.env.APP_PASSWORD || 'changeme';

  if (username === validUser && password === validPass) {
    const token = Buffer.from(username + ':' + Date.now()).toString('base64');
    res.cookie('auth', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
};

const logoutHandler = (req, res) => {
  res.clearCookie('auth', { path: '/' });
  res.json({ success: true });
};

const checkHandler = (req, res) => {
  const auth = req.cookies && req.cookies.auth;
  if (auth) return res.json({ authenticated: true });
  res.json({ authenticated: false });
};

app.post('/api/auth/login', loginHandler);
app.post('/api/auth/logout', logoutHandler);
app.get('/api/auth/check', checkHandler);

// List files
app.get('/api/list', async (req, res) => {
  try {
    const folder = req.query.folder || 'root';
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
});

// Upload
app.post('/api/upload', (req, res) => {
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
});

// Download
app.get('/api/download', async (req, res) => {
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
});

// Metadata
app.use('/api/metadata', express.json());
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
