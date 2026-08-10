/**
 * 문자 변환 허브 — 화면 (흡수 ⓒ)
 *
 * 골격만이다. 계산은 전부 `core/charconv.ts` — 여기서 다시 짜면 화면과 MCP 가 갈린다.
 *
 * 네 갈래를 한 화면에 둔 이유: 이 변환들은 **따로 찾아 들어가는 것 자체가 마찰**이다.
 * 「전각인가?」를 의심할 정도면 이미 한참 헤맨 뒤다. 그래서 붙여 놓고, 붙여 넣는 순간
 * **섞여 있으면 먼저 알려 준다** — 물어보기 전에 답이 보이는 편이 낫다.
 */
import {
  ambiguousChars,
  hasFullWidth,
  manyReadings,
  parsePinyinTable,
  pinyinOf,
  romanize,
  toFullWidth,
  toHalfWidth,
  toSimplified,
  toTraditional,
  type PinyinTable,
  type ToneStyle
} from '../../core/charconv';
import { compose, decompose } from '../../core/jamo';
import { readInvocation } from '../../lib/tool-url';
import { spec } from '../../core/charconv';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  type Mode = 'half' | 'full' | 'roman' | 'split' | 'join' | 'simp' | 'trad' | 'pinyin';

  /* 이름은 **쓸 때 정한다** — 이 배열이 모듈 뜨는 순간에 굳으면 한국어로 굳는다. */
  const modes = (): Array<{ id: Mode; label: string }> => [
    { id: 'half', label: t('charconv.t01') },
    { id: 'full', label: t('charconv.t02') },
    { id: 'roman', label: t('charconv.t03') },
    { id: 'split', label: t('charconv.t04') },
    { id: 'join', label: t('charconv.t05') },
    { id: 'simp', label: t('charconv.t06') },
    { id: 'trad', label: t('charconv.t07') },
    { id: 'pinyin', label: t('charconv.t08') }
  ];

  /*
   * 소리 표(2만 자·167KB)는 **묶음에 안 넣는다.** 전각·반각만 쓰러 온 사람에게까지 물리면
   * 「가볍게 열린다」가 깨진다. 「병음」을 고른 사람만 한 번 받아 오고, 그 뒤로는 안 받는다.
   * 받는 중에 또 눌러도 한 번만 간다(단발).
   */
  let pinyinTable: PinyinTable | null = null;
  let pinyinLoading: Promise<PinyinTable> | null = null;

  const loadPinyin = async (): Promise<PinyinTable> => {
    if (pinyinTable !== null) return pinyinTable;
    if (pinyinLoading !== null) return pinyinLoading;
    pinyinLoading = fetch('/apps/karmolab/data/han-pinyin.json')
      .then((r) => {
        if (r.ok === false) throw new Error(t('charconv.err.table', { status: r.status }));
        return r.json();
      })
      .then((raw) => {
        pinyinTable = parsePinyinTable(raw);
        return pinyinTable;
      })
      .catch((err) => {
        /* 실패는 기억하지 않는다 — 잠깐 끊긴 것뿐일 수 있다. 다음에 다시 눌러 볼 수 있어야 한다. */
        pinyinLoading = null;
        throw err;
      });
    return pinyinLoading;
  };

  let tone: ToneStyle = 'mark';

  const convert = (mode: Mode, text: string): string => {
    switch (mode) {
      case 'half':
        return toHalfWidth(text);
      case 'full':
        return toFullWidth(text);
      case 'roman':
        return romanize(text);
      case 'split':
        return decompose(text);
      case 'join':
        return compose(text);
      case 'simp':
        return toSimplified(text);
      case 'trad':
        return toTraditional(text);
      case 'pinyin':
        /* 표가 아직이면 빈칸 — 아래 render 가 「받는 중」이라고 말한다. */
        return pinyinTable === null ? '' : pinyinOf(pinyinTable, text, tone);
    }
  };

  Toolbox.register({
    id: 'charconv',
    title: t('widgets.charconv.title', undefined, "문자 변환"),
    category: 'tool',
    desc: t('widgets-desc.charconv.desc', undefined, "전각·반각, 한글·로마자, 한글·자모를 한 곳에서. 붙여 넣으면 섞인 글자를 먼저 알려 줍니다"),
    layout: 'wide',
    tabs: [
      {
        id: 'conv',
        label: t('charconv.t11', undefined, "변환"),
        build: function (container: HTMLElement): void {
          void loadNamespace('charconv').then(function () {

          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row" id="ccModes"></div>
              <label class="tool-label" for="ccIn">${esc(t('charconv.label.ccIn'))}</label>
              <textarea id="ccIn" class="tool-input" rows="4" spellcheck="false"></textarea>
              <div id="ccWarn" class="tool-note" role="status"></div>
              <label class="tool-label" for="ccOut">${esc(t('charconv.label.ccOut'))}</label>
              <textarea id="ccOut" class="tool-input" rows="4" readonly></textarea>
              <div class="tool-row" id="ccToneRow" hidden>
                <label class="tool-label" for="ccTone">${esc(t('charconv.label.ccTone'))}</label>
                <select id="ccTone" class="tool-input" style="max-width:14em;">
                  <option value="mark">${esc(t('charconv.opt.mark'))}</option>
                  <option value="number">${esc(t('charconv.opt.number'))}</option>
                  <option value="none">${esc(t('charconv.opt.none'))}</option>
                </select>
              </div>
              <div class="tool-row">
                <button id="ccCopy" class="tool-btn" type="button">${esc(t('charconv.btn.ccCopy'))}</button>
                <button id="ccSwap" class="tool-btn" type="button">${esc(t('charconv.btn.ccSwap'))}</button>
              </div>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const input = $<HTMLTextAreaElement>('#ccIn');
          const output = $<HTMLTextAreaElement>('#ccOut');
          let mode: Mode = 'half';

          $('#ccModes').innerHTML = modes().map(
            (m) => `<button class="tool-btn" type="button" data-mode="${m.id}">${esc(m.label)}</button>`
          ).join('');

          const paint = (): void => {
            for (const btn of container.querySelectorAll<HTMLButtonElement>('#ccModes button')) {
              btn.classList.toggle('tool-btn-primary', btn.dataset.mode === mode);
            }
          };

          const render = (): void => {
            output.value = input.value === '' ? '' : convert(mode, input.value);
            /* 묻기 전에 알려 준다 — 「왜 검색이 안 되지」의 답이 대개 이것이다. */
            const warn = $('#ccWarn');

            /*
             * 뜻을 봐야 정해지는 글자는 **바꾼 다음에** 말해 줘야 한다. 조용히 하나 골라 두면
             * 사람은 맞는 줄 알고 그대로 쓴다 — 发 를 髮 로 써야 할 자리에 發 이 들어간다.
             */
            $('#ccToneRow').hidden = mode !== 'pinyin';

            const amb = mode === 'simp' || mode === 'trad' ? ambiguousChars(input.value, mode === 'trad') : [];
            const multi = mode === 'pinyin' && pinyinTable !== null ? manyReadings(pinyinTable, input.value) : [];
            if (mode === 'pinyin' && pinyinTable === null) {
              warn.textContent = t('charconv.t12');
              warn.className = 'tool-note';
            } else if (multi.length > 0) {
              warn.textContent =
                t('charconv.t13') +
                multi.map((m) => `${m.ch} → ${m.readings.join(t('charconv.t14'))}`).join(' · ');
              warn.className = 'tool-note error';
            } else if (amb.length > 0) {
              warn.textContent =
                t('charconv.t15') +
                amb.map((a) => `${a.ch} → ${a.candidates.join(t('charconv.t14'))}`).join(' · ');
              warn.className = 'tool-note error';
            } else if (mode !== 'full' && hasFullWidth(input.value)) {
              warn.textContent = t('charconv.t16');
              warn.className = 'tool-note error';
            } else {
              warn.textContent = '';
              warn.className = 'tool-note';
            }
          };

          for (const btn of container.querySelectorAll<HTMLButtonElement>('#ccModes button')) {
            btn.onclick = () => {
              mode = (btn.dataset.mode as Mode) ?? 'half';
              paint();
              render();
              if (mode === 'pinyin' && pinyinTable === null) {
                void loadPinyin()
                  .then(render)
                  .catch((err: unknown) => {
                    const warn = $('#ccWarn');
                    warn.textContent = err instanceof Error ? err.message : String(err);
                    warn.className = 'tool-note error';
                  });
              }
            };
          }
          $<HTMLSelectElement>('#ccTone').onchange = (e) => {
            tone = (e.target as HTMLSelectElement).value as ToneStyle;
            render();
          };
          input.addEventListener('input', render);
          $<HTMLButtonElement>('#ccCopy').onclick = () =>
            void Toolbox.copyText?.(output.value, { message: t('charconv.t17') });
          $<HTMLButtonElement>('#ccSwap').onclick = () => {
            input.value = output.value;
            render();
          };

          // 주소로 부른 경우 (`?op=width&text=…&mode=full`). 없으면 예시로 시작한다.
          const call = readInvocation(spec);
          if (call === null) {
            input.value = 'ＫａｒｍｏＬａｂ　１２３';
            paint();
            render();
            return;
          }
          input.value = String(call.args.text ?? '');
          if (call.op === 'roman') mode = 'roman';
          else if (call.op === 'han') mode = call.args.mode === 'trad' ? 'trad' : 'simp';
          else if (call.op === 'pinyin') mode = 'pinyin';
          else if (call.op === 'jamo') mode = call.args.mode === 'join' ? 'join' : 'split';
          else mode = call.args.mode === 'full' ? 'full' : 'half';
          paint();
          render();
          if (call.error !== undefined) {
            const warn = $('#ccWarn');
            warn.textContent = call.error;
            warn.className = 'tool-note error';
          }
                  });
        }
      }
    ]
  });
})();
