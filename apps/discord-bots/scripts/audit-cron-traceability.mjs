#!/usr/bin/env node
// audit-cron-traceability.mjs — automation-debt-ledger enforcement (memo/automation-debt-ledger.md).
//
// 룰 검사 2종:
//   ① 자동화 수동 트리거 전제 (process.md § 사용자 작업량 최소화)
//      → setInterval 발견 file 에 `export.*function (trigger|run).*(Now|Tick)` 도 export 됐는가
//   ② No-news is bad-news — healthy log 전제 (process.md § 사용자 작업량 최소화)
//      → setInterval 콜백 안에 console.log/warn 로 0 건/no_X branch 도 박혔는가 (regex 추정)
//
// regex 기반이라 false-positive/negative 가능. 실제 cron 자동화 표준 패턴 (단일 setInterval +
// tickNow 함수 + result branch console.log) 가정. 새 패턴 등장 시 본 script 갱신 필요.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const yawnbotSrc = path.resolve(__dirname, '..', 'apps', 'yawnbot', 'src');

/**
 * services/*.ts 중 *external 서비스 패턴* 만 수집:
 *   1) setInterval 포함
 *   2) `export function start*` (module-level lifecycle — main.ts 가 registry)
 *   3) `this._XXX = setInterval` (class 내부) 만이면 internal 모델 — 제외
 * bot/ 는 UI event timer 라 cron 아님 — 디렉토리째 제외.
 */
function scanFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'bot') continue;
        walk(p);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const text = fs.readFileSync(p, 'utf-8');
        if (!/setInterval\s*\(/.test(text)) continue;
        // external service 패턴: 모듈 레벨 start* export. 없으면 internal model.
        if (!/export\s+function\s+start\w+/.test(text)) continue;
        out.push({ p, text });
      }
    }
  }
  walk(root);
  return out;
}

/** rule ① — 동일 module 에 trigger/run/tick 류 fn export 있는가 (slash 라우트 진입점 = trigger* / run*Tick / save* / *Once). **/
function checkManualTrigger(text) {
  return /export\s+(async\s+)?function\s+(trigger\w+|run\w*Tick|save\w*Data|\w+Once)/.test(text);
}

/**
 * rule ② — setInterval 호출 가까이의 tick 콜백이 *모든* 가능 분기에서 console.log 박았는가.
 * 정확 AST 검사 대신 휴리스틱: 같은 파일에 `.status === 'sent'` 가 있으면 그 뒤로 `else.*status` 또는
 * `else console.log` 도 같이 있어야 함. 단일 `if status==='sent' console.log` 만이면 silent 패턴.
 */
function checkHealthyLog(text) {
  const sentMatches = [...text.matchAll(/if\s*\(\s*\w+\.status\s*===\s*['"]sent['"]\s*\)\s*console\.log/g)];
  if (sentMatches.length === 0) return { ok: true, reason: 'no sent-branch pattern' };
  // 각 sent 분기 뒤 100 자 이내에 else if/else console.log 가 있어야 healthy.
  for (const m of sentMatches) {
    const tail = text.slice(m.index, m.index + 400);
    if (!/else\s+if[^{]*console\.log|else\s*console\.log/.test(tail)) {
      return { ok: false, reason: `sent-only branch silent (idx ${m.index})` };
    }
  }
  return { ok: true };
}

const files = scanFiles(yawnbotSrc);
const violations = [];
for (const { p, text } of files) {
  const rel = path.relative(yawnbotSrc, p);
  if (!checkManualTrigger(text)) {
    violations.push({ file: rel, rule: '①', detail: 'setInterval 있지만 export trigger*Now / run*Tick 없음 (수동 트리거 누락)' });
  }
  const healthy = checkHealthyLog(text);
  if (!healthy.ok) {
    violations.push({ file: rel, rule: '②', detail: `healthy log 누락: ${healthy.reason}` });
  }
}

console.log(`[audit-cron-traceability] yawnbot/src scan — setInterval 포함 ${files.length} file`);
if (violations.length === 0) {
  console.log('  → 위반 0 (룰 ①+② 정합)');
  process.exit(0);
}
console.error(`  → 위반 ${violations.length}:`);
for (const v of violations) {
  console.error(`    [${v.rule}] ${v.file} — ${v.detail}`);
}
console.error('\n원장: memo/automation-debt-ledger.md (정본).');
process.exit(1);
