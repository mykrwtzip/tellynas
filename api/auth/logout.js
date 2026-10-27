module.exports = (req, res) => {
  res.setHeader('Set-Cookie', 'auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true });
};
