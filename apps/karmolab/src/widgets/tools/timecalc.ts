/**
 * 시간 더하기·빼기 (TASK-KL-088)
 *
 * 「9시 40분에 시작해 1시간 25분 걸리면 몇 시?」 는 60진법이라 손으로 하면 자주 틀린다.
 * 근무시간 합계(7:45 + 8:20 + …)도 마찬가지 — 계산기에 넣으면 7.45 로 읽혀 엉뚱한 값이 나온다.
 * 시각 더하기와 시간 합계를 나눠 두 가지 실수 모두 막는다.
 */
(function (): void {
  /** "1:30" / "90m" / "1h30" / "90" 을 분으로 */
  function toMinutes(raw: string): number | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    const hm = s.match(/^(\d+)\s*[:hㅅ시]\s*(\d+)?/);
    if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2] || '0', 10);
    const h = s.match(/^([\d.]+)\s*h$/);
    if (h) return Math.round(parseFloat(h[1]) * 60);
    const m = s.match(/^(\d+)\s*m?$/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  const fmt = (min: number): string => {
    const neg = min < 0;
    const a = Math.abs(min);
    return `${neg ? '-' : ''}${Math.floor(a / 60)}시간 ${a % 60}분`;
  };
  const clock = (min: number): string => {
    const d = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
  };

  Toolbox.register({
    id: 'timecalc',
    title: '시간 더하기·빼기',
    category: 'tool',
    desc: '시각에 시간을 더하거나 근무시간을 합산합니다. 60진법 실수를 막습니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16 4h5M18.5 1.5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '시간 계산',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">시각 더하기·빼기</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">시작 시각</div>
                  <input type="time" id="tcStart" value="09:40">
                </div>
                <div>
                  <div class="tool-sublabel">걸리는 시간 — 1:25 / 85m / 1.5h</div>
                  <input type="text" id="tcDur" value="1:25" spellcheck="false">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <button type="button" class="tool-chip active" data-op="add">더하기</button>
                <button type="button" class="tool-chip" data-op="sub">빼기</button>
              </div>
            </div>
            <div class="tool-display" id="tcResult">—</div>
            <div class="tool-list" id="tcOut"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">시간 합계 — 한 줄에 하나 (7:45, 8h, 90m)</label>
              <textarea id="tcList" rows="5" spellcheck="false" placeholder="7:45&#10;8:20&#10;6:50"></textarea>
            </div>
            <div class="cc-stats" id="tcSum"></div>
            <div class="tool-status" id="tcStatus">시각은 24시간을 넘으면 다음 날로 넘어갑니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const start = $<HTMLInputElement>('#tcStart');
          const dur = $<HTMLInputElement>('#tcDur');
          const result = $<HTMLElement>('#tcResult');
          const out = $<HTMLElement>('#tcOut');
          const list = $<HTMLTextAreaElement>('#tcList');
          const sum = $<HTMLElement>('#tcSum');
          const status = $<HTMLElement>('#tcStatus');
          let op = 'add';

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;
          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;

          function render(): void {
            const [sh, sm] = start.value.split(':').map(Number);
            const base = (sh || 0) * 60 + (sm || 0);
            const delta = toMinutes(dur.value);
            if (delta === null) {
              result.textContent = '—';
              out.innerHTML = '';
              status.textContent = '걸리는 시간을 1:25 / 85m / 1.5h 처럼 적어 주세요.';
              status.className = 'tool-status error';
              return;
            }
            const total = op === 'add' ? base + delta : base - delta;
            result.textContent = clock(total);
            const dayShift = Math.floor(total / 1440);
            out.innerHTML =
              row('걸리는 시간', fmt(delta)) +
              row('결과', `${clock(total)}${dayShift > 0 ? ` (${dayShift}일 뒤)` : dayShift < 0 ? ` (${-dayShift}일 전)` : ''}`) +
              row('분으로', `${delta}분`) +
              row('소수 시간', `${(delta / 60).toFixed(2)}시간`);
            status.textContent = '시각은 24시간을 넘으면 다음 날로 넘어갑니다.';
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('add');
          }

          function renderSum(): void {
            const lines = list.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (!lines.length) {
              sum.innerHTML = '';
              return;
            }
            let total = 0;
            let bad = 0;
            lines.forEach((l) => {
              const v = toMinutes(l);
              if (v === null) bad++;
              else total += v;
            });
            sum.innerHTML =
              stat('합계', fmt(total), true) +
              stat('소수 시간', `${(total / 60).toFixed(2)}시간`) +
              stat('평균', fmt(Math.round(total / Math.max(1, lines.length - bad)))) +
              (bad ? stat('못 읽은 줄', `${bad}줄`) : '');
          }

          [start, dur].forEach((el) => el.addEventListener('input', render));
          list.addEventListener('input', renderSum);
          container.querySelectorAll('[data-op]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('[data-op]').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              op = (chip as HTMLElement).dataset.op || 'add';
              render();
            };
          });

          list.value = '7:45\n8:20\n6:50';
          render();
          renderSum();
        }
      }
    ]
  });
})();
