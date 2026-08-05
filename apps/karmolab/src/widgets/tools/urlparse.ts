/**
 * URL 인코딩·분해 (TASK-KL-088)
 *
 * 「%EC%95%88%EB%85%95」 를 읽으려 할 때와 긴 추적 파라미터가 붙은 링크를 정리할 때는
 * 사실 같은 도구가 필요하다 — 주소를 **조각으로 펼쳐** 보는 것. 인코딩 변환과 분해를 한 화면에 둔다.
 */
(function (): void {
  /** 광고·추적용으로만 붙는 파라미터 — 지워도 링크가 같은 곳을 가리킨다. */
  const TRACKING = /^(utm_|fbclid$|gclid$|igshid$|mc_eid$|mc_cid$|ref$|ref_src$|si$|_ga$|yclid$|msclkid$)/i;

  Toolbox.register({
    id: 'urlparse',
    title: 'URL 인코딩 · 분해',
    category: 'tool',
    desc: '한글이 깨진 주소를 되돌리고, 쿼리 파라미터를 펼쳐 보고, 추적 파라미터를 지웁니다',
    layout: 'wide',
    icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'URL',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">주소 또는 텍스트</label>
              <textarea id="upIn" rows="4" spellcheck="false" placeholder="https://example.com/검색?q=안녕&utm_source=news"></textarea>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="upDecode">디코딩 (%EC → 한글)</button>
              <button class="btn btn-ghost" id="upEncode">인코딩 (한글 → %EC)</button>
              <button class="btn btn-ghost" id="upStrip">추적 파라미터 제거</button>
              <button class="btn btn-ghost" id="upCopy">복사</button>
            </div>

            <div class="tool-list" id="upParts"></div>
            <div class="tool-status" id="upStatus">주소를 넣으면 조각으로 펼쳐 보여줍니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#upIn');
          const parts = $<HTMLElement>('#upParts');
          const status = $<HTMLElement>('#upStatus');
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const row = (k: string, v: string, dim = false): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}</span><span class="tool-list-val${dim ? ' tool-list-dim' : ''}">${esc(v)}</span></div>`;

          function analyze(): void {
            const raw = input.value.trim();
            if (!raw) {
              parts.innerHTML = '';
              status.textContent = '주소를 넣으면 조각으로 펼쳐 보여줍니다.';
              status.className = 'tool-status';
              return;
            }
            let u: URL;
            try {
              u = new URL(raw);
            } catch {
              parts.innerHTML = '';
              status.textContent = '온전한 주소가 아니에요 (http:// 로 시작해야 조각을 펼칠 수 있습니다). 인코딩 변환은 그대로 됩니다.';
              status.className = 'tool-status';
              return;
            }
            const rows = [
              row('프로토콜', u.protocol.replace(':', '')),
              row('호스트', u.hostname),
              u.port ? row('포트', u.port) : '',
              row('경로', decodeURIComponent(u.pathname)),
              u.hash ? row('해시', decodeURIComponent(u.hash)) : ''
            ];
            const qs = [...u.searchParams.entries()];
            qs.forEach(([k, v]) => {
              const track = TRACKING.test(k);
              rows.push(row(`? ${k}${track ? ' (추적)' : ''}`, v || '(빈 값)', track));
            });
            parts.innerHTML = rows.filter(Boolean).join('');
            const trackCount = qs.filter(([k]) => TRACKING.test(k)).length;
            status.textContent = `파라미터 ${qs.length}개${trackCount ? ` · 그중 추적용 ${trackCount}개` : ''}`;
            status.className = 'tool-status ok';
          }

          input.addEventListener('input', analyze);

          $<HTMLButtonElement>('#upDecode').onclick = () => {
            try {
              input.value = decodeURIComponent(input.value.replace(/\+/g, ' '));
            } catch {
              status.textContent = '디코딩할 수 없는 % 표기가 섞여 있어요.';
              status.className = 'tool-status error';
              return;
            }
            analyze();
            Toolbox.trackUse?.('decode');
          };
          $<HTMLButtonElement>('#upEncode').onclick = () => {
            input.value = encodeURI(input.value);
            analyze();
            Toolbox.trackUse?.('encode');
          };
          $<HTMLButtonElement>('#upStrip').onclick = () => {
            try {
              const u = new URL(input.value.trim());
              const drop = [...u.searchParams.keys()].filter((k) => TRACKING.test(k));
              drop.forEach((k) => u.searchParams.delete(k));
              input.value = u.toString();
              analyze();
              status.textContent = drop.length ? `${drop.length}개 지웠어요: ${drop.join(', ')}` : '지울 추적 파라미터가 없었어요.';
              status.className = 'tool-status ok';
              Toolbox.trackUse?.('strip');
            } catch {
              status.textContent = '온전한 주소가 아니라 파라미터를 지울 수 없어요.';
              status.className = 'tool-status error';
            }
          };
          $<HTMLButtonElement>('#upCopy').onclick = async () => {
            if (!input.value) return;
            await Toolbox.copyText?.(input.value, { message: '주소를 복사했어요' });
          };
        }
      }
    ]
  });
})();
