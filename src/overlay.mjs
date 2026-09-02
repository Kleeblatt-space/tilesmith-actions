import { PNG } from 'pngjs';

const COLORS = {
  Production: { r: 46, g: 160, b: 67 },
  Review: { r: 230, g: 159, b: 0 },
  Reject: { r: 196, g: 40, b: 40 },
};

const FONT = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '110'],
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  E: ['111', '100', '110', '100', '111'],
  I: ['111', '010', '010', '010', '111'],
  N: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '010'],
  ' ': ['000', '000', '000', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
};

const pixel = (png, x, y, color) => {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) * 4;
  png.data[i] = color.r;
  png.data[i + 1] = color.g;
  png.data[i + 2] = color.b;
  png.data[i + 3] = 255;
};

function drawText(png, text, x, y, scale, color) {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] ?? FONT[' '];
    for (let row = 0; row < glyph.length; row++)
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '1')
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) pixel(png, cursor + col * scale + dx, y + row * scale + dy, color);
      }
    cursor += 4 * scale;
  }
}

function upscale(source) {
  const factor = Math.max(1, Math.ceil(128 / Math.min(source.width, source.height)));
  if (factor === 1) return source;
  const output = new PNG({ width: source.width * factor, height: source.height * factor });
  for (let y = 0; y < output.height; y++)
    for (let x = 0; x < output.width; x++) {
      const sx = Math.floor(x / factor),
        sy = Math.floor(y / factor);
      const si = (source.width * sy + sx) * 4,
        di = (output.width * y + x) * 4;
      output.data[di] = source.data[si];
      output.data[di + 1] = source.data[si + 1];
      output.data[di + 2] = source.data[si + 2];
      output.data[di + 3] = source.data[si + 3];
    }
  return output;
}

/** @param {Buffer} input @param {{gate?: string, overall?: number}} score */
export function renderOverlay(input, score = {}) {
  const source = PNG.sync.read(input);
  const png = upscale(source);
  const gate = score.gate ?? 'Review';
  const frame = COLORS[gate] ?? COLORS.Review;
  const thickness = Math.max(2, Math.round(Math.min(png.width, png.height) / 64));
  for (let t = 0; t < thickness; t++)
    for (let x = 0; x < png.width; x++) {
      pixel(png, x, t, frame);
      pixel(png, x, png.height - 1 - t, frame);
    }
  for (let t = 0; t < thickness; t++)
    for (let y = 0; y < png.height; y++) {
      pixel(png, t, y, frame);
      pixel(png, png.width - 1 - t, y, frame);
    }
  const label = `${gate} ${Number.isFinite(score.overall) ? Math.round(score.overall) : '?'}`;
  const scale = Math.max(1, Math.floor(Math.min(png.width, png.height) / 160));
  drawText(png, label, thickness * 2, thickness * 2, scale, { r: 255, g: 255, b: 255 });
  return PNG.sync.write(png);
}

export const __test = { upscale };
