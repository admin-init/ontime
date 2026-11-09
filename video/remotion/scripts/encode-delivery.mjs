/**
 * Remotion 母版 → 平台交付版。
 *
 * 背景：
 *   Remotion 直出是 yuvj420p / pc（full range），容器里还常带 bt470bg 元数据。
 *   小红书等平台按 limited range + bt709 解码，纸底 #F7F5F1 会被裁成纯白。
 *
 * 做法：
 *   - 母版保留：promo-vX-master.mp4
 *   - 交付版：yuv420p / tv / bt709 / 10 Mbps CBR / AAC 192k
 *   - 实测母版实际的 RGB→YUV 矩阵是 BT.709（不是容器里写的 bt470bg）；
 *     按 bt709 转，纸底能保持 245/243/241。按 bt601 转会掉到 243/243/238。
 *   - CRF 16 在这条静态 UI 片上只有约 2.4 Mbps，达不到 8–12 Mbps；
 *     改用 10 Mbps CBR。
 *   - -x264-params 里的 colorprim/transfer/colormatrix 必须写，
 *     否则 ffprobe 的 color_transfer / color_primaries 仍是 unknown。
 *
 * 用法：
 *   node scripts/encode-delivery.mjs
 *   node scripts/encode-delivery.mjs ../out/promo-v5-master.mp4 ../out/promo-v5.mp4
 *   npm run encode:delivery -- ../out/promo-v6-master.mp4 ../out/promo-v6.mp4
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '..', 'out');

const input = path.resolve(process.argv[2] || path.join(OUT, 'promo-v5-master.mp4'));
const output = path.resolve(process.argv[3] || path.join(OUT, 'promo-v5.mp4'));

if (!fs.existsSync(input)) {
  throw new Error(`missing master: ${input}`);
}

const VF =
  'scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p';

const args = [
  '-y',
  '-i', input,
  '-vf', VF,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-b:v', '10M',
  '-minrate', '10M',
  '-maxrate', '10M',
  '-bufsize', '20M',
  '-x264-params', 'nal-hrd=cbr:colorprim=bt709:transfer=bt709:colormatrix=bt709',
  '-profile:v', 'high',
  '-level', '4.1',
  '-colorspace', 'bt709',
  '-color_primaries', 'bt709',
  '-color_trc', 'bt709',
  '-color_range', 'tv',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-movflags', '+faststart',
  output,
];

console.log(`in  ${input}`);
console.log(`out ${output}`);
execFileSync('ffmpeg', args, {stdio: 'inherit'});

const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries',
      'stream=pix_fmt,color_range,color_space,color_transfer,color_primaries,bit_rate,avg_frame_rate,width,height,nb_frames:format=duration,size,bit_rate',
      '-of', 'json',
      output,
    ],
    {encoding: 'utf8'},
  ),
);
const s = probe.streams?.[0] || {};
const f = probe.format || {};
const expect = {
  pix_fmt: 'yuv420p',
  color_range: 'tv',
  color_space: 'bt709',
  color_transfer: 'bt709',
  color_primaries: 'bt709',
};
for (const [key, value] of Object.entries(expect)) {
  if (s[key] !== value) {
    throw new Error(`bad ${key}: ${s[key]} (expected ${value})`);
  }
}

console.log('');
console.log('✓ delivery encoded');
console.log(`  pix_fmt         ${s.pix_fmt}`);
console.log(`  color_range     ${s.color_range}`);
console.log(`  color_space     ${s.color_space}`);
console.log(`  color_transfer  ${s.color_transfer}`);
console.log(`  color_primaries ${s.color_primaries}`);
console.log(`  resolution      ${s.width}×${s.height}`);
console.log(`  frames          ${s.nb_frames}`);
console.log(`  duration        ${Number(f.duration).toFixed(3)}s`);
console.log(`  video bitrate   ${(Number(s.bit_rate) / 1e6).toFixed(2)} Mbps`);
console.log(`  file bitrate    ${(Number(f.bit_rate) / 1e6).toFixed(2)} Mbps`);
console.log(`  size            ${(Number(f.size) / 1024 / 1024).toFixed(2)} MiB`);
