/**
 * 텍스트 정리 (TASK-KL-088) — 줄 단위 정렬·중복 제거·공백 정리·대소문자·번호 매기기.
 *
 * 흩어져 있으면 각각은 사소한데, 실제 작업은 「중복 지우고 → 정렬하고 → 접두어 붙이고」 처럼
 * 이어서 일어난다. 그래서 개별 버튼이 아니라 **체크한 처리를 정해진 순서로 통과**시키는 파이프로 만든다.
 * 원본을 건드리지 않으므로 옵션을 껐다 켜며 결과를 바로 비교할 수 있다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** 처리 순서 고정 — 공백 정리 → 빈 줄 → 중복 → 정렬 → 대소문자 → 접두/접미 → 번호. */
  interface Opts {
    trim: boolean;
    squeeze: boolean;
    dropEmpty: boolean;
    dedupe: boolean;
    sort: string;
    caseMode: string;
    prefix: string;
    suffix: string;
    number: boolean;
    reverse: boolean;
    /** 보이지 않는 글자(NBSP·전각공백·zero-width) 를 보통 공백으로 */
    invisible: boolean;
    /** 자모 분리(NFD) 한글을 합쳐 되돌리기 */
    nfc: boolean;
    /** 한 문단이 여러 줄로 쪼개진 것을 다시 잇기 */
    join: boolean;
  }

  const NEWLINE_RE = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');

  function apply(src: string, o: Opts): string[] {
    /* 붙여넣은 글의 가장 흔한 오염원은 **보이지 않는 글자**다 — 워드·PDF·웹에서 따라오는
       NBSP·전각 공백·zero-width. 눈에는 공백인데 기존 정리가 하나도 못 잡아서, 정리했는데도
       정렬·중복 제거가 안 먹었다. */
    if (o.invisible) {
      src = src
        .replace(/[   -   　]/g, ' ')
        .replace(/[​-‍﻿]/g, '');
    }
    /* macOS 에서 온 한글은 자모가 갈라진 모양(NFD)일 때가 있다 — 윈도에서 깨져 보이고 검색·정렬이
       다 어긋난다. 합치면 되돌아온다. 남들의 「유니코드 정규화」는 라틴 문자용이라 한글 자모 분리를
       내세운 곳이 사실상 없다. */
    if (o.nfc) src = src.normalize('NFC');
    /* PDF·전자책에서 복사하면 한 문단이 줄마다 잘려 온다. 그냥 이으면 영어는 붙고 한글은 없던
       공백이 생긴다. 앞뒤 글자를 보고 한글끼리면 그대로, 아니면 공백 하나. 빈 줄은 문단 경계다. */
    if (o.join) {
      const merged: string[] = [];
      for (const line of src.split(NEWLINE_RE)) {
        const cur = line.trim();
        if (cur === '') { merged.push(''); continue; }
        const prev = merged.length ? merged[merged.length - 1] : '';
        if (prev === '' || /[.!?。？！:;]$/.test(prev)) { merged.push(cur); continue; }
        const 한글끼리 = /[가-힣]$/.test(prev) && /^[가-힣]/.test(cur);
        merged[merged.length - 1] = prev + (한글끼리 ? '' : ' ') + cur;
      }
      src = merged.join(String.fromCharCode(10));
    }
    let lines = src.split(/\r?\n/);
    if (o.trim) lines = lines.map((l) => l.trim());
    if (o.squeeze) lines = lines.map((l) => l.replace(/[ \t]+/g, ' '));
    if (o.dropEmpty) lines = lines.filter((l) => l.trim() !== '');
    if (o.dedupe) {
      const seen = new Set<string>();
      lines = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    }
    if (o.sort === 'asc') lines.sort((a, b) => a.localeCompare(b, 'ko-KR'));
    else if (o.sort === 'desc') lines.sort((a, b) => b.localeCompare(a, 'ko-KR'));
    else if (o.sort === 'len') lines.sort((a, b) => a.length - b.length);
    else if (o.sort === 'shuffle') {
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
    }
    if (o.reverse) lines.reverse();
    if (o.caseMode === 'upper') lines = lines.map((l) => l.toUpperCase());
    else if (o.caseMode === 'lower') lines = lines.map((l) => l.toLowerCase());
    else if (o.caseMode === 'title')
      lines = lines.map((l) => l.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
    if (o.prefix || o.suffix) lines = lines.map((l) => o.prefix + l + o.suffix);
    if (o.number) lines = lines.map((l, i) => `${i + 1}. ${l}`);
    return lines;
  }

  Toolbox.register({
    id: 'textclean',
    title: t('widgets.textclean.title', undefined, '텍스트 정리'),
    category: 'tool',
    desc: t(
      'widgets-desc.textclean.desc',
      undefined,
      '여러 줄 텍스트를 정렬·중복 제거·공백 정리·번호 매기기로 한 번에 다듬습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 6h16M4 11h11M4 16h14M4 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 18l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('textclean.tab', undefined, '정리'),
        build: function (container: HTMLElement): void {
          void loadNamespace('textclean').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <label class="field-label">${esc(t('textclean.label.in'))}</label>
                  <textarea id="tcIn" rows="10" spellcheck="false" placeholder="${esc(t('textclean.ph.in'))}"></textarea>
                </div>
                <div>
                  <label class="field-label">${esc(t('textclean.label.out'))}</label>
                  <textarea id="tcOut" aria-label="정리된 결과" rows="10" spellcheck="false" readonly></textarea>
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('textclean.label.ops'))}</label>
              <div class="tool-chips">
                <label class="tool-chip"><input type="checkbox" id="tcTrim" checked> ${esc(t('textclean.op.trim'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcSqueeze"> ${esc(t('textclean.op.squeeze'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcDropEmpty" checked> ${esc(t('textclean.op.dropEmpty'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcDedupe"> ${esc(t('textclean.op.dedupe'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcReverse"> ${esc(t('textclean.op.reverse'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcNumber"> ${esc(t('textclean.op.number'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcInvisible" checked> ${esc(t('textclean.op.invisible'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcNfc" checked> ${esc(t('textclean.op.nfc'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tcJoin"> ${esc(t('textclean.op.join'))}</label>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('textclean.label.sort'))}</div>
                  <select id="tcSort" aria-label="정렬">
                    <option value="">${esc(t('textclean.sort.none'))}</option>
                    <option value="asc">${esc(t('textclean.sort.asc'))}</option>
                    <option value="desc">${esc(t('textclean.sort.desc'))}</option>
                    <option value="len">${esc(t('textclean.sort.len'))}</option>
                    <option value="shuffle">${esc(t('textclean.sort.shuffle'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('textclean.label.case'))}</div>
                  <select id="tcCase" aria-label="대소문자">
                    <option value="">${esc(t('textclean.case.none'))}</option>
                    <option value="upper">${esc(t('textclean.case.upper'))}</option>
                    <option value="lower">${esc(t('textclean.case.lower'))}</option>
                    <option value="title">${esc(t('textclean.case.title'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('textclean.label.prefix'))}</div>
                  <input type="text" id="tcPrefix" placeholder="${esc(t('textclean.ph.prefix'))}" spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('textclean.label.suffix'))}</div>
                  <input type="text" id="tcSuffix" placeholder="${esc(t('textclean.ph.suffix'))}" spellcheck="false">
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="tcCopy">${esc(t('textclean.btn.copy'))}</button>
              <button class="btn btn-ghost" id="tcSwap">${esc(t('textclean.btn.swap'))}</button>
              <button class="btn btn-ghost" id="tcClear">${esc(t('textclean.btn.clear'))}</button>
            </div>

            <div class="tool-status" id="tcStatus">${esc(t('textclean.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#tcIn');
          const output = $<HTMLTextAreaElement>('#tcOut');
          const status = $<HTMLElement>('#tcStatus');

          function run(): void {
            const src = input.value;
            const lines = apply(src, {
              trim: $<HTMLInputElement>('#tcTrim').checked,
              squeeze: $<HTMLInputElement>('#tcSqueeze').checked,
              dropEmpty: $<HTMLInputElement>('#tcDropEmpty').checked,
              dedupe: $<HTMLInputElement>('#tcDedupe').checked,
              reverse: $<HTMLInputElement>('#tcReverse').checked,
              number: $<HTMLInputElement>('#tcNumber').checked,
              invisible: $<HTMLInputElement>('#tcInvisible').checked,
              nfc: $<HTMLInputElement>('#tcNfc').checked,
              join: $<HTMLInputElement>('#tcJoin').checked,
              sort: $<HTMLSelectElement>('#tcSort').value,
              caseMode: $<HTMLSelectElement>('#tcCase').value,
              prefix: $<HTMLInputElement>('#tcPrefix').value,
              suffix: $<HTMLInputElement>('#tcSuffix').value
            });
            output.value = lines.join('\n');
            const before = src ? src.split(/\r?\n/).length : 0;
            status.textContent = src
              ? t('textclean.status.done', {
                  before,
                  after: lines.length,
                  chars: output.value.length.toLocaleString(locale())
                })
              : t('textclean.status.idle');
            status.className = 'tool-status' + (src ? ' ok' : '');
          }

          container.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('input', run);
            el.addEventListener('change', run);
          });

          $<HTMLButtonElement>('#tcCopy').onclick = async () => {
            if (!output.value) return;
            await Toolbox.copyText?.(output.value, { message: t('textclean.copy.done') });
            Toolbox.trackUse?.('copy');
          };
          $<HTMLButtonElement>('#tcSwap').onclick = () => {
            input.value = output.value;
            run();
          };
          $<HTMLButtonElement>('#tcClear').onclick = () => {
            input.value = '';
            run();
          };

          run();
  }
})();
