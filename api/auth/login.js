const cookieParser = require('cookie-parser');

// Simple cookie parser middleware
function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = v;
  });
  return cookies;
}

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let data = {};
    try { data = JSON.parse(body); } catch {}

    const validUser = process.env.APP_USERNAME || 'admin';
    const validPass = process.env.APP_PASSWORD || 'changeme';

    if (data.username === validUser && data.password === validPass) {
      const token = Buffer.from(data.username + ':' + Date.now()).toString('base64');
      res.setHeader('Set-Cookie', `auth=${token}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax`);
      return res.json({ success: true });
    }
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  });
};
