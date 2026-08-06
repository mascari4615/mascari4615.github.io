/**
 * 학점 계산기 (TASK-KL-088)
 *
 * 학점은 단순 평균이 아니라 **학점 수로 가중한 평균**이다. 3학점 과목의 A와
 * 1학점 과목의 A는 무게가 다른데, 그냥 더해 나누면 이 차이가 사라진다.
 * 목표 학점을 채우려면 남은 학기에 얼마가 필요한지도 함께 낸다 — 그게 실제 질문이다.
 */
(function (): void {
  /** 4.5 만점 기준 (국내 대부분) */
  const SCALE_45: Record<string, number> = {
    'A+': 4.5, A0: 4.0, 'A-': 3.7,
    'B+': 3.5, B0: 3.0, 'B-': 2.7,
    'C+': 2.5, C0: 2.0, 'C-': 1.7,
    'D+': 1.5, D0: 1.0, 'D-': 0.7,
    F: 0
  };
  /** 4.3 만점 기준 */
  const SCALE_43: Record<string, number> = {
    'A+': 4.3, A0: 4.0, 'A-': 3.7,
    'B+': 3.3, B0: 3.0, 'B-': 2.7,
    'C+': 2.3, C0: 2.0, 'C-': 1.7,
    'D+': 1.3, D0: 1.0, 'D-': 0.7,
    F: 0
  };

  Toolbox.register({
    id: 'grade',
    title: '학점 계산기',
    category: 'tool',
    desc: '과목별 학점과 성적으로 평점을 계산합니다. 목표 학점에 필요한 성적도 함께',
    layout: 'wide',
    icon: '<path d="M12 4 2 9l10 5 10-5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '학점',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="grScale">
                <button type="button" class="tool-chip active" data-scale="45">4.5 만점</button>
                <button type="button" class="tool-chip" data-scale="43">4.3 만점</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">과목 — 한 줄에 「학점 성적」 (예: 3 A+)</label>
              <textarea id="grList" rows="8" spellcheck="false" placeholder="3 A+&#10;3 B0&#10;2 A0&#10;1 B+"></textarea>
            </div>

            <div class="cc-stats" id="grStats"></div>
            <div class="tool-list" id="grOut"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">목표 학점 채우기</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">목표 평점</div>
                  <input type="number" id="grTarget" value="4.0" step="0.1" min="0" max="4.5">
                </div>
                <div>
                  <div class="tool-sublabel">앞으로 들을 학점</div>
                  <input type="number" id="grFuture" value="18" step="1" min="1">
                </div>
              </div>
            </div>
            <div class="tool-list" id="grNeed"></div>
            <div class="tool-status" id="grStatus">학점 수로 가중한 평균입니다. 단순 평균과 다릅니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const list = $<HTMLTextAreaElement>('#grList');
          const stats = $<HTMLElement>('#grStats');
          const out = $<HTMLElement>('#grOut');
          const need = $<HTMLElement>('#grNeed');
          const status = $<HTMLElement>('#grStatus');
          let scale = SCALE_45;
          let max = 4.5;

          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const lines = list.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            let credits = 0;
            let points = 0;
            let counted = 0;
            const bad: string[] = [];
            const dist: Record<string, number> = {};

            lines.forEach((line) => {
              const m = line.match(/^([\d.]+)\s*[,\s]\s*([A-Fa-f][+\-0]?)$/);
              if (!m) {
                bad.push(line);
                return;
              }
              const c = parseFloat(m[1]);
              let g = m[2].toUpperCase();
              if (g.length === 1 && g !== 'F') g += '0'; // A → A0
              if (scale[g] === undefined) {
                bad.push(line);
                return;
              }
              credits += c;
              points += c * scale[g];
              counted++;
              dist[g] = (dist[g] || 0) + 1;
            });

            const gpa = credits ? points / credits : 0;
            const simple = counted ? Object.keys(dist).reduce((a, g) => a + scale[g] * dist[g], 0) / counted : 0;

            stats.innerHTML =
              stat('평점', credits ? gpa.toFixed(2) : '—', true) +
              stat('이수 학점', String(credits)) +
              stat('백분위 환산', credits ? `${((gpa / max) * 100).toFixed(1)}점` : '—');

            out.innerHTML =
              row('과목 수', `${counted}과목`) +
              row('학점 가중 평균', credits ? gpa.toFixed(3) : '—') +
              row('단순 평균 (참고)', counted ? simple.toFixed(3) : '—') +
              row('만점 대비', credits ? `${gpa.toFixed(2)} / ${max}` : '—') +
              (bad.length ? row('못 읽은 줄', bad.slice(0, 3).join(' · ') + (bad.length > 3 ? ` 외 ${bad.length - 3}` : '')) : '');

            // 목표를 채우려면 남은 학점에서 평균 얼마가 필요한가
            const target = parseFloat($<HTMLInputElement>('#grTarget').value);
            const future = parseFloat($<HTMLInputElement>('#grFuture').value);
            if (credits && future > 0 && isFinite(target)) {
              const required = (target * (credits + future) - points) / future;
              need.innerHTML =
                row('필요한 평균', required <= max ? required.toFixed(2) : `${required.toFixed(2)} — 만점으로도 불가능`) +
                row('가능 여부', required > max ? '이번 목표는 도달 불가' : required <= 0 ? '이미 넘었습니다' : '가능') +
                row('전부 만점이면', ((points + future * max) / (credits + future)).toFixed(2));
            } else {
              need.innerHTML = '';
            }

            status.textContent = bad.length
              ? `${bad.length}줄을 못 읽었어요. 「3 A+」 처럼 학점과 성적을 띄어 적어 주세요.`
              : '학점 수로 가중한 평균입니다. 단순 평균과 다릅니다.';
            status.className = 'tool-status' + (bad.length ? ' error' : credits ? ' ok' : '');
            Toolbox.trackUse?.('calc');
          }

          container.querySelectorAll('#grScale .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#grScale .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              const is45 = (chip as HTMLElement).dataset.scale === '45';
              scale = is45 ? SCALE_45 : SCALE_43;
              max = is45 ? 4.5 : 4.3;
              run();
            };
          });
          [list, $<HTMLInputElement>('#grTarget'), $<HTMLInputElement>('#grFuture')].forEach((el) =>
            el.addEventListener('input', run)
          );

          list.value = '3 A+\n3 B0\n2 A0\n1 B+';
          run();
        }
      }
    ]
  });
})();
