#!/usr/bin/env node
// 중복 판정의 실제 본문, 사본 대조, 구성원 일치 및 저장 결과 감사
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { atlasPath, isFake } from './lib/atlas-file.mjs';
import { DUPLICATE_POLICY, fingerprint, compareFingerprints, duplicateBody, findDuplicates } from './lib/atlas-duplicates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const file = atlasPath(HERE);
if (!fs.existsSync(file)) {
  console.log('[twins] 실제 지도 부재. CANNOT-RUN'); process.exit(2);
}
const atlas = JSON.parse(fs.readFileSync(file, 'utf8'));
const bad = [];
const fixture = spawnSync(process.execPath, ['--test', path.join(HERE, 'lib/atlas-duplicates.test.mjs')], { encoding: 'utf8' });
if (fixture.status !== 0) { console.log(fixture.stdout, fixture.stderr); bad.push('독립 사본 및 비중복 대조 실패'); }
if (isFake(file)) {
  console.log('[twins] 합성 자료: 독립 본문 대조만 검사. 실제 문서 재계산은 로컬 자료 필요');
  process.exit(bad.length ? 1 : 0);
}
const tw = atlas.twins;
if (!tw) { console.log('[twins] 중복 요약 누락'); process.exit(1); }
for (const [key, value] of Object.entries(DUPLICATE_POLICY)) {
  if (tw[key] !== value) bad.push(`중복 정책 불일치: ${key}`);
}

const { collectAll } = await import('./build-memo-atlas.mjs');
const docs = collectAll();
const actual = findDuplicates(docs);
const stored = new Map(atlas.docs.filter((d) => d.twin).map((d) => [d.id, d.twin]));
for (const [key, value] of Object.entries(actual.stat)) {
  if (key !== 'candidates' && tw[key] !== value) bad.push(`실제 본문과 저장 통계 불일치: ${key}`);
}
if (atlas.docs.some((d) => Object.hasOwn(d, 'duplicateText') || Object.hasOwn(d, 'text'))) bad.push('내보내기 자료에 원본 본문 포함');
if (stored.size !== actual.representatives.size) bad.push('실제 본문과 중복 표시 수 불일치');
for (const [id, rep] of stored) if (actual.representatives.get(id) !== rep) bad.push(`본문 근거 없는 대표 연결: ${id}`);
console.log(`[twins] 본문 ${docs.length}, 후보 ${actual.stat.candidates}, 직접 일치 ${actual.stat.pairs}, 무리 ${actual.stat.groups}, 표시 ${stored.size}`);

// 이전 감사와 같은 문서 선택 및 문장 삭제 사본. 전체 본문과 10% 삭제 대조 추가
const long = docs.filter((d) => d.text.length > 800 && !d.id.startsWith('bookmark/'));
const step = Math.max(1, Math.floor(long.length / 25));
const pick = long.filter((_, i) => i % step === 0).slice(0, 25);
if (pick.length < 10) bad.push('대조용 긴 본문 부족');
const score = (a, b) => compareFingerprints(fingerprint(a), fingerprint(b));
let caught = 0; let controlled = 0; let falsePos = 0; let negatives = 0;
for (let i = 0; i < pick.length; i += 1) {
  const cut = pick[i].text.slice(0, 1200);
  const edited = cut.split(/(?<=[.!?。])\s+/).filter((_, j) => j % 10 !== 3).join(' ');
  if (score(cut, edited).match) caught += 1;
  const full = duplicateBody(pick[i]);
  const words = full.split(/\s+/);
  const start = Math.floor(words.length * 0.4);
  const copy = words.filter((_, j) => j < start || j >= start + Math.floor(words.length * 0.1)).join(' ');
  if (score(full, copy).match) controlled += 1;
  for (let j = i + 1; j < pick.length; j += 1) {
    negatives += 1;
    if (score(full, duplicateBody(pick[j])).match) falsePos += 1;
  }
}
console.log(`[twins] 기존 문장 삭제 사본 ${caught}/${pick.length}, 전체 본문 10% 삭제 ${controlled}/${pick.length}, 독립 문서 오탐 후보 ${falsePos}/${negatives}`);
if (caught < pick.length * 0.5) bad.push('기존 사본 회수율 50% 미달');
if (controlled < pick.length * 0.9) bad.push('전체 본문 10% 삭제 사본 회수율 90% 미달');
if (falsePos > 0) bad.push('독립 문서 대조의 중복 후보 존재. 실제 사본 여부 검토 필요');
if (bad.length) { for (const line of bad) console.log('[twins] FAIL ' + line); process.exit(1); }
console.log('[twins] PASS. 독립 대조와 실제 본문 재계산 일치');
