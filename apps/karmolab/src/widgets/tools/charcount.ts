/**
 * 글자수 세기 — 공백 포함/제외, 바이트, 단어, 문장, 원고지 매수.
 * 자기소개서·리포트 분량 체크가 주 용도라 「제한 글자수」 게이지를 1급 시민으로 둔다.
 */
(function (): void {
  const LIMIT_PRESETS: Array<{ label: string; value: number }> = [
    { label: '제한 없음', value: 0 },
    { label: '자소서 500자', value: 500 },
    { label: '자소서 1000자', value: 1000 },
    { label: '자소서 1500자', value: 1500 },
    { label: '트위터 280자', value: 280 },
    { label: '메타 description 155자', value: 155 }
  ];

  function byteLength(s: string, encoding: 'utf8' | 'euckr'): number {
    if (encoding === 'utf8') return new TextEncoder().encode(s).length;
    // EUC-KR 근사: 한글/한자/전각 = 2 byte, 그 외 = 1 byte
    let n = 0;
    for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
    return n;
  }

  Toolbox.register({
    id: 'charcount',
    title: '글자수 세기',
    category: 'tool',
    desc: '공백 포함·제외 글자수, 바이트, 단어·문장·원고지 매수를 실시간으로 셉니다',
    layout: 'form',
    icon: '<path d="M4 7V5h16v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '글자수',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '한 글자도 안 놓치고 세어 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">텍스트 입력</label>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-ghost" id="ccPaste">붙여넣기</button>
                  <button class="btn btn-ghost" id="ccClear">지우기</button>
                </div>
              </div>
              <textarea id="ccInput" placeholder="여기에 글을 붙여넣으세요. 입력하는 즉시 계산됩니다." style="min-height:200px;"></textarea>
            </div>

            <div class="field-group">
              <label class="field-label">글자수 제한</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <select id="ccLimitPreset" aria-label="글자수 제한" style="flex:1;">
                  ${LIMIT_PRESETS.map((p, i) => `<option value="${p.value}"${i === 0 ? ' selected' : ''}>${p.label}</option>`).join('')}
                </select>
                <input type="text" id="ccLimitCustom" inputmode="numeric" placeholder="직접 입력" style="width:120px;">
              </div>
              <div id="ccGaugeWrap" style="margin-top:12px; display:none;">
                <div style="height:8px; background:var(--bg-secondary); border:1px solid var(--border); overflow:hidden;">
                  <div id="ccGauge" style="height:100%; width:0%; background:var(--accent); transition:width 120ms ease;"></div>
                </div>
                <div id="ccGaugeText" style="margin-top:6px; font-size:var(--font-size-xs); color:var(--text-secondary); font-family:var(--font-mono);"></div>
              </div>
            </div>

            <div class="cc-stats" id="ccStats"></div>
          `;

          const input = container.querySelector('#ccInput') as HTMLTextAreaElement;
          const stats = container.querySelector('#ccStats') as HTMLElement;
          const limitPreset = container.querySelector('#ccLimitPreset') as HTMLSelectElement;
          const limitCustom = container.querySelector('#ccLimitCustom') as HTMLInputElement;
          const gaugeWrap = container.querySelector('#ccGaugeWrap') as HTMLElement;
          const gauge = container.querySelector('#ccGauge') as HTMLElement;
          const gaugeText = container.querySelector('#ccGaugeText') as HTMLElement;

          function currentLimit(): number {
            const custom = parseInt(limitCustom.value.replace(/[^0-9]/g, ''), 10);
            if (custom > 0) return custom;
            return parseInt(limitPreset.value, 10) || 0;
          }

          function render(): void {
            const text = input.value;
            const withSpace = [...text].length;
            const withoutSpace = [...text.replace(/\s/g, '')].length;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const lines = text ? text.split(/\n/).length : 0;
            const sentences = (text.match(/[^.!?。？！\n]+[.!?。？！]+/g) || []).length;
            const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).length : 0;
            const manuscript = Math.ceil(withSpace / 200); // 원고지 200자 기준
            const utf8 = byteLength(text, 'utf8');
            const euckr = byteLength(text, 'euckr');

            const cells: Array<[string, string, string?]> = [
              ['공백 포함', withSpace.toLocaleString('ko-KR') + '자', 'primary'],
              ['공백 제외', withoutSpace.toLocaleString('ko-KR') + '자', 'primary'],
              ['단어', words.toLocaleString('ko-KR') + '개'],
              ['줄', lines.toLocaleString('ko-KR') + '줄'],
              ['문장', sentences.toLocaleString('ko-KR') + '개'],
              ['문단', paragraphs.toLocaleString('ko-KR') + '개'],
              ['원고지', manuscript.toLocaleString('ko-KR') + '매'],
              ['UTF-8', utf8.toLocaleString('ko-KR') + ' byte'],
              ['EUC-KR', euckr.toLocaleString('ko-KR') + ' byte']
            ];
            stats.innerHTML = cells
              .map(
                ([label, value, tone]) => `
                  <div class="cc-stat${tone === 'primary' ? ' cc-stat-primary' : ''}">
                    <div class="cc-stat-label">${label}</div>
                    <div class="cc-stat-value">${value}</div>
                  </div>`
              )
              .join('');

            const limit = currentLimit();
            if (limit > 0) {
              gaugeWrap.style.display = 'block';
              const ratio = Math.min(withSpace / limit, 1);
              gauge.style.width = (ratio * 100).toFixed(1) + '%';
              const over = withSpace - limit;
              const okColor = withSpace > limit ? 'var(--error)' : withSpace > limit * 0.9 ? 'var(--warning)' : 'var(--accent)';
              gauge.style.background = okColor;
              gaugeText.textContent =
                over > 0
                  ? `${limit.toLocaleString('ko-KR')}자 제한 · ${over.toLocaleString('ko-KR')}자 초과`
                  : `${limit.toLocaleString('ko-KR')}자 제한 · ${(limit - withSpace).toLocaleString('ko-KR')}자 남음`;
              gaugeText.style.color = okColor;
            } else {
              gaugeWrap.style.display = 'none';
            }
          }

          input.addEventListener('input', render);
          limitPreset.addEventListener('change', () => {
            limitCustom.value = '';
            render();
          });
          limitCustom.addEventListener('input', render);
          (container.querySelector('#ccClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            input.focus();
            render();
          };
          (container.querySelector('#ccPaste') as HTMLButtonElement).onclick = async () => {
            try {
              const t = await navigator.clipboard.readText();
              input.value = t;
              render();
            } catch {
              Toolbox.showToast?.('클립보드 읽기 권한이 없어요. Ctrl+V 로 붙여넣어 주세요.', 'warning', undefined);
            }
          };

          render();
        }
      }
    ]
  });
})();
