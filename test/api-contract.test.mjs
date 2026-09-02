import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { requestScore } from '../src/main.mjs';
import { renderOverlay } from '../src/overlay.mjs';

const response = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const fixtureDir = new URL('../tests/fixtures/', import.meta.url);

test('API contract sends raw PNG bytes and parses score response', async () => {
  let call;
  const result = await requestScore(Buffer.from('png'), 'ts_test', async (url, options) => {
    call = { url, options };
    return response(200, { overall: 97, gate: 'Production', size_class: '16x16' });
  });
  assert.equal(result.overall, 97);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers['x-api-key'], 'ts_test');
  assert.equal(call.options.headers['content-type'], 'image/png');
  assert.deepEqual(call.options.body, Buffer.from('png'));
});

test('401 and 403 are hard configuration errors', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      () => requestScore(Buffer.from('x'), 'ts_test', async () => response(status)),
      (error) => error.code === 2 && /API key/.test(error.message),
    );
  }
});

test('402 is a hard quota error', async () => {
  await assert.rejects(
    () => requestScore(Buffer.from('x'), 'ts_test', async () => response(402)),
    (error) => error.code === 2 && /quota/i.test(error.message),
  );
});

test('all benchmark fixtures are readable PNGs and produce overlays', async () => {
  const names = (await readdir(fixtureDir)).filter((name) => name.endsWith('.png'));
  assert.equal(names.length, 6);
  for (const name of names) {
    const source = await readFile(new URL(name, fixtureDir));
    const overlay = renderOverlay(source, { overall: 95, gate: 'Production' });
    assert.ok(overlay.length > source.length / 2, `${name} overlay was unexpectedly small`);
  }
});
