/**
 * 비밀번호 만들기·확인 (TASK-KL-088)
 *
 * 「비밀번호 강도」를 봐 주는 사이트는 많은데, 거기에 진짜 쓰는 비밀번호를 넣는 건 위험하다.
 * 여기서는 **아무것도 보내지 않는다** — 그래서 마음 놓고 넣을 수 있다.
 *
 * 강도를 색깔로만 알려 주면 아무 도움이 안 된다. 「얼마나 버티나」를 시간으로 말해 주고,
 * 왜 약한지(자판 순서·반복·연도·흔한 낱말)를 짚어 준다. 사람은 이유를 알아야 고친다.
 */
import { analyze, type ChunkKind } from '../../core/passgen';
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // l 제외
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외
  const DIGIT = '23456789'; // 0, 1 제외
  const SYMBOL = '!@#$%^&*-_=+?';
  const AMBIG = 'lIO01';

  /**
   * 외우기 쉬운 비밀번호 — **발음되는 조각**을 이어 만든다.
   *
   * 왜 있나: 무작위 20자는 안전하지만 아무도 못 외운다. 그래서 사람들은 적어 두거나 짧게 바꾼다.
   *
   * 낱말 사전을 쓰는 방식(diceware)도 있지만, 사전이 작으면 **길어 보여도 실제로는 약하다**
   * (낱말 50개로 4개를 이으면 6억 가지뿐 — 무작위 5자보다 못하다). 사전을 크게 넣으면 이 도구가
   * 무거워진다. 그래서 자음+모음 조각을 그 자리에서 만들어 잇는다 — 조각 하나가 20×6×21 = 2,520
   * 가지라 넷만 이어도 사전 방식보다 세고, 소리 내어 읽히므로 외워진다.
   */
  const CONS = 'bcdfghjklmnprstvwyz';
  const VOWEL = 'aeiou';

  /** 조각 하나: 자음 + 모음 + (끝자음 또는 없음). 몇 가지가 나오는지 함께 돌려준다. */
  function syllable(r: Uint32Array, i: number): string {
    const c = CONS[r[i * 3] % CONS.length];
    const v = VOWEL[r[i * 3 + 1] % VOWEL.length];
    const t = r[i * 3 + 2] % (CONS.length + 1);
    return c + v + (t === CONS.length ? '' : CONS[t]);
  }
  const SYLLABLE_SPACE = CONS.length * VOWEL.length * (CONS.length + 1);

  /** 흔한 비밀번호 조각 — 이게 들어가면 길이와 무관하게 금방 뚫린다. */
  const COMMON = ['password', 'qwerty', 'admin', '1234', 'iloveyou', 'letmein', 'welcome', 'dragon', 'monkey', 'abc123', 'asdf', 'zxcv'];

  function pick(pool: string, n: number): string {
    const bytes = new Uint32Array(n);
    crypto.getRandomValues(bytes);
    let out = '';
    // 나머지 연산으로 고르면 앞쪽 글자가 조금 더 자주 나온다. 편향을 없애려면 버리고 다시 뽑아야 한다.
    for (let i = 0; i < n; i++) {
      let v = bytes[i];
      const limit = Math.floor(4294967296 / pool.length) * pool.length;
      while (v >= limit) {
        const again = new Uint32Array(1);
        crypto.getRandomValues(again);
        v = again[0];
      }
      out += pool[v % pool.length];
    }
    return out;
  }

  /**
   * 「몇 초 버틴다」를 사람 말로 (TASK-KL-203).
   *
   * 초·분·시간·일·달·년을 손으로 적지 않는다 — `Intl` 이 **모든 언어의 단위 이름**을 안다.
   * 손으로 적으면 언어를 늘릴 때마다 여섯 개를 또 옮겨야 하고, 복수형이 갈리는 언어에서 틀린다
   * (1 hour / 2 hours). 브라우저에 맡기면 그 규칙이 공짜로 따라온다.
   */
  function humanDuration(seconds: number): string {
    const steps: Array<[string, number]> = [
      ['year', 31536000],
      ['month', 2592000],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1]
    ];
    for (const [unit, size] of steps) {
      if (seconds < size && unit !== 'second') continue;
      const n = Math.round(seconds / size);
      try {
        return new Intl.NumberFormat(locale(), {
          style: 'unit',
          unit,
          unitDisplay: 'long',
          maximumFractionDigits: 0
        } as Intl.NumberFormatOptions).format(n);
      } catch {
        return `${n} ${unit}`;
      }
    }
    return '';
  }

  /** 알맹이가 낸 열쇠 → 이 화면의 말. 문장끼리 비교하지 않는다(문장은 언어마다 다르다). */
  const WEAK_KEY: Partial<Record<ChunkKind, string>> = {
    repeat: 'passgen.weak.repeat',
    sequence: 'passgen.weak.sequence',
    keyboard: 'passgen.weak.keyboard',
    year: 'passgen.weak.year'
  };

  /**
   * 약점 목록. **점수와 같은 판정에서 나온다** — 알맹이가 싸게 매긴 바로 그 덩어리들이다.
   *
   * 예전에는 여기서 따로 정규식을 돌렸다. 그러면 「약점 없음」인데 점수는 깎이거나 그 반대가
   * 되고, 사람은 무엇을 고쳐야 할지 알 수 없다. 이유와 숫자는 같은 자리에서 나와야 한다.
   */
  function weaknesses(pw: string): string[] {
    if (pw === '') return [];
    const found: string[] = [];
    for (const c of analyze(pw).chunks) {
      if (c.kind === 'common') {
        found.push(t('passgen.weak.common', { word: c.text }));
        continue;
      }
      const key = WEAK_KEY[c.kind];
      if (key !== undefined) found.push(t(key));
    }
    if (/^[a-z]+\d{1,4}!?$/i.test(pw)) found.push(t('passgen.weak.wordDigit'));
    return [...new Set(found)];
  }

  function labelForScore(score: number): string {
    return score <= 1
      ? t('passgen.level.weak')
      : score === 2
        ? t('passgen.level.fair')
        : score === 3
          ? t('passgen.level.strong')
          : t('passgen.level.veryStrong');
  }

  /**
   * 세기. **계산은 `core/passgen` 이 한다** — 이 화면과 MCP(`passgen_strength`)가 같은 값을
   * 내야 하기 때문이다. 갈리면 「사이트는 강하다는데 에이전트는 약하다더라」가 된다.
   *
   * 여기 있던 옛 계산(글자 종류 풀^길이 − 약점당 12비트)은 버렸다. 그 방식은 `Password1!` 을
   * 통과시키고 긴 낱말묶음을 탈락시킨다 — 정확히 거꾸로였다.
   */
  function strength(pw: string): { bits: number; label: string; time: string; tone: string } {
    const analyzed = pw === '' ? null : analyze(pw);
    const real = analyzed?.bits ?? 0;
    const score = analyzed?.score ?? 0;

    // 초당 100억 번 시도(요즘 그래픽카드 여러 대) 기준
    const seconds = Math.pow(2, real - 1) / 1e10;
    const time =
      seconds < 1
        ? t('passgen.time.instant')
        : seconds >= 31536000000
          ? t('passgen.time.centuries')
          : humanDuration(seconds);

    const label = labelForScore(score);
    const tone = real < 40 ? 'error' : real < 60 ? '' : 'ok';
    return { bits: Math.round(real), label, time, tone };
  }

  Toolbox.register({
    id: 'passgen',
    title: '비밀번호 만들기·확인',
    category: 'tool',
    /* 도구 큰제목 아래 한 줄도 이 값을 쓴다 — 등록 순간이라 원본을 기본값으로 함께 준다. */
    desc: t('widgets-desc.passgen.desc', undefined, '안전한 비밀번호를 만들고, 쓰던 것이 얼마나 버티는지 확인합니다. 아무것도 전송하지 않습니다'),
    layout: 'wide',
    icon: '<rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/>',
    tabs: [
      {
        id: 'make',
        /* 등록 순간에 쓰인다 — 원본을 기본값으로 함께 준다. */
        label: t('passgen.tab', undefined, '만들기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('passgen').then(function () {
            drawMake(container);
          });
        }
      },
      {
        id: 'check',
        label: t('passgen.check.tab', undefined, '확인하기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('passgen').then(function () {
            drawCheck(container);
          });
        }
      }
    ]
  });

  function drawMake(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="tool-display" id="pgOut" style="word-break:break-all; user-select:all;">—</div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('passgen.label.length'))} <span id="pgLenVal" class="range-value">${esc(t('passgen.label.lengthValue', { n: 20 }))}</span></div>
              <input type="range" id="pgLen" aria-label="${esc(t('passgen.label.length'))}" min="8" max="64" value="20">
              <div class="tool-chips" id="pgMode" style="margin-bottom:10px;">
                <button type="button" class="tool-chip active" data-mode="random">${esc(t('passgen.mode.random'))}</button>
                <button type="button" class="tool-chip" data-mode="words">${esc(t('passgen.mode.words'))}</button>
              </div>
              <div class="tool-chips" id="pgRandomOpts" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="pgUpper" checked> ${esc(t('passgen.opt.upper'))}</label>
                <label class="tool-chip"><input type="checkbox" id="pgDigit" checked> ${esc(t('passgen.opt.digit'))}</label>
                <label class="tool-chip"><input type="checkbox" id="pgSym" checked> ${esc(t('passgen.opt.symbol'))}</label>
                <label class="tool-chip"><input type="checkbox" id="pgAmbig" checked> ${esc(t('passgen.opt.ambiguous'))}</label>
              </div>
              <div id="pgWordOpts" style="display:none; margin-top:10px;">
                <div class="tool-sublabel">${esc(t('passgen.label.chunks'))} <span id="pgWordsVal" class="range-value">${esc(t('passgen.label.chunksValue', { n: 4 }))}</span></div>
                <input type="range" id="pgWords" aria-label="${esc(t('passgen.label.chunks'))}" min="3" max="8" value="5">
                <div class="tool-status" style="margin-top:8px;">조각 사이는 - 로 잇고 끝에 숫자 두 자를 붙입니다. 소리 내어 읽히므로 외워집니다.</div>
              </div>
            </div>

            <div class="cc-stats" id="pgStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="pgMake">${esc(t('passgen.btn.make'))}</button>
              <button class="btn btn-ghost" id="pgCopy">${esc(t('passgen.btn.copy'))}</button>
            </div>

            <div class="tool-status" id="pgStatus">${esc(t('passgen.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const out = $<HTMLElement>('#pgOut');
          const lenEl = $<HTMLInputElement>('#pgLen');
          const stats = $<HTMLElement>('#pgStats');
          const status = $<HTMLElement>('#pgStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          let mode: 'random' | 'words' = 'random';

          /** 낱말을 이어 만든다 — 무작위 뽑기는 암호용 난수(crypto)로 한다. */
          function makeWords(): void {
            const n = parseInt($<HTMLInputElement>('#pgWords').value, 10);
            const r = new Uint32Array(n * 3 + 1);
            crypto.getRandomValues(r);
            const parts = [];
            for (let i = 0; i < n; i++) parts.push(syllable(r, i));
            const tail = String(r[n * 3] % 100).padStart(2, '0');
            const pw = parts.join('-') + '-' + tail;
            out.textContent = pw;
            /* 세기는 글자 수가 아니라 **고른 가짓수**로 센다 — 조각 하나가 SYLLABLE_SPACE 가지다.
               글자 기준으로 재면 이 방식이 실제보다 약해 보인다(길지만 소문자뿐이라서). */
            const bits = Math.log2(Math.pow(SYLLABLE_SPACE, n) * 100);
            const 초 = Math.pow(2, bits - 1) / 1e10;
            const 년 = 초 / 3.15e7;
            const 시간말 =
              년 > 1e6
                ? t('passgen.time.eons', { n: (년 / 1e8).toExponential(1) })
                : humanDuration(초);
            stats.innerHTML =
              stat(t('passgen.stat.strength'), bits >= 80 ? t('passgen.level.veryStrong2') : bits >= 60 ? t('passgen.level.strong2') : bits >= 45 ? t('passgen.level.fair') : t('passgen.level.weak'), true) +
              stat(t('passgen.stat.holdsFor'), 시간말) +
              stat(t('passgen.stat.space'), `${SYLLABLE_SPACE.toLocaleString(locale())}^${n} × 100`);
            $<HTMLElement>('#pgWordsVal').textContent = t('passgen.label.chunksValue', { n });
            say(t('passgen.status.madeWords'), 'ok');
            Toolbox.trackUse?.('words');
          }

          function make(): void {
            if (mode === 'words') { makeWords(); return; }
            const noAmbig = $<HTMLInputElement>('#pgAmbig').checked;
            let pool = noAmbig ? LOWER : LOWER + 'l';
            if ($<HTMLInputElement>('#pgUpper').checked) pool += noAmbig ? UPPER : UPPER + 'IO';
            if ($<HTMLInputElement>('#pgDigit').checked) pool += noAmbig ? DIGIT : DIGIT + '01';
            if ($<HTMLInputElement>('#pgSym').checked) pool += SYMBOL;
            const len = parseInt(lenEl.value, 10);
            const pw = pick(pool, len);
            out.textContent = pw;
            const s = strength(pw);
            stats.innerHTML =
              stat(t('passgen.stat.strength'), s.label, true) + stat(t('passgen.stat.holdsFor'), s.time) + stat(t('passgen.stat.charKinds'), t('passgen.stat.charKindsValue', { n: pool.length }));
            $<HTMLElement>('#pgLenVal').textContent = t('passgen.label.lengthValue', { n: len });
            say(t('passgen.status.made'), 'ok');
            Toolbox.trackUse?.('make');
          }

          $<HTMLElement>('#pgMode').addEventListener('click', (e: Event) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.tool-chip');
            if (!btn) return;
            mode = (btn.dataset.mode || 'random') as typeof mode;
            $<HTMLElement>('#pgMode').querySelectorAll('.tool-chip').forEach((c) => c.classList.toggle('active', c === btn));
            $<HTMLElement>('#pgRandomOpts').style.display = mode === 'random' ? '' : 'none';
            $<HTMLElement>('#pgWordOpts').style.display = mode === 'words' ? '' : 'none';
            $<HTMLElement>('#pgLenVal').parentElement!.style.display = mode === 'random' ? '' : 'none';
            lenEl.style.display = mode === 'random' ? '' : 'none';
            make();
          });
          $<HTMLInputElement>('#pgWords').addEventListener('input', make);
          lenEl.addEventListener('input', make);
          ['#pgUpper', '#pgDigit', '#pgSym', '#pgAmbig'].forEach((s) => $<HTMLInputElement>(s).addEventListener('change', make));
          $<HTMLButtonElement>('#pgMake').onclick = make;
          $<HTMLButtonElement>('#pgCopy').onclick = () => {
            void Toolbox.copyText?.(out.textContent || '', { message: '비밀번호를 복사했어요' });
          };
          make();
  }

  function drawCheck(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="pcIn">${esc(t('passgen.check.label'))}</label>
              <input type="text" id="pcIn" spellcheck="false" autocomplete="off" placeholder="${esc(t('passgen.check.placeholder'))}">
            </div>

            <div class="cc-stats" id="pcStats"></div>
            <div class="tool-list" id="pcWhy"></div>

            <div class="tool-status" id="pcStatus">${esc(t('passgen.check.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLInputElement>('#pcIn');
          const stats = $<HTMLElement>('#pcStats');
          const whyEl = $<HTMLElement>('#pcWhy');
          const status = $<HTMLElement>('#pcStatus');

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function refresh(): void {
            const pw = input.value;
            if (!pw) {
              stats.innerHTML = '';
              whyEl.innerHTML = '';
              status.textContent = t('passgen.check.idle');
              status.className = 'tool-status';
              return;
            }
            const s = strength(pw);
            stats.innerHTML = stat(t('passgen.stat.strength'), s.label, true) + stat(t('passgen.stat.holdsFor'), s.time) + stat(t('passgen.check.length'), t('passgen.check.lengthValue', { n: pw.length }));
            const found = weaknesses(pw);
            whyEl.innerHTML = found.length
              ? found
                  .map((w) => `<div class="tool-list-row"><span class="tool-list-key">${esc(t('passgen.check.weakness'))}</span><span class="tool-list-val">${esc(w)}</span></div>`)
                  .join('')
              : `<div class="tool-list-row"><span class="tool-list-val">${esc(t('passgen.check.noWeakness'))}</span></div>`;
            status.textContent =
              s.tone === 'error'
                ? t('passgen.check.adviceWeak')
                : s.tone === 'ok'
                  ? t('passgen.check.adviceStrong')
                  : t('passgen.check.adviceFair');
            status.className = 'tool-status' + (s.tone ? ' ' + s.tone : '');
            Toolbox.trackUse?.('check');
          }

          input.addEventListener('input', refresh);
          refresh();
  }
})();
