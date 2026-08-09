/**
 * 글자수 세기 — 공백 포함/제외, 바이트, 단어, 문장, 원고지 매수.
 * 자기소개서·리포트 분량 체크가 주 용도라 「제한 글자수」 게이지를 1급 시민으로 둔다.
 *
 * 남들은 어디까지 하나 (2026-08-08 조사): 인크루트·잡코리아 같은 큰 곳은 **공백포함·공백제외·
 * 바이트 셋뿐**이다(브랜드로 상위에 뜬다). 작은 도구 사이트들이 원고지·읽는 시간·종류별 세기·
 * 플랫폼 한도표까지 간다. 우리는 그 위를 목표로 한다 — 세는 것은 다 세고, 거기에 **글이 안
 * 날아가는 것**(임시 보관)과 **바이트가 진짜 맞는 것**(옛 인코딩에 못 담기는 글자 경고)을 더한다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';
import { inRegion } from '../../lib/region';

import { byteLength, euckrUnsafe, manuscriptSheets, sentenceCount, spec } from '../../core/charcount';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  /**
   * 한도 목록은 **그릴 때** 만든다 (TASK-KL-203) — 파일 실릴 때 만들면 이름 자리에 열쇠가 굳는다.
   *
   * 「자소서 500/1000/1500자」는 **한국 채용 서류의 관행**이다. 영어·일본어 화면에 옮겨 두면
   * 뜻은 통하지만 아무도 안 고르는 줄이 셋 는다 — 그래서 한국어에서만 넣는다.
   * 트위터·메타 설명·인스타·유튜브는 어디서나 같은 한도라 그대로 둔다.
   */
  const limitPresets = (): Array<{ label: string; value: number }> => [
    { label: t('charcount.preset.none'), value: 0 },
    /* 자소서 한도는 **한국 채용 관행**이다 — 한국어를 읽든 영어를 읽든, 한국에서 서류를
       내는 사람에게만 뜻이 있다. 그래서 언어가 아니라 **지역**으로 가른다. */
    ...(inRegion('KR')
      ? [
          { label: '자소서 500자', value: 500 },
          { label: '자소서 1000자', value: 1000 },
          { label: '자소서 1500자', value: 1500 }
        ]
      : []),
    { label: t('charcount.preset.twitter'), value: 280 },
    { label: t('charcount.preset.meta'), value: 155 }
  ];

  const platforms = (): Array<{ label: string; limit: number }> => [
    ...(inRegion('KR')
      ? [
          { label: '자소서 500자', limit: 500 },
          { label: '자소서 1000자', limit: 1000 },
          { label: '자소서 1500자', limit: 1500 }
        ]
      : []),
    { label: t('charcount.platform.meta'), limit: 155 },
    { label: t('charcount.platform.twitter'), limit: 280 },
    { label: t('charcount.platform.instagram'), limit: 2200 },
    { label: t('charcount.platform.youtube'), limit: 100 }
  ];



  /** 한국어 묵독·발표 속도 (분당 글자). 방송 원고에서 쓰는 어림값이다. */
  const 읽기_분당 = 500;
  const 말하기_분당 = 300;

  const 한글 = /[ㄱ-ㆎ가-힣]/u;
  const 영문 = /[A-Za-z]/;
  const 숫자 = /[0-9]/;

  /**
   * 「몇 분 몇 초」 — 단위 이름은 브라우저가 안다 (TASK-KL-203).
   * 손으로 「분」·「초」를 적으면 언어마다 또 옮겨야 하고 복수형이 갈리는 언어에서 틀린다.
   */
  function 시간말(초: number): string {
    if (초 <= 0) return t('charcount.time.zero');
    const unit = (n: number, u: string): string => {
      try {
        return new Intl.NumberFormat(locale(), {
          style: 'unit',
          unit: u,
          unitDisplay: 'short',
          maximumFractionDigits: 0
        } as Intl.NumberFormatOptions).format(n);
      } catch {
        return `${n}${u === 'minute' ? 'm' : 's'}`;
      }
    };
    const m = Math.floor(초 / 60);
    const sec = Math.round(초 % 60);
    if (!m) return unit(sec, 'second');
    return sec ? `${unit(m, 'minute')} ${unit(sec, 'second')}` : unit(m, 'minute');
  }

  Toolbox.register({
    id: 'charcount',
    /* 도구 큰제목 — 등록 순간이라 원본을 기본값으로 함께 준다. */
    title: t('widgets.charcount.title', undefined, '글자수 세기'),
    category: 'tool',
    desc: t('widgets-desc.charcount.desc', undefined, '공백 포함·제외 글자수, 바이트, 단어·문장·원고지 매수를 실시간으로 셉니다'),
    layout: 'form',
    icon: '<path d="M4 7V5h16v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('charcount.tab', undefined, '글자수'),
        /* 말을 받아온 뒤에 그린다 — 안 기다리면 화면에 열쇠 이름이 뜬다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('charcount').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const PRESETS = limitPresets();
    const PLATS = platforms();
          Mdd.linePreset('tool_run', { msg: t('charcount.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">텍스트 입력</label>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-ghost" id="ccPaste">붙여넣기</button>
                  <button class="btn btn-ghost" id="ccClear">지우기</button>
                </div>
              </div>
              <textarea id="ccInput" placeholder="${esc(t('charcount.placeholder'))}" style="min-height:200px;"></textarea>
              <div id="ccKeep" class="cc-note" style="display:none;"></div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('charcount.limit.label'))}</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <select id="ccLimitPreset" aria-label="${esc(t('charcount.limit.label'))}" style="flex:1;">
                  ${PRESETS.map((p, i) => `<option value="${p.value}"${i === 0 ? ' selected' : ''}>${p.label}</option>`).join('')}
                </select>
                <input type="text" id="ccLimitCustom" inputmode="numeric" placeholder="${esc(t('charcount.limit.custom'))}" style="width:120px;">
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
              <label class="field-label">${esc(t('charcount.fit.label'))}</label>
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
              keep.textContent = t('charcount.restored');
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
            /* 마지막에 마침표가 없어도 문장이다 — 판단은 알맹이가 한다 (TASK-KL-205). */
            const sentences = sentenceCount(text);
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

            const n = (v: number): string => v.toLocaleString(locale());
            /* 원고지는 한국만의 것이 아니다 — 일본의 原稿用紙가 같은 것이라 일본에서도 쓴다.
               EUC-KR 은 옛 한글 인코딩이라 한국만. 언어가 아니라 지역으로 가른다. */
            const squarePaper = inRegion('KR', 'JP');
            const forKorea = inRegion('KR');
            /* 원고지와 EUC-KR 은 **한국에서만 뜻이 있는 칸**이다 — 원고지는 한국·일본 글쓰기의
               세는 단위이고, EUC-KR 은 옛 한글 인코딩이다. 다른 언어 화면에서는 아무 의미 없는
               숫자가 두 줄 느는 것이라 안 보여 준다(평당 가격과 같은 판단). */
            const cells: Array<[string, string, string?]> = [
              [t('charcount.stat.withSpace'), t('charcount.unit.chars', { n: n(withSpace) }), 'primary'],
              [t('charcount.stat.withoutSpace'), t('charcount.unit.chars', { n: n(withoutSpace) }), 'primary'],
              [t('charcount.stat.words'), t('charcount.unit.count', { n: n(words) })],
              [t('charcount.stat.lines'), t('charcount.unit.lines', { n: n(lines) })],
              [t('charcount.stat.sentences'), t('charcount.unit.count', { n: n(sentences) })],
              [t('charcount.stat.paragraphs'), t('charcount.unit.count', { n: n(paragraphs) })],
              ...(squarePaper
                ? ([[t('charcount.stat.manuscript'), t('charcount.unit.sheets', { n: n(manuscript) })]] as Array<
                    [string, string, string?]
                  >)
                : []),
              ['UTF-8', n(utf8) + ' byte'],
              ...(forKorea ? ([['EUC-KR', n(euckr) + ' byte']] as Array<[string, string, string?]>) : []),
              [t('charcount.stat.hangul'), t('charcount.unit.chars', { n: n(ko) })],
              [t('charcount.stat.latin'), t('charcount.unit.chars', { n: n(en) })],
              [t('charcount.stat.digits'), t('charcount.unit.chars', { n: n(num) })],
              [t('charcount.stat.spaces'), t('charcount.unit.chars', { n: n(space) })],
              [t('charcount.stat.other'), t('charcount.unit.chars', { n: n(etc) })],
              [t('charcount.stat.readTime'), 시간말((withSpace / 읽기_분당) * 60)],
              [t('charcount.stat.speakTime'), 시간말((withSpace / 말하기_분당) * 60)]
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

            fit.innerHTML = PLATS.map((p) => {
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
              Toolbox.showToast?.(t('charcount.clipboardDenied'), 'warning', undefined);
            }
          };

          render();
  }
})();
