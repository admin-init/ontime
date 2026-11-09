/**
 * Copy the supplied BGM/SFX into public/audio and write the audio manifest.
 * Run from video/remotion:  npm run prepare-audio
 *
 * Sources:
 *   ../assets/bgm/bgm-main.mp3
 *   ../assets/sfx/whoosh-transition.mp3
 */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
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

// v3 is 129.35s+ and needs a 117s BGM bed from 0:12. Build a 131.5s bed:
// original 0:09-1:54 (105s) + original 0:00-0:27 (27s), 0.5s crossfade.
const bgmV3 = path.join(PUBLIC_AUDIO, 'bgm-v3.mp3');
let bgmV3Exists = false;
if (bgmExists) {
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i', bgmSrc,
        '-filter_complex',
        '[0:a]atrim=start=9:end=114,asetpts=PTS-STARTPTS[a];' +
          '[0:a]atrim=start=0:end=27,asetpts=PTS-STARTPTS[b];' +
          '[a][b]acrossfade=d=0.5:c1=tri:c2=tri[out]',
        '-map', '[out]',
        '-c:a', 'libmp3lame', '-q:a', '2',
        bgmV3,
      ],
      {stdio: 'ignore'},
    );
    bgmV3Exists = fs.existsSync(bgmV3);
  } catch (e) {
    console.warn('bgm-v3 build failed, falling back to bgm-main.mp3');
  }
}

const manifest = {
  bgm: {
    file: bgmV3Exists ? 'audio/bgm-v3.mp3' : 'audio/bgm-main.mp3',
    exists: bgmV3Exists || bgmExists,
    inPoint: 12,
    sourceIn: bgmV3Exists ? 0 : 9,
    volume: 0.3,
    fadeIn: 0.5,
    fadeOut: 2,
    trackDuration: bgmV3Exists ? 131.5 : 114.024,
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
console.log(`bgm-v3.mp3       ${bgmV3Exists ? 'built' : 'not built'}`);
console.log(`whoosh-transition ${whooshExists ? 'found' : 'missing'}`);
console.log('audio manifest written to src/audio-manifest.json');
