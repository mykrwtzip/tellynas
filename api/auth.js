const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');

app.use(express.json());
app.use(cookieParser());

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

app.post('/login', loginHandler);
app.post('/api/auth/login', loginHandler);
app.post('/logout', logoutHandler);
app.post('/api/auth/logout', logoutHandler);
app.get('/check', checkHandler);
app.get('/api/auth/check', checkHandler);

module.exports = app;
