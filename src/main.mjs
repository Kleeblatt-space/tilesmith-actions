import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { renderOverlay } from './overlay.mjs';
import { aggregate, markdownReport, upsertComment, writeSummary } from './report.mjs';

const API_URL = process.env.TILESMITH_API_URL || 'https://api.kleeblatt.space/v1/score';
const REPORTS_URL = process.env.TILESMITH_REPORTS_URL || API_URL.replace(/\/score\/?$/, '/reports');
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const input = (name, fallback = '') => process.env[`INPUT_${name.toUpperCase().replaceAll('-', '_')}`] ?? fallback;
const command = (kind, message) => console.log(`::${kind}::${String(message).replace(/[\r\n]/g, ' ')}`);

function validate() {
  const failOn = input('fail-on', 'Reject').toLowerCase();
  if (!['reject', 'review', 'never'].includes(failOn))
    throw new Error('Invalid fail-on: use Reject, Review, or never.');
  const maxFiles = Number(input('max-files', '100'));
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 500)
    throw new Error('Invalid max-files: use an integer from 1 to 500.');
  return { failOn, maxFiles };
}

async function walk(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'tilesmith-report'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, found);
    else if (/\.(png|jpe?g|webp)$/i.test(extname(entry.name))) found.push(full);
  }
  return found;
}

function matches(file, patterns) {
  const normalized = relative(root, file).split('\\').join('/');
  return patterns.some((pattern) => {
    const p = pattern.trim().replace(/^\.\//, '').replaceAll('**', '*');
    if (!p) return false;
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    return new RegExp(`^${escaped}$`).test(normalized) || new RegExp(`^${escaped}`).test(normalized);
  });
}

async function requestScore(buffer, apiKey) {
  let retry429 = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'image/png' },
        body: buffer,
        signal: controller.signal,
      });
      if ([401, 403].includes(response.status))
        throw Object.assign(new Error('Authentication failed. Check your API key and dashboard.'), { code: 2 });
      if (response.status === 402)
        throw Object.assign(new Error('TileSmith quota exhausted. Upgrade at https://app.kleeblatt.space.'), {
          code: 2,
        });
      if (response.status === 429) {
        if (!retry429) {
          command('warning', 'Rate limited by TileSmith API; tile skipped.');
          return null;
        }
        retry429 = false;
        const wait = Math.min(30_000, Number(response.headers.get('retry-after') || 1) * 1000);
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      if (response.status >= 500) {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
      }
      if (!response.ok) {
        command('warning', `TileSmith API returned ${response.status}; tile skipped.`);
        return null;
      }
      return await response.json();
    } catch (error) {
      if (error.code === 2) throw error;
      if (attempt === 2) {
        command('warning', `Tile scoring failed: ${error.message}; tile skipped.`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function scoreOne(file, apiKey) {
  const buffer = await readFile(file);
  const result = await requestScore(buffer, apiKey);
  if (!result) return null;
  const tile = {
    file: relative(root, file).split('\\').join('/'),
    overall: result.overall ?? result.score,
    gate: result.gate ?? 'Review',
    size_class:
      result.size_class ?? result.sizeClass ?? result.scored_at ?? `${result.width ?? '?'}x${result.height ?? '?'}`,
  };
  const safe = tile.file
    .replace(/^\/+|\.\./g, '')
    .replaceAll('/', '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
  await mkdir(join(root, 'tilesmith-report'), { recursive: true });
  await writeFile(join(root, 'tilesmith-report', `${safe}.png`), renderOverlay(buffer, tile));
  return tile;
}

async function uploadReport(apiKey, payload) {
  if (input('upload-report', 'true').toLowerCase() === 'false') return;
  try {
    const response = await fetch(REPORTS_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) command('warning', `Aggregate report upload returned ${response.status}; continuing.`);
  } catch (error) {
    command('warning', `Aggregate report upload failed: ${error.message}; continuing.`);
  }
}

async function main() {
  const { failOn, maxFiles } = validate();
  const apiKey = input('api-key');
  if (!apiKey) {
    command('notice', 'No API key – skipping QC. Free key: https://app.kleeblatt.space');
    return;
  }
  const patterns = input('paths', 'assets/**').split(',');
  const files = (await walk(root)).filter((file) => matches(file, patterns)).slice(0, maxFiles);
  const tiles = [];
  for (let i = 0; i < files.length; i += 4) {
    const batch = await Promise.all(files.slice(i, i + 4).map((file) => scoreOne(file, apiKey)));
    tiles.push(...batch.filter(Boolean));
  }
  const stats = aggregate(tiles);
  const metadata = {
    repo: process.env.GITHUB_REPOSITORY || '',
    ref: process.env.GITHUB_REF || '',
    commit: process.env.GITHUB_SHA || '',
    action_version: '1.0.0',
    stats,
    tiles,
  };
  await mkdir(join(root, 'tilesmith-report'), { recursive: true });
  await writeFile(join(root, 'tilesmith-report', 'report.json'), JSON.stringify(metadata, null, 2) + '\n');
  await writeSummary(process.env.GITHUB_STEP_SUMMARY, stats, tiles);
  const issue = process.env.GITHUB_EVENT_PATH ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const issueNumber = issue.pull_request?.number;
  if (process.env.GITHUB_TOKEN && issueNumber) {
    try {
      await upsertComment({
        token: process.env.GITHUB_TOKEN,
        repo: process.env.GITHUB_REPOSITORY,
        issueNumber,
        body: markdownReport(stats, tiles),
      });
    } catch (error) {
      command('warning', `PR comment failed: ${error.message}`);
    }
  }
  await uploadReport(apiKey, metadata);
  const outputLines = Object.entries({
    production: stats.production,
    review: stats.review,
    reject: stats.reject,
    avg: stats.avg,
    report: 'tilesmith-report/report.json',
  })
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `${outputLines}\n`);
  } else for (const line of outputLines.split('\n')) command('set-output', line);
  if ((failOn === 'reject' && stats.reject > 0) || (failOn === 'review' && stats.review + stats.reject > 0))
    process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = error.code === 2 ? 2 : 1;
  });

export { matches, aggregate };
