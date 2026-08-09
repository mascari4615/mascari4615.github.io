/**
 * 크론 표현식 읽기 (TASK-KL-088)
 *
 * 간격 표기와 범위 표기를 헷갈리면 「매일 새벽에 한 번」 이 「1분마다」 가 된다.
 * 그래서 뜻풀이만 주지 않고 **다음 실행 시각 5개를 실제로 계산해** 보여준다 —
 * 사람의 해석이 아니라 기계의 답으로 확인되는 형태.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** 남은 시간의 단위는 **Intl 이 그 언어로 적어 준다** — 분/시간/일을 언어마다 적을 필요가 없다. */
  function humanGap(mins: number): string {
    const [n, unit]: [number, Intl.NumberFormatOptions['unit']] =
      mins < 60 ? [mins, 'minute'] : mins < 1440 ? [Math.round(mins / 60), 'hour'] : [Math.round(mins / 1440), 'day'];
    return new Intl.NumberFormat(locale(), { style: 'unit', unit, unitDisplay: 'long' }).format(n);
  }
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  const DOW = [t('cron.day.sun'), t('cron.day.mon'), t('cron.day.tue'), t('cron.day.wed'), t('cron.day.thu'), t('cron.day.fri'), t('cron.day.sat')];

  /** 사람 문장으로 옮긴다 — 값이 전부면 「매」, 몇 개면 나열. */
  function describe(f: Field, total: number, unit: string, fmt?: (n: number) => string): string {
    const show = (n: number): string => (fmt ? fmt(n) : String(n));
    if (f.values.length === total) return '';
    if (f.values.length === 1) return `${show(f.values[0])}${unit}`;
    if (f.values.length > 8) return t('cron.value.count', { n: f.values.length, unit });
    return f.values.map(show).join(',') + unit;
  }

  Toolbox.register({
    id: 'cron',
    title: t('widgets.cron.title', undefined, "크론 표현식 읽기"),
    category: 'tool',
    desc: t('widgets-desc.cron.desc', undefined, "크론 표현식을 우리말로 풀고 다음 실행 시각을 실제로 계산해 보여줍니다"),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 4l2 2M21 4l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('cron.tab', undefined, "읽기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('cron').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('cron.label.expr'))}</label>
              <input type="text" id="crIn" spellcheck="false" value="0 9 * * 1-5" placeholder="0 9 * * 1-5">
            </div>

            <div class="field-group">
              <div class="tool-chips" id="crPresets">
                <button type="button" class="tool-chip" data-v="* * * * *">${esc(t('cron.ex.everyMinute'))}</button>
                <button type="button" class="tool-chip" data-v="*/10 * * * *">${esc(t('cron.ex.every10'))}</button>
                <button type="button" class="tool-chip" data-v="0 * * * *">${esc(t('cron.ex.hourly'))}</button>
                <button type="button" class="tool-chip" data-v="0 9 * * 1-5">${esc(t('cron.ex.weekday9'))}</button>
                <button type="button" class="tool-chip" data-v="0 0 1 * *">${esc(t('cron.ex.monthly'))}</button>
                <button type="button" class="tool-chip" data-v="30 3 * * 0">${esc(t('cron.ex.sunday330'))}</button>
              </div>
            </div>

            <div class="tool-display" id="crText">—</div>
            <div class="tool-list" id="crNext"></div>
            <div class="tool-status" id="crStatus">${esc(t('cron.status.idle'))}</div>
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
              status.textContent = t('cron.err.fields');
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
              status.textContent = t('cron.err.parse');
              status.className = 'tool-status error';
              return;
            }

            const bits = [
              describe(mo, 12, t('cron.day.mon'), (n) => `${n}`),
              describe(dw, 7, t('cron.unit.weekday'), (n) => DOW[n]),
              describe(da, 31, t('cron.day.sun')),
              describe(ho, 24, t('cron.unit.hour')),
              describe(mi, 60, t('cron.unit.minute'))
            ].filter(Boolean);
            text.textContent = bits.length ? bits.join(' ') + t('cron.phrase.runAt') : t('cron.phrase.everyMinute');

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
                      t('cron.phrase.after', { d: humanGap(mins) });
                    return `<div class="tool-list-row"><span class="tool-list-key">${esc(t('cron.value.nth', { n: i + 1 }))}</span><span class="tool-list-val">${d.toLocaleString(locale())} <span class="tool-list-dim">${human}</span></span></div>`;
                  })
                  .join('')
              : t('cron.list.never');

            status.textContent = t('cron.status.idle');
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
                  });
        }
      }
    ]
  });
})();
