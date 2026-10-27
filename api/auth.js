const express = require('express');
const router = express.Router();
const cookieParser = require('cookie-parser');

router.use(cookieParser());

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.APP_USERNAME || 'admin';
  const validPass = process.env.APP_PASSWORD || 'changeme';

  if (username === validUser && password === validPass) {
    const token = Buffer.from(username + ':' + Date.now()).toString('base64');
    res.cookie('auth', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ success: true });
});

router.get('/check', (req, res) => {
  const auth = req.cookies.auth;
  if (auth) return res.json({ authenticated: true });
  res.json({ authenticated: false });
});

module.exports = router;
