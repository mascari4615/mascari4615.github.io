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
(function (): void {
  const ZODIAC = ['원숭이', '닭', '개', '돼지', '쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양'];

  /** [시작 월, 시작 일, 이름] — 그 날짜부터 다음 항목 전날까지 */
  const SIGNS: Array<[number, number, string]> = [
    [1, 20, '물병자리'],
    [2, 19, '물고기자리'],
    [3, 21, '양자리'],
    [4, 20, '황소자리'],
    [5, 21, '쌍둥이자리'],
    [6, 22, '게자리'],
    [7, 23, '사자자리'],
    [8, 23, '처녀자리'],
    [9, 23, '천칭자리'],
    [10, 23, '전갈자리'],
    [11, 22, '사수자리'],
    [12, 22, '염소자리']
  ];

  /** 달마다 정해진 탄생석 — 상위 계산기들이 대개 함께 준다. */
  const GEMS = ['가넷', '자수정', '아쿠아마린', '다이아몬드', '에메랄드', '진주', '루비', '페리도트', '사파이어', '오팔', '토파즈', '터키석'];

  function signOf(m: number, d: number): string {
    let found = '염소자리'; // 12/22 ~ 1/19
    for (const [sm, sd, name] of SIGNS) {
      if (m > sm || (m === sm && d >= sd)) found = name;
    }
    if (m === 1 && d < 20) found = '염소자리';
    return found;
  }

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
            const [y, m, d] = dateEl.value.split('-').map(Number);
            const born = new Date(y, m - 1, d);
            if (isNaN(born.getTime())) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 만 나이 = 생일이 지났으면 올해-태어난해, 아직이면 거기서 1을 뺀다
            let age = today.getFullYear() - y;
            const passed = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
            if (!passed) age -= 1;

            // 다음 생일 (2월 29일생은 그 해에 없으면 3월 1일로 넘어간다)
            let next = new Date(today.getFullYear(), m - 1, d);
            if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
            const untilNext = Math.round((next.getTime() - today.getTime()) / 86400000);
            const lived = Math.floor((today.getTime() - born.getTime()) / 86400000);

            /* 한국에서 「나이」는 세 가지다 (2023-06 만 나이 통일 뒤에도 연 나이는 법에 남아 있다).
               상위 계산기들이 셋을 나란히 주는 이유 — 어디에 쓰느냐에 따라 답이 다르기 때문이다.
                 만 나이   생일 지났으면 올해-태어난해
                 연 나이   올해 - 태어난 해 (병역·청소년보호법 등)
                 세는 나이 연 나이 + 1 (예전에 쓰던 한국식) */
            const yearAge = today.getFullYear() - y;
            const koreanAge = yearAge + 1;
            /* 초등학교 입학 연도 — 태어난 해 + 7. 2009년 이전 1~2월생(빠른년생)은 한 해 빨랐다. */
            const schoolYear = y + 7;
            const 빠른 = m <= 2 && y < 2009;

            out.innerHTML =
              row('만 나이', `${age}세`) +
              row('연 나이', `${yearAge}세 <span class="tool-list-dim">올해 − 태어난 해</span>`) +
              row('세는 나이', `${koreanAge}세 <span class="tool-list-dim">예전 한국식</span>`) +
              row('띠', `${ZODIAC[y % 12]}띠`) +
              row('별자리', signOf(m, d)) +
              row('태어난 요일', ['일', '월', '화', '수', '목', '금', '토'][born.getDay()] + '요일') +
              row('산 날수', `${lived.toLocaleString('ko-KR')}일째`) +
              row('다음 생일', untilNext === 0 ? '오늘이에요 🎉' : `${untilNext}일 남음 (${next.toLocaleDateString('ko-KR')})`) +
              row('탄생석', GEMS[m - 1]) +
              row('초등학교 입학', `${schoolYear}년 3월 <span class="tool-list-dim">${빠른 ? '빠른년생이면 ' + (schoolYear - 1) + '년' : '추정'}</span>`) +
              row('1만 일 되는 날', new Date(born.getTime() + 10000 * 86400000).toLocaleDateString('ko-KR'));
            Toolbox.trackUse?.('calc');
          }

          dateEl.addEventListener('input', render);
          const d = new Date();
          dateEl.value = `${d.getFullYear() - 30}-01-01`;
          render();
        }
      }
    ]
  });
})();
