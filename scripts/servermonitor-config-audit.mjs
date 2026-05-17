#!/usr/bin/env node
// Server Monitor 설정 정합 audit — TASK-KL-066.
// 사고 패턴: `karmolab-tauri` 의 npm 스크립트가 `dev:dual` → `dev` 로 rename 됐는데
//   servermonitor-config.json 이 손기재 `["run","dev:dual"]` 그대로 → 카드가
//   `npm error Missing script: "dev:dual"` 로 *조용히* 죽음 (사용자 발견).
// 호출처: `node scripts/servermonitor-config-audit.mjs` / `npm run verify` (verify.mjs).
//
// 근본: devProfiles 의 npm-script 프로필은 program/args/cwd 를 손기재하지 않고
//   `{ app, script }` 참조만 둔다 (Rust `DevProfile::resolve` / TS `resolveProfile` 가
//   `npm run <script>` @ app 으로 파생 — drift 구조적 불가). 이 audit 는 그 참조가
//   실제 `<app>/package.json` 의 scripts 에 존재하는지 *정본을 직접* cross-check 한다.
//   → 죽은 카드가 main 에 못 들어옴 (verify 게이트 fail).
//
// 검증 규칙 (모두 통과해야 exit 0):
//   npm-script 형식 ({script} 보유):
//     - app 필수, raw 필드(program/args/cwd) 동시 보유 금지 (형식 모호)
//     - <app>/package.json 존재 + .scripts[script] 존재
//     - deployScript 있으면 .scripts[deployScript] 존재
//   raw 형식 ({script} 없음):
//     - program ∈ {npm,npx,bundle,ruby,node} (Rust program_allowed 와 동일)
//     - cwd 필수 + 레포 내 실재 디렉토리
//     - deployScript 금지 (Rust resolve 가 raw 엔 deploy 미지원)

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const CONFIG_REL = 'apps/karmolab/data/servermonitor-config.json';
const CONFIG_PATH = join(REPO, CONFIG_REL);
// Rust local_dev.rs program_allowed 와 동일 (drift 시 양쪽 동시 갱신).
const ALLOWED_PROGRAMS = new Set(['npm', 'npx', 'bundle', 'ruby', 'node']);

if (!existsSync(CONFIG_PATH)) {
  console.error(`[sm-audit] X  설정 파일 없음: ${CONFIG_REL}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`[sm-audit] X  JSON 파싱 실패 (${CONFIG_REL}): ${e.message}`);
  process.exit(1);
}

const profiles = Array.isArray(config.devProfiles) ? config.devProfiles : [];
const failures = [];

function pkgScripts(appRel) {
  const pkgPath = join(REPO, appRel, 'package.json');
  if (!existsSync(pkgPath)) return { ok: false, reason: `${appRel}/package.json 없음` };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return { ok: true, scripts: pkg.scripts ?? {} };
  } catch (e) {
    return { ok: false, reason: `${appRel}/package.json 파싱 실패: ${e.message}` };
  }
}

for (const p of profiles) {
  const id = p?.id ?? '(id 없음)';
  const hasScriptForm = typeof p?.script === 'string' && p.script.length > 0;
  const hasRawForm =
    p?.program !== undefined || p?.args !== undefined || p?.cwd !== undefined;

  if (hasScriptForm) {
    if (hasRawForm) {
      failures.push(`${id}: script 형식인데 raw 필드(program/args/cwd)도 보유 — 형식 모호`);
    }
    if (typeof p.app !== 'string' || p.app.length === 0) {
      failures.push(`${id}: script 형식엔 app 필요`);
      continue;
    }
    const ps = pkgScripts(p.app);
    if (!ps.ok) {
      failures.push(`${id}: ${ps.reason}`);
      continue;
    }
    if (!(p.script in ps.scripts)) {
      failures.push(
        `${id}: ${p.app}/package.json 에 script "${p.script}" 없음 ` +
          `(있는 것: ${Object.keys(ps.scripts).join(', ') || '없음'})`
      );
    }
    if (typeof p.deployScript === 'string' && p.deployScript.length > 0) {
      if (!(p.deployScript in ps.scripts)) {
        failures.push(
          `${id}: ${p.app}/package.json 에 deployScript "${p.deployScript}" 없음`
        );
      }
    }
  } else {
    // raw 형식
    if (typeof p?.program !== 'string' || !ALLOWED_PROGRAMS.has(p.program)) {
      failures.push(
        `${id}: raw program "${p?.program}" 비허용 ` +
          `(허용: ${[...ALLOWED_PROGRAMS].join(', ')}; 또는 {app,script} 형식 사용)`
      );
    }
    if (typeof p?.cwd !== 'string' || p.cwd.length === 0) {
      failures.push(`${id}: raw 형식엔 cwd 필요`);
    } else {
      const cwdAbs = join(REPO, p.cwd);
      if (!existsSync(cwdAbs) || !statSync(cwdAbs).isDirectory()) {
        failures.push(`${id}: cwd "${p.cwd}" 가 레포 내 디렉토리가 아님`);
      }
    }
    if (!Array.isArray(p?.args)) {
      failures.push(`${id}: raw 형식엔 args 배열 필요`);
    }
    if (p?.deployScript !== undefined || p?.deployArgs !== undefined) {
      failures.push(`${id}: raw 형식은 deploy 미지원 (deployScript/deployArgs 제거 — {app,script} 형식만 deploy 가능)`);
    }
  }
}

// ── KL-068: Rust DevProfile forward-compat 계약 기계 강제 ──
// 사고: KL-066 가 `cwd` 를 Rust DevProfile 필수 필드로 둔 채 config 스키마를 바꿔
//   ≤v0.1.19 바이너리가 신형 config 를 serde hard-fail → 카드 사망. 룰(텍스트)만
//   두면 또 잊는다 → 「형식-변종 필드는 전부 #[serde(default)]」 를 여기서 강제.
//   id/label 만 예외(프로필 정체성 = 항상 존재, 제거 불가한 안정 필드).
const FWD_COMPAT_ALLOWLIST = new Set(['id', 'label']);
function auditRustForwardCompat() {
  const rsRel = 'apps/karmolab-tauri/src-tauri/src/local_dev.rs';
  const rsPath = join(REPO, rsRel);
  if (!existsSync(rsPath)) {
    failures.push(`[fwd-compat] ${rsRel} 없음 (DevProfile 계약 검증 불가)`);
    return;
  }
  const src = readFileSync(rsPath, 'utf8');
  const m = src.indexOf('struct DevProfile {');
  if (m < 0) {
    failures.push(`[fwd-compat] ${rsRel} 에 'struct DevProfile {' 없음 — 리팩터 시 본 게이트 갱신 필요`);
    return;
  }
  // 여는 { 부터 brace 매칭으로 본문 슬라이스.
  const open = src.indexOf('{', m);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    failures.push(`[fwd-compat] DevProfile 본문 brace 매칭 실패`);
    return;
  }
  const body = src.slice(open + 1, end);
  let attrs = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('#[')) {
      attrs.push(line);
      continue;
    }
    const fld = line.match(/^(?:pub\s+)?([a-z_][a-z0-9_]*)\s*:/);
    if (fld) {
      const name = fld[1];
      const hasDefault = attrs.some((a) => a.includes('serde(default)'));
      if (!FWD_COMPAT_ALLOWLIST.has(name) && !hasDefault) {
        failures.push(
          `[fwd-compat] DevProfile.${name} 가 #[serde(default)] 없는 필수 필드 — ` +
            `옛 바이너리가 신형 config 를 만나면 serde hard-fail(KL-066/KL-068). ` +
            `Option<T> + #[serde(default)] 로 두거나 resolve() 에서 의미 검증할 것.`
        );
      }
    }
    attrs = [];
  }
}
auditRustForwardCompat();

if (failures.length === 0) {
  console.log(
    `[sm-audit] OK — devProfiles ${profiles.length}개 정합 ` +
      `(npm-script 참조 ⟷ <app>/package.json scripts 실재 확인)`
  );
  process.exit(0);
} else {
  console.error('[sm-audit] X  servermonitor-config.json 정합 위반:');
  for (const f of failures) console.error(`             - ${f}`);
  console.error(
    '\n[sm-audit] FAIL — 죽은/모호한 dev 프로필. Fix before push ' +
      '(npm-script 는 {app,script} 로, script 명은 해당 package.json 과 일치).'
  );
  process.exit(1);
}
