/**
 * Prepare local media for the Remotion composition.
 *
 * - Copies the trial recordings and the two real/synthetic demo images into public/media.
 * - Conforms every timed shot into a short 1440x900 / 30fps clip with ffmpeg, so the
 *   Remotion timeline only has to deal with exact shot durations.
 * - Extracts the last frame of each clip (used as a safe fallback when a shot is a few
 *   frames longer than its clip) and a few real stills for hold shots.
 *
 * Run from video/remotion:  npm run prepare-media
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const VIDEO = path.resolve(REMOTION, '..');
const REPO = path.resolve(VIDEO, '..');
const REC = path.join(REPO, 'recordings', '_trial');
const PUBLIC = path.join(REMOTION, 'public', 'media');
const SRC = path.join(REMOTION, 'src');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const CLIPS = [
  {id: '01-settings', src: '01-reset.mp4', start: 0.0, end: 1.933, rate: 0.55},
  {id: '02-progress', src: '02-notice-ingest.mp4', start: 0.0, end: 34.0, rate: 8.0},
  {id: '03-confirm', src: '03-confirm-detail.mp4', start: 1.0, end: 6.0, rate: 1.1},
  {id: '04-fields', src: '04-fields-source.mp4', start: 0.4, end: 4.9, rate: 1.0},
  {id: '04b-materials', src: '04b-task-pending.mp4', start: 3.0, end: 6.1, rate: 0.7},
  {id: '05-progress', src: '05-chat-ingest.mp4', start: 1.4, end: 51.2, rate: 16.0},
  {id: '06-diff', src: '06-merge-conflict.mp4', start: 1.2, end: 3.1, rate: 0.5},
  {id: '06-conflict', src: '06-merge-conflict.mp4', start: 6.8, end: 9.66, rate: 0.5},
  {id: '07-search', src: '07-verify-search.mp4', start: 0.9, end: 7.2, rate: 1.35},
  {id: '08-link', src: '08-link-verify-apply-export.mp4', start: 5.5, end: 14.2, rate: 2.2},
  {id: '08-findings', src: '08-link-verify-apply-export.mp4', start: 14.3, end: 17.8, rate: 1.0},
  {id: '09-action', src: '09-action-final.mp4', start: 0.2, end: 4.0, rate: 0.92},
  {id: '09-history', src: '09-action-final.mp4', start: 6.4, end: 7.8, rate: 0.54},
  {id: 'ms-sync', src: '../_multisource/ms-sync.mp4', start: 3.2, end: 7.8, rate: 1.0},
  {id: 'ms-email-start', src: '../_multisource/ms-email2-start.mp4', start: 2.6, end: 4.6, rate: 1.0},
  {id: 'ms-email-done', src: '../_multisource/ms-email2-done.mp4', start: 3.1, end: 5.0, rate: 1.0},
  {id: 'ms-inbox', src: '../_multisource/ms-inbox2.mp4', start: 2.6, end: 5.4, rate: 1.0},
  {id: 'ms-reminder', src: '../_multisource/ms-reminder2.mp4', start: 3.4, end: 6.0, rate: 1.0},
  {id: 'ms-agent-result', src: '../_multisource/ms-agent3.mp4', start: 14.6, end: 18.2, rate: 1.15},
  {id: '10-export-ics', src: '../_export-ics/export-ics.mp4', start: 0.5, end: 4.5, rate: 1.0},
];

const STILLS = [
  {id: '02-inbox', src: '02-notice-ingest.mp4', at: 31.6},
  {id: '04b-task', src: '04b-task-pending.mp4', at: 3.2},
  {id: '05-merge', src: '05-chat-ingest.mp4', at: 52.0},
  {id: '07-notfound', src: '07-verify-search.mp4', at: 7.6},
];

function run(bin, args) {
  execFileSync(bin, args, {stdio: ['ignore', 'inherit', 'inherit']});
}

function probeDuration(file) {
  const out = execFileSync(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    {encoding: 'utf8'},
  ).trim();
  return Number(out);
}

fs.mkdirSync(path.join(PUBLIC, 'clips'), {recursive: true});
fs.mkdirSync(path.join(PUBLIC, 'stills'), {recursive: true});
fs.mkdirSync(path.join(PUBLIC, 'img'), {recursive: true});
fs.mkdirSync(SRC, {recursive: true});

for (const spec of CLIPS) {
  const input = path.join(REC, spec.src);
  if (!fs.existsSync(input)) throw new Error(`missing source: ${input}`);
  const out = path.join(PUBLIC, 'clips', `${spec.id}.mp4`);
  const filter = [
    `trim=start=${spec.start}:end=${spec.end}`,
    'setpts=PTS-STARTPTS',
    `setpts=PTS/${spec.rate}`,
    'fps=30',
    'scale=1440:900:flags=lanczos',
    'setsar=1',
    'format=yuv420p',
  ].join(',');
  console.log(`clip ${spec.id}  ${spec.start}-${spec.end}s  x${spec.rate}`);
  run(FFMPEG, [
    '-y',
    '-loglevel', 'error',
    '-i', input,
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '16',
    '-movflags', '+faststart',
    out,
  ]);
  run(FFMPEG, [
    '-y',
    '-loglevel', 'error',
    '-sseof', '-0.15',
    '-i', out,
    '-frames:v', '1',
    '-q:v', '2',
    path.join(PUBLIC, 'clips', `${spec.id}-last.png`),
  ]);
}

for (const spec of STILLS) {
  const input = path.join(REC, spec.src);
  console.log(`still ${spec.id}  @${spec.at}s`);
  run(FFMPEG, [
    '-y',
    '-loglevel', 'error',
    '-ss', String(spec.at),
    '-i', input,
    '-frames:v', '1',
    '-q:v', '2',
    path.join(PUBLIC, 'stills', `${spec.id}.png`),
  ]);
}

for (const name of ['unnc_notice.png', 'unnc_chat.png']) {
  fs.copyFileSync(
    path.join(REPO, 'fixtures', 'demo', name),
    path.join(PUBLIC, 'img', name),
  );
}

const manifest = CLIPS.map((spec) => ({
  id: spec.id,
  source: spec.src,
  sourceStart: spec.start,
  sourceEnd: spec.end,
  rate: spec.rate,
  file: `media/clips/${spec.id}.mp4`,
  lastFrame: `media/clips/${spec.id}-last.png`,
  duration: Number(
    probeDuration(path.join(PUBLIC, 'clips', `${spec.id}.mp4`)).toFixed(3),
  ),
}));
fs.writeFileSync(
  path.join(SRC, 'clips-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log('\nprepared:');
for (const item of manifest) {
  console.log(`  ${item.id.padEnd(16)} ${item.duration.toFixed(2)}s  x${item.rate}`);
}
