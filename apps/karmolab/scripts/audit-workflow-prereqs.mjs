#!/usr/bin/env node
// audit-workflow-prereqs.mjs — 「이 앱을 짓는 워크플로는 전제도 같이 갖췄나」를 본다.
//
// ★ 왜 (2026-08-10 실측): `apps/karmolab` 은 `packages/badapple` 과 `packages/karmolab-ai` 를
//   `file:` 로 물고 있고, 그 꾸러미들은 **타입을 지어야 생긴다**(새 체크아웃엔 dist 가 없다).
//   `verify.yml` 은 2026-08-08 에 그 사실을 알고 badapple 짓기 단계를 넣었다.
//   그런데 `karmolab-live-check.yml` 에는 **안 들어왔다.** 결과:
//     - 그 점검은 매 판 빌드에서 죽었다 — 최근 25판 중 초록 **0**
//     - 게다가 뒤 검사들이 `if: always()` 라 계속 돌면서 **없는 기준과 대조해 헛것을 쟀다**
//       (「대비 미달 648건」 같은 숫자가 그 부산물이었다)
//   같은 전제를 두 워크플로가 **따로 들고 있으면 반드시 갈라진다.** 한쪽만 고친 값이 저 사고다.
//
// 판정 하나: 이 앱을 짓는 워크플로마다, 필수 꾸러미 자리에서 도는 단계
//   (`working-directory: <그 자리>`)가 있는가.
//   ★ 명령 모양으로 보면 안 된다 — badapple 은 잠금 파일이 없어 `npx tsc` 로 짓고
//     karmolab-ai 는 `npm run build` 로 짓는다. 명령을 특정했더니 초판이 pages-deploy 를
//     헛경보로 찍었다. 틀린 경고가 하나 섞이면 목록 전체가 안 읽힌다.
//   ★ `working-directory` 로 보면 「짓는가」와 「자기 자리를 적었는가」가 한 번에 지켜진다.
//     `cd packages/...` 만 쓰면 job 기본 자리(`apps/karmolab`)에 끌려가 엉뚱한 폴더를 본다 —
//     오늘 내가 그 실수를 했고 돌려 보기 전에 잡았다.
//
// 사용:  node scripts/audit-workflow-prereqs.mjs
// exit:  0 = 전부 갖춤 / 1 = 빠진 곳 있음 / 2 = 볼 대상이 0건(안 본 것을 통과로 읽지 않는다)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));   // apps/karmolab
const repoRoot = dirname(dirname(appRoot));                          // 저장소 뿌리
const wfDir = join(repoRoot, '.github', 'workflows');

// 목록을 여기 박지 않는다 — package.json 의 `file:` 의존이 정본이다(박으면 그것부터 갈라진다).
const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const required = Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })
	.filter(([, v]) => typeof v === 'string' && v.startsWith('file:../../packages/'))
	.map(([name, v]) => ({ name, dir: v.replace(/^file:\.\.\/\.\.\//, '') }))
	// 지을 게 없는 꾸러미(빌드 스크립트 없음)는 전제가 아니다.
	.filter((p) => {
		const pj = join(repoRoot, p.dir, 'package.json');
		if (!existsSync(pj)) return false;
		return Boolean(JSON.parse(readFileSync(pj, 'utf8')).scripts?.build);
	});

if (required.length === 0) {
	console.error('[wf-prereq] CANNOT-RUN: file: 로 무는 꾸러미를 하나도 못 찾았다 — package.json 확인.');
	process.exit(2);
}

const files = existsSync(wfDir) ? readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)) : [];
if (files.length === 0) {
	console.error('[wf-prereq] CANNOT-RUN: 워크플로를 하나도 못 찾았다 — 경로 확인.');
	process.exit(2);
}

const problems = [];
let looked = 0;

for (const f of files) {
	const text = readFileSync(join(wfDir, f), 'utf8');
	const lines = text.split(/\r?\n/).map((l) => l.trim());
	// ★ 주석은 배선이 아니다 (2026-08-10, 이 도구의 첫 시험에서 바로 걸렸다):
	//   워크플로 주석에 「`cd packages/badapple` 는 …」이라고 적어 뒀더니, 단계를 일부러
	//   망가뜨려도 그 주석 한 줄 덕에 초록이 나왔다. 배선 감사가 예전에 겪은 함정과 같은 모양이다.
	const code = lines.filter((l) => l.startsWith('#') === false);

	// 이 앱을 짓는 워크플로인가 — **정확히** `apps/karmolab` 에서 build/verify 를 돌리는가.
	// ★ 앞자리 일치로 보면 안 된다: `apps/karmolab-tauri` 가 걸려 헛경보가 났다(초판 실측).
	// 자리를 잡는 방식이 둘이다: `working-directory:` 와 `cd`. 둘 다 받아야 한다 —
	// 한 쪽만 보면 **verify.yml 이 통째로 빠진다**(이 전제를 처음 갖춘 워크플로가 그건데도).
	const thisApp = lines.some((l) => l === 'working-directory: apps/karmolab')
		|| code.some((l) => /cd apps\/karmolab(\s|$|&)/.test(l));
	// ★ `run: |` 블록으로 쓴 워크플로도 세어야 한다 — 한 줄 `run:` 만 보면 **배포 워크플로가
	//   통째로 빠진다**(초판이 pages-deploy 를 못 봤다: 2개만 세고 3개째를 놓쳤다).
	//   가장 중요한 판을 안 보는 게이트는 있으나 마나다.
	const builds = /run:.*npm run (build|verify)/.test(text)
		|| lines.some((l) => /^npm run (build|verify)\b/.test(l));
	if (!thisApp || !builds) continue;
	looked += 1;

	for (const p of required) {
		// 같은 이유로 두 방식 다 인정한다(verify.yml 은 `cd packages/badapple && …` 로 짓는다).
		if (lines.some((l) => l === `working-directory: ${p.dir}`)) continue;
		if (code.some((l) => l.includes(`cd ${p.dir}`))) continue;
		problems.push(`${f}: ${p.name}(${p.dir}) 를 먼저 짓는 단계가 없다 — 새 체크아웃엔 dist 가 없어 typecheck 이 「모듈을 못 찾겠다」로 선다`);
	}
}

if (looked === 0) {
	console.error('[wf-prereq] CANNOT-RUN: 이 앱을 짓는 워크플로를 하나도 못 찾았다.');
	console.error('[wf-prereq]   빠진 게 없는 게 아니라 아무것도 안 본 것이다 — 판정 규칙 확인.');
	process.exit(2);
}

console.log(`[wf-prereq] 이 앱을 짓는 워크플로 ${looked}개 · 필수 꾸러미 ${required.map((p) => p.name).join(', ')}`);
if (problems.length === 0) {
	console.log('[wf-prereq] RESULT: OK — 전제를 전부 갖췄다');
	process.exit(0);
}
console.log('');
for (const m of problems) console.log(`  ${m}`);
console.log('');
console.log('[wf-prereq] 고치는 법: 그 워크플로의 build 앞에 아래 모양의 단계를 넣을 것.');
console.log('    - name: <꾸러미> 먼저 짓기');
console.log('      working-directory: packages/<꾸러미>   # cd 로 쓰면 job 기본 자리에 끌려간다');
console.log('      run: npm ci --no-audit --no-fund && npm run build');
console.log('[wf-prereq] 같은 전제를 워크플로마다 따로 들면 반드시 갈라진다 — 한쪽만 고친 값이 사고다.');
process.exit(1);
