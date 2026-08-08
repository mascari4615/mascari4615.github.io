/**
 * 공용 꾸러미를 **짓는 단계가 모든 워크플로에 있나** (TASK-KL-153 곁가지).
 *
 * 왜 있나: 앱은 `packages/*` 를 `file:` 로 물고 **타입으로** 쓴다. 그 꾸러미는 지어야
 * `dist/*.d.ts` 가 생긴다. 로컬에는 이미 지어 둔 게 남아 있어서 초록인데, 러너는 매번
 * 맨바닥이라 「모듈을 못 찾겠다」로 타입 검사가 멈춘다 — 그리고 그 뒤로 implicit any 가
 * 줄줄이 딸려 나와, **진짜 원인과 안 닮은 오류 목록**이 나온다.
 *
 * 같은 사고가 두 번 났다: karmolab-ai (2026-08-07, 다섯 판 연속 빨강) · badapple
 * (2026-08-08, 배포는 초록인데 게이트만 빨강). 두 번째는 워크플로 **하나에만** 단계를
 * 넣어서 났다 — 사람이 세 파일을 같이 고치는 걸 잊는다. 그러니 사람 대신 여기서 센다.
 *
 * 세는 방법은 일부러 무디다: 워크플로 글 안에 그 꾸러미 경로가 **짓는 줄**로 등장하나만 본다.
 * YAML 을 해석하려 들면 이 검사가 워크플로 문법 변화에 먼저 깨진다.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const repoRoot = path.dirname(path.dirname(root));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
/** `"badapple": "file:../../packages/badapple"` → `badapple`. */
const shared = Object.entries(pkg.dependencies || {})
  .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:../../packages/'))
  .map(([name, spec]) => ({ name, dir: spec.slice('file:'.length).replace(/^\.\.\/\.\.\//, '') }));

/** 앱을 **짓는** 워크플로. 여기 빠지면 그 판이 통째로 선다. */
const WORKFLOWS = [
  '.github/workflows/verify.yml',
  '.github/workflows/pages-deploy.yml',
  '.github/workflows/karmolab-live-check.yml',
];

const problems = [];
for (const file of WORKFLOWS) {
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) continue; // 워크플로가 사라졌으면 그건 다른 검사의 일이다
  const text = fs.readFileSync(full, 'utf8');
  /* 잡이 여럿인 파일은 **잡마다** 지어야 한다 — 잡끼리 파일을 안 물려받는다.
   * `steps:` 개수로 잡 수를 세고, 앱을 짓는 잡만 본다. */
  const jobs = text
    .split(/\n {4}steps:\n/)
    .slice(1)
    .filter((block) => /apps\/karmolab && npm (ci|run build)|working-directory: apps\/karmolab/.test(block));
  jobs.forEach((block, i) => {
    const lines = block.split('\n');
    for (const { name, dir } of shared) {
      /* 짓는 줄 = 그 꾸러미 경로가 있는 줄, **또는 그 아래 세 줄 안**에 `npm run build`·`tsc`.
       * 한 줄로 쓰기도 하고(`cd packages/x && npm run build`) 두 줄로 쓰기도 한다
       * (`working-directory:` + `run:`) — 둘 다 짓는 것이다. */
      const builds = lines.some((line, at) => {
        if (!line.includes(dir)) return false;
        return lines.slice(at, at + 4).some((near) => /npm run build|tsc /.test(near));
      });
      if (!builds) problems.push(`${file} (앱 짓는 잡 ${i + 1}): 공용 꾸러미 '${name}' 을 짓는 단계가 없다`);
    }
  });
}

if (problems.length) {
  console.error('[audit-shared-package-builds] 문제 ' + problems.length + '건');
  for (const p of problems) console.error('  - ' + p);
  console.error("  → 그 잡에 `cd packages/<이름> && npm run build`(잠금 파일 없으면 tsc 직접) 를 앱 빌드 **앞에** 넣어라.");
  process.exit(1);
}
console.log(`[audit-shared-package-builds] 공용 꾸러미 ${shared.length}개 — 앱 짓는 잡마다 짓는 단계가 있다`);
