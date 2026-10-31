const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Load the server's TypeScript modules without introducing a test-runner dependency.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { createTelegramDriver } = require('../lib/driver.ts');
const { serializeFileSidecar, parseSidecarRecord, toEmbeddedFileMeta, serializeDirectory, parseDirectory } = require('../lib/metadata.ts');

test('chunks use different bots even when every request creates a new driver', async () => {
  const originalFetch = global.fetch;
  const tokens = [];
  global.fetch = async (url) => {
    tokens.push(String(url).match(/\/bot([^/]+)\//)[1]);
    return Response.json({ ok: true, result: { message_id: tokens.length, document: { file_id: `file-${tokens.length}` } } });
  };
  try {
    const chunks = await Promise.all([0, 1, 2, 3].map(index =>
      createTelegramDriver(['one', 'two', 'three']).uploadChunk({ data: new Uint8Array([index]), name: 'test', folder: '', index, total: 4 }),
    ));
    assert.deepEqual(tokens, ['one', 'two', 'three', 'one']);
    assert.deepEqual(chunks.map(chunk => chunk.botIndex), [0, 1, 2, 0]);
  } finally { global.fetch = originalFetch; }
});

test('bot ownership survives sidecar and embedded directory round trips', () => {
  const chunks = [{ index: 0, messageId: 1, fileId: 'a', size: 3, botIndex: 2 }];
  const file = { id: 'id', name: 'a.jpg', size: 3, mime: 'image/jpeg', folder: '', chunks, createdAt: 1, updatedAt: 1, starred: false, archived: false };
  const sidecar = serializeFileSidecar(file);
  assert.equal(parseSidecarRecord(sidecar.content, sidecar.caption).chunks[0].botIndex, 2);
  const directory = serializeDirectory([{ kind: 'file', id: file.id, fileName: sidecar.fileName, fileId: 'sidecar', messageId: 2, meta: toEmbeddedFileMeta(file) }]);
  assert.equal(parseDirectory(directory.content).entries[0].meta.chunks[0].botIndex, 2);
});
