module.exports = (req, res) => {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = v;
  });
  if (cookies.auth) return res.json({ authenticated: true });
  res.json({ authenticated: false });
};
