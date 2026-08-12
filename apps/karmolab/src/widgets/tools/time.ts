/**
 * 때 — **한 순간을 정하면, 나머지는 그 순간의 얼굴** (TASK-KL-088 → TASK-KL-267)
 *
 * 때 도구는 여덟이었고 전부 칸 채우는 양식이었다(D-Day 는 D-Day 칸에, 시차는 시차 칸에).
 * 그런데 사람이 들고 오는 건 늘 하나다 — **「그 때」**. 「내일 오후 3시」·「2026-09-01」·
 * 「1755043200」·「3주 뒤」 는 전부 **같은 것을 가리키는 다른 말**이다.
 *
 * 그래서 이 화면은 말 한 줄을 받아 순간을 정하고(`shared/when`), 그 순간의 얼굴을 **한꺼번에**
 * 보여 준다: 날짜·요일 / 시각 / D-Day / 몇 주차 / 유닉스 초 / ISO / 다른 도시의 시각.
 * 전에는 이 일곱을 보려면 탭을 일곱 번 옮기며 같은 날짜를 일곱 번 적어야 했다.
 *
 * 도시 표는 World Time Buddy·timeanddate 의 회의 계획표를 보고 들여왔다 — 여러 도시를
 * 한 줄에 늘어놓고 **일하는 시간인지 색으로** 가른다. 다만 우리는 바깥에 안 기댄다:
 * 시간대는 브라우저가 가진 표(`Intl`)로 낸다(서머타임까지 그쪽이 안다).
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { parseWhen, facesOf, inZones } from './shared/when';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('time.group.date', undefined, '날짜 셈'),
      jobs: [
        ['datecalc', t('time.part.datecalc', undefined, '날짜 · D-Day')],
        ['workdays', t('time.part.workdays', undefined, '영업일')],
        ['timecalc', t('time.part.timecalc', undefined, '시간 더하기')],
        ['birth', t('time.part.birth', undefined, '생일')]
      ]
    },
    {
      label: t('time.group.count', undefined, '재기'),
      jobs: [
        ['timer', t('time.part.timer', undefined, '타이머')],
        ['countdown', t('time.part.countdown', undefined, '카운트다운')],
        ['stopwatch', t('time.part.stopwatch', undefined, '스톱워치')],
        ['pace', t('time.part.pace', undefined, '러닝 페이스')]
      ]
    },
    {
      label: t('time.group.form', undefined, '다른 표기'),
      jobs: [
        ['epoch', t('time.part.epoch', undefined, '타임스탬프')],
        ['worldclock', t('time.part.worldclock', undefined, '세계 시차')],
        ['cron', t('time.part.cron', undefined, '크론')],
        ['icsmake', t('time.part.icsmake', undefined, '일정 파일')]
      ]
    }
  ];

  /* 때 도구는 전부 자기 칸에 날짜를 받는 양식이라 글을 넘겨줄 자리가 없다 — 안 넘긴다. */
  const NO_INPUT_NEEDED = new Set(GROUPS().flatMap((g) => g.jobs.map(([id]) => id)));

  /** 여기 사는 사람이 실제로 볼 도시들. 늘어놓는 게 아니라 **골라 둔다**. */
  const ZONES = ['Asia/Seoul', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];

  Toolbox.register({
    id: 'time',
    title: t('widgets.time.title', undefined, '시간'),
    category: 'tool',
    desc: t('widgets-desc.time.desc', undefined, '날짜 계산·D-Day·타이머·스톱워치·세계 시차를 한 곳에서'),
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('time.tab', undefined, '때'),
        build: function (container: HTMLElement): void {
          void loadNamespace('time').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      intake: 'text',
      live: true,
      accept: 'text/*',
      groups: GROUPS,
      noInputNeeded: NO_INPUT_NEEDED,
      accepts: /^text\//i,
      drop: {
        title: t('time.drop.title', undefined, '언제인지 말로 적으세요'),
        hint: t('time.drop.hint', undefined, '내일 오후 3시 · 2026-09-01 · 3주 뒤 · 다음 주 월요일 · 1755043200')
      },
      labels: {
        change: t('time.btn.change', undefined, '다시 적기'),
        back: t('time.btn.back', undefined, '할 일 고르기'),
        chain: t('time.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('time.preview.fail', undefined, '언제인지 못 알아들었습니다'),
        pasted: t('time.pasted', undefined, '고른 때')
      },
      preview: drawWhen
    });

    const box = container.querySelector<HTMLTextAreaElement>('#pfText');
    if (box && !box.value) {
      box.value = t('time.sample', undefined, '내일 오후 3시');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /** 왼쪽 칸 = 그 순간의 얼굴들 + 도시별 시각. **이 함수만 때를 안다.** */
  async function drawWhen(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const raw = (await file.text()).split(/\r?\n/)[0];
    if (!alive()) return '';
    const p = parseWhen(raw);
    if (!p.at) {
      box.innerHTML = `<div class="pf-empty" id="tmNone">${t('time.none', undefined, '언제인지 못 알아들었습니다 — 「내일 오후 3시」 처럼 적어 보세요')}</div>`;
      return t('time.meta.none', undefined, '못 알아들음');
    }

    const how = document.createElement('div');
    how.className = 'tm-how';
    how.id = 'tmHow';
    how.textContent = t('time.how', { how: p.how }, `「${p.how}」 로 읽었습니다`);
    box.appendChild(how);

    const faces = document.createElement('div');
    faces.className = 'tm-faces';
    faces.id = 'tmFaces';
    for (const f of facesOf(p.at)) {
      const row = document.createElement('div');
      row.className = 'tm-face';
      row.dataset.face = f.label;
      const k = document.createElement('span');
      k.textContent = f.label;
      const v = document.createElement('strong');
      v.textContent = f.value;
      /* 눌러서 복사 — 유닉스 초·ISO 는 **다른 데 옮겨 적으려고** 보는 것이다 */
      row.onclick = (): void => {
        void navigator.clipboard?.writeText(f.value);
        row.classList.add('tm-copied');
        window.setTimeout(() => row.classList.remove('tm-copied'), 900);
      };
      row.appendChild(k);
      row.appendChild(v);
      faces.appendChild(row);
    }
    box.appendChild(faces);

    const cities = document.createElement('div');
    cities.className = 'tm-cities';
    cities.id = 'tmCities';
    for (const z of inZones(p.at, ZONES)) {
      const row = document.createElement('div');
      row.className = 'tm-city';
      /* 일하는 시간인지 색으로 가른다(timeanddate 회의 계획표) — 09~18시면 편한 때다 */
      const hour = Number(z.value.match(/(\d{1,2}):/)?.[1] ?? -1);
      if (hour >= 9 && hour < 18) row.classList.add('tm-ok');
      else if (hour >= 7 && hour < 22) row.classList.add('tm-meh');
      else row.classList.add('tm-bad');
      const k = document.createElement('span');
      k.textContent = z.label;
      const v = document.createElement('strong');
      v.textContent = z.value;
      row.appendChild(k);
      row.appendChild(v);
      cities.appendChild(row);
    }
    box.appendChild(cities);

    const f = facesOf(p.at);
    return `${f[0].value}${p.hasTime ? ' ' + f[1].value : ''} · ${f[2].value}`;
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.tm-how{font-size:12px;opacity:.6;margin-bottom:8px;}
.tm-faces{display:grid;gap:5px;margin-bottom:12px;}
.tm-face{display:flex;justify-content:space-between;gap:10px;align-items:baseline;cursor:copy;
  padding:7px 11px;border-radius:9px;border:1px solid rgba(128,128,128,.22);}
.tm-face:hover{border-color:rgba(128,160,255,.6);}
.tm-face span{font-size:11px;opacity:.6;}
.tm-face strong{font-variant-numeric:tabular-nums;font-size:13px;word-break:break-all;text-align:right;}
.tm-face.tm-copied{border-color:rgba(120,200,140,.8);background:rgba(120,200,140,.14);}
.tm-cities{display:grid;gap:4px;}
.tm-city{display:flex;justify-content:space-between;gap:10px;padding:5px 11px;border-radius:8px;font-size:12px;}
.tm-city strong{font-variant-numeric:tabular-nums;}
.tm-city.tm-ok{background:rgba(120,200,140,.16);}
.tm-city.tm-meh{background:rgba(220,190,120,.14);}
.tm-city.tm-bad{background:rgba(128,128,128,.1);opacity:.65;}
`;
    document.head.appendChild(el);
  }
})();
