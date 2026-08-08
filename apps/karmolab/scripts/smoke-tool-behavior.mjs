/**
 * 도구가 실제로 답을 내는지 확인 (TASK-KL-089)
 *
 * 이미 있는 검사 두 개는 각각 다른 층을 본다.
 *  - `smoke-tools.mjs`      : 위젯이 등록되는가 (사이드바에서 사라지지 않는가)
 *  - `smoke-live-pages.mjs` : 페이지를 열면 화면이 그려지는가
 * 둘 다 통과하면서도 **넣으면 아무 일도 안 일어나는** 상태가 될 수 있다. 검색으로 들어온
 * 사람에게 그건 빈 페이지와 같고, 그대로 되돌아 나간다. 그래서 값을 넣고 답이 나오는지 본다.
 *
 * 전 도구를 자동으로 다루기는 어렵다(그림·소리·파일을 받는 도구가 많다). 대신 글자를 받아
 * 글자를 내는 대표 도구를 골라 둔다 — 여기가 깨지면 공통 배관이 상한 것이다.
 *
 * 사용: node scripts/smoke-tool-behavior.mjs            (기본 = 아래 목록 전부)
 *       BASE=http://127.0.0.1:8797/apps/blog node ...   (로컬 사본 대상)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';

/**
 * [도구, 넣을 값, (필요하면) 눌러야 하는 것, 기대]
 *
 * 기대가 정규식이면 그 글이 결과에 보여야 한다.
 * 기대가 `CHANGES` 면 「값을 바꾸면 화면이 달라진다」만 본다 — 계산기처럼 답이 숫자라
 * 미리 적어 둘 수 없는 도구용이다. 이때 넣는 값은 **기본값과 달라야** 한다.
 * (BMI 에 기본값과 같은 값을 넣고 「결과가 안 바뀐다」고 오해한 적이 있다.)
 */
const CHANGES = Symbol('결과가 달라지면 통과');

const CASES = [
  ['charcount', '안녕하세요 반갑습니다', null, /11|공백/],
  ['base64', '안녕', null, /7JWI64WV/],
  ['slug', 'Hello World', null, /hello-world/],
  ['radix', '255', null, /FF|ff|1111\s?1111/],
  ['caseconv', 'hello world', null, /HELLO WORLD|Hello World|helloWorld/],
  ['hashgen', 'abc', null, /a9993e|ba7816/i],
  ['jsonfmt', '{"a":1}', '정렬', /"a"/],
  ['textclean', '  여러   공백  ', '중간 공백 하나로', /여러 공백/],
  ['morse', 'SOS', null, /\.\.\.\s?---\s?\.\.\./],
  ['numword', '1234', null, /천이백삼십사|일천이백삼십사/],
  ['jamo', '한글', null, /ㅎ|ㅏ|ㄴ/],
  ['hangulkey', 'dkssudgktpdy', null, /안녕하세요/],
  /* 섞여 있는 글은 조각마다 따로 되돌린다 — 남들은 글 전체를 한 방향으로만 본다.
     이 성질이 사라지면 멀쩡한 쪽까지 같이 뒤집혀 더 망가진다. */
  ['hangulkey', '안녕 gktpdy', null, /dkssud 하세요/],
  // 주소 분해는 결과를 표로 보여 준다 — 「x=1」 그대로가 아니라 「호스트 a.b」 꼴로 나온다.
  ['urlparse', 'https://a.b/c?x=1&y=2', null, /a\.b/],
  ['wordfreq', '가나 가나 다라', null, /가나/],
  ['linebreak', '한 줄\n두 줄', null, /한 줄/],
  ['csvjson', 'a,b\n1,2', 'CSV → JSON', /"a"|\[/],

  // 답이 숫자라 미리 적어 둘 수 없는 계산기들 — 값을 바꾸면 화면이 달라지는지로 본다.

  // (텍스트 비교는 두 칸을 다 채워야 결과가 나온다. 이 검사는 한 칸만 채우므로 넣지 않았다.)
  ['listdiff', '가\n나', null, CHANGES],
  ['radix', '4095', null, /FFF|fff/],
  // 타임스탬프 칸은 숫자만 받는다 — 날짜 문자열을 넣으면 아무 일도 안 일어난다.
  /* 계산기는 「화면이 바뀌었나」가 아니라 **답이 맞는가**로 본다 (TASK-KL-089).
   * 아래 값은 손으로 따로 셈해 둔 것이다 — 도구가 내놓은 값을 그대로 베끼면 검사가 아니다.
   * 부가세: 공급가 10,000 · 10% → 세액 1,000 · 합계 11,000
   * 체질량: 70kg ÷ 1.7m² = 24.2
   * 용량:   1GB(1000 기준) = 1,000,000,000 B */
  ['vat', '10000', null, /11,000/],
  [
    'bmi',
    [
      ['키', '170'],
      ['몸무게', '70']
    ],
    null,
    /24\.2/
  ],
  ['bytesize', '1', null, /1,000,000,000/],
  /* 텍스트 비교는 「줄이 바뀌었다」가 아니라 **줄 안에서 어디가 바뀌었나**가 값어치다.
     그 표시가 사라지면 이 도구는 남들과 같아진다 — 그래서 그 표시를 검사가 붙든다. */
  [
    'textdiff',
    [
      ['원본', '오늘 날씨가 좋다'],
      ['변경본', '오늘 날씨가 흐리다']
    ],
    null,
    /추가 1줄|흐리/
  ],
  /* 아래도 손으로 따로 셈한 값이다 (TASK-KL-089).
   * 화면비: 1920×1200 의 최대공약수 240 → 8:5
   * 단위:   24px ÷ 루트 16px = 1.5rem
   * 퍼센트: 640 의 25% = 160
   * 길이:   5cm ÷ 2.54 = 1.9685 inch
   * 대출:   1억 · 연 4.5% · 360개월 원리금균등 → 매달 506,685원
   *         (P·r ÷ (1-(1+r)^-n), r = 0.045/12) */
  [
    'aspect',
    [
      ['가로', '1920'],
      ['세로', '1200']
    ],
    null,
    /8\s*:\s*5/
  ],
  [
    'cssunit',
    [
      ['루트 글자 크기', '16'],
      // 칸 이름이 「바꿀 숫자」에서 「숫자」로 바뀌었다. 검사만 옛 이름을 들고 있어서
      // 멀쩡한 도구가 몇 주째 빨갛게 나왔다 — 실제로는 1.5rem 을 잘 내놓는다.
      ['숫자', '24']
    ],
    null,
    /1\.5\s*rem/
  ],
  [
    'percent',
    [
      ['몇의 몇% 는? — 1번째 값', '640'],
      ['몇의 몇% 는? — 2번째 값', '25']
    ],
    null,
    /160/
  ],
  ['unitconv', '5', null, /1\.9685/],
  [
    'loan',
    [
      ['대출 금액', '100000000'],
      ['연 이자율', '4.5'],
      ['기간 (개월)', '360']
    ],
    null,
    /506,685/
  ],
  /* 시간·날짜·이자·페이스도 손으로 셈해 둔다 (TASK-KL-089).
   * 시각:   09:00 + 2시간 30분 = 11:30
   * 날짜:   2026-01-01 → 2026-03-01 = 59일 (1월 31일 + 2월 28일)
   * 적금:   매달 100만 · 연 5% 단리 · 12개월 → 세전 이자 325,000
   *         (M·r/12 × n(n+1)/2 — 먼저 넣은 돈이 더 오래 굴러서)
   * 페이스: 6:00/km × 42.195km = 253.17분 = 4시간 13분 10초
   * 타임스탬프: 1000000000 초 = 2001-09-09T01:46:40Z (시간대와 무관한 ISO 로 본다) */
  [
    'timecalc',
    [
      ['시작 시각', '09:00'],
      ['걸리는 시간', '2:30']
    ],
    null,
    /11:30/
  ],
  [
    'datecalc',
    [
      ['기준일', '2026-01-01'],
      ['목표일', '2026-03-01']
    ],
    null,
    /59일/
  ],
  [
    'interest',
    [
      ['원금', '1000000'],
      ['연 이자율', '5'],
      ['기간 (개월)', '12']
    ],
    null,
    /325,000/
  ],
  ['pace', '6:00', null, /4시간 13분 10초/],
  ['epoch', '1000000000', null, /2001-09-09T01:46:40/],
  /* 학점: A+ 4.5 · B0 3.0 을 각 3학점씩 → (4.5×3 + 3.0×3) ÷ 6 = 3.75
   * 바꾸기: 「바나나 사과」에서 바나나를 포도로 → 「포도 사과」 (넣은 값에는 없는 짝이라 답으로만 나온다) */
  ['grade', '3 A+\n3 B0', null, /3\.75/],
  [
    'replace',
    [
      ['바꿀 텍스트', '바나나 사과'],
      ['찾을 내용', '바나나'],
      ['바꿀 내용', '포도']
    ],
    '바꾸기',
    /포도 사과/
  ],
  /* 글자 도구도 답이 정해져 있으면 그 답으로 본다 (TASK-KL-089).
   * 색:   #FF0000 = rgb(255, 0, 0) = hsl(0, 100%, 50%)
   * 크론: 0 9 * * 1 = 매주 월요일 9시 0분 (다음 실행이 월요일인지도 함께 뜬다)
   * 표:   CSV 「a,b / 1,2」 → 마크다운 표 「| a | b |」
   * 타입: {"a":1} → a 는 number */
  ['colorconv', '#FF0000', null, /rgb\(255, 0, 0\)/],
  ['cron', '0 9 * * 1', null, /월요일/],
  ['tableconv', 'a,b\n1,2', null, /\|\s*a\s*\|\s*b\s*\|/],
  ['json2ts', '{"a":1,"b":"s"}', '타입 만들기', /a:\s*number/]
];

const only = process.argv.slice(2);
const cases = only.length ? CASES.filter(([id]) => only.includes(id)) : CASES;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const failures = [];

// 서로 무관한 페이지라 몇 장씩 동시에 연다 (TASK-KL-089).
const LANES = 4;

async function runCase([id, input, press, expect]) {
  const page = await ctx.newPage();
  const scope = `#page-${id}`;
  try {
    await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(800);

    /* 칸이 여러 개인 도구 (TASK-KL-089).
     * 계산기는 대개 값을 둘 이상 받는다(키·몸무게처럼). 첫 칸 하나만 채우던 때는 그런 도구의
     * **답이 맞는지**를 볼 수가 없어서, 화면이 바뀌는지만 보고 넘어갔다 — 틀린 답을 내도 통과한다.
     * 칸을 옆에 적힌 이름으로 찾아 채운다. 이름은 label·aria-label·placeholder 중 아무거나. */
    // 「달라지는가」로 보는 도구는 넣기 전 화면을 먼저 담아 둔다.
    const before = expect === CHANGES ? await page.$eval(scope, (e) => e.innerText || '') : null;

    if (Array.isArray(input)) {
      for (const [label, value] of input) {
        const done = await page.evaluate(
          ({ s, label, value }) => {
            const root = document.querySelector(s);
            const fields = [...root.querySelectorAll('input, textarea')].filter((e) => e.getBoundingClientRect().height > 0);
            const nameOf = (e) => {
              const own = (e.getAttribute('aria-label') || '') + ' ' + (e.placeholder || '');
              const lab = e.closest('label') || (e.id && root.querySelector(`label[for="${e.id}"]`));
              const near = e.parentElement ? e.parentElement.textContent || '' : '';
              return (own + ' ' + (lab ? lab.textContent : '') + ' ' + near).replace(/\s+/g, ' ');
            };
            const hit = fields.find((e) => nameOf(e).includes(label));
            if (!hit) return false;
            hit.focus();
            hit.value = value;
            hit.dispatchEvent(new Event('input', { bubbles: true }));
            hit.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          },
          { s: scope, label, value }
        );
        if (!done) throw new Error(`「${label}」 칸을 못 찾았다`);
      }
    } else {
      const field = await page.$(
        `${scope} textarea, ${scope} input[type="text"], ${scope} input[type="number"], ${scope} input:not([type]), ${scope} input[type="date"]`
      );
      if (!field) throw new Error('값을 넣을 곳이 없다');
      if (expect === CHANGES && (await field.inputValue()) === input) {
        throw new Error('넣으려는 값이 기본값과 같다 — 다른 값으로 바꿔야 뜻이 있다');
      }
      await field.fill(input);
    }

    if (press) {
      const hit = await page.evaluate(
        ({ s, label }) => {
          const el = [...document.querySelector(s).querySelectorAll('button, label, .btn, input[type="checkbox"]')].find(
            (e) => (e.textContent || '').trim().includes(label) || (e.getAttribute('aria-label') || '').includes(label)
          );
          if (!el) return false;
          el.click();
          return true;
        },
        { s: scope, label: press }
      );
      if (!hit) throw new Error(`「${press}」 를 못 찾았다`);
    }
    await page.waitForTimeout(1000);

    if (expect === CHANGES) {
      const now = await page.$eval(scope, (e) => e.innerText || '');
      if (now === before) throw new Error('값을 바꿔도 화면이 그대로다');
    } else {
      // 결과가 화면 글자로 나오는 도구도, 결과칸 안에 담기는 도구도 있다 — 둘 다 본다.
      const blob = await page.$eval(scope, (e) => `${e.innerText || ''}\n${[...e.querySelectorAll('input, textarea')].map((x) => x.value || '').join('\n')}`);
      /* 넣은 값이 그대로 비친 것을 답으로 착각하지 않으려고 지운다. 다만 **짧은 값은 지우면
       * 안 된다** — 「1」을 지우면 답 1,000,000,000 도 함께 뭉개져 「답이 없다」가 된다
       * (실제로 용량 도구에서 그랬다). 세 글자 이상일 때만 지운다. */
      const typed = Array.isArray(input) ? '' : input;
      const after = typed.length >= 3 ? blob.split(typed).join('') : blob;
      if (!expect.test(after)) throw new Error(`넣어도 답이 안 나온다 — ${after.replace(/\s+/g, ' ').trim().slice(0, 70)}`);
    }
    process.stdout.write('.');
  } catch (e) {
    failures.push(`${id}: ${String(e.message).slice(0, 90)}`);
    process.stdout.write('x');
  }
  await page.close();
}

const queue = [...cases];
await Promise.all(
  Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) break;
      await runCase(c);
    }
  })
);

process.stdout.write('\n');
await browser.close();

if (failures.length) {
  console.error(`[smoke-tool-behavior] 답이 안 나오는 도구 ${failures.length}건 / ${cases.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-tool-behavior] ${cases.length}개 도구가 넣은 값에 답을 낸다`);
