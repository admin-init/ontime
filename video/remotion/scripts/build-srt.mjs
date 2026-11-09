/**
 * Generate video/subtitles/promo.zh.srt from src/captions.json.
 * Run from video/remotion:  npm run captions
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const VIDEO = path.resolve(REMOTION, '..');
const OUT = path.join(VIDEO, 'subtitles', 'promo.zh.srt');

const captions = JSON.parse(
  fs.readFileSync(path.join(REMOTION, 'src', 'captions.json'), 'utf8'),
);

function stamp(seconds) {
  let ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  ms -= m * 60000;
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

const body = captions
  .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`)
  .join('\n\n');

fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, `${body}\n`, 'utf8');
console.log(`wrote ${OUT} (${captions.length} cues)`);
