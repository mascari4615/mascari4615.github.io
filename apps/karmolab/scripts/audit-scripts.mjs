/**
 * 부르는 이름이 실제로 있는지 (TASK-KL-089)
 *
 * 왜 있나: 설정 파일(`package.json`)은 여러 사람이 동시에 건드린다. 한 번은 다른 세션이 이
 * 파일을 통째로 덮어 **내 검사 넷이 사라졌고**, 검사 묶음의 마지막 줄이 없는 이름을 부르며
 * 조용히 끝났다. 화면에 아무것도 안 나오니 통과한 것처럼 보였다. 검사가 죽은 줄 몰랐다.
 *
 * 보는 것:
 *  - 묶음 스크립트가 부르는 이름이 전부 있는가 (`npm run <이름>`)
 *  - 그 스크립트가 실행하는 파일이 실제로 있는가 (`node scripts/....mjs`)
 *  - 배포가 끝난 뒤 도는 확인이 부르는 이름도 전부 있는가 (그쪽이 사라지면 배포 때 알게 된다)
 *
 * 그림도 서버도 필요 없다. 0.2초면 끝나므로 묶음의 **맨 앞**에 둔다.
 *
 * 사용: node scripts/audit-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const names = new Set(Object.keys(scripts));
const problems = [];

for (const [name, body] of Object.entries(scripts)) {
  for (const [, called] of body.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
    if (!names.has(called)) problems.push(`${name} 가 없는 이름을 부른다. ${called}`);
  }
  for (const [, file] of body.matchAll(/node (scripts\/[\w./-]+\.mjs)/g)) {
    if (!fs.existsSync(path.join(root, file))) problems.push(`${name} 가 없는 파일을 부른다. ${file}`);
  }
}

/* 배포 후 확인이 부르는 이름. 아래 두 곳에서 쓴다. */
const wfPath = path.join(root, '../../.github/workflows/karmolab-live-check.yml');
const wfCalled = fs.existsSync(wfPath)
  /* ★ **껍데기를 씌워 불러도 부른 것이다** (2026-08-13). 배포에 밟히면 다시 재도록
     `retry-if-redeployed.mjs` 로 감쌌더니, `run: npm run ...` 모양만 찾던 이 검사가
     실제 사이트에서는 안 돈다고 말했다. 부르는 방식이 바뀌었을 뿐 검사는 그대로 돈다.
     그래서 줄 어디에 있든 `npm run <이름>` 을 찾는다. */
  ? (() => {
      /* ★ **목록은 이제 `live-checks.mjs` 에 있다** (2026-08-13). 워크플로는 그 목록을 도는
         `npm run verify:live` 한 줄만 부른다. YAML 만 읽으면 검사 열일곱이 안 돈다는
         거짓 빨강이 난다(리팩터 직후 실제로 그랬다). 부르는 곳이 옮겨졌으면 **옮겨진 곳**을 읽는다. */
      const wf = fs.readFileSync(wfPath, 'utf8');
      const inWorkflow = [...wf.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
      const listPath = path.join(root, 'scripts/live-checks.mjs');
      if (!wf.includes('verify:live') || !fs.existsSync(listPath)) return inWorkflow;
      const list = fs.readFileSync(listPath, 'utf8');
      return [...inWorkflow, ...[...list.matchAll(/'npm',\s*'run',\s*'([a-z0-9:_-]+)'/g)].map((m) => m[1])];
    })()
  : [];

/* 파일이 **저장소에 들어 있는가**. 내 컴퓨터에 있는 것과 다르다.
 * 실제로 검사 스크립트 열 개와 앱 아이콘 셋이 브랜치에서 사라진 적이 있다(세션끼리 커밋이 부딪혀).
 * 내 컴퓨터에는 그대로 있으니 위의 파일 있나 검사는 통과했고, 아무도 몰랐다. 그런데 배포는
 * 저장소에서 받아 가므로 거기서는 없는 파일이다. 그 검사들이 통째로 안 도는 상태였다. */
{
  let tracked = new Set();
  try {
    /* **커밋에 들어 있는지**를 본다. 인덱스가 아니라 (TASK-KL-089).
     * 예전엔 `git ls-files` 로 봤는데 그건 인덱스라, `git add` 만 해 두고 커밋 안 한 파일도
     * 있다로 나왔다. 실제로 그 상태로 스크립트 11개와 도구 기록 4개가 오래 떠 있었다 . 
     * 배포는 커밋본을 받아 가므로 거기서는 통째로 없는 파일이었는데 검사는 초록이었다. */
    /* ★ **밀 커밋을 봐야 한다** (2026-08-17). 여기만 `HEAD` 를 봤다. 그러면 **새 검사 파일의
       첫 커밋**은 영원히 막힌다: 파일은 이 커밋에 들어 있는데 HEAD 에는 아직 없으니까.
       실제로 오늘 그 자물쇠에 걸려 push 가 두 번 튕겼다. 형제 감사들처럼 `KL_PUSH_SHA` 를 쓴다. */
    const baseline = process.env.KL_PUSH_SHA || 'HEAD';
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, 'scripts', 'img', 'data'], { cwd: root, encoding: 'utf8' });
    tracked = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch {
    /* ★ **못 물어본 것은 빨강이 아니다** (2026-08-13). 이 검사는 저장소 밖(밀 커밋을 풀어 놓은
       자리 등)에서도 불린다. 거기서 git 을 못 부른다고 없는 파일을 부른다로 세면,
       고칠 것이 없는 커밋이 빨강이 된다. 못 잰 것은 못 쟀다고 말하고 2로 끝낸다
       (묶음 러너가 그 값을 통과도 실패도 아님으로 읽는다). */
    console.log('[audit-scripts] CANNOT-RUN. 커밋에 들어 있는지 못 물어봤다 (git 을 못 불렀다)');
    process.exit(2);
  }
  if (tracked.size) {
    /* 아무 스크립트나 보지 않는다. **실제로 도는 사슬**에서 닿는 것만 본다.
     * (다른 사람이 만들다 만 스크립트까지 걸면 내 게이트가 남의 사정으로 빨개진다.) */
    /* 검사 묶음의 목록은 `audit-all.mjs` 안에 있다(하나가 실패해도 끝까지 돌리려고 그렇게 했다).
     * 그래서 package.json 만 따라가면 그 열셋을 못 본다. 거기 적힌 이름도 함께 읽는다. */
    const runnerPath = path.join(root, 'scripts/audit-all.mjs');
    const runnerNames = fs.existsSync(runnerPath)
      ? [...fs.readFileSync(runnerPath, 'utf8').matchAll(/'([a-z0-9]+:[a-z0-9:]+)'\]/g)].map((m) => m[1])
      : [];
    const entries = ['build', 'audit:all', 'sync:tools', ...runnerNames, ...wfCalled];
    const wanted = new Set();
    const walk = (name, depth = 0) => {
      const body = scripts[name];
      if (!body || depth > 6) return;
      for (const [, file] of body.matchAll(/node (scripts\/[\w./-]+\.mjs)/g)) wanted.add(file);
      for (const [, called] of body.matchAll(/npm run ([a-z0-9:_-]+)/g)) walk(called, depth + 1);
    };
    entries.forEach((e) => walk(e));
    /* 검사가 쓰는 표본 파일(그림, PDF, 소리, 영상)도 저장소에 있어야 한다.
     * 없으면 값을 넣으면 반응하는지 검사가 배포 후에 통째로 죽는다. 내 컴퓨터에만 있으면 모른다. */
    for (const f of fs.existsSync(path.join(root, 'data/samples')) ? fs.readdirSync(path.join(root, 'data/samples')) : []) {
      wanted.add(`data/samples/${f}`);
    }

    /* 검사, 생성기가 읽는 기록 파일도 마찬가지다. 실제로 이 넷이 한꺼번에 빠진 적이 있고,
     * 그러면 자리 높이, 다른 이름, 처음 본 날, 반응 목록이 전부 배포에서 사라진다. */
    for (const f of ['tool-aliases.json', 'tool-heights.json', 'tools-seen.json', 'tools-modified.json', 'behavior-typing.json']) {
      wanted.add(`data/${f}`);
    }

    // 설치 정보가 가리키는 아이콘도 같은 사고를 겪었다. 없으면 앱으로 설치하는 길이 막힌다.
    const manifestPath = path.join(root, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const icon of m.icons || []) {
        const rel = String(icon.src || '').replace('/apps/karmolab/', '');
        if (rel.startsWith('img/')) wanted.add(rel);
      }
      wanted.add('img/apple-touch-icon.png');
    }
    for (const file of wanted) {
      if (fs.existsSync(path.join(root, file)) && !tracked.has(file)) {
        problems.push(`${file} 이 커밋에 안 들어 있다. 배포에는 없는 파일이다 (staged 만으로는 안 된다)`);
      }
    }
  }
}

/* 배포가 끝난 뒤 도는 확인도 같은 이름들을 부른다. 여기서 어긋나면 배포 때까지 모른다. */
const wf = path.join(root, '../../.github/workflows/karmolab-live-check.yml');
if (fs.existsSync(wf)) {
  const yml = fs.readFileSync(wf, 'utf8');
  const called = [...yml.matchAll(/run:\s*npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
  if (!called.length) problems.push('배포 후 확인이 아무 검사도 안 부른다. 파일이 바뀌었는지 보라');
  for (const c of new Set(called)) {
    if (!names.has(c)) problems.push(`배포 후 확인이 없는 이름을 부른다. ${c}`);
  }
}

/* 손으로 돌리는 묶음과 배포 후 확인이 **같은 검사**를 보고 있는가 (TASK-KL-089).
 * 검사를 더할 때 두 곳에 각각 손으로 넣어 왔다. 한쪽에만 넣으면. 특히 로컬에만 넣으면 . 
 * 실제 사이트는 그 검사를 영영 안 받는다. 내 컴퓨터에서만 초록인 셈이다.
 * (배포 후에만 있는 검사는 괜찮다. 실제 주소가 있어야 볼 수 있는 것들이 그렇다.) */
{
  const runnerPath = path.join(root, 'scripts/audit-all.mjs');
  if (fs.existsSync(runnerPath) && wfCalled.length) {
    const runnerNames = [...fs.readFileSync(runnerPath, 'utf8').matchAll(/'([a-z0-9]+:[a-z0-9:]+)'\]/g)].map((m) => m[1]);
    /* 실제 사이트에서 볼 수 없는 것들. 저장소 안을 보는 검사다. 라이브 목록에 없다고
       빠졌다로 세면 고칠 수 없는 빨강이 된다(2026-08-13: 이 둘로 라이브 점검이 섰다). */
    const REPO_ONLY = new Set([
      'audit:generated', // 커밋된 파생물 ↔ 지금 소스 대조. 저장소가 있어야 본다
      'ratchet:tighten' // 톱니 조이기(기준선 줄이기). 손질 도구지 실사이트 판정이 아니다
    ]);
    const missingOnLive = runnerNames.filter((n) => !wfCalled.includes(n) && !REPO_ONLY.has(n));
    if (missingOnLive.length) {
      problems.push(`배포 후 확인에 빠진 검사. ${missingOnLive.join(', ')} (실제 사이트에서는 안 돈다)`);
    }
  }
}

/* ★ **없어진 위젯 꾸러미를 부르는 검사** (2026-08-13). 도구를 작업대로 합치면 그 낱개
   꾸러미(`js/widgets/tools/<id>.js`)가 안 지어진다. 그런데 화면 검사들이 그 파일을 직접
   열어 재고 있어서, 합친 다음 판마다 그 파일을 못 연다로 CI 가 죽었다. 오늘 charcount , 
   textredact 로 두 번, 그때마다 밀고 10분을 기다려서야 알았다. 여기서 3초에 잡는다. */
{
  const retired = new Set();
  try {
    const src = fs.readFileSync(path.join(root, 'scripts/lib/retired-operations.mjs'), 'utf8');
    for (const m of src.matchAll(/'([a-z0-9-]+)'/g)) retired.add(m[1]);
  } catch { /* 목록이 없으면 볼 것도 없다 */ }
  if (retired.size) {
    for (const file of fs.readdirSync(path.join(root, 'scripts'))) {
      if (!file.endsWith('.mjs')) continue;
      const src = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
      for (const m of src.matchAll(/js\/widgets\/(?:tools\/)?([a-z0-9-]+)\.js/g)) {
        if (retired.has(m[1])) {
          problems.push(`scripts/${file} 가 없어진 꾸러미를 연다. js/widgets/.../${m[1]}.js (작업대로 합쳐졌다)`);
        }
      }
    }
  }
}

/*
 * ★ **볼 곳을 손으로 박지 마라** (2026-08-14 red-walk 발견).
 *
 * 라이브 점검 러너와 워크플로는 볼 곳을 `BASE` 하나로 정해 준다. 그런데 검사 열여섯이
 * `URL` 만 읽고 그 기본값에 **실서비스 주소를 박아** 두고 있었다. `BASE` 를 딴 곳으로 줘도
 * 그 열여섯은 실서비스를 재고 초록을 냈다. 실제로 `BASE=http://127.0.0.1:1` 로 돌렸는데
 * 다섯이 멀쩡히 통과했다(안 서 있는 주소를 본 게 아니라 **실서비스**를 보고 있었다).
 * 재는 대상이 내가 생각한 그것이 아니면, 그 초록은 아무 말도 아니다.
 *
 * 규약: 볼 곳은 `lib/live-url.mjs` 의 `livePage(길)` 로 정한다. 실서비스 주소는 거기 한 곳.
 */
{
  const hardcodedUrls = /process\.env\.URL \|\| ['"]https:\/\/blog\.mascari4615\.com/;
  for (const file of fs.readdirSync(path.join(root, 'scripts'))) {
    if (!file.endsWith('.mjs')) continue;
    const src = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    if (hardcodedUrls.test(src)) {
      problems.push(`scripts/${file} 가 볼 곳을 손으로 박았다. BASE 를 줘도 실서비스를 본다 (lib/live-url.mjs 의 livePage() 를 써라)`);
    }
  }
}

if (problems.length) {
  console.error(`[audit-scripts] 부르는 이름이 없는 자리 ${problems.length}건. 그 검사는 안 돈다`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[audit-scripts] 이름 ${names.size}개가 서로 맞는다. 없는 이름, 없는 파일을 부르는 자리 0`);
