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
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  interface Rule {
    id: string;
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
      re: /\b(\d{6})[-\s]?([1-4]\d{6})\b/g,
      // 뒷자리 첫 글자는 성별 자리(1~4)다. 앞 6자리도 날짜여야 한다 — 아니면 그냥 숫자다
      accept: (m) => {
        const d = m.replace(/\D/g, '');
        const mm = Number(d.slice(2, 4));
        const dd = Number(d.slice(4, 6));
        return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
      }
    },
    { id: 'phone', re: /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g },
    { id: 'card', re: /\b(?:\d[ -]?){12,18}\d\b/g, accept: luhn },
    { id: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
    { id: 'account', re: /\b\d{2,3}-\d{2,6}-\d{2,6}(?:-\d{1,3})?\b/g },
    { id: 'ip', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, accept: (m) => m.split('.').every((p) => Number(p) <= 255) },
    { id: 'token', re: /\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}\b/g },
    { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g }
  ];

  Toolbox.register({
    id: 'textredact',
    title: t('widgets.textredact.title', undefined, '글자 가리개'),
    category: 'tool',
    desc: t(
      'widgets-desc.textredact.desc',
      undefined,
      '로그·문서에서 주민번호·전화·카드번호를 찾아 지웁니다. 무엇을 찾았는지 보여 줍니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 5h16M4 9h16M4 13h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="14" y="15" width="7" height="4" rx="1" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('textredact.tab', undefined, '글자 가리기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('textredact').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /* 이름표는 **쓸 때** 붙인다 — 규칙 표에 박아 두면 말 묶음이 오기 전에 한국어로 굳는다.
   * 찾는 꼴 자체가 한국 것(주민번호·010)이라 다른 언어 이름표에는 *어느 나라 것인지*를 적었다. */
  const kindName = (r: Rule): string => t(`textredact.kind.${r.id}`);

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="txIn">${esc(t('textredact.label.in'))}</label>
              <textarea id="txIn" rows="8" spellcheck="false" style="width:100%;" placeholder="${esc(t('textredact.ph.in'))}"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-sublabel">${esc(t('textredact.label.kinds'))}</div>
              <div class="tool-chips" id="txKinds">
                ${RULES.map(
                  (r) =>
                    `<label class="tool-chip"><input type="checkbox" data-kind="${r.id}" checked> ${esc(
                      kindName(r)
                    )} <span class="tool-list-dim" id="txN-${r.id}">0</span></label>`
                ).join('')}
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('textredact.label.style'))}</div>
                  <select id="txStyle" aria-label="${esc(t('textredact.label.style'))}">
                    <option value="kind">${esc(t('textredact.style.kind'))}</option>
                    <option value="mask">${esc(t('textredact.style.mask'))}</option>
                    <option value="drop">${esc(t('textredact.style.drop'))}</option>
                  </select>
                </div>
                <div class="tool-chips" style="align-content:end;">
                  <label class="tool-chip"><input type="checkbox" id="txSame" checked> ${esc(t('textredact.opt.same'))}</label>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="txStats"></div>

            <div class="field-group">
              <label class="field-label" for="txOut">${esc(t('textredact.label.out'))}</label>
              <textarea id="txOut" rows="10" spellcheck="false" style="width:100%;" readonly></textarea>
              <button class="btn btn-ghost btn-sm" id="txCopy" style="margin-top:8px;">${esc(t('textredact.btn.copy'))}</button>
            </div>

            <div class="tool-list" id="txFound"></div>

            <div class="tool-status" id="txStatus">${esc(t('textredact.status.idle'))}</div>
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

          /** 숫자·글자는 별표로, 구분선(-)은 남긴다 — 어떤 꼴이었는지는 보이는 편이 낫다 */
          const maskOf = (m: string): string => m.replace(/[^\s\-.@]/g, '*');

          function run(): void {
            const text = input.value;
            if (!text) {
              out.value = '';
              stats.innerHTML = '';
              foundEl.innerHTML = '';
              RULES.forEach((r) => ($<HTMLElement>('#txN-' + r.id).textContent = '0'));
              say(t('textredact.say.paste'));
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
                sameNum ? `[${kindName(h.rule)}${n}]` : `[${kindName(h.rule)}]`;
              at = h.end;
            }
            result += text.slice(at);
            out.value = result;

            const total = hits.length;
            stats.innerHTML =
              stat(t('textredact.stat.removed'), t('textredact.value.count', { n: total }), true) +
              stat(t('textredact.stat.distinct'), t('textredact.value.count', { n: seen.size })) +
              stat(
                t('textredact.stat.skipped'),
                t('textredact.value.count', {
                  n: Object.values(counts).reduce((a, b) => a + b, 0) - total
                })
              );

            // 무엇을 지웠는지 보여 준다 — 조용히 바꿔 버리면 맞게 지웠는지 확인할 길이 없다
            foundEl.innerHTML = seen.size
              ? [...seen.entries()]
                  .map(([v, n]) => {
                    const found = hits.find((h) => h.text === v);
                    const kind = found ? kindName(found.rule) : '';
                    const shown = v.length > 6 ? v.slice(0, 3) + '…' + v.slice(-2) : v;
                    return `<div class="tool-list-row"><span class="tool-list-key">${kind}${n}</span><span class="tool-list-val">${esc(shown)}</span></div>`;
                  })
                  .join('')
              : `<div class="tool-list-row"><span class="tool-list-val">${esc(
                  t('textredact.found.none')
                )}</span></div>`;

            // 「도구가 다 지워 줬겠지」가 가장 위험하다
            if (total) say(t('textredact.say.done', { n: total }), 'ok');
            else say(t('textredact.say.nothing'), 'error');
            Toolbox.trackUse?.('redact');
          }

          input.addEventListener('input', run);
          $<HTMLSelectElement>('#txStyle').addEventListener('change', run);
          $<HTMLInputElement>('#txSame').addEventListener('change', run);
          container.querySelectorAll('#txKinds input[data-kind]').forEach((el) => el.addEventListener('change', run));
          $<HTMLButtonElement>('#txCopy').onclick = () => {
            void Toolbox.copyText?.(out.value, { message: t('textredact.copy.done') });
          };
          run();
  }
})();
