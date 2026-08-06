/**
 * 비밀번호 만들기·확인 (TASK-KL-088)
 *
 * 「비밀번호 강도」를 봐 주는 사이트는 많은데, 거기에 진짜 쓰는 비밀번호를 넣는 건 위험하다.
 * 여기서는 **아무것도 보내지 않는다** — 그래서 마음 놓고 넣을 수 있다.
 *
 * 강도를 색깔로만 알려 주면 아무 도움이 안 된다. 「얼마나 버티나」를 시간으로 말해 주고,
 * 왜 약한지(자판 순서·반복·연도·흔한 낱말)를 짚어 준다. 사람은 이유를 알아야 고친다.
 */
(function (): void {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // l 제외
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외
  const DIGIT = '23456789'; // 0, 1 제외
  const SYMBOL = '!@#$%^&*-_=+?';
  const AMBIG = 'lIO01';

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

  /** 사람이 알아볼 만한 약점을 찾는다. */
  function weaknesses(pw: string): string[] {
    const found: string[] = [];
    const low = pw.toLowerCase();
    if (/(.)\1{2,}/.test(pw)) found.push('같은 글자가 세 번 이상 이어집니다');
    if (/(012|123|234|345|456|567|678|789|890)/.test(pw)) found.push('숫자가 순서대로 이어집니다');
    if (/(qwer|asdf|zxcv|wasd|1qaz|qaz|wsx)/i.test(pw)) found.push('자판에서 나란한 글자를 씁니다');
    if (/(19|20)\d{2}/.test(pw)) found.push('연도처럼 보이는 숫자가 있습니다 — 생일·졸업연도는 가장 먼저 시도됩니다');
    for (const c of COMMON) if (low.includes(c)) found.push(`흔한 낱말 「${c}」 이 들어 있습니다`);
    if (/^[a-z]+\d{1,4}!?$/i.test(pw)) found.push('「낱말 + 숫자」 꼴은 가장 흔한 모양입니다');
    return found;
  }

  /** 몇 가지를 섞어 썼는지로 후보 개수를 재고, 거기서 버티는 시간을 어림한다. */
  function strength(pw: string): { bits: number; label: string; time: string; tone: string } {
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
    const bits = pw.length ? Math.log2(Math.max(pool, 2)) * pw.length : 0;
    // 약점이 있으면 실제로는 훨씬 빨리 뚫린다 — 그만큼 깎는다
    const penalty = weaknesses(pw).length * 12;
    const real = Math.max(0, bits - penalty);

    // 초당 100억 번 시도(요즘 그래픽카드 여러 대) 기준
    const seconds = Math.pow(2, real - 1) / 1e10;
    const time =
      seconds < 1 ? '1초 안에' :
      seconds < 60 ? `${Math.round(seconds)}초` :
      seconds < 3600 ? `${Math.round(seconds / 60)}분` :
      seconds < 86400 ? `${Math.round(seconds / 3600)}시간` :
      seconds < 2592000 ? `${Math.round(seconds / 86400)}일` :
      seconds < 31536000 ? `${Math.round(seconds / 2592000)}달` :
      seconds < 31536000000 ? `${Math.round(seconds / 31536000)}년` :
      '수백 년 넘게';

    const label = real < 40 ? '약함' : real < 60 ? '보통' : real < 80 ? '강함' : '아주 강함';
    const tone = real < 40 ? 'error' : real < 60 ? '' : 'ok';
    return { bits: Math.round(real), label, time, tone };
  }

  Toolbox.register({
    id: 'passgen',
    title: '비밀번호 만들기·확인',
    category: 'tool',
    desc: '안전한 비밀번호를 만들고, 쓰던 것이 얼마나 버티는지 확인합니다. 아무것도 전송하지 않습니다',
    layout: 'wide',
    icon: '<rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/>',
    tabs: [
      {
        id: 'make',
        label: '만들기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-display" id="pgOut" style="word-break:break-all; user-select:all;">—</div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">길이 <span id="pgLenVal" class="range-value">20자</span></div>
              <input type="range" id="pgLen" aria-label="길이" min="8" max="64" value="20">
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="pgUpper" checked> 대문자</label>
                <label class="tool-chip"><input type="checkbox" id="pgDigit" checked> 숫자</label>
                <label class="tool-chip"><input type="checkbox" id="pgSym" checked> 기호</label>
                <label class="tool-chip"><input type="checkbox" id="pgAmbig" checked> 헷갈리는 글자 빼기 (l, I, O, 0, 1)</label>
              </div>
            </div>

            <div class="cc-stats" id="pgStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="pgMake">새로 만들기</button>
              <button class="btn btn-ghost" id="pgCopy">복사</button>
            </div>

            <div class="tool-status" id="pgStatus">이 비밀번호는 이 브라우저 안에서 만들어지고 어디에도 보내지지 않습니다.</div>
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

          function make(): void {
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
              stat('세기', s.label, true) + stat('버티는 시간', s.time) + stat('쓰는 글자 종류', `${pool.length}가지`);
            $<HTMLElement>('#pgLenVal').textContent = len + '자';
            say('만들었어요. 눌러서 복사하세요 — 이 값은 어디에도 보내지지 않습니다.', 'ok');
            Toolbox.trackUse?.('make');
          }

          lenEl.addEventListener('input', make);
          ['#pgUpper', '#pgDigit', '#pgSym', '#pgAmbig'].forEach((s) => $<HTMLInputElement>(s).addEventListener('change', make));
          $<HTMLButtonElement>('#pgMake').onclick = make;
          $<HTMLButtonElement>('#pgCopy').onclick = () => {
            void Toolbox.copyText?.(out.textContent || '', { message: '비밀번호를 복사했어요' });
          };
          make();
        }
      },
      {
        id: 'check',
        label: '확인하기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="pcIn">확인할 비밀번호</label>
              <input type="text" id="pcIn" spellcheck="false" autocomplete="off" placeholder="여기에 적어 보세요 — 어디에도 보내지 않습니다">
            </div>

            <div class="cc-stats" id="pcStats"></div>
            <div class="tool-list" id="pcWhy"></div>

            <div class="tool-status" id="pcStatus">적은 값은 이 브라우저 밖으로 나가지 않습니다 — 통신이 일어나지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLInputElement>('#pcIn');
          const stats = $<HTMLElement>('#pcStats');
          const whyEl = $<HTMLElement>('#pcWhy');
          const status = $<HTMLElement>('#pcStatus');

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function refresh(): void {
            const pw = input.value;
            if (!pw) {
              stats.innerHTML = '';
              whyEl.innerHTML = '';
              status.textContent = '적은 값은 이 브라우저 밖으로 나가지 않습니다 — 통신이 일어나지 않습니다.';
              status.className = 'tool-status';
              return;
            }
            const s = strength(pw);
            stats.innerHTML = stat('세기', s.label, true) + stat('버티는 시간', s.time) + stat('길이', `${pw.length}자`);
            const found = weaknesses(pw);
            whyEl.innerHTML = found.length
              ? found
                  .map((w) => `<div class="tool-list-row"><span class="tool-list-key">약점</span><span class="tool-list-val">${esc(w)}</span></div>`)
                  .join('')
              : '<div class="tool-list-row"><span class="tool-list-val">눈에 띄는 약점은 없습니다.</span></div>';
            status.textContent =
              s.tone === 'error'
                ? '지금 쓰는 곳이 있다면 바꾸는 것이 좋습니다. 길이를 늘리는 것이 가장 크게 듣습니다.'
                : s.tone === 'ok'
                  ? '충분히 튼튼합니다. 다만 같은 것을 여러 곳에 쓰지는 마세요.'
                  : '나쁘지 않지만 길이를 조금 더 늘리면 훨씬 좋아집니다.';
            status.className = 'tool-status' + (s.tone ? ' ' + s.tone : '');
            Toolbox.trackUse?.('check');
          }

          input.addEventListener('input', refresh);
          refresh();
        }
      }
    ]
  });
})();
