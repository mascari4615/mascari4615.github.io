/**
 * 부르는 이름이 실제로 있는지 (TASK-KL-089)
 *
 * 왜 있나: 설정 파일(`package.json`)은 여러 사람이 동시에 건드린다. 한 번은 다른 세션이 이
 * 파일을 통째로 덮어 **내 검사 넷이 사라졌고**, 검사 묶음의 마지막 줄이 「없는 이름」을 부르며
 * 조용히 끝났다. 화면에 아무것도 안 나오니 통과한 것처럼 보였다 — 검사가 죽은 줄 몰랐다.
 *
 * 보는 것:
 *  - 묶음 스크립트가 부르는 이름이 전부 있는가 (`npm run <이름>`)
 *  - 그 스크립트가 실행하는 파일이 실제로 있는가 (`node scripts/….mjs`)
 *  - 배포가 끝난 뒤 도는 확인이 부르는 이름도 전부 있는가 (그쪽이 사라지면 배포 때 알게 된다)
 *
 * 그림도 서버도 필요 없다 — 0.2초면 끝나므로 묶음의 **맨 앞**에 둔다.
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
    if (!names.has(called)) problems.push(`「${name}」 가 없는 이름을 부른다 — ${called}`);
  }
  for (const [, file] of body.matchAll(/node (scripts\/[\w./-]+\.mjs)/g)) {
    if (!fs.existsSync(path.join(root, file))) problems.push(`「${name}」 가 없는 파일을 부른다 — ${file}`);
  }
}

/* 배포 후 확인이 부르는 이름 — 아래 두 곳에서 쓴다. */
const wfPath = path.join(root, '../../.github/workflows/karmolab-live-check.yml');
const wfCalled = fs.existsSync(wfPath)
  ? [...fs.readFileSync(wfPath, 'utf8').matchAll(/run:\s*npm run ([a-z0-9:_-]+)/g)].map((m) => m[1])
  : [];

/* 파일이 **저장소에 들어 있는가** — 내 컴퓨터에 있는 것과 다르다.
 * 실제로 검사 스크립트 열 개와 앱 아이콘 셋이 브랜치에서 사라진 적이 있다(세션끼리 커밋이 부딪혀).
 * 내 컴퓨터에는 그대로 있으니 위의 「파일 있나」 검사는 통과했고, 아무도 몰랐다. 그런데 배포는
 * 저장소에서 받아 가므로 거기서는 없는 파일이다 — 그 검사들이 통째로 안 도는 상태였다. */
{
  let tracked = new Set();
  try {
    /* **커밋에 들어 있는지**를 본다 — 인덱스가 아니라 (TASK-KL-089).
     * 예전엔 `git ls-files` 로 봤는데 그건 인덱스라, `git add` 만 해 두고 커밋 안 한 파일도
     * 「있다」로 나왔다. 실제로 그 상태로 스크립트 11개와 도구 기록 4개가 오래 떠 있었다 —
     * 배포는 커밋본을 받아 가므로 거기서는 통째로 없는 파일이었는데 검사는 초록이었다. */
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'scripts', 'img', 'data'], { cwd: root, encoding: 'utf8' });
    tracked = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch {
    problems.push('커밋에 들어 있는지 확인할 수 없다 (git 을 못 불렀다)');
  }
  if (tracked.size) {
    /* 아무 스크립트나 보지 않는다 — **실제로 도는 사슬**에서 닿는 것만 본다.
     * (다른 사람이 만들다 만 스크립트까지 걸면 내 게이트가 남의 사정으로 빨개진다.) */
    /* 검사 묶음의 목록은 `audit-all.mjs` 안에 있다(하나가 실패해도 끝까지 돌리려고 그렇게 했다).
     * 그래서 package.json 만 따라가면 그 열셋을 못 본다 — 거기 적힌 이름도 함께 읽는다. */
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
    /* 검사가 쓰는 표본 파일(그림·PDF·소리·영상)도 저장소에 있어야 한다.
     * 없으면 「값을 넣으면 반응하는지」 검사가 배포 후에 통째로 죽는다 — 내 컴퓨터에만 있으면 모른다. */
    for (const f of fs.existsSync(path.join(root, 'data/samples')) ? fs.readdirSync(path.join(root, 'data/samples')) : []) {
      wanted.add(`data/samples/${f}`);
    }

    /* 검사·생성기가 읽는 기록 파일도 마찬가지다. 실제로 이 넷이 한꺼번에 빠진 적이 있고,
     * 그러면 자리 높이·다른 이름·처음 본 날·반응 목록이 전부 배포에서 사라진다. */
    for (const f of ['tool-aliases.json', 'tool-heights.json', 'tools-seen.json', 'tools-modified.json', 'behavior-typing.json']) {
      wanted.add(`data/${f}`);
    }

    // 설치 정보가 가리키는 아이콘도 같은 사고를 겪었다 — 없으면 앱으로 설치하는 길이 막힌다.
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
        problems.push(`「${file}」 이 커밋에 안 들어 있다 — 배포에는 없는 파일이다 (staged 만으로는 안 된다)`);
      }
    }
  }
}

/* 배포가 끝난 뒤 도는 확인도 같은 이름들을 부른다. 여기서 어긋나면 배포 때까지 모른다. */
const wf = path.join(root, '../../.github/workflows/karmolab-live-check.yml');
if (fs.existsSync(wf)) {
  const yml = fs.readFileSync(wf, 'utf8');
  const called = [...yml.matchAll(/run:\s*npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
  if (!called.length) problems.push('배포 후 확인이 아무 검사도 안 부른다 — 파일이 바뀌었는지 보라');
  for (const c of new Set(called)) {
    if (!names.has(c)) problems.push(`배포 후 확인이 없는 이름을 부른다 — ${c}`);
  }
}

/* 손으로 돌리는 묶음과 배포 후 확인이 **같은 검사**를 보고 있는가 (TASK-KL-089).
 * 검사를 더할 때 두 곳에 각각 손으로 넣어 왔다. 한쪽에만 넣으면 — 특히 로컬에만 넣으면 —
 * 실제 사이트는 그 검사를 영영 안 받는다. 내 컴퓨터에서만 초록인 셈이다.
 * (배포 후에만 있는 검사는 괜찮다. 실제 주소가 있어야 볼 수 있는 것들이 그렇다.) */
{
  const runnerPath = path.join(root, 'scripts/audit-all.mjs');
  if (fs.existsSync(runnerPath) && wfCalled.length) {
    const runnerNames = [...fs.readFileSync(runnerPath, 'utf8').matchAll(/'([a-z0-9]+:[a-z0-9:]+)'\]/g)].map((m) => m[1]);
    const missingOnLive = runnerNames.filter((n) => !wfCalled.includes(n));
    if (missingOnLive.length) {
      problems.push(`배포 후 확인에 빠진 검사 — ${missingOnLive.join(', ')} (실제 사이트에서는 안 돈다)`);
    }
  }
}

if (problems.length) {
  console.error(`[audit-scripts] 부르는 이름이 없는 자리 ${problems.length}건 — 그 검사는 안 돈다`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[audit-scripts] 이름 ${names.size}개가 서로 맞는다 — 없는 이름·없는 파일을 부르는 자리 0`);
