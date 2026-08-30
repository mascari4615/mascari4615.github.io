/**
 * 이 검사는 무엇을 딛는가를 **스스로 알아낸다** (TASK-KAR-231).
 *
 * ## 왜 이게 필요했나
 *
 * `gate-scope.mjs` 가 2026-08-19 에 바뀐 것에 걸리는 검사만을 세웠다. 기계는 옳았는데
 * **자료가 안 채워졌다**. 하루 뒤 재 보니 발판(`볼것`)이 적힌 게이트는 **160개 중 11개**였고,
 * 그 11개조차 `src/lib/**`, `package.json` 을 보고 있어 실제 작업에서는 늘 걸렸다.
 * 그래서 `--changed` 가 **160/160 을 고르는 no-op** 이었고, 같은 세션이 통짜 판을 다섯 번
 * 돌렸다. 왜 이리 오래 걸려가 이틀 연속 나온 이유가 이것이다.
 *
 * 149개를 손으로 적는 설계는 어제도 안 됐고 내일도 안 된다. **적게 하지 말고 알아내게 한다.**
 *
 * ## 무엇을 근거로 알아내나 (셋 다 실제로 있는 것만 쓴다)
 *
 * ① **검사 스크립트 자기 자신**. 검사를 고쳤으면 그 검사는 돌아야 한다.
 * ② **스크립트 안에 글자 그대로 적힌 경로**. 이 저장소의 검사들은 대상 파일을 문자열로
 *    들고 있다(`scripts/test-cutout.mjs` 안에 `'src/lib/ai-cutout.ts'` 가 그대로 있다).
 *    추측이 아니라 **그 파일이 스스로 적어 둔 것**이라 틀릴 여지가 작다.
 * ③ **이름 규칙으로 나오는 실재 파일**. `test:xmlfmt` → `src/core/xmlfmt.ts`.
 *    없는 경로는 안 넣는다(있는 척하면 영영 안 걸린다).
 *
 * ## ★ 아무 것도 못 알아내면 **언제나 돈다**
 *
 * `gate-scope.mjs` 의 안전 기본값을 그대로 지킨다. 모르는 것을 걸릴 것 없다로 바꾸는 게
 * 이 저장소에서 제일 비싼 고장이다. 그래서 이 파일은 **건너뛸 근거를 만들 뿐**,
 * 건너뛰어도 된다를 스스로 단정하지 않는다.
 *
 * 그리고 이 길은 **개발 중에만** 쓴다. push, CI 는 통짜다. 여기서 잘못 건너뛰어도
 * 배포로는 안 샌다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 검사들이 **함께 딛는 바닥**. 여기가 바뀌면 어느 검사든 흔들릴 수 있다.
 *
 * ★ 여기에 무엇을 넣느냐가 이 파일의 성패다. 실측으로 배웠다(2026-08-20).
 * 처음에는 `package.json`, `data/gate-list.json` 도 넣었다. 그랬더니 **건너뛴 검사가 0개**로
 * 나왔다: 검사를 하나 새로 다는 작업은 반드시 그 둘을 건드리므로, 발판을 116개나 알아내고도
 * 전부 걸려 버린다. 기존 발판 11개가 무력했던 이유와 **똑같은 함정**이었다.
 *
 * 그래서 뺐다. 근거: `package.json` 이 바뀌어 뜻이 있는 경우는 **그 검사의 명령 줄이 바뀐
 * 때**뿐이고, 그때는 그 검사의 스크립트 파일도 거의 항상 같이 바뀐다(①로 잡힌다).
 * `gate-list.json` 은 무엇을 돌릴지인데 그 목록은 이 판이 **매번 새로 읽는다**.
 *
 * 같은 이유로 `src/lib/**` 도 안 넣는다. 넣으면 도구 하나 고칠 때마다 160개가 다 돈다.
 * 스크립트가 *이름으로 부른* lib 파일만 ②로 들어온다.
 */
const ALWAYS = ['scripts/lib/**'];

/** 화면을 띄워 보는 검사(smoke, e2e)는 셸이 바뀌면 같이 흔들린다. */
const SHELL = ['index.html', 'build.mjs', 'src/toolbox.ts', 'src/widgets-lazy-meta.ts'];

/** 검사 이름 → 그 검사가 실제로 부르는 스크립트 파일 (앱 뿌리 기준). 못 찾으면 `null`. */
export function scriptOf(gateName, scripts) {
  const cmd = scripts?.[gateName];
  if (typeof cmd !== 'string') return null;
  const m = cmd.match(/scripts\/[A-Za-z0-9._/-]+\.mjs/);
  return m ? m[0] : null;
}

/** 이름 뒤쪽(`test:xmlfmt` → `xmlfmt`). 갈래가 여럿이면 마지막 칸을 쓴다. */
export function tailOf(gateName) {
  const parts = gateName.split(':').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * 스크립트 안에 **글자 그대로** 적힌 저장소 경로들.
 *
 * 역따옴표까지 본다. 이 저장소의 주석은 대상 파일을 역따옴표로 감싸 적는 꼴이고, 그건
 * **진짜 신호**다(그 검사가 무엇을 딛는지 사람이 적어 둔 것). 넓은 쪽으로 틀리면 그 검사가
 * 더 도는 것으로 끝나므로 안전하다.
 *
 * ★ 다만 **글로브(`*`)가 든 경로는 버린다.** 코드가 넘기는 경로는 구체적인 파일, 폴더이고,
 * `**` 가 보이는 자리는 거의 다 *설명 문장*이다. 실제로 이 판을 짜다 그 일이 났다: 검사
 * 파일 머리말의 `src/lib/**` 를 보고 있어서 한 줄 때문에 그 검사가 **모든 소스**를 보게
 * 됐다(= 늘 돈다 = 이 파일이 무의미해진다). 폴더로 넓히는 일은 `widen` 이 **실재를 확인한
 * 뒤에만** 한다.
 */
export function pathsInside(source) {
  const out = new Set();
  const re = /['"`](src\/[A-Za-z0-9._/*-]+|data\/[A-Za-z0-9._/*-]+)['"`]/g;
  let m;
  while ((m = re.exec(source)) !== null) out.add(m[1]);
  return [...out];
}

/**
 * 모든 소스와 같은 뜻이라 **아무 정보가 없는** 발판. 이런 것은 알아낸 것으로 안 친다 . 
 * 넣어 봐야 그 검사는 늘 돌고, 발판을 알아냈다는 숫자만 부풀린다.
 */
/* `src/lib` 도 여기 든다 (2026-08-29). 검사 하나가 그 폴더를 통째로 훑으면 유도가
   `src/lib/**` 를 내주는데, 그건 도구 하나를 고쳐도 걸리는 자리다. `test:gate-derive` 의
   함정 목록과 같은 판단이라 여기서 막는다. push, CI 는 언제나 통짜라 놓치는 것은 없다. */
const meaningless = new Set(['src/**', 'src', 'data/**', 'data', 'src/lib', 'src/lib/**']);

/** 그 경로가 폴더면 `dir/**` 로 넓힌다. 폴더를 훑는 검사는 그 안 아무 파일에나 걸린다. */
function widen(rel) {
  if (meaningless.has(rel.replace(/\/$/, ''))) return null;
  /* 글로브는 설명 문장에서 온 것으로 본다. 위 머리말 ★ 참조. */
  if (rel.includes('*')) return null;
  let stat = null;
  try {
    stat = fs.statSync(path.join(APP, rel));
  } catch {
    return null; // 없는 경로는 안 넣는다. 있는 척하면 영영 안 걸린다
  }
  return stat.isDirectory() ? rel.replace(/\/$/, '') + '/**' : rel;
}

/** 이름 규칙으로 나오는 자리들. **실재하는 것만**. */
export function byName(tail) {
  if (!tail) return [];
  const guesses = [
    `src/core/${tail}.ts`,
    `src/lib/${tail}.ts`,
    `src/widgets/tools/${tail}.ts`,
    `src/widgets/${tail}.ts`,
    `src/widgets/${tail}`,
    `src/lib/${tail}`
  ];
  return guesses.map(widen).filter((v) => v !== null);
}

/**
 * 한 검사의 발판을 알아낸다. **못 알아내면 `null`** = 언제나 돈다.
 *
 * @param gateName 검사 이름 (`test:cutout`)
 * @param scripts  package.json 의 scripts
 * @param read     파일 읽기 (시험에서 갈아 끼운다)
 */
export function deriveWatch(gateName, scripts, read = (p) => fs.readFileSync(path.join(APP, p), 'utf8')) {
  const script = scriptOf(gateName, scripts);
  if (script === null) return null; // 스크립트를 못 찾으면 아무 근거가 없다

  let source = '';
  try {
    source = read(script);
  } catch {
    return null;
  }

  const found = new Set([script, ...ALWAYS]);
  for (const rel of pathsInside(source)) {
    const w = widen(rel);
    if (w !== null) found.add(w);
  }
  for (const g of byName(tailOf(gateName))) found.add(g);
  if (/^scripts\/smoke-/.test(script)) for (const s of SHELL) found.add(s);

  /* ★ 근거가 자기 자신 + 언제나 자리뿐이면 **알아낸 게 없는 것**이다.
     그걸 발판이라고 내주면 그 검사는 자기 파일을 고칠 때 말고는 영영 안 돈다. 조용한 고장. */
  const real = [...found].filter((f) => f !== script && !ALWAYS.includes(f));
  return real.length > 0 ? [...found] : null;
}
