#!/usr/bin/env node
/**
 * audit-private-origin — 비공개에서 나온 파일이 공개 레포에 담기는 걸 막는다.
 *
 * 2026-08-21 에 실제로 났던 사고: 이 레포는 공개인데 지식베이스는 비공개다.
 * 거기서 구운 지도 데이터를 여기 담았고, 그 안에 글 제목·경로가 1516개 들어 있었다.
 * 비공개 지식베이스의 목차를 공개한 셈이다.
 *
 * 흔한 유출 방지 도구는 이걸 못 잡는다. 그것들은 열쇠·토큰처럼 **모양이 정해진**
 * 비밀을 찾는데, 새어 나간 건 평범한 글자였다. 그래서 모양이 아니라 **출신**을 본다:
 * 만드는 쪽이 파일 안에 도장을 찍고, 여기서 그 도장이 찍힌 파일이 git 에 담겼는지 본다.
 *
 * 무시 목록에만 기대지 않는 이유 = 사람이 잊으면 끝이기 때문이다. 도장은 파일이
 * 스스로 들고 다니므로, 새 파일이 생겨도 규칙을 다시 안 적어도 된다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const REPO = path.resolve(KARMOLAB, '../..');

const STAMP = '"origin"';                       // 도장 열쇠
const PRIVATE = 'private:';                   // 비공개 출신 표시

function tracked() {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--', 'apps/', 'assets/', 'data/'],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

const files = tracked();
if (!files) {
  console.log('[private-origin] git 을 못 읽었다 — 검사 건너뜀');
  process.exit(0);
}

/* 도장은 굽는 스크립트가 찍는다. 소스 코드가 그 글자를 말할 수는 있으니
   (이 파일이 그렇다) 데이터 파일만 본다. */
const DATA_LIKE = /\.(json|jsonl|csv|ndjson)$/i;
const caught = [];
for (const rel of files) {
  if (!DATA_LIKE.test(rel)) continue;
  const abs = path.join(REPO, rel);
  let head;
  try {
    const fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    head = buf.slice(0, n).toString('utf8');
  } catch { continue; }
  if (head.includes(STAMP) && head.includes(PRIVATE)) caught.push(rel);
}

if (caught.length) {
  console.log('[private-origin] **비공개에서 나온 파일이 이 레포에 담겨 있다**');
  for (const c of caught) console.log(`  - ${c}`);
  console.log('  이 레포는 공개다. 담긴 파일 안에 비공개 쪽 글 제목·경로가 들어 있다.');
  console.log('  빼는 법: git rm --cached <파일>  +  .gitignore 에 추가');
  process.exit(1);
}

console.log(`[private-origin] 데이터 파일 ${files.filter((f) => DATA_LIKE.test(f)).length}개 확인 — 비공개 출신 없음`);
