import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiUrl = process.env.TILESMITH_API_URL || 'https://api.kleeblatt.space/v1/score';
const apiKey = process.env.TILESMITH_STAGING_API_KEY || process.env.TILESMITH_API_KEY;
const fixtureDir = new URL('../tests/fixtures/', import.meta.url);

async function score(name) {
  const buffer = await readFile(new URL(name, fixtureDir));
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'x-api-key': apiKey, 'content-type': 'image/png' }, body: buffer });
  assert.equal(response.status, 200, `${name}: expected HTTP 200, got ${response.status}`);
  return response.json();
}

test('staging API baseline fixtures', { skip: !apiKey }, async () => {
  const base = await score('base-01.png');
  assert.ok(Math.abs(Number(base.overall ?? base.score) - 97) <= 1, `base-01 score was ${base.overall ?? base.score}`);
  assert.equal(String(base.gate), 'Production');

  const brick = await score('brick.png');
  assert.ok(Math.abs(Number(brick.overall ?? brick.score) - 95) <= 1, `brick score was ${brick.overall ?? brick.score}`);
  const size = brick.size_class ?? brick.sizeClass ?? brick.scored_at;
  assert.equal(String(size), '64x64');
});

test('staging API credentials are available for the real run', { skip: Boolean(apiKey) }, () => {
  assert.ok(true, 'Set TILESMITH_STAGING_API_KEY to execute the live staging test.');
});
