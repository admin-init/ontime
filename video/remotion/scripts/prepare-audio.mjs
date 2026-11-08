/**
 * Copy the supplied BGM/SFX into public/audio and write the audio manifest.
 * Run from video/remotion:  npm run prepare-audio
 *
 * Sources:
 *   ../assets/bgm/bgm-main.mp3
 *   ../assets/sfx/whoosh-transition.mp3
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const VIDEO = path.resolve(REMOTION, '..');
const PUBLIC_AUDIO = path.join(REMOTION, 'public', 'audio');
const SRC = path.join(REMOTION, 'src');

const bgmSrc = path.join(VIDEO, 'assets', 'bgm', 'bgm-main.mp3');
const whooshSrc = path.join(VIDEO, 'assets', 'sfx', 'whoosh-transition.mp3');

fs.mkdirSync(PUBLIC_AUDIO, {recursive: true});

const copyIfPresent = (src, name) => {
  const exists = fs.existsSync(src);
  if (exists) {
    fs.copyFileSync(src, path.join(PUBLIC_AUDIO, name));
  }
  return exists;
};

const bgmExists = copyIfPresent(bgmSrc, 'bgm-main.mp3');
const whooshExists = copyIfPresent(whooshSrc, 'whoosh-transition.mp3');

const manifest = {
  bgm: {
    file: 'audio/bgm-main.mp3',
    exists: bgmExists,
    inPoint: 12,
    sourceIn: 9,
    volume: 0.3,
    fadeIn: 0.5,
    fadeOut: 2,
    trackDuration: 114.024,
  },
  sfx: [
    {
      file: 'audio/whoosh-transition.mp3',
      exists: whooshExists,
      at: 21,
      lead: 1.1,
      volume: 0.12,
      duration: 1.34,
    },
    {
      file: 'audio/whoosh-transition.mp3',
      exists: whooshExists,
      at: 43,
      lead: 1.1,
      volume: 0.12,
      duration: 1.34,
    },
    {
      file: 'audio/whoosh-transition.mp3',
      exists: whooshExists,
      at: 65,
      lead: 1.1,
      volume: 0.12,
      duration: 1.34,
    },
  ],
  attribution:
    'Music: "Continue Life" — Kevin MacLeod (incompetech.com), CC BY 4.0',
};

fs.writeFileSync(
  path.join(SRC, 'audio-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`bgm-main.mp3     ${bgmExists ? 'found' : 'missing'}`);
console.log(`whoosh-transition ${whooshExists ? 'found' : 'missing'}`);
console.log('audio manifest written to src/audio-manifest.json');
