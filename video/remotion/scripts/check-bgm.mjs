/**
 * Refresh src/bgm-manifest.json from public/bgm.mp3.
 * Run after dropping a track in:  npm run bgm
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const VIDEO = path.resolve(REMOTION, '..');
const SRC = path.join(REMOTION, 'src');
const publicBgm = path.join(REMOTION, 'public', 'bgm.mp3');
const assetBgm = path.join(VIDEO, 'assets', 'bgm', 'bgm.mp3');

if (!fs.existsSync(publicBgm) && fs.existsSync(assetBgm)) {
  fs.mkdirSync(path.dirname(publicBgm), {recursive: true});
  fs.copyFileSync(assetBgm, publicBgm);
}

const exists = fs.existsSync(publicBgm);
fs.writeFileSync(
  path.join(SRC, 'bgm-manifest.json'),
  `${JSON.stringify({exists, path: 'bgm.mp3'}, null, 2)}\n`,
  'utf8',
);
console.log(exists ? 'bgm.mp3 found: audio will be attached.' : 'no bgm.mp3: silent render.');
