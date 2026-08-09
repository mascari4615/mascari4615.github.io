/**
 * 한/영 타자 변환 (TASK-KL-088) — 「dkssud」 ↔ 「안녕」.
 * 두벌식 자판 기준. 변환 규칙(조합 오토마타·받침 넘김·겹자모)은 `src/core/hangulkey.ts` 가
 * 소유한다 — 여기는 칸을 그리고 값을 옮길 뿐이다 (TASK-KL-205).
 */
import { engToKor, hasHangul, korToEng, spec } from '../../core/hangulkey';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  window.KarmoHangulKey = { engToKor, korToEng };

  Toolbox.register({
    id: 'hangulkey',
    title: t('widgets.hangulkey.title', undefined, "한영타 변환"),
    category: 'tool',
    desc: t('widgets-desc.hangulkey.desc', undefined, "한영키를 안 누르고 친 글자를 되돌립니다. dkssudgktpdy ↔ 안녕하세요 (두벌식)"),
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h2M11 10h2M16 10h2M7 14h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('hangulkey.t05', undefined, "한영타"),
        build: function (container: HTMLElement): void {
          void loadNamespace('hangulkey').then(function () {

          Mdd.linePreset('tool_run', { msg: t('hangulkey.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('hangulkey.label.input'))}</label>
              <textarea id="hkInput" placeholder="${esc(t('hangulkey.ph.input'))}" style="min-height:120px;"></textarea>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="hkAuto">${esc(t('hangulkey.btn.auto'))}</button>
              <button class="btn btn-secondary" id="hkE2K">${esc(t('hangulkey.btn.e2k'))}</button>
              <button class="btn btn-secondary" id="hkK2E">${esc(t('hangulkey.btn.k2e'))}</button>
              <button class="btn btn-ghost" id="hkSwap">${esc(t('hangulkey.btn.swap'))}</button>
              <button class="btn btn-ghost" id="hkClear">${esc(t('hangulkey.btn.clear'))}</button>
            </div>
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">${esc(t('hangulkey.label.out'))}</label>
                <button class="btn btn-ghost" id="hkCopy">${esc(t('hangulkey.btn.copy'))}</button>
              </div>
              <textarea id="hkOutput" aria-label="${esc(t('hangulkey.aria.out'))}" readonly style="min-height:120px;"></textarea>
            </div>
            <div class="tool-status" id="hkNote">${esc(t('hangulkey.note'))}</div>
          `;

          const input = container.querySelector('#hkInput') as HTMLTextAreaElement;
          const output = container.querySelector('#hkOutput') as HTMLTextAreaElement;
          const note = container.querySelector('#hkNote') as HTMLElement;

          function looksKorean(s: string): boolean {
            const kor = (s.match(/[가-힣ㄱ-ㅣ]/g) || []).length;
            const eng = (s.match(/[a-zA-Z]/g) || []).length;
            return kor >= eng;
          }

          /**
           * 자동일 때는 **조각마다 따로** 판단한다 (2026-08-08 — 남들도 안 하는 자리).
           *
           * 남들(가제트AI·인스타공백·크롬 확장)은 전부 「글 전체가 한글이냐 영문이냐」로 한 번에
           * 정한다. 그런데 실제로 잘못 친 글은 「안녕 gktpdy」처럼 **섞여** 있다. 전체로 판단하면
           * 멀쩡한 쪽까지 같이 뒤집혀 더 망가진다.
           *
           * 그래서 글자 갈래가 바뀌는 자리에서 잘라, 한글 덩어리는 영문으로·영문 덩어리는
           * 한글로 각각 되돌린다. 숫자·기호·공백은 어느 쪽도 아니라 그대로 둔다.
           */
          function autoConvert(src: string): { text: string; k2e: number; e2k: number } {
            const 갈래 = (ch: string): 'kor' | 'eng' | 'etc' =>
              /[가-힣ㄱ-ㅣ]/.test(ch) ? 'kor' : /[a-zA-Z]/.test(ch) ? 'eng' : 'etc';
            let out = '';
            let k2e = 0;
            let e2k = 0;
            let i = 0;
            while (i < src.length) {
              const kind = 갈래(src[i]);
              let j = i;
              /* 기호·공백은 옆 덩어리에 붙여 둔다 — 「안녕 gktpdy」의 가운데 빈칸에서 끊으면
                 덩어리가 잘게 쪼개져 판단이 흔들린다. */
              while (j < src.length && (갈래(src[j]) === kind || 갈래(src[j]) === 'etc')) j++;
              const 덩어리 = src.slice(i, j);
              if (kind === 'kor') { out += korToEng(덩어리); k2e++; }
              else if (kind === 'eng') { out += engToKor(덩어리); e2k++; }
              else out += 덩어리;
              i = j;
            }
            return { text: out, k2e, e2k };
          }

          function run(mode: 'auto' | 'e2k' | 'k2e'): void {
            const src = input.value;
            if (!src) {
              output.value = '';
              note.textContent = t('hangulkey.note');
              return;
            }
            if (mode === 'auto') {
              const r = autoConvert(src);
              output.value = r.text;
              const 섞임 = r.k2e > 0 && r.e2k > 0;
              note.textContent = 섞임
                ? `섞여 있어서 조각마다 따로 되돌렸어요 — 한글→영문 ${r.k2e}조각 · 영문→한글 ${r.e2k}조각.`
                : r.k2e > 0
                  ? t('hangulkey.say.k2e')
                  : r.e2k > 0
                    ? t('hangulkey.say.e2k')
                    : t('hangulkey.say.none');
              return;
            }
            output.value = mode === 'k2e' ? korToEng(src) : engToKor(src);
            note.textContent = mode === 'k2e' ? t('hangulkey.say.k2e') : t('hangulkey.say.e2k');
          }

          (container.querySelector('#hkAuto') as HTMLButtonElement).onclick = () => run('auto');
          (container.querySelector('#hkE2K') as HTMLButtonElement).onclick = () => run('e2k');
          (container.querySelector('#hkK2E') as HTMLButtonElement).onclick = () => run('k2e');
          (container.querySelector('#hkSwap') as HTMLButtonElement).onclick = () => {
            input.value = output.value;
            run('auto');
          };
          (container.querySelector('#hkClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            output.value = '';
            input.focus();
          };
          (container.querySelector('#hkCopy') as HTMLButtonElement).onclick = async () => {
            if (!output.value) return;
            await Toolbox.copyText?.(output.value, { message: t('hangulkey.copy.done') });
          };
          input.addEventListener('input', () => run('auto'));

          // 주소로 부른 경우 (`?op=toKorean&text=dkssud`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            input.value = String(call.args.text ?? '');
            run(call.op === 'toEnglish' ? 'k2e' : call.op === 'toKorean' ? 'e2k' : 'auto');
          } else if (call?.error !== undefined) {
            note.textContent = call.error;
          }
                  });
        }
      }
    ]
  });
})();
