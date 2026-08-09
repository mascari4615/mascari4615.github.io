/**
 * 생일 정보 (TASK-KL-088)
 *
 * 생년월일 하나에서 사람들이 실제로 궁금해하는 건 여러 개다 — 만 나이, 띠, 별자리,
 * 무슨 요일에 태어났는지, 다음 생일까지 며칠, 태어난 지 며칠째.
 * 따로 찾으면 같은 날짜를 여섯 번 입력하게 되므로 한 번에 낸다.
 *
 * 띠와 별자리는 **경계에서 자주 틀린다** — 띠는 음력 설 기준이라는 설이 있으나
 * 통용되는 것은 양력 1월 1일 기준이고, 별자리는 날짜 구간이 달마다 다르다. 구간을 표로 박는다.
 */
import { birthInfo, spec } from '../../core/birth';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace, locale, fmtDate } from '../../lib/i18n';
import { inRegion } from '../../lib/region';

(function (): void {
  Toolbox.register({
    id: 'birth',
    title: t('widgets.birth.title', undefined, '생일 정보'),
    category: 'tool',
    desc: t(
      'widgets-desc.birth.desc',
      undefined,
      '생년월일로 만 나이·띠·별자리·태어난 요일·다음 생일까지 남은 날을 한 번에'
    ),
    layout: 'form',
    icon: '<path d="M4 20h16v-7H4zM6 13V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 7V5M12 7V4M15 7V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('birth.tab', undefined, '생일'),
        build: function (container: HTMLElement): void {
          void loadNamespace('birth').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 파일 실릴 때 그리면 이름 자리에 열쇠가 굳는다. */
  function draw(container: HTMLElement): void {
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('birth.label.date'))}</label>
              <input type="date" id="biDate" aria-label="${esc(t('birth.label.date'))}">
            </div>
            <div class="tool-list" id="biOut"></div>
            <div class="tool-status" id="biStatus">${esc(t('birth.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const dateEl = $<HTMLInputElement>('#biDate');
          const out = $<HTMLElement>('#biOut');
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function render(): void {
            if (!dateEl.value) {
              out.innerHTML = '';
              return;
            }
            /* 계산은 `src/core/birth.ts` 가 한다 — 한국 나이 세 가지(만·연·세는)를 함께 내는
               이유도 거기 적혀 있다. 여기는 그 값을 줄로 그릴 뿐이다 (TASK-KL-205). */
            const info = birthInfo(dateEl.value);
            if (info === null) {
              out.innerHTML = '';
              return;
            }

            /* 요일 이름은 표로 안 적는다 — `Intl` 이 모든 언어의 요일을 안다(적어 두면 언어마다
               일곱 개를 또 옮겨야 한다). 띠·별자리·탄생석은 자리 번호로 받아 여기서 이름을 붙인다. */
            const dim = (s: string): string => ` <span class="tool-list-dim">${esc(s)}</span>`;
            const born = new Date(dateEl.value);

            out.innerHTML =
              row(t('birth.row.age'), t('birth.value.age', { n: info.age })) +
              row(t('birth.row.yearAge'), t('birth.value.age', { n: info.yearAge }) + dim(t('birth.note.yearAge'))) +
              row(t('birth.row.koreanAge'), t('birth.value.age', { n: info.koreanAge }) + dim(t('birth.note.koreanAge'))) +
              row(t('birth.row.zodiac'), esc(t(`birth.zodiac.${info.zodiacIndex}`))) +
              row(t('birth.row.sign'), esc(t(`birth.sign.${info.signIndex}`))) +
              row(t('birth.row.weekday'), esc(fmtDate(born, { weekday: 'long' }))) +
              row(t('birth.row.lived'), t('birth.value.lived', { n: info.lived.toLocaleString(locale()) })) +
              row(
                t('birth.row.nextBirthday'),
                info.untilNext === 0
                  ? t('birth.value.today')
                  : t('birth.value.untilNext', { n: info.untilNext, date: fmtDate(info.nextBirthday) })
              ) +
              row(t('birth.row.gem'), esc(t(`birth.gem.${info.month}`))) +
              /* 초등학교 입학(만 7세 3월)은 **한국 학제**라 한국에 사는 사람에게만 낸다.
                 다만 「한국에 사는 사람」 ≠ 「한국어를 읽는 사람」 이므로, 보여 줄 때는
                 그 사람의 말로 보여 준다 — 지역이 낼지 말지를, 언어가 어떻게 적을지를 정한다. */
              (inRegion('KR')
                ? row(
                    t('birth.row.school'),
                    esc(t('birth.value.school', { year: info.schoolYear })) +
                      dim(
                        info.earlyEntry
                          ? t('birth.note.early', { year: info.schoolYear - 1 })
                          : t('birth.note.estimate')
                      )
                  )
                : '') +
              row(t('birth.row.tenThousandth'), esc(fmtDate(info.tenThousandth)));
            Toolbox.trackUse?.('calc');
          }

          dateEl.addEventListener('input', render);

          // 주소로 부른 경우 (`?op=info&date=1990-05-05`) — 아니면 예시로 시작 (TASK-KL-205).
          const call = readInvocation(spec);
          const d = new Date();
          dateEl.value =
            call !== null && call.error === undefined && call.op === 'info'
              ? String(call.args.date ?? '')
              : `${d.getFullYear() - 30}-01-01`;
          render();
          if (call?.error !== undefined) {
            const st = $<HTMLElement>('#biStatus');
            st.textContent = call.error;
            st.className = 'tool-status error';
          }
  }
})();
