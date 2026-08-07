/**
 * 러닝 페이스 계산 (TASK-KL-088)
 *
 * 페이스(1km 당 시간)와 속도(시속)는 서로 역수 관계라, 하나를 알면 나머지가 정해진다.
 * 그런데 페이스는 분:초라 60진법이고 속도는 10진법이라 손으로 옮기면 자주 틀린다.
 * 목표 기록에서 필요한 페이스를 역산하는 쪽이 실제 질문이므로 그쪽도 함께 낸다.
 */
(function (): void {
  const DISTANCE: Array<[string, number]> = [
    ['5K', 5],
    ['10K', 10],
    ['하프 (21.0975km)', 21.0975],
    ['풀코스 (42.195km)', 42.195]
  ];

  const mmss = (sec: number): string => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const hms = (sec: number): string => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    return `${h ? h + '시간 ' : ''}${Math.floor((s % 3600) / 60)}분 ${s % 60}초`;
  };

  Toolbox.register({
    id: 'pace',
    title: '러닝 페이스 계산',
    category: 'tool',
    desc: '페이스와 속도를 서로 바꾸고 목표 기록에 필요한 페이스를 역산합니다',
    layout: 'wide',
    icon: '<circle cx="17" cy="5" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 21l2-6-3-2 1-4 3 2 2 1M9 12l-2 3-3 1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '페이스',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">페이스 (분:초 / km)</div>
                  <input type="text" id="paPace" value="6:00" spellcheck="false" aria-label="페이스 (분:초 / km)">
                </div>
                <div>
                  <div class="tool-sublabel">속도 (km/h)</div>
                  <input type="number" id="paSpeed" value="10" step="0.1" min="0.1" aria-label="속도 (km/h)">
                </div>
              </div>
            </div>

            <div class="tool-sublabel" style="margin:14px 0 6px;">이 페이스로 달리면</div>
            <div class="tool-list" id="paTimes"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">목표 기록에서 페이스 역산</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">거리</div>
                  <select id="paDist" aria-label="거리"></select>
                </div>
                <div>
                  <div class="tool-sublabel">목표 기록 (시:분:초)</div>
                  <input type="text" id="paGoal" aria-label="목표 기록 (시:분:초)" value="0:50:00" spellcheck="false">
                </div>
              </div>
            </div>
            <div class="tool-list" id="paNeed"></div>
            <div class="tool-status" id="paStatus">페이스는 60진법, 속도는 10진법이라 손으로 옮기면 틀리기 쉽습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const paceEl = $<HTMLInputElement>('#paPace');
          const speedEl = $<HTMLInputElement>('#paSpeed');
          const times = $<HTMLElement>('#paTimes');
          const need = $<HTMLElement>('#paNeed');
          let syncing = false;

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          $<HTMLSelectElement>('#paDist').innerHTML = DISTANCE.map(([n, km]) => `<option value="${km}">${n}</option>`).join('');
          $<HTMLSelectElement>('#paDist').value = '10';

          function paceSeconds(): number {
            const m = paceEl.value.match(/^(\d+)\s*[:분]\s*(\d+)?/);
            if (!m) return 0;
            return parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10);
          }

          function renderTimes(): void {
            const sec = paceSeconds();
            if (!sec) {
              times.innerHTML = '';
              return;
            }
            times.innerHTML = DISTANCE.map(([n, km]) => row(n, hms(sec * km))).join('');
          }

          function fromPace(): void {
            if (syncing) return;
            const sec = paceSeconds();
            if (!sec) return;
            syncing = true;
            speedEl.value = (3600 / sec).toFixed(2);
            syncing = false;
            renderTimes();
            renderNeed();
            Toolbox.trackUse?.('pace');
          }

          function fromSpeed(): void {
            if (syncing) return;
            const v = parseFloat(speedEl.value);
            if (!(v > 0)) return;
            syncing = true;
            paceEl.value = mmss(3600 / v);
            syncing = false;
            renderTimes();
            renderNeed();
          }

          function renderNeed(): void {
            const km = parseFloat($<HTMLSelectElement>('#paDist').value);
            const g = $<HTMLInputElement>('#paGoal').value.match(/^(\d+)\s*:\s*(\d+)\s*:?\s*(\d+)?$/);
            if (!g || !km) {
              need.innerHTML = '';
              return;
            }
            const goalSec = parseInt(g[1], 10) * 3600 + parseInt(g[2], 10) * 60 + parseInt(g[3] || '0', 10);
            const perKm = goalSec / km;
            need.innerHTML =
              row('필요한 페이스', `${mmss(perKm)} / km`) +
              row('필요한 속도', `${(3600 / perKm).toFixed(2)} km/h`) +
              row('현재 페이스로는', hms(paceSeconds() * km)) +
              row('차이', `${paceSeconds() * km <= goalSec ? '목표 안쪽' : '초과'} ${hms(Math.abs(paceSeconds() * km - goalSec))}`);
          }

          paceEl.addEventListener('input', fromPace);
          speedEl.addEventListener('input', fromSpeed);
          $<HTMLInputElement>('#paGoal').addEventListener('input', renderNeed);
          $<HTMLSelectElement>('#paDist').addEventListener('change', renderNeed);

          fromPace();
        }
      }
    ]
  });
})();
