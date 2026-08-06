/**
 * 내 컴퓨터에서 도는 한국어 목소리 챙기기.
 *
 *   node scripts/get-voice.mjs
 *
 * 이 길을 찾는 데 두 번 헛발을 디뎠으므로 그대로 적어 둔다:
 *
 * 1. 공식 한국어 목소리는 실행기가 그냥은 못 읽는다 — 설정표에 「여러 글자로 된 발음」
 *    다섯 개(영어 이중모음)가 들어 있는데, 이 실행기는 한 글자짜리만 안다. 한국어는
 *    그 다섯 개를 쓰지 않으므로 빼고 쓰면 된다.
 * 2. 다른 배포본(pygoruut 용)은 소리는 나오지만 **발음이 엉망**이다. 실행기가 그 발음
 *    변환기를 모르기 때문이다. 소리가 난다고 맞는 게 아니다.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? join(here, '..', '..', '..', '..', 'memo', 'life', '.models', 'piper');

const VOICE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx';
const RUNNER = 'https://github.com/rhasspy/piper/releases/latest/download/piper_windows_amd64.zip';

mkdirSync(root, { recursive: true });

async function download(url, into) {
  if (existsSync(into)) {
    console.log(`이미 있다: ${into}`);
    return;
  }
  console.log(`받는 중: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (res.ok === false) throw new Error(`${res.status} — ${url}`);
  writeFileSync(into, Buffer.from(await res.arrayBuffer()));
}

const rawVoice = join(root, 'ko_KR-kss-medium.onnx');
await download(VOICE, rawVoice);
await download(`${VOICE}.json`, `${rawVoice}.json`);

if (existsSync(join(root, 'piper', 'piper.exe')) === false) {
  const zip = join(root, 'piper.zip');
  await download(RUNNER, zip);
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${root}' -Force`]);
  rmSync(zip, { force: true });
}

// 실행기가 읽을 수 있는 설정으로 손봐서 따로 저장한다. 원본은 건드리지 않는다.
const config = JSON.parse(readFileSync(`${rawVoice}.json`, 'utf8'));
const dropped = Object.keys(config.phoneme_id_map).filter((k) => [...k].length > 1);
config.phoneme_id_map = Object.fromEntries(
  Object.entries(config.phoneme_id_map).filter(([k]) => [...k].length === 1),
);
copyFileSync(rawVoice, join(root, 'ko-espeak.onnx'));
writeFileSync(join(root, 'ko-espeak.onnx.json'), JSON.stringify(config), 'utf8');

console.log(`정리했다 — 뺀 발음 ${dropped.length}개 (${dropped.join(' ')}) · 한국어엔 안 쓰인다`);
console.log(`준비 끝: ${join(root, 'ko-espeak.onnx')}`);
