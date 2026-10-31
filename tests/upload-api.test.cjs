const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

// Run against a separately started demo server; see README for the command.
const base = process.env.TEST_BASE_URL;
test('chunk finalization can be retried and previews remain usable', { skip: !base }, async () => {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password-1234' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#123456' } }).png().toBuffer();
  const half = Math.ceil(image.length / 2);
  const chunks = [];
  for (const [index, bytes] of [image.subarray(0, half), image.subarray(half)].entries()) {
    const form = new FormData();
    form.append('chunk', new Blob([bytes]), 'test.png');
    form.append('name', 'test.png');
    form.append('folder', '');
    form.append('index', String(index));
    form.append('total', '2');
    const response = await fetch(`${base}/api/files/upload`, { method: 'POST', headers: { cookie }, body: form });
    assert.equal(response.status, 200);
    chunks.push((await response.json()).chunk);
  }
  const payload = { id: randomUUID(), name: 'test.png', mime: 'image/png', size: image.length, folder: '', chunks };
  const finalize = body => fetch(`${base}/api/files/finalize`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await finalize({ ...payload, chunks: chunks.slice(1) })).status, 400);
  const first = await finalize(payload);
  assert.equal(first.status, 200);
  const file = (await first.json()).file;
  const second = await finalize(payload);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).file.id, file.id);
  const preview = await fetch(`${base}/api/files/${file.id}/preview`, { headers: { cookie } });
  assert.equal(preview.status, 200);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), image);
  const thumb = await fetch(`${base}/api/files/${file.id}/thumbnail`, { headers: { cookie } });
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/webp');
  const etag = thumb.headers.get('etag');
  assert.equal((await fetch(`${base}/api/files/${file.id}/thumbnail`, { headers: { cookie, 'if-none-match': etag } })).status, 304);
});
