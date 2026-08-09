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

(function (): void {
  Toolbox.register({
    id: 'birth',
    title: '생일 정보',
    category: 'tool',
    desc: '생년월일로 만 나이·띠·별자리·태어난 요일·다음 생일까지 남은 날을 한 번에',
    layout: 'form',
    icon: '<path d="M4 20h16v-7H4zM6 13V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 7V5M12 7V4M15 7V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '생일',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">생년월일</label>
              <input type="date" id="biDate" aria-label="생년월일">
            </div>
            <div class="tool-list" id="biOut"></div>
            <div class="tool-status" id="biStatus">양력 기준입니다. 띠는 통용되는 양력 1월 1일 기준으로 셉니다.</div>
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

            out.innerHTML =
              row('만 나이', `${info.age}세`) +
              row('연 나이', `${info.yearAge}세 <span class="tool-list-dim">올해 − 태어난 해</span>`) +
              row('세는 나이', `${info.koreanAge}세 <span class="tool-list-dim">예전 한국식</span>`) +
              row('띠', `${info.zodiac}띠`) +
              row('별자리', info.sign) +
              row('태어난 요일', info.weekday + '요일') +
              row('산 날수', `${info.lived.toLocaleString('ko-KR')}일째`) +
              row(
                '다음 생일',
                info.untilNext === 0 ? '오늘이에요 🎉' : `${info.untilNext}일 남음 (${info.nextBirthday.toLocaleDateString('ko-KR')})`
              ) +
              row('탄생석', info.gem) +
              row(
                '초등학교 입학',
                `${info.schoolYear}년 3월 <span class="tool-list-dim">${info.earlyEntry ? '빠른년생이면 ' + (info.schoolYear - 1) + '년' : '추정'}</span>`
              ) +
              row('1만 일 되는 날', info.tenThousandth.toLocaleDateString('ko-KR'));
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
      }
    ]
  });
})();
