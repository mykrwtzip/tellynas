const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { useUploadQueue } = require('../lib/use-uploads.ts');
global.window = global;
global.IS_REACT_ACT_ENVIRONMENT = true;

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    if (predicate()) return;
  }
  throw new Error('Timed out waiting for upload queue');
}

test('retry preserves completed chunks and can retry a failed finalization', async () => {
  const previousXHR = global.XMLHttpRequest;
  const previousFetch = global.fetch;
  const calls = [0, 0, 0];
  const finalizations = [];
  let queue;
  let failure = true;
  let finalFailure = true;
  class FakeXHR {
    upload = {};
    open() {}
    send(form) {
      const index = Number(form.get('index'));
      calls[index]++;
      queueMicrotask(() => {
        if (index === 1 && failure) {
          this.status = 400;
          this.responseText = JSON.stringify({ error: 'failed chunk' });
          failure = false;
        } else {
          this.status = 200;
          this.responseText = JSON.stringify({ chunk: { index, messageId: index + 1, fileId: `file-${index}`, size: 1, botIndex: index } });
        }
        this.onload();
        this.onloadend?.();
      });
    }
    abort() { this.onabort?.(); this.onloadend?.(); }
  }
  global.XMLHttpRequest = FakeXHR;
  global.fetch = async (_url, init) => {
    finalizations.push(JSON.parse(init.body));
    if (finalFailure) { finalFailure = false; return Response.json({ error: 'busy' }, { status: 503 }); }
    return Response.json({ file: { id: finalizations[0].id } });
  };
  function Component() {
    queue = useUploadQueue({ chunkSize: 1, chunkConcurrency: 3, onUploaded() {}, onError() {} });
    return null;
  }
  let root;
  try {
    await act(async () => { root = create(React.createElement(Component)); });
    await act(async () => { queue.addFiles([new File(['abc'], 'test.txt')], ''); });
    await waitFor(() => queue.items[0]?.status === 'error');
    assert.deepEqual(calls, [1, 1, 1]);
    await act(async () => { queue.retry(queue.items[0].id); });
    await waitFor(() => queue.items[0]?.status === 'error' && finalizations.length === 1);
    assert.deepEqual(calls, [1, 2, 1]);
    assert.deepEqual(finalizations[0].chunks.map(c => c.botIndex), [0, 1, 2]);
    await act(async () => { queue.retry(queue.items[0].id); });
    await waitFor(() => queue.items[0]?.status === 'done');
    assert.deepEqual(calls, [1, 2, 1]);
    assert.deepEqual(finalizations[1], finalizations[0]);
  } finally {
    if (root) await act(async () => root.unmount());
    global.XMLHttpRequest = previousXHR;
    global.fetch = previousFetch;
  }
});

test('transient failures release semaphore slots before retrying', async () => {
  const previousXHR = global.XMLHttpRequest;
  const previousFetch = global.fetch;
  const calls = new Map();
  let queue;
  class FakeXHR {
    upload = {};
    open() {}
    send(form) {
      const index = Number(form.get('index'));
      const count = (calls.get(index) || 0) + 1;
      calls.set(index, count);
      queueMicrotask(() => {
        this.status = count === 1 ? 503 : 200;
        this.responseText = JSON.stringify(count === 1 ? { error: 'busy' } : { chunk: { index, messageId: index + 1, fileId: String(index), size: 1 } });
        this.onload();
        this.onloadend?.();
      });
    }
    abort() { this.onabort?.(); this.onloadend?.(); }
  }
  global.XMLHttpRequest = FakeXHR;
  global.fetch = async () => Response.json({ file: { id: 'done' } });
  function Component() {
    queue = useUploadQueue({ chunkSize: 1, chunkConcurrency: 12, onUploaded() {}, onError() {} });
    return null;
  }
  let root;
  try {
    await act(async () => { root = create(React.createElement(Component)); });
    await act(async () => { queue.addFiles([new File(['abcdefghijkl'], 'large.txt')], ''); });
    await waitFor(() => queue.items[0]?.status === 'done');
    assert.equal(calls.size, 12);
    assert.ok([...calls.values()].every(count => count === 2));
  } finally {
    if (root) await act(async () => root.unmount());
    global.XMLHttpRequest = previousXHR;
    global.fetch = previousFetch;
  }
});
