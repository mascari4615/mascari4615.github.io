/**
 * **파일의 표본률을 읽는 눈** (TASK-KL-269 뒤따라).
 *
 * 왜 있나: 화면에 44.1kHz라고 적혀 있었는데 그건 파일이 아니라 **그 컴퓨터 스피커**의 값이었다.
 * 브라우저가 소리를 풀 때 장치 값으로 바꿔 주기 때문이다. 그래서 8kHz 로 만든 파일을 넣는 검사가
 * 내 컴퓨터에선 초록, CI 에선 빨강이 됐다. 도구가 틀린 수를 보여 주고 있었다는 뜻이다.
 *
 * 여기서는 형식별로 머리만 만들어 넣고 그 수가 나오는지 본다(브라우저 없이 1초).
 * 사용: node scripts/test-audio-rate.mjs   (npm run test:audiorate)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: ${got} (기대 ${want})`);

const out = path.join(os.tmpdir(), `audio-rate-${Date.now()}.mjs`);
await esbuild.build({
  entryPoints: [path.join(root, 'src/widgets/tools/shared/audio-rate.ts')],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { sniffSampleRate } = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });

/** 검사가 실제로 쓰는 것과 **같은 모양**의 WAV 머리 (smoke-sound-shell 의 그것) */
function wav(rate, bytes = 32) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + bytes, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(bytes, 40);
  return Buffer.concat([head, Buffer.alloc(bytes)]);
}

eq(sniffSampleRate(wav(8000)), 8000, 'WAV 8kHz');
eq(sniffSampleRate(wav(44100)), 44100, 'WAV 44.1kHz');
eq(sniffSampleRate(wav(48000)), 48000, 'WAV 48kHz');

/* 덩이 순서가 다른 WAV. `fmt ` 앞에 다른 덩이가 끼어도 찾아야 한다 (실제 녹음기들이 그렇게 쓴다) */
{
  const extra = Buffer.alloc(8 + 10);
  extra.write('LIST', 0);
  extra.writeUInt32LE(10, 4);
  const w = wav(16000);
  const mixed = Buffer.concat([w.subarray(0, 12), extra, w.subarray(12)]);
  mixed.writeUInt32LE(mixed.length - 8, 4);
  eq(sniffSampleRate(mixed), 16000, 'WAV. 다른 덩이가 앞에 끼어도');
}

/* FLAC. 첫 덩이 안, 80비트 뒤의 20비트 */
{
  const b = Buffer.alloc(64);
  b.write('fLaC', 0);
  b[4] = 0x80; // 마지막 덩이, STREAMINFO
  const s = 8;
  const rate = 44100;
  b[s + 10] = (rate >> 12) & 0xff;
  b[s + 11] = (rate >> 4) & 0xff;
  b[s + 12] = (rate & 0xf) << 4;
  eq(sniffSampleRate(b), 44100, 'FLAC');
}

/* Ogg Opus. 48k 로 나온다가 아니라 **원래 녹음한 값**을 적어 준다 */
{
  const b = Buffer.alloc(128);
  b.write('OggS', 0);
  b.write('OpusHead', 28);
  b.writeUInt32LE(24000, 28 + 12);
  eq(sniffSampleRate(b), 24000, 'Ogg Opus');
}

/* Ogg Vorbis */
{
  const b = Buffer.alloc(128);
  b.write('OggS', 0);
  b[28] = 1;
  b.write('vorbis', 29);
  b.writeUInt32LE(32000, 29 + 11);
  eq(sniffSampleRate(b), 32000, 'Ogg Vorbis');
}

/* MP4/M4A. 소리 칸 머리의 16.16 고정소수 (윗 두 바이트만 본다) */
{
  const b = Buffer.alloc(256);
  b.write('ftyp', 4);
  const at = 64;
  b.write('mp4a', at);
  b.writeUInt16BE(44100, at + 24);
  eq(sniffSampleRate(b), 44100, 'MP4 mp4a');
}

/* MP3. ID3 꼬리표를 건너뛰고 첫 마디 */
{
  const tag = Buffer.alloc(10 + 100);
  tag.write('ID3', 0);
  tag[6] = 0;
  tag[7] = 0;
  tag[8] = 0;
  tag[9] = 100; // 7비트씩 적는 크기
  const frame = Buffer.from([0xff, 0xfb, 0x90, 0x00]); // MPEG-1 Layer3, 표본률 자리 0 = 44100
  eq(sniffSampleRate(Buffer.concat([tag, frame])), 44100, 'MP3 (ID3 뒤)');
  eq(sniffSampleRate(Buffer.concat([Buffer.from([0xff, 0xf3, 0x90, 0x00]), Buffer.alloc(32)])), 22050, 'MP3 MPEG-2');
}

/* 모르는 것은 **모른다고** 해야 한다. 0 이나 44100 으로 둘러대면 부르는 쪽이 속는다 */
eq(sniffSampleRate(Buffer.from('이건 소리가 아니다', 'utf8')), null, '모르는 형식이면 null');
eq(sniffSampleRate(Buffer.alloc(4)), null, '너무 짧으면 null');

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-audio-rate] 실패 ${failures.length}건`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[test-audio-rate] 전부 통과');
