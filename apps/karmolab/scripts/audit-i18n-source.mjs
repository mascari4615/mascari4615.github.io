/**
 * 아직 안 빼낸 한국어 감시 — **더 늘지 않게 잠근다** (TASK-KL-203 S5)
 *
 * 사정: 화면에 나가는 글 21만 자가 코드 안에 한국어로 박혀 있다(300 파일). 이걸 한 번에 다
 * 빼내는 건 몇 주짜리 일이고, 그동안에도 새 위젯은 계속 늘어난다. 그러면 **빼내는 속도보다
 * 박히는 속도가 빨라져 영영 안 끝난다** — 다국어가 실패하는 가장 흔한 방식이다.
 *
 * 그래서 총량을 세고 **기준선을 박아 둔다**. 규칙은 하나: *어떤 파일도 기준선보다 늘 수 없다.*
 * 줄이는 건 언제든 환영이고(그때 기준선을 다시 박는다), 새 파일에 한국어 글을 박으면 그 자리에서
 * 멈춘다. 「지금 0으로 만들어라」가 아니라 「여기서부터는 늘지 마라」 — 그래야 사람이 검사를
 * 안 끄고, 숫자가 실제로 내려간다.
 *
 * 세는 것 = **글자열 안의 한국어만**. 주석·설명은 세지 않는다(이 레포는 주석을 한국어로 길게
 * 쓰는 것이 규약이고, 그건 화면에 안 나간다). 그래서 먼저 주석을 걷어 내고 문자열만 본다.
 *
 * 사용:
 *   node scripts/audit-i18n-source.mjs            검사 (기준선 초과면 실패)
 *   node scripts/audit-i18n-source.mjs --baseline 지금 상태를 새 기준선으로 (줄인 뒤에만)
 *   node scripts/audit-i18n-source.mjs --tighten  **줄어든 파일만** 기준선을 내린다
 *                                                 (남이 늘려 놓은 파일은 빨간 채로 둔다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, 'src');
const BASELINE = path.join(root, 'i18n/.source-baseline.json');
const REBASE = process.argv.includes('--baseline');
/** 조이는 쪽만 반영 — 남이 늘려 놓은 줄까지 함께 축복하지 않으려고 나눠 뒀다. */
const TIGHTEN = process.argv.includes('--tighten');
/* 내 파일만 현재 값으로 다시 박는다. `--baseline` 은 **다른 슬롯이 늘려 놓은 것까지** 축복해
 * 버려서 쓸 수 없다. 늘어난 게 의도인 경우가 있다 — 등록 시점 탭 이름처럼 기다릴 자리가 없어
 * 한국어 기본값을 코드에 두는 자리(S9-b). 그때만 그 파일을 `--bless` 로 적는다. */
const BLESS = (() => {
  const at = process.argv.indexOf('--bless');
  if (at < 0) return [];
  return process.argv.slice(at + 1).filter((a) => !a.startsWith('--'));
})();
/**
 * **기본이 「알리되 세우지 않는다」** (2026-08-09 결정).
 *
 * 이 검사는 배포 길목에 있다. 그런데 걸리는 것은 대개 **다른 사람이 지금 만들고 있는 도구**다 —
 * 번역 규칙을 알 이유가 없는 사람의 작업이 사이트 전체를 얼린다. 실제로 몇 시간 얼렸고,
 * 그동안 영어 판이 한 번도 못 나갔다. 지키려던 것(옮긴 글이 도로 코드로 새는 것)보다
 * 막은 것이 훨씬 컸다.
 *
 * 세우고 싶을 때는 `--strict`. 옮기는 일이 더 진행돼 「다 옮긴 파일」이 뚜렷해지면 그때 기본으로.
 */
const STRICT = process.argv.includes('--strict');
const KO = /[가-힣]/;

/**
 * 주석을 걷어 낸다.
 *
 * 정확한 파서를 쓰지 않는 이유: 우리가 알아야 하는 건 「한국어 글자열이 몇 개인가」라는 **추세**지
 * 정확한 구문 트리가 아니다. 다만 **문자열 안에 든 `//`** 를 주석으로 오해하면 뒷부분이 통째로
 * 사라져 숫자가 실제보다 작게 나온다 — 그러면 잠금이 헐거워진다. 그래서 문자열을 먼저 만나면
 * 그 문자열을 통째로 건너뛴다.
 */
/**
 * 「여기서 `/` 는 나눗셈인가 정규식인가」 — 바로 앞의 뜻 있는 글자로 가른다.
 * 값이 끝난 자리 뒤면 나눗셈(`a / b`), 그 밖이면 정규식 시작(`(`·`=`·`,`·`return` 뒤 등).
 */
function looksLikeRegexStart(code, at) {
  let j = at - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  const p = code[j];
  if (')]}'.includes(p)) return false; // 값이 끝난 자리 → 나눗셈
  if (/[A-Za-z0-9_$]/.test(p)) {
    // `return /…/` 처럼 낱말 뒤면 정규식. 변수 이름 뒤면 나눗셈.
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(code[k])) k--;
    return ['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await'].includes(code.slice(k + 1, j + 1));
  }
  return true;
}

function countKoreanLiterals(code) {
  let n = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    /* ★ 정규식 리터럴을 건너뛴다 (2026-08-09 실측으로 고침).
       거의 모든 위젯의 `esc` 가 `.replace(/"/g, '&quot;')` 를 쓴다. 예전 판은 그 `/"` 의
       따옴표를 **문자열 시작**으로 봤고, 거기서부터 짝이 어긋나 뒤쪽 HTML 속성 따옴표가
       문자열로 잡혔다 — 태그·코드가 섞인 조각이 「한국어 글자열」로 세어졌다.
       그래서 **한국어를 하나도 안 늘린 편집도** 근처 코드만 바뀌면 숫자가 흔들렸다
       (실측: unitconv 조각 7 늘고 6 줄어 순증 1 → 배포가 섰다). */
    if (c === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && looksLikeRegexStart(code, i)) {
      let j = i + 1;
      let inClass = false;
      while (j < code.length) {
        const d = code[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break; // 정규식은 줄을 넘지 않는다 — 잘못 짚었으면 여기서 포기
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && inClass === false) {
          i = j;
          break;
        }
        j++;
      }
      if (i === j) continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = ++i;
      /* ★ 템플릿 안 `${…}` 는 **다시 코드**다 (2026-08-09 실측으로 고침).
         그 안에 또 템플릿이 있으면(흔하다: `${rows.map((r) => `<td>…</td>`).join('')}`)
         예전 판은 **그 안쪽 백틱에서 바깥 템플릿을 끝냈다.** 그 뒤부터 짝이 어긋나서,
         HTML 속성의 따옴표(`class="…"`)가 문자열 시작으로 잡히고 태그·코드가 섞인 조각이
         「한국어 글자열」로 세어졌다.
         그래서 **한국어를 하나도 안 늘린 편집도** 근처 코드만 바뀌면 숫자가 흔들렸다
         (실측: unitconv 조각 7 늘고 6 줄어 순증 1 → 배포가 섰다).
         이제 `${` 를 만나면 중괄호 짝을 세어 건너뛴다 — 그 안의 문자열은 따로 판정된다. */
      let depth = 0;
      while (i < code.length) {
        const ch = code[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && ch === '$' && code[i + 1] === '{') {
          i += 2;
          depth = 1;
          // `${…}` 안은 코드다. 중괄호 짝을 세되, 그 안의 문자열·주석도 건너뛴다.
          while (i < code.length && depth > 0) {
            const d = code[i];
            if (d === '{') depth++;
            else if (d === '}') depth--;
            else if (d === '"' || d === "'" || d === '`') {
              const q2 = d;
              const s2 = ++i;
              let inner = 0;
              while (i < code.length) {
                if (code[i] === '\\') {
                  i += 2;
                  continue;
                }
                if (q2 === '`' && code[i] === '$' && code[i + 1] === '{') {
                  i += 2;
                  inner = 1;
                  while (i < code.length && inner > 0) {
                    if (code[i] === '{') inner++;
                    else if (code[i] === '}') inner--;
                    i++;
                  }
                  continue;
                }
                if (code[i] === q2) break;
                i++;
              }
              // 안쪽 문자열도 한국어면 센다 — 실제로 화면에 나가는 글이다.
              if (KO.test(code.slice(s2, i))) n++;
            }
            i++;
          }
          continue;
        }
        if (ch === quote) break;
        i++;
      }
      /* 한 벌로 훑으며 문자열을 그 자리에서 판정한다. 정규식으로 문자열을 다시 찾으면
         길고 여러 줄인 템플릿 글자열에서 되짚기가 폭발해 검사가 몇 분씩 걸린다(실측). */
      if (KO.test(code.slice(start, i))) n++;
      continue;
    }
  }
  return n;
}

const counts = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(f);
    } else if (e.name.endsWith('.ts')) {
      const n = countKoreanLiterals(fs.readFileSync(f, 'utf8'));
      if (n) counts[path.relative(root, f).split(path.sep).join('/')] = n;
    }
  }
})(SRC);

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (REBASE || TIGHTEN || BLESS.length) {
  /* `--tighten` = **조이는 쪽만** 반영한다.
   *
   * 왜 따로 두나: 이 저장소는 슬롯 여럿이 같이 쓴다. 한쪽에서 한국어를 다 빼낸 날 그냥
   * `--baseline` 을 박으면, 그 순간 **다른 슬롯이 늘려 놓은 줄까지 함께 축복**된다
   * (실제로 `karmomap` 이 86→113 으로 늘어 있었다). 잠금을 조이려던 행동이 그 파일에
   * 대해서는 정확히 반대로 작동한다.
   * 그래서 파일마다 **작은 쪽**을 남긴다 — 줄인 것은 잠기고, 늘어난 것은 빨간 채로 그 슬롯 몫. */
  let next = counts;
  if ((TIGHTEN || BLESS.length) && fs.existsSync(BASELINE)) {
    const prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files || {};
    next = {};
    for (const key of new Set([...Object.keys(prev), ...Object.keys(counts)])) {
      const now = counts[key] ?? 0;
      const was = prev[key];
      const blessed = BLESS.some((b) => key === b || key.endsWith('/' + b));
      const keep = was === undefined || blessed ? now : Math.min(was, now);
      if (keep) next[key] = keep;
    }
  }
  const nextTotal = Object.values(next).reduce((a, b) => a + b, 0);
  fs.writeFileSync(BASELINE, JSON.stringify({ total: nextTotal, files: next }, null, 2) + '\n', 'utf8');
  console.log(
    `[i18n-source] 기준선 ${TIGHTEN ? '조임' : '새로 박음'} — 파일 ${Object.keys(next).length}개 · ` +
      `한국어 글자열 ${nextTotal}개`
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error('[i18n-source] 기준선이 없다 — `node scripts/audit-i18n-source.mjs --baseline` 먼저');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

/* **새로 생긴 파일과 되돌아간 파일은 다르다** (2026-08-09 실측).
 *
 * 처음엔 「어떤 파일도 기준선보다 늘 수 없다」 하나였다. 그런데 이 저장소는 도구가 계속 는다 —
 * 누가 새 위젯을 만들면 그 파일은 기준선에 없으니 `0 → N` 으로 무조건 걸리고, 그 사람은
 * 번역 규칙을 알 이유가 없다. 그 결과 **배포가 통째로 섰고 영어 판이 한 번도 못 나갔다**.
 * 지키려던 것(옮긴 글이 도로 코드로 새는 것)보다 막은 것이 훨씬 컸다.
 *
 * → 갈라 본다: **이미 옮긴 파일이 되돌아가는 것**만 잘못이고, 새 파일은 「아직 안 옮긴 것」이라
 *   경고로 알리고 통과시킨다(다음 `--baseline` 때 자연히 편입된다). */
const regressed = [];
const fresh = [];
for (const [f, n] of Object.entries(counts)) {
  const was = base.files[f];
  if (was === undefined) fresh.push(`${f}: ${n}`);
  else if (n > was) regressed.push(`${f}: ${was} → ${n}`);
}

if (fresh.length) {
  console.log(`[i18n-source] 아직 안 옮긴 새 파일 ${fresh.length}개 (막지 않는다):`);
  for (const g of fresh.slice(0, 8)) console.log('  ' + g);
  if (fresh.length > 8) console.log(`  … 그 밖 ${fresh.length - 8}개`);
}

if (regressed.length) {
  console.error('[i18n-source] **이미 옮긴 파일**에 한국어 글이 도로 늘었다 — i18n/ 묶음으로 빼야 한다:');
  for (const g of regressed) console.error('  ' + g);
  console.error('  (정말 늘려야 하는 경우에만 `--baseline` 으로 다시 박는다)');
  /* 배포 길목에서는 **세우지 않는다** — 이 검사 하나가 사이트 전체를 얼릴 값어치는 없다.
     대신 `verify`·PR 에서는 그대로 빨강이라, 고칠 사람이 고칠 자리에서 걸린다. */
  if (STRICT) process.exit(1);
  console.error('  (지금은 알리기만 한다 — 세우려면 `--strict`)');
}

const shrunk = base.total - total;
console.log(
  `[i18n-source] 코드 안 한국어 글자열 ${total}개 (기준선 ${base.total})` +
    (shrunk > 0 ? ` — ${shrunk}개 줄었다. \`--baseline\` 으로 잠금을 조여라` : '')
);


/* ── 「그 나라 것으로 바꿔치기」 훑개 ─────────────────────────────
 * 옮기긴 했는데 **가리키는 것이 달라진** 자리가 있다. 열쇠 수 검사도, 값 검사도 못 본다 —
 * 수도 맞고, 한국어도 아니고, 원문과 같지도 않다. 두 번 잡혔다:
 *   · 한영키(한글/영문 자판) → `かな/英字キー` — 일본어로 읽는 사람은 자기 IME 이야기로 읽는다
 *   · 한국 부가세·원 → `消費税`·`円` / 한글 수 → `漢数字`·「金○○円也」
 * 기계가 「맞는 말인가」를 못 보므로, **의심 자리를 좁혀 사람에게 보여 준다**. 세우지는 않는다
 * (坪 처럼 진짜 같은 단위인 경우가 섞여 있어, 세우면 곧 꺼진다). */
const SWAP_PAIRS = [
  [/부가세|부가가치세/, /消費税/, '한국 부가세 → 일본 소비세'],
  [/한글|한영|자모|초성/, /かな|仮名|ひらがな|カタカナ/, '한글 → 일본 가나'],
  [/한글 수|한글로 읽|한글로 적/, /漢数字/, '한글 수 → 한자 숫자'],
  [/국세청/, /(?<!韓国)国税庁|IRS/, '한국 국세청 → 그 나라 세무서'],
  [/[0-9]\s*원|원 미만|만원/, /円|¥|yen/i, '원 → 엔'],
  [/주민등록/, /マイナンバー|My ?Number|Social Security/i, '주민등록 → 그 나라 신분번호'],
];
{
  const suspect = [];
  for (const loc of ['en', 'ja']) {
    for (const f of fs.readdirSync(path.join(root, 'i18n', 'ko'))) {
      const kp = path.join(root, 'i18n', 'ko', f);
      const tp = path.join(root, 'i18n', loc, f);
      if (!fs.existsSync(tp)) continue;
      const ko = JSON.parse(fs.readFileSync(kp, 'utf8'));
      const tr = JSON.parse(fs.readFileSync(tp, 'utf8'));
      for (const [k, v] of Object.entries(ko)) {
        const t = tr[k];
        if (typeof v !== 'string' || typeof t !== 'string') continue;
        for (const [koRe, badRe, why] of SWAP_PAIRS) {
          if (koRe.test(v) && badRe.test(t)) suspect.push(`${loc}/${k} — ${why}`);
        }
      }
    }
  }
  if (suspect.length) {
    console.log(`[i18n-source] 「그 나라 것으로 바꿔치기」 의심 ${suspect.length}개 — 사람이 읽고 판단하라:`);
    for (const line of suspect.slice(0, 12)) console.log('  ' + line);
    if (suspect.length > 12) console.log(`  … 그 밖 ${suspect.length - 12}개`);
  } else {
    console.log('[i18n-source] 바꿔치기 의심 0');
  }
}
