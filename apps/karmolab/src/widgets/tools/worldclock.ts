/**
 * 세계 시간 · 시차 (TASK-KL-088)
 *
 * 시차 계산이 틀리는 이유는 대부분 **서머타임**이다. 나라별로 시행 여부와 전환일이 달라
 * 「+9시간」 같은 고정 숫자를 외우면 연중 몇 달은 어긋난다.
 * 그래서 상수를 쓰지 않고 브라우저의 IANA 시간대 데이터에 매번 물어본다 — 서머타임이 자동 반영된다.
 */
(function (): void {
  /** [IANA 시간대, 도시, 나라] */
  const ZONES: Array<[string, string, string]> = [
    ['Asia/Seoul', '서울', '대한민국'],
    ['Asia/Tokyo', '도쿄', '일본'],
    ['Asia/Shanghai', '베이징·상하이', '중국'],
    ['Asia/Hong_Kong', '홍콩', '홍콩'],
    ['Asia/Taipei', '타이베이', '대만'],
    ['Asia/Singapore', '싱가포르', '싱가포르'],
    ['Asia/Bangkok', '방콕', '태국'],
    ['Asia/Ho_Chi_Minh', '호치민', '베트남'],
    ['Asia/Jakarta', '자카르타', '인도네시아'],
    ['Asia/Manila', '마닐라', '필리핀'],
    ['Asia/Kolkata', '뉴델리', '인도'],
    ['Asia/Dubai', '두바이', 'UAE'],
    ['Europe/Moscow', '모스크바', '러시아'],
    ['Europe/Istanbul', '이스탄불', '튀르키예'],
    ['Europe/Berlin', '베를린', '독일'],
    ['Europe/Paris', '파리', '프랑스'],
    ['Europe/Madrid', '마드리드', '스페인'],
    ['Europe/Rome', '로마', '이탈리아'],
    ['Europe/Amsterdam', '암스테르담', '네덜란드'],
    ['Europe/Zurich', '취리히', '스위스'],
    ['Europe/Prague', '프라하', '체코'],
    ['Europe/London', '런던', '영국'],
    ['Europe/Lisbon', '리스본', '포르투갈'],
    ['America/New_York', '뉴욕', '미국 동부'],
    ['America/Chicago', '시카고', '미국 중부'],
    ['America/Denver', '덴버', '미국 산악'],
    ['America/Los_Angeles', 'LA·샌프란시스코', '미국 서부'],
    ['America/Anchorage', '앵커리지', '미국 알래스카'],
    ['Pacific/Honolulu', '호놀룰루', '미국 하와이'],
    ['America/Toronto', '토론토', '캐나다'],
    ['America/Vancouver', '밴쿠버', '캐나다 서부'],
    ['America/Mexico_City', '멕시코시티', '멕시코'],
    ['America/Sao_Paulo', '상파울루', '브라질'],
    ['America/Argentina/Buenos_Aires', '부에노스아이레스', '아르헨티나'],
    ['Australia/Sydney', '시드니', '호주'],
    ['Australia/Perth', '퍼스', '호주 서부'],
    ['Pacific/Auckland', '오클랜드', '뉴질랜드'],
    ['Africa/Cairo', '카이로', '이집트'],
    ['Africa/Johannesburg', '요하네스버그', '남아공'],
    ['Africa/Lagos', '라고스', '나이지리아'],
    ['UTC', 'UTC', '협정 세계시']
  ];

  /** 그 시간대의 UTC 오프셋(분). Intl 이 서머타임까지 반영해 준다. */
  function offsetMinutes(zone: string, at: Date): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).format(at);
    const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
  }

  Toolbox.register({
    id: 'worldclock',
    title: '세계 시간 · 시차',
    category: 'tool',
    desc: '도시별 현재 시각과 서울과의 시차를 봅니다. 서머타임 자동 반영',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '세계 시간',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '서머타임 때문에 매번 틀리죠.' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">기준 도시</div>
                  <select id="wcBase"></select>
                </div>
                <div>
                  <div class="tool-sublabel">기준 시각 — 비우면 지금</div>
                  <input type="datetime-local" id="wcWhen">
                </div>
              </div>
            </div>
            <div class="field-group">
              <input type="text" id="wcSearch" placeholder="도시나 나라로 찾기 (예: 뉴욕, 독일, UTC)">
            </div>
            <div class="tool-list" id="wcList"></div>
            <div class="tool-status" id="wcStatus"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const baseSel = $<HTMLSelectElement>('#wcBase');
          const when = $<HTMLInputElement>('#wcWhen');
          const search = $<HTMLInputElement>('#wcSearch');
          const list = $<HTMLElement>('#wcList');
          const status = $<HTMLElement>('#wcStatus');

          baseSel.innerHTML = ZONES.map(([z, city, country]) => `<option value="${z}">${city} · ${country}</option>`).join('');
          baseSel.value = 'Asia/Seoul';

          function render(): void {
            const at = when.value ? new Date(when.value) : new Date();
            if (isNaN(at.getTime())) return;
            const baseOff = offsetMinutes(baseSel.value, at);
            const q = search.value.trim().toLowerCase();

            list.innerHTML = ZONES.filter(
              ([z, city, country]) => !q || city.toLowerCase().includes(q) || country.toLowerCase().includes(q) || z.toLowerCase().includes(q)
            )
              .map(([z, city, country]) => {
                const diff = (offsetMinutes(z, at) - baseOff) / 60;
                const diffText =
                  diff === 0 ? '같은 시각' : `${diff > 0 ? '+' : ''}${Number.isInteger(diff) ? diff : diff.toFixed(1)}시간`;
                const time = new Intl.DateTimeFormat('ko-KR', {
                  timeZone: z,
                  dateStyle: 'short',
                  timeStyle: 'short'
                }).format(at);
                const here = z === baseSel.value;
                return `<div class="tool-list-row"${here ? ' style="border-left:3px solid var(--accent);"' : ''}>
                          <span class="tool-list-key">${city}<span class="tool-list-dim" style="display:block;">${country}</span></span>
                          <span class="tool-list-val">${time} <span class="tool-list-dim">${diffText}</span></span>
                        </div>`;
              })
              .join('');

            const baseName = ZONES.find(([z]) => z === baseSel.value);
            status.textContent = `${baseName ? baseName[1] : ''} 기준 · ${
              when.value ? '지정한 시각' : '지금'
            } · 서머타임은 자동 반영됩니다.`;
            status.className = 'tool-status ok';
          }

          [baseSel, when, search].forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });
          render();
          // 기준 시각을 비워 둔 동안만 살아 있는 시계로 둔다 (지정했으면 흔들리면 안 된다).
          // 위젯을 떠날 때를 알려 주는 훅이 없으므로, 화면에서 떨어져 나간 것을 스스로 보고 멈춘다
          // (안 그러면 다른 도구로 가도 타이머가 계속 돈다).
          const timer = window.setInterval(() => {
            if (!container.isConnected) {
              clearInterval(timer);
              return;
            }
            if (!when.value && document.visibilityState === 'visible') render();
          }, 30000);
          Toolbox.trackUse?.('view');
        }
      }
    ]
  });
})();
