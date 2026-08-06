/**
 * 글자 가리개 — 로그·문서에서 개인정보 찾아 지우기 (TASK-KL-088)
 *
 * 오류 로그나 문서를 남에게 보낼 때 그 안에 주민번호·전화번호·카드번호가 섞여 있는 일이 잦다.
 * 눈으로 훑어 지우면 꼭 하나가 남는다 — 긴 로그일수록 그렇다.
 *
 * 신경 쓴 곳 — **찾은 것을 보여 준다.**
 *  - 무엇을 몇 개 찾았는지 종류별로 적는다. 조용히 바꿔 버리면 맞게 지웠는지 확인할 방법이 없다.
 *  - 카드번호는 검사식(Luhn)까지 본다. 16자리 숫자를 전부 카드로 몰면 주문번호까지 지워진다.
 *  - 주민번호는 날짜·생년월일 꼴과 헷갈리기 쉬워, 뒷자리 첫 글자가 성별 자리인지까지 본다.
 *  - **자동 탐지는 놓칠 수 있다**고 분명히 말한다. 「도구가 다 지워 줬겠지」가 가장 위험하다.
 */
(function (): void {
  interface Rule {
    id: string;
    label: string;
    re: RegExp;
    /** 진짜인지 한 번 더 보는 자리 — 숫자 뭉치를 무턱대고 지우지 않기 위해 */
    accept?: (m: string) => boolean;
  }

  /** 카드번호 검사식 — 이걸 안 보면 16자리 주문번호까지 카드로 몰린다 */
  function luhn(s: string): boolean {
    const d = s.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  const RULES: Rule[] = [
    {
      id: 'rrn',
      label: '주민등록번호',
      re: /\b(\d{6})[-\s]?([1-4]\d{6})\b/g,
      // 뒷자리 첫 글자는 성별 자리(1~4)다. 앞 6자리도 날짜여야 한다 — 아니면 그냥 숫자다
      accept: (m) => {
        const d = m.replace(/\D/g, '');
        const mm = Number(d.slice(2, 4));
        const dd = Number(d.slice(4, 6));
        return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
      }
    },
    { id: 'phone', label: '전화번호', re: /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g },
    { id: 'card', label: '카드번호', re: /\b(?:\d[ -]?){12,18}\d\b/g, accept: luhn },
    { id: 'email', label: '이메일', re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
    { id: 'account', label: '계좌번호', re: /\b\d{2,3}-\d{2,6}-\d{2,6}(?:-\d{1,3})?\b/g },
    { id: 'ip', label: 'IP 주소', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, accept: (m) => m.split('.').every((p) => Number(p) <= 255) },
    { id: 'token', label: '열쇠·토큰', re: /\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}\b/g },
    { id: 'jwt', label: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g }
  ];

  Toolbox.register({
    id: 'textredact',
    title: '글자 가리개',
    category: 'tool',
    desc: '로그·문서에서 주민번호·전화·카드번호를 찾아 지웁니다. 무엇을 찾았는지 보여 줍니다',
    layout: 'wide',
    icon: '<path d="M4 5h16M4 9h16M4 13h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="14" y="15" width="7" height="4" rx="1" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '글자 가리기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="txIn">붙여넣을 글 — 로그·문서 그대로 넣으세요</label>
              <textarea id="txIn" rows="8" spellcheck="false" style="width:100%;" placeholder="오류 로그나 문서를 그대로 붙여 넣으면, 개인정보로 보이는 것을 찾아 표시합니다."></textarea>
            </div>

            <div class="field-group">
              <div class="tool-sublabel">지울 종류 — 찾은 개수가 옆에 나옵니다</div>
              <div class="tool-chips" id="txKinds">
                ${RULES.map(
                  (r) =>
                    `<label class="tool-chip"><input type="checkbox" data-kind="${r.id}" checked> ${r.label} <span class="tool-list-dim" id="txN-${r.id}">0</span></label>`
                ).join('')}
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">지우는 방법</div>
                  <select id="txStyle" aria-label="지우는 방법">
                    <option value="kind">종류로 바꾸기 — [전화번호]</option>
                    <option value="mask">별표로 가리기 — 010-****-****</option>
                    <option value="drop">통째로 지우기</option>
                  </select>
                </div>
                <div class="tool-chips" style="align-content:end;">
                  <label class="tool-chip"><input type="checkbox" id="txSame" checked> 같은 값은 같은 번호로</label>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="txStats"></div>

            <div class="field-group">
              <label class="field-label" for="txOut">지운 결과</label>
              <textarea id="txOut" rows="10" spellcheck="false" style="width:100%;" readonly></textarea>
              <button class="btn btn-ghost btn-sm" id="txCopy" style="margin-top:8px;">복사</button>
            </div>

            <div class="tool-list" id="txFound"></div>

            <div class="tool-status" id="txStatus">글은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#txIn');
          const out = $<HTMLTextAreaElement>('#txOut');
          const stats = $<HTMLElement>('#txStats');
          const foundEl = $<HTMLElement>('#txFound');
          const status = $<HTMLElement>('#txStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          /** 숫자·글자는 별표로, 구분선(-)은 남긴다 — 어떤 꼴이었는지는 보이는 편이 낫다 */
          const maskOf = (m: string): string => m.replace(/[^\s\-.@]/g, '*');

          function run(): void {
            const text = input.value;
            if (!text) {
              out.value = '';
              stats.innerHTML = '';
              foundEl.innerHTML = '';
              RULES.forEach((r) => ($<HTMLElement>('#txN-' + r.id).textContent = '0'));
              say('로그나 문서를 그대로 붙여 넣어 보세요.');
              return;
            }

            const on = new Set(
              Array.from(container.querySelectorAll('#txKinds input[data-kind]'))
                .filter((el) => (el as HTMLInputElement).checked)
                .map((el) => (el as HTMLElement).dataset.kind as string)
            );
            const style = $<HTMLSelectElement>('#txStyle').value;
            const sameNum = $<HTMLInputElement>('#txSame').checked;

            // 찾은 자리를 한 번에 모아 두고 뒤에서부터 바꾼다 — 앞에서 바꾸면 자리가 밀린다
            const hits: Array<{ start: number; end: number; text: string; rule: Rule }> = [];
            const counts: Record<string, number> = {};
            for (const rule of RULES) {
              counts[rule.id] = 0;
              rule.re.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = rule.re.exec(text)) !== null) {
                if (rule.accept && !rule.accept(m[0])) continue;
                counts[rule.id]++;
                if (!on.has(rule.id)) continue;
                // 이미 다른 종류가 먹은 자리는 건너뛴다 (계좌번호와 전화번호가 겹칠 수 있다)
                if (hits.some((h) => m!.index < h.end && m!.index + m![0].length > h.start)) continue;
                hits.push({ start: m.index, end: m.index + m[0].length, text: m[0], rule });
              }
            }
            RULES.forEach((r) => ($<HTMLElement>('#txN-' + r.id).textContent = String(counts[r.id])));

            hits.sort((a, b) => a.start - b.start);
            const seen = new Map<string, number>();
            let result = '';
            let at = 0;
            for (const h of hits) {
              if (h.start < at) continue;
              result += text.slice(at, h.start);
              let n = seen.get(h.text);
              if (n === undefined) {
                n = seen.size + 1;
                seen.set(h.text, n);
              }
              result +=
                style === 'drop' ? '' :
                style === 'mask' ? maskOf(h.text) :
                sameNum ? `[${h.rule.label}${n}]` : `[${h.rule.label}]`;
              at = h.end;
            }
            result += text.slice(at);
            out.value = result;

            const total = hits.length;
            stats.innerHTML =
              stat('지운 것', `${total}개`, true) +
              stat('서로 다른 값', `${seen.size}개`) +
              stat('찾았지만 끈 것', `${Object.values(counts).reduce((a, b) => a + b, 0) - total}개`);

            // 무엇을 지웠는지 보여 준다 — 조용히 바꿔 버리면 맞게 지웠는지 확인할 길이 없다
            foundEl.innerHTML = seen.size
              ? [...seen.entries()]
                  .map(([v, n]) => {
                    const kind = hits.find((h) => h.text === v)?.rule.label || '';
                    const shown = v.length > 6 ? v.slice(0, 3) + '…' + v.slice(-2) : v;
                    return `<div class="tool-list-row"><span class="tool-list-key">${kind}${n}</span><span class="tool-list-val">${esc(shown)}</span></div>`;
                  })
                  .join('')
              : '<div class="tool-list-row"><span class="tool-list-val">지운 것이 없습니다.</span></div>';

            // 「도구가 다 지워 줬겠지」가 가장 위험하다
            if (total) say(`${total}개를 지웠어요. 자동 탐지는 놓치는 것이 있으니 결과를 한 번 훑어 주세요.`, 'ok');
            else say('지울 것을 못 찾았어요. 그렇다고 없다는 뜻은 아니니 직접 확인해 주세요.', 'error');
            Toolbox.trackUse?.('redact');
          }

          input.addEventListener('input', run);
          $<HTMLSelectElement>('#txStyle').addEventListener('change', run);
          $<HTMLInputElement>('#txSame').addEventListener('change', run);
          container.querySelectorAll('#txKinds input[data-kind]').forEach((el) => el.addEventListener('change', run));
          $<HTMLButtonElement>('#txCopy').onclick = () => {
            void Toolbox.copyText?.(out.value, { message: '지운 글을 복사했어요' });
          };
          run();
        }
      }
    ]
  });
})();
