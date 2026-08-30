/**
 * 새 도구 뼈대. **자리를 하나도 안 빠뜨리나** (TASK-KL-338).
 *
 * 생성기의 고질병은 한 자리를 조용히 빠뜨리는 것이다. 그러면 사람은 다 됐다고 믿고
 * 넘어가는데, 실제로는 게이트가 며칠 뒤에 잡거나(운이 좋으면) **앱에서만 안 열린다**.
 * 그래서 여기서 잠그는 것은 예쁘게 만드나가 아니라 **여덟 자리가 다 계획에 드나**다.
 *
 * 계획은 순수 함수라 **저장소를 안 건드리고** 잰다.
 *
 * 사용: node scripts/test-new-tool.mjs   (npm run test:new-tool)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { badId, leftovers, planTool, WORKBENCHES } from './lib/new-tool-plan.mjs';

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, why) => check(got === want, `${why}. 기대 ${want}, 나온 것 ${got}`);

const plan = planTool({ id: 'wibble', title: '위블', desc: '위블 설명', work: 'image' });
const paths = plan.map((s) => s.path);
const has = (p) => paths.includes(p);

// ── ① 여덟 자리가 다 든다 ────────────────────────────────────────────────────

/* 이 목록이 이 파일의 전부다. 자리가 늘면 여기도 늘어야 하고, 그래야 생성기가 안 늙는다. */
check(has('src/widgets/tools/wibble.ts'), '도구 본체');
check(has('src/widgets-lazy-meta.ts'), '★ 명부. 여기 빠지면 전 게이트 초록인데 앱에서 못 연다');
check(has('data/tool-aliases.json'), '찾기창 검색어');
check(has('i18n/ko/wibble.json'), '말 묶음 (원본)');
check(has('i18n/en/wibble.json'), '말 묶음 (영어)');
check(has('i18n/ja/wibble.json'), '말 묶음 (일본어)');
check(has('i18n/en/widgets.json') && has('i18n/ja/widgets.json'), '이름 번역 두 벌');
check(has('i18n/en/widgets-desc.json') && has('i18n/ja/widgets-desc.json'), '설명 번역 두 벌');
check(has('src/widgets/tools/image.ts'), '고른 작업대의 할 일 카드');

/* 작업대를 안 고르면 **아무 데도 안 꽂는다**. 엉뚱한 카드는 빠진 것보다 고치기 번거롭다. */
const noBench = planTool({ id: 'wibble' }).map((s) => s.path);
check(!noBench.includes('src/widgets/tools/image.ts'), '작업대를 안 고르면 작업대는 안 건드린다');
eq(noBench.length, plan.length - 1, '작업대 말고는 똑같다');

// ── ② 계획이 가리키는 파일이 **실재하나** ────────────────────────────────────

/* 경로가 낡으면 생성기는 조용히 엉뚱한 데를 만든다. 고칠 대상(create 아닌 것)은 있어야 한다. */
for (const s of plan) {
  if (s.kind === 'create') continue;
  check(fs.existsSync(path.join(APP, s.path)), `고칠 파일이 실재한다: ${s.path}`);
}

/* 넣을 자리 표식도 실재해야 한다. 못 찾으면 CLI 가 멈추지만, 그건 사람이 부른 뒤다. */
const meta = fs.readFileSync(path.join(APP, 'src/widgets-lazy-meta.ts'), 'utf8');
const anchor = plan.find((s) => s.kind === 'insert-before');
check(meta.includes(anchor.find), `명부의 넣을 자리(${anchor.find})가 그대로 있다`);
check(new RegExp('\\}\\s*\\n' + anchor.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(meta), '배열 끝 모양이 CLI 가 아는 그대로다');

for (const [name, bench] of Object.entries(WORKBENCHES)) {
  const abs = path.join(APP, bench.file);
  check(fs.existsSync(abs), `작업대 ${name} 파일이 실재한다`);
  if (fs.existsSync(abs)) check(fs.readFileSync(abs, 'utf8').includes(bench.anchor), `작업대 ${name} 의 표식이 실재한다`);
}

// ── ③ 이름 규칙 ─────────────────────────────────────────────────────────────

/* 파일 이름, 열쇠, 주소가 전부 id 로 만들어진다. 반쯤 되는 이름은 **반쯤 선 도구**를 만든다. */
check(badId('qr') === null, '짧아도 두 글자면 된다');
check(badId('videobg') === null, '보통 이름');
check(badId('') !== null, '빈 이름은 막는다');
check(badId('A') !== null, '한 글자는 막는다');
check(badId('VideoBg') !== null, '대문자는 막는다');
check(badId('video-bg') !== null, '붙임표는 막는다 (열쇠 이름이 갈린다)');
check(badId('../x') !== null, '경로가 섞이면 막는다');
check(badId('1st') !== null, '숫자로 시작하면 막는다');
let threw = false;
try {
  planTool({ id: 'Bad Id' });
} catch {
  threw = true;
}
check(threw, '나쁜 이름이면 계획을 아예 안 만든다');
threw = false;
try {
  planTool({ id: 'wibble', work: '없는작업대' });
} catch {
  threw = true;
}
check(threw, '모르는 작업대면 던진다 (아무 데나 안 꽂는다)');

// ── ④ 만들어 주는 내용이 실제로 쓸 만한가 ────────────────────────────────────

const widget = plan.find((s) => s.path === 'src/widgets/tools/wibble.ts').content;
check(widget.includes("id: 'wibble'"), '위젯이 자기 id 를 안다');
check(widget.includes("loadNamespace('wibble')"), '말 묶음을 스스로 받는다');
check(widget.includes('markLive'), '상태 줄이 읽히는 자리다 (KL-291)');
check(widget.includes('TODO'), '사람이 채울 자리를 TODO 로 남긴다');
check(widget.includes('안 하는지'), '★ 머리말이 무엇을 안 하는지를 적으라고 시킨다. 이 저장소의 규율');
check(/aria-label=/.test(widget), '입력칸에 이름이 붙어 있다');
check(/name="input"/.test(widget), '입력칸에 name 이 있다 (test:names 가 본다)');

const koStep = plan.find((s) => s.path === 'i18n/ko/wibble.json');
const ko = JSON.parse(koStep.content);
const en = JSON.parse(plan.find((s) => s.path === 'i18n/en/wibble.json').content);
eq(Object.keys(en).length, Object.keys(ko).length, '번역 자리표가 원본과 열쇠 수가 같다');
check(Object.keys(ko).every((k) => k in en), '열쇠가 하나도 안 빠진다');
check(Object.values(en).every((v) => v.startsWith('[EN]')), '★ 안 옮긴 자리는 표가 나야 한다. 조용히 한국어로 두면 영영 안 옮긴다');
check(ko['wibble.tab'] === '위블', '탭 이름이 들어간다');
check(ko['wibble.note.limits'].includes('안 하는 것'), '★ 화면 안내문에도 안 하는 것 자리를 비워 둔다');

// ── ⑤ 사람에게 남기는 것 ────────────────────────────────────────────────────

const rest = leftovers('wibble');
check(rest.length >= 5, '이어서 할 것을 알려 준다');
check(rest.some((r) => r.includes('gate-list')), '검사 등록은 사람 몫이라고 말한다');
check(rest.some((r) => r.includes('[EN]') || r.includes('자리표')), '번역 자리표를 바꾸라고 말한다');
/* ★ 자리표를 **잡는 게이트 이름**을 정확히 말해야 한다. 2026-08-20 에 여기가 틀려서
   test:i18n 이 잡아 준다고 적어 뒀는데 실제로는 100% 초록이었다(안 잡는다). */
check(rest.some((r) => r.includes('audit:i18n-stub')), '자리표를 실제로 잡는 게이트 이름을 말한다');
check(!rest.some((r) => /test:i18n 이 남은 것을 센다/.test(r)), 'test:i18n 이 잡아 준다고 거짓말하지 않는다');
check(rest.some((r) => r.includes('core/') || r.includes('lib/')), '셈을 화면 밖으로 빼라고 말한다');
/* ★ 2026-08-20 에 이 자리를 빠뜨렸다가 **다른 세션이 audit:data 로 걸리는 걸 보고** 알았다.
   자리표를 넣지 않는 이유: TODO 문구가 검색엔진에 실린다. 그래서 사람에게 넘긴다. */
check(rest.some((r) => r.includes('tools-seo.json')), '상세 페이지 정보(tools-seo)를 채우라고 말한다');

// ── 마무리 ───────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-new-tool] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[test-new-tool] 자리 ${plan.length}곳, 검사 전부 통과`);
