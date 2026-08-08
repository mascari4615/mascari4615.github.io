/**
 * 크론 표현식 읽기 (TASK-KL-088)
 *
 * 간격 표기와 범위 표기를 헷갈리면 「매일 새벽에 한 번」 이 「1분마다」 가 된다.
 * 그래서 뜻풀이만 주지 않고 **다음 실행 시각 5개를 실제로 계산해** 보여준다 —
 * 사람의 해석이 아니라 기계의 답으로 확인되는 형태.
 */
(function (): void {
  interface Field {
    /** 허용 값 목록 */
    values: number[];
    ok: boolean;
  }

  /** 이름값 — 실제 crontab 에서 흔히 쓰는데 예전에는 통째로 거절했다. */
  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  /** `@daily` 같은 별칭 — 사람이 실제로 쓰는 표기다. */
  const ALIASES: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
  };

  function parseField(raw: string, min: number, max: number, names?: string[]): Field {
    const values = new Set<number>();
    /* 이름값(JAN·MON)과 일요일 7 을 숫자로 바꾼 뒤 푼다.
       표준 cron 은 요일 0 과 7 을 둘 다 일요일로 받는데, 예전에는 7 을 에러로 냈다. */
    let text = raw.toUpperCase();
    /* 이름 → 숫자. 달은 1부터(JAN=1), 요일은 0부터(SUN=0)라 `min` 을 더한다. */
    if (names) names.forEach((nm, i) => { text = text.split(nm).join(String(i + min)); });
    if (max === 6) text = text.replace(/7/g, '0');
    raw = text;
    for (const chunk of raw.split(',')) {
      const [range, stepRaw] = chunk.split('/');
      const step = stepRaw ? parseInt(stepRaw, 10) : 1;
      if (!isFinite(step) || step < 1) return { values: [], ok: false };
      let lo = min;
      let hi = max;
      if (range !== '*') {
        const m = range.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) return { values: [], ok: false };
        lo = parseInt(m[1], 10);
        hi = m[2] !== undefined ? parseInt(m[2], 10) : stepRaw ? max : lo;
      }
      if (lo < min || hi > max || lo > hi) return { values: [], ok: false };
      for (let v = lo; v <= hi; v += step) values.add(v);
    }
    /* 요일은 0 과 7 이 **둘 다 일요일**이다(표준 cron). 요일 칸만 7 까지 받아 두고 여기서 0 으로
       접는다 — 이렇게 해야 `1-7`(월~일) 같은 범위도 그대로 읽힌다. 예전에는 7 을 통째로 거절해
       실제 crontab 에 흔한 표현이 에러로 떴다. */
    const folded = max === 7 ? new Set([...values].map((v) => (v === 7 ? 0 : v))) : values;
    return { values: [...folded].sort((a, b) => a - b), ok: true };
  }

  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  /** 사람 문장으로 옮긴다 — 값이 전부면 「매」, 몇 개면 나열. */
  function describe(f: Field, total: number, unit: string, fmt?: (n: number) => string): string {
    const show = (n: number): string => (fmt ? fmt(n) : String(n));
    if (f.values.length === total) return '';
    if (f.values.length === 1) return `${show(f.values[0])}${unit}`;
    if (f.values.length > 8) return `${f.values.length}개 ${unit}`;
    return f.values.map(show).join(',') + unit;
  }

  Toolbox.register({
    id: 'cron',
    title: '크론 표현식 읽기',
    category: 'tool',
    desc: '크론 표현식을 우리말로 풀고 다음 실행 시각을 실제로 계산해 보여줍니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 4l2 2M21 4l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '읽기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">크론 표현식 — 분 시 일 월 요일</label>
              <input type="text" id="crIn" spellcheck="false" value="0 9 * * 1-5" placeholder="0 9 * * 1-5">
            </div>

            <div class="field-group">
              <div class="tool-chips" id="crPresets">
                <button type="button" class="tool-chip" data-v="* * * * *">1분마다</button>
                <button type="button" class="tool-chip" data-v="*/10 * * * *">10분마다</button>
                <button type="button" class="tool-chip" data-v="0 * * * *">매시 정각</button>
                <button type="button" class="tool-chip" data-v="0 9 * * 1-5">평일 아침 9시</button>
                <button type="button" class="tool-chip" data-v="0 0 1 * *">매월 1일 자정</button>
                <button type="button" class="tool-chip" data-v="30 3 * * 0">일요일 새벽 3시 반</button>
              </div>
            </div>

            <div class="tool-display" id="crText">—</div>
            <div class="tool-list" id="crNext"></div>
            <div class="tool-status" id="crStatus">표준 5칸 크론 기준입니다. 시각은 이 기기의 시간대로 계산합니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLInputElement>('#crIn');
          const text = $<HTMLElement>('#crText');
          const next = $<HTMLElement>('#crNext');
          const status = $<HTMLElement>('#crStatus');

          function run(): void {
            const typed = input.value.trim();
            const parts = (ALIASES[typed.toLowerCase()] || typed).split(/\s+/);
            if (parts.length !== 5) {
              text.textContent = '—';
              next.innerHTML = '';
              status.textContent = '칸이 5개여야 합니다 — 분 시 일 월 요일. (@daily·@hourly 같은 별칭도 됩니다)';
              status.className = 'tool-status error';
              return;
            }
            const [mi, ho, da, mo, dw] = [
              parseField(parts[0], 0, 59),
              parseField(parts[1], 0, 23),
              parseField(parts[2], 1, 31),
              parseField(parts[3], 1, 12, MONTH_NAMES),
              parseField(parts[4], 0, 7, DOW_NAMES)
            ];
            if (![mi, ho, da, mo, dw].every((f) => f.ok)) {
              text.textContent = '—';
              next.innerHTML = '';
              status.textContent = '읽을 수 없는 칸이 있어요. 숫자·*·범위(1-5)·간격(*/10)·목록(1,3)·이름(MON·JAN)만 됩니다.';
              status.className = 'tool-status error';
              return;
            }

            const bits = [
              describe(mo, 12, '월', (n) => `${n}`),
              describe(dw, 7, '요일', (n) => DOW[n]),
              describe(da, 31, '일'),
              describe(ho, 24, '시'),
              describe(mi, 60, '분')
            ].filter(Boolean);
            text.textContent = bits.length ? bits.join(' ') + ' 에 실행' : '1분마다 실행';

            // 표현식을 직접 돌려 다음 시각을 찾는다. 최대 2년치까지만 훑고 없으면 「없음」.
            const found: Date[] = [];
            const cur = new Date();
            cur.setSeconds(0, 0);
            cur.setMinutes(cur.getMinutes() + 1);
            const limit = new Date(cur.getTime() + 366 * 2 * 24 * 3600 * 1000);
            // 분 단위로 훑으면 2년이 백만 번이라 느리다 → 조건에 안 맞는 날은 하루씩 건너뛴다.
            while (found.length < 5 && cur < limit) {
              const dayOk =
                mo.values.includes(cur.getMonth() + 1) &&
                // 크론은 일·요일이 둘 다 지정되면 OR 로 친다 (표준 동작)
                (da.values.length === 31 || dw.values.length === 7
                  ? da.values.includes(cur.getDate()) && dw.values.includes(cur.getDay())
                  : da.values.includes(cur.getDate()) || dw.values.includes(cur.getDay()));
              if (!dayOk) {
                cur.setDate(cur.getDate() + 1);
                cur.setHours(0, 0, 0, 0);
                continue;
              }
              if (!ho.values.includes(cur.getHours())) {
                cur.setHours(cur.getHours() + 1, 0, 0, 0);
                continue;
              }
              if (!mi.values.includes(cur.getMinutes())) {
                cur.setMinutes(cur.getMinutes() + 1, 0, 0);
                continue;
              }
              found.push(new Date(cur));
              cur.setMinutes(cur.getMinutes() + 1, 0, 0);
            }

            next.innerHTML = found.length
              ? found
                  .map((d, i) => {
                    const diff = d.getTime() - Date.now();
                    const mins = Math.round(diff / 60000);
                    const human =
                      mins < 60 ? `${mins}분 후` : mins < 1440 ? `${Math.round(mins / 60)}시간 후` : `${Math.round(mins / 1440)}일 후`;
                    return `<div class="tool-list-row"><span class="tool-list-key">${i + 1}번째</span><span class="tool-list-val">${d.toLocaleString('ko-KR')} <span class="tool-list-dim">${human}</span></span></div>`;
                  })
                  .join('')
              : '<div class="tool-list-row"><span class="tool-list-val">앞으로 2년 안에는 실행되지 않습니다 (예: 2월 30일).</span></div>';

            status.textContent = '표준 5칸 크론 기준입니다. 시각은 이 기기의 시간대로 계산합니다.';
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('parse');
          }

          input.addEventListener('input', run);
          container.querySelectorAll('#crPresets .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              input.value = (chip as HTMLElement).dataset.v || '';
              run();
            };
          });
          run();
        }
      }
    ]
  });
})();
