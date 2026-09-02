import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { renderOverlay } from '../src/overlay.mjs';
import { aggregate, markdownReport, MARKER } from '../src/report.mjs';
import { matches } from '../src/main.mjs';

const png = (width, height) => PNG.sync.write(new PNG({ width, height }));

test('overlay upscales small source and draws a production frame', () => {
  const output = PNG.sync.read(renderOverlay(png(16, 16), { gate: 'Production', overall: 97 }));
  assert.ok(output.width >= 128 && output.height >= 128);
  assert.deepEqual([...output.data.slice(0, 3)], [46, 160, 67]);
});

test('aggregate counts gates and computes average', () => {
  assert.deepEqual(
    aggregate([
      { gate: 'Production', overall: 97 },
      { gate: 'Review', overall: 80 },
      { gate: 'Reject', overall: 50 },
    ]),
    { total: 3, production: 1, review: 1, reject: 1, avg: 75.7 },
  );
});

test('markdown contains marker, table, disclaimer and upgrade hint', () => {
  const text = markdownReport({ total: 1, avg: 50, production: 0, review: 0, reject: 1 }, [
    { file: 'a.png', overall: 50, gate: 'Reject', size_class: '64x64' },
  ]);
  assert.match(text, new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /\| File \| Score \| Gate \| Size class \|/);
  assert.match(text, /Images and personal data are never stored/);
  assert.match(text, /upgrade/i);
});

test('scan matcher accepts configured glob prefixes and rejects unrelated paths', () => {
  assert.equal(matches(`${process.cwd()}/assets/hero.png`, ['assets/**']), true);
  assert.equal(matches(`${process.cwd()}/src/hero.png`, ['assets/**']), false);
});
