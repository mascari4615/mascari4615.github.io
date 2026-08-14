/**
 * **아무도 안 돌리는 검사**를 센다 (TASK-KL-301)
 *
 * 검사를 만들어 놓고 어느 묶음에도 안 넣으면, 그 검사는 **없는 것과 같다**. 빨개져도 아무도
 * 모른다 — `test:pdfdiff` 가 그렇게 며칠 「원래 깨진 것」으로 살았고, 이번 세션에 만든 재료
 * 화면검사 여덟은 게이트 밖이었으며, 이미지 재료 검사는 **npm 이름조차 없어** 손으로 부르지
 * 않으면 절대 안 돌았다.
 *
 * 그래서 「돌려지는 자리」를 전부 펼쳐 훑는다:
 *   package.json 의 묶음(`build`·`gates`·`verify:*`) 을 **재귀로** 펼치고,
 *   `scripts/live-checks.mjs`(라이브 목록)와 `.github/workflows/*.yml`(CI 가 직접 부르는 것)까지.
 *
 * **톱니(ratchet)**: 지금 밖에 있는 것들은 기준선에 적어 두고 통과시킨다. 대신
 *   ① 기준선에 없는 **새 고아**가 생기면 막고
 *   ② 기준선에 적혀 있는데 이제 묶음에 들어간 것은 **기준선에서 빼라**고 막는다.
 * 그래서 이 수는 **줄기만 한다**. (전부 당장 묶으면 게이트가 몇 배로 느려지고, 실주소를 보는
 * 검사는 배포 시점에 빨개져 아무도 안 믿게 된다 — 그건 따로 볼 판이다.)
 *
 * 사용: node scripts/audit-orphan-tests.mjs [--update]
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE = path.join(root, 'data/orphan-tests.json');
/* ★ **push 전에 부를 때는 「올라갈 커밋」의 package.json 을 읽는다** (2026-08-13).
 *   이 나무는 세션 여럿이 함께 쓴다 — 작업 폴더의 `package.json` 에는 남이 만들다 만 검사
 *   이름이 늘 몇 개 들어 있다. 그걸 읽으면 내 push 마다 남의 미완성으로 빨개져, 곧 아무도
 *   안 보는 경고가 된다. 반대로 **내가 올리는 커밋**만 보면 오늘 실제로 났던 사고
 *   (게이트 줄에서만 뺀 이름이 고아로 남아 verify 가 섰다)를 3초에 잡는다.
 *   `KL_PUSH_SHA` 가 없으면 예전대로 작업 폴더를 본다(CI 는 체크아웃이 곧 커밋이다). */
const REF = process.env.KL_PUSH_SHA || '';
const pkgText = (() => {
  if (!REF) return fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  try {
    const env = { ...process.env };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
    return execFileSync('git', ['show', `${REF}:./package.json`], { cwd: root, env, encoding: 'utf8' });
  } catch {
    /* 못 물어보면 「모른다」다 — 작업 폴더로 물러선다(모름을 빨강으로 만들지 않는다) */
    return fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  }
})();
const pkg = JSON.parse(pkgText);
const scripts = pkg.scripts || {};
const isCheck = (name) => /^(test|smoke|audit):/.test(name);

/** 묶음 하나를 펼친다 — 묶음이 묶음을 부르므로 재귀. */
const covered = new Set();
function expand(name, depth = 0) {
  const body = scripts[name];
  if (depth > 6 || !body) return;
  for (const m of body.matchAll(/npm run ([\w:.-]+)/g)) {
    covered.add(m[1]);
    expand(m[1], depth + 1);
  }
  /* ★ **이름 목록을 파일로 뺀 묶음도 있다** (2026-08-14): `run-gates.mjs --from data/gate-list.json`.
     한 줄에 백스물다섯 개를 적어 두니 세션들이 동시에 늘릴 때마다 충돌했고, 손으로 합치다
     승격 하나가 조용히 사라졌다. 그래서 파일로 뺐다 — 여기서도 그 파일을 읽어야 한다.
     안 읽으면 「아무도 안 돌리는 검사 119개」라는 거짓 경보가 난다(옮기자마자 실측). */
  const from = body.match(/--from\s+(\S+)/);
  if (from) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(root, from[1]), 'utf8'));
      for (const n of raw.목록 ?? raw.list ?? []) {
        covered.add(n);
        expand(n, depth + 1);
      }
    } catch {
      /* 못 읽으면 아래 낱말 훑기로 떨어진다 */
    }
  }

  /* `run-gates.mjs a b c` 처럼 인자로 늘어놓는 묶음도 있다 */
  for (const word of body.split(/\s+/)) {
    if (isCheck(word)) {
      covered.add(word);
      expand(word, depth + 1);
    }
  }
}
for (const entry of ['build', 'gates', 'verify:prepush', 'verify:quality', 'verify:live']) {
  covered.add(entry);
  expand(entry);
}

/* 라이브 목록은 배열이라 이름이 따옴표 안에 있다 */
/* ★ **볼 것을 한 자리에서 본다** (2026-08-13). 밀 커밋 기준으로 판정할 때 `package.json` 만
   커밋에서 읽고 라이브 목록·워크플로는 **작업 폴더**에서 읽고 있었다 — 그 어긋남 때문에
   「이건 이제 묶음에 들었다」고 잘못 읽고 기준선을 줄였다가 CI 를 여러 판 세웠다(오늘 실측).
   `KL_PUSH_SHA` 가 있으면 셋 다 그 커밋에서 읽는다. 못 읽으면 폴더로 물러선다. */
const atRef = (relFromApp) => {
  if (!REF) return null;
  try {
    const env = { ...process.env };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
    return execFileSync('git', ['show', `${REF}:./${relFromApp}`], { cwd: root, env, encoding: 'utf8' });
  } catch {
    return null;
  }
};
const live = atRef('scripts/live-checks.mjs') || fs.readFileSync(path.join(root, 'scripts/live-checks.mjs'), 'utf8');
for (const m of live.matchAll(/["'](?:test|smoke|audit):[\w:.-]+["']/g)) {
  const name = m[0].slice(1, -1);
  covered.add(name);
  expand(name);
}

/* CI 가 워크플로에서 직접 부르는 것도 「돌려지는 것」이다 */
/* ★ **뿌리의 `verify.mjs` 도 검사를 부른다** (2026-08-14). 이 파일은 npm 묶음이 아니라
   경로로 부르는 자리라 여태 안 봤다 — 그래서 `audit:pages`(도구 장 최신 여부)처럼 **매 verify 마다
   도는 검사**가 「아무도 안 돌린다」로 기준선에 얹혀 있었다. 부르는 자리는 다 세야 수가 맞는다. */
{
  const vf = path.join(root, '../../scripts/verify.mjs');
  if (fs.existsSync(vf)) {
    const src = fs.readFileSync(vf, 'utf8');
    for (const m of src.matchAll(/npm run (?:--[\w-]+\s+)*([\w:.-]+)/g)) {
      covered.add(m[1]);
      expand(m[1]);
    }
    /* `node scripts/<이름>.mjs` 로 부르는 것도 있다 — 그 파일을 가리키는 npm 이름을 찾아 덮는다. */
    for (const m of src.matchAll(/node\s+scripts\/([\w-]+)\.mjs/g)) {
      for (const [name, line] of Object.entries(pkg.scripts || {})) {
        if (line.includes(`scripts/${m[1]}.mjs`)) {
          covered.add(name);
          expand(name);
        }
      }
    }
  }
}

const wfDir = path.join(root, '../../.github/workflows');
if (fs.existsSync(wfDir)) {
  for (const file of fs.readdirSync(wfDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    /* `npm run --silent <이름>` 처럼 **깃발이 앞에 오는** 부름도 있다 — 깃발을 이름으로 읽으면
       진짜 이름은 못 보고 「아무도 안 돌린다」로 잡는다(2026-08-14 실측: `audit:deploy-health`
       를 워크플로가 부르는데도 고아로 걸려 master 가 빨개졌다). 깃발은 건너뛴다. */
    for (const m of fs.readFileSync(path.join(wfDir, file), 'utf8').matchAll(/npm run (?:--[\w-]+\s+)*([\w:.-]+)/g)) {
      covered.add(m[1]);
      expand(m[1]);
    }
  }
}

/** 갈래로 안 잡히는 것은 손으로 적는다 — 실측해 보고 안 것들. */
const 사유메모 = {
  'test:garden': '알맹이지만 19초 걸린다 — 게이트 한 판이 그만큼 길어진다 (실측 2026-08-13)',
  'test:studymap': '알맹이지만 24초 걸린다 (실측 2026-08-13)',
  'test:heung': '60초를 넘겨도 안 끝난다 — 멈추는 자리가 있다 (실측 2026-08-13, 그 슬롯 몫)'
};

const all = Object.keys(scripts).filter(isCheck);
const orphans = all.filter((k) => !covered.has(k)).sort();

/**
 * 왜 못 묶는지를 **기준선이 스스로 적게** 한다 — 이름만 늘어놓은 목록은 반년 뒤 아무도 못 읽는다.
 * 갈래는 검사 파일을 읽어 가른다(브라우저를 쓰나 · 실주소를 보나 · 다른 검사를 부르나).
 */
function 갈래(name) {
  const file = (scripts[name].match(/scripts\/[\w.-]+\.mjs/) || [])[0];
  let src = '';
  try {
    src = fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '알 수 없음 (검사 파일을 못 찾았다)';
  }
  const 브라우저 = /from ['"]playwright['"]/.test(src);
  const 실주소 = /blog\.mascari4615\.com|mascari4615\.github\.io|process\.env\.(URL|BASE)/.test(src);
  if (/child_process/.test(src) && /npm/.test(src)) return '묶음 — 다른 검사들을 불러 모으는 것이라 게이트에 또 넣으면 겹친다';
  if (브라우저 && 실주소) return '화면 + 실주소 — 배포 시점에 따라 빨개져서 막는 자리에 두면 아무도 안 믿게 된다';
  if (브라우저) return '화면 — 브라우저를 띄워 무겁다 (묶으려면 시간을 재고 넣어라)';
  if (실주소) return '실주소 — 배포 상태에 달렸다';
  return '알맹이인데 아직 안 묶었다 — 빠르면 그냥 gates 에 넣어라';
}

function 기준선쓰기() {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        설명: '아무 묶음에도 없는 검사 — 줄기만 한다. 늘리려면 왜 못 묶는지 적어라 (audit-orphan-tests.mjs)',
        갱신: new Date().toISOString().slice(0, 10),
        목록: orphans,
        사유: Object.fromEntries(orphans.map((n) => [n, 사유메모[n] || 갈래(n)]))
      },
      null,
      2
    ) + '\n'
  );
}

if (process.argv.includes('--update')) {
  기준선쓰기();
  console.log(`[audit-orphan-tests] 기준선 갱신 — ${orphans.length}개`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).목록;
const added = orphans.filter((k) => !base.includes(k));
const fixed = base.filter((k) => !orphans.includes(k));

if (added.length) {
  console.log(`[audit-orphan-tests] 아무도 안 돌리는 새 검사 ${added.length}개`);
  for (const a of added) console.log(`  - ${a} — 만들어 놓고 어느 묶음에도 안 넣었다`);
  console.log('  넣을 자리: package.json 의 `gates` (빠른 것) · `live-checks.mjs` (실주소를 보는 것)');
  process.exit(1);
}
/** 작업 폴더의 `package.json` 이 origin 과 다르면 — 남의 미커밋이 섞였을 수 있다 */
function worktreeDiffersFromOrigin() {
  try {
    const env = { ...process.env };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
    const out = execFileSync('git', ['diff', '--name-only', 'origin/master', '--', 'package.json'], {
      cwd: root, env, encoding: 'utf8'
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/* ★ **여기서 갈리는 이유를 적어 준다** (2026-08-13). 이 감사는 작업 폴더를 읽는데, 이 저장소는
   세션 여럿이 한 폴더를 쓴다 — 남의 **미커밋** 게이트 줄 때문에 「이제 묶음에 들었다」가 뜨고,
   그 말을 믿고 기준선을 줄이면 CI 가 커밋 기준으로 다시 빨개진다(오늘 실측, 여러 판). */
if (!REF && (added.length || fixed.length) && worktreeDiffersFromOrigin()) {
  console.log('[audit-orphan-tests] ⚠ 작업 폴더의 package.json 이 origin 과 다르다 — 남의 미커밋이 섞였을 수 있다.');
  console.log('  커밋 기준으로 보려면: KL_PUSH_SHA=origin/master npm run audit:orphans');
}

/* ★ **조인 쪽은 사람을 부르지 않는다 — 스스로 줄이고 지나간다** (2026-08-14).
   여태 이 자리는 빨강이었다: 누가 검사를 묶음에 넣으면 기준선이 그만큼 낡고, 그 사실만으로
   master 가 빨개졌다. 그런데 **그건 좋아진 것**이다 — 나쁜 쪽(묶음에서 빠짐)만 막으면 된다.
   실제로 오늘만 두 판이 이걸로 빨갰고, 고치는 일은 언제나 `--update` 한 줄이었다.
   좋아졌다고 부르는 알람은 사람을 길들여 **진짜 빨강도 무시하게** 만든다.
   그래서 여기서 바로 줄인다. 내 자리에서 돌면 파일이 남아 다음 커밋에 실리고,
   CI 에서 돌면 그 판만 초록으로 지나간다(다음 사람이 그 줄어든 값을 올린다). */
if (fixed.length) {
  기준선쓰기();
  console.log(`[audit-orphan-tests] 이제 묶음에 든 것 ${fixed.length}개를 기준선에서 뺐다: ${fixed.join(', ')}`);
  console.log(`  기준선 ${orphans.length}개 — 톱니는 조이는 쪽으로만 돈다(막지 않는다).`);
}
console.log(`[audit-orphan-tests] 검사 ${all.length}개 · 묶음 밖 ${orphans.length}개 (기준선과 같음 — 늘지 않았다)`);
