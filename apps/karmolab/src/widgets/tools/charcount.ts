/**
 * 글자수 세기 — 공백 포함/제외, 바이트, 단어, 문장, 원고지 매수.
 * 자기소개서·리포트 분량 체크가 주 용도라 「제한 글자수」 게이지를 1급 시민으로 둔다.
 *
 * 남들은 어디까지 하나 (2026-08-08 조사): 인크루트·잡코리아 같은 큰 곳은 **공백포함·공백제외·
 * 바이트 셋뿐**이다(브랜드로 상위에 뜬다). 작은 도구 사이트들이 원고지·읽는 시간·종류별 세기·
 * 플랫폼 한도표까지 간다. 우리는 그 위를 목표로 한다 — 세는 것은 다 세고, 거기에 **글이 안
 * 날아가는 것**(임시 보관)과 **바이트가 진짜 맞는 것**(옛 인코딩에 못 담기는 글자 경고)을 더한다.
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

  /** 자주 쓰는 글자수 한도 — 지금 글이 어디에 들어가고 어디서 잘리는지 한눈에 본다. */
  const PLATFORMS: Array<{ label: string; limit: number; 기준: '공백포함' }> = [
    { label: '자소서 500자', limit: 500, 기준: '공백포함' },
    { label: '자소서 1000자', limit: 1000, 기준: '공백포함' },
    { label: '자소서 1500자', limit: 1500, 기준: '공백포함' },
    { label: '메타 description', limit: 155, 기준: '공백포함' },
    { label: '트위터(X)', limit: 280, 기준: '공백포함' },
    { label: '인스타 캡션', limit: 2200, 기준: '공백포함' },
    { label: '유튜브 제목', limit: 100, 기준: '공백포함' }
  ];

  /** 한국어 묵독·발표 속도 (분당 글자). 방송 원고에서 쓰는 어림값이다. */
  const 읽기_분당 = 500;
  const 말하기_분당 = 300;

  const 한글 = /[ㄱ-ㆎ가-힣]/u;
  const 영문 = /[A-Za-z]/;
  const 숫자 = /[0-9]/;

  function byteLength(s: string, encoding: 'utf8' | 'euckr'): number {
    if (encoding === 'utf8') return new TextEncoder().encode(s).length;
    /* EUC-KR 근사: 한글·한자·전각 = 2 byte, ASCII = 1 byte.
       이모지처럼 **애초에 못 담는 글자**는 여기서 2 로 세지 말고 따로 알린다 (아래 euckrUnsafe). */
    let n = 0;
    for (const ch of [...s]) {
      const code = ch.codePointAt(0) || 0;
      n += code > 127 ? 2 : 1;
    }
    return n;
  }

  /** 옛 인코딩(EUC-KR)에 못 담기는 글자 — 이모지·일부 특수문자. 붙여넣는 곳에서 깨진다. */
  function euckrUnsafe(s: string): string[] {
    const out: string[] = [];
    for (const ch of [...s]) {
      const code = ch.codePointAt(0) || 0;
      if (code > 0xffff && !out.includes(ch)) out.push(ch);
    }
    return out;
  }

  /** 원고지는 칸이다 — 줄이 바뀌면 남은 칸은 버린다. 한 줄 20칸·한 장 200칸. */
  function manuscriptSheets(text: string): number {
    if (!text.trim()) return 0;
    const 칸 = text.split(/\n/).reduce((sum, line) => sum + Math.ceil([...line].length / 20 || 0), 0);
    return Math.ceil((칸 * 20) / 200);
  }

  function 시간말(초: number): string {
    if (초 <= 0) return '0초';
    const m = Math.floor(초 / 60);
    const s = Math.round(초 % 60);
    if (!m) return `${s}초`;
    return s ? `${m}분 ${s}초` : `${m}분`;
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
              <div id="ccKeep" class="cc-note" style="display:none;"></div>
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
            <div id="ccUnsafe" class="cc-note cc-note-warn" style="display:none;"></div>

            <div class="field-group">
              <label class="field-label">어디에 들어가나</label>
              <div class="cc-fit" id="ccFit"></div>
            </div>
          `;

          const input = container.querySelector('#ccInput') as HTMLTextAreaElement;
          const stats = container.querySelector('#ccStats') as HTMLElement;
          const limitPreset = container.querySelector('#ccLimitPreset') as HTMLSelectElement;
          const limitCustom = container.querySelector('#ccLimitCustom') as HTMLInputElement;
          const gaugeWrap = container.querySelector('#ccGaugeWrap') as HTMLElement;
          const gauge = container.querySelector('#ccGauge') as HTMLElement;
          const gaugeText = container.querySelector('#ccGaugeText') as HTMLElement;
          const fit = container.querySelector('#ccFit') as HTMLElement;
          const unsafe = container.querySelector('#ccUnsafe') as HTMLElement;
          const keep = container.querySelector('#ccKeep') as HTMLElement;

          /* 쓰던 글이 새로고침 한 번에 날아가면 그 도구는 다시 안 온다. 이 창에만 남기고
             서버에는 아무것도 안 보낸다 (자소서를 남의 서버에 두고 싶은 사람은 없다). */
          const KEEP_KEY = 'karmolab_charcount_text';
          try {
            const saved = localStorage.getItem(KEEP_KEY);
            if (saved) {
              input.value = saved;
              keep.textContent = '이 기기에만 남겨 둔 글을 되살렸어요. 「지우기」를 누르면 지워집니다.';
              keep.style.display = '';
            }
          } catch (_) { /* 저장을 막아 둔 브라우저도 있다 */ }

          function currentLimit(): number {
            const custom = parseInt(limitCustom.value.replace(/[^0-9]/g, ''), 10);
            if (custom > 0) return custom;
            return parseInt(limitPreset.value, 10) || 0;
          }

          function render(): void {
            const text = input.value;
            const chars = [...text];
            const withSpace = chars.length;
            const withoutSpace = [...text.replace(/\s/g, '')].length;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const lines = text ? text.split(/\n/).length : 0;
            /* 마지막 문장에 마침표가 없어도 문장이다 — 자소서 마지막 줄이 늘 그렇다. */
            const 끝맺은문장 = (text.match(/[^.!?。？！\n]+[.!?。？！]+/g) || []).length;
            const 꼬리 = text.replace(/[\s\S]*[.!?。？！]/, '').trim();
            const sentences = 끝맺은문장 + (꼬리 ? 1 : 0);
            const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).length : 0;
            const manuscript = manuscriptSheets(text);
            const utf8 = byteLength(text, 'utf8');
            const euckr = byteLength(text, 'euckr');

            let ko = 0, en = 0, num = 0, space = 0, etc = 0;
            for (const ch of chars) {
              if (/\s/.test(ch)) space++;
              else if (한글.test(ch)) ko++;
              else if (영문.test(ch)) en++;
              else if (숫자.test(ch)) num++;
              else etc++;
            }

            const cells: Array<[string, string, string?]> = [
              ['공백 포함', withSpace.toLocaleString('ko-KR') + '자', 'primary'],
              ['공백 제외', withoutSpace.toLocaleString('ko-KR') + '자', 'primary'],
              ['단어', words.toLocaleString('ko-KR') + '개'],
              ['줄', lines.toLocaleString('ko-KR') + '줄'],
              ['문장', sentences.toLocaleString('ko-KR') + '개'],
              ['문단', paragraphs.toLocaleString('ko-KR') + '개'],
              ['원고지', manuscript.toLocaleString('ko-KR') + '매'],
              ['UTF-8', utf8.toLocaleString('ko-KR') + ' byte'],
              ['EUC-KR', euckr.toLocaleString('ko-KR') + ' byte'],
              ['한글', ko.toLocaleString('ko-KR') + '자'],
              ['영문', en.toLocaleString('ko-KR') + '자'],
              ['숫자', num.toLocaleString('ko-KR') + '자'],
              ['공백', space.toLocaleString('ko-KR') + '자'],
              ['기호·기타', etc.toLocaleString('ko-KR') + '자'],
              ['눈으로 읽기', 시간말((withSpace / 읽기_분당) * 60)],
              ['소리 내 말하기', 시간말((withSpace / 말하기_분당) * 60)]
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

            /* 옛 인코딩에 못 담기는 글자는 **바이트가 맞아도** 붙여넣는 곳에서 깨진다.
               숫자만 맞춰 주고 깨지는 걸 안 알리면 그 숫자가 사람을 속인다. */
            const 못담는것 = euckrUnsafe(text);
            if (못담는것.length) {
              unsafe.textContent =
                `EUC-KR(옛 한글 인코딩)에는 못 담기는 글자가 ${못담는것.length}종 있어요 — ` +
                `${못담는것.slice(0, 6).join(' ')} · 바이트 제한이 EUC-KR 기준인 곳에서는 깨지거나 막힐 수 있어요.`;
              unsafe.style.display = '';
            } else {
              unsafe.style.display = 'none';
            }

            fit.innerHTML = PLATFORMS.map((p) => {
              const 남음 = p.limit - withSpace;
              const ok = 남음 >= 0;
              return `<div class="cc-fit-row${ok ? '' : ' cc-fit-over'}">
                  <span class="cc-fit-label">${p.label}</span>
                  <span class="cc-fit-num">${p.limit.toLocaleString('ko-KR')}자</span>
                  <span class="cc-fit-state">${ok ? `${남음.toLocaleString('ko-KR')}자 남음` : `${(-남음).toLocaleString('ko-KR')}자 초과`}</span>
                </div>`;
            }).join('');

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

            try {
              if (text) localStorage.setItem(KEEP_KEY, text);
              else localStorage.removeItem(KEEP_KEY);
            } catch (_) { /* 저장을 막아 둔 브라우저도 있다 */ }
          }

          input.addEventListener('input', render);
          limitPreset.addEventListener('change', () => {
            limitCustom.value = '';
            render();
          });
          limitCustom.addEventListener('input', render);
          (container.querySelector('#ccClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            keep.style.display = 'none';
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
