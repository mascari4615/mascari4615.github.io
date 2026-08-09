/**
 * 학점 계산기 (TASK-KL-088)
 *
 * 학점은 단순 평균이 아니라 **학점 수로 가중한 평균**이다. 3학점 과목의 A와
 * 1학점 과목의 A는 무게가 다른데, 그냥 더해 나누면 이 차이가 사라진다.
 * 목표 학점을 채우려면 남은 학기에 얼마가 필요한지도 함께 낸다 — 그게 실제 질문이다.
 */
import { maxOf, neededAverage, parseCourses, scaleOf, spec } from '../../core/grade';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'grade',
    title: t('widgets.grade.title', undefined, "학점 계산기"),
    category: 'tool',
    desc: t('widgets-desc.grade.desc', undefined, "과목별 학점과 성적으로 평점을 계산합니다. 목표 학점에 필요한 성적도 함께"),
    layout: 'wide',
    icon: '<path d="M12 4 2 9l10 5 10-5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('grade.tab', undefined, "학점"),
        build: function (container: HTMLElement): void {
          void loadNamespace('grade').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="grScale">
                <button type="button" class="tool-chip active" data-scale="45">${esc(t('grade.scale.45'))}</button>
                <button type="button" class="tool-chip" data-scale="43">${esc(t('grade.scale.43'))}</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('grade.label.courses'))}</label>
              <textarea id="grList" rows="8" spellcheck="false" placeholder="3 A+&#10;3 B0&#10;2 A0&#10;1 B+"></textarea>
            </div>

            <div class="cc-stats" id="grStats"></div>
            <div class="tool-list" id="grOut"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">${esc(t('grade.label.target'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('grade.aria.target'))}</div>
                  <input type="number" id="grTarget" aria-label="${esc(t('grade.aria.target'))}" value="4.0" step="0.1" min="0" max="4.5">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('grade.aria.future'))}</div>
                  <input type="number" id="grFuture" aria-label="${esc(t('grade.aria.future'))}" value="18" step="1" min="1">
                </div>
              </div>
            </div>
            <div class="tool-list" id="grNeed"></div>
            <div class="tool-status" id="grStatus">${esc(t('grade.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const list = $<HTMLTextAreaElement>('#grList');
          const stats = $<HTMLElement>('#grStats');
          const out = $<HTMLElement>('#grOut');
          const need = $<HTMLElement>('#grNeed');
          const status = $<HTMLElement>('#grStatus');
          let scale = scaleOf('45');
          let max = maxOf(scale);

          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            /* 읽기·가중 평균은 `src/core/grade.ts` 가 한다 — 「단순 평균과 다르다」가
               이 도구의 요점이고, 시험도 거기에 붙어 있다 (TASK-KL-205). */
            const parsed = parseCourses(list.value, scale);
            const { credits, points, counted, bad } = parsed;

            const gpa = parsed.gpa;
            const simple = parsed.simple;

            stats.innerHTML =
              stat(t('grade.stat.gpa'), credits ? gpa.toFixed(2) : '—', true) +
              stat(t('grade.stat.credits'), String(credits)) +
              stat(t('grade.stat.percent'), credits ? t('grade.value.points', { n: ((gpa / max) * 100).toFixed(1) }) : '—');

            out.innerHTML =
              row(t('grade.row.courses'), t('grade.value.courses', { n: counted })) +
              row(t('grade.row.weighted'), credits ? gpa.toFixed(3) : '—') +
              row(t('grade.row.simple'), counted ? simple.toFixed(3) : '—') +
              row(t('grade.row.ofMax'), credits ? `${gpa.toFixed(2)} / ${max}` : '—') +
              (bad.length ? row(t('grade.row.unreadable'), bad.slice(0, 3).join(' · ') + (bad.length > 3 ? t('grade.value.andMore', { n: bad.length - 3 }) : '')) : '');

            // 목표를 채우려면 남은 학점에서 평균 얼마가 필요한가
            const target = parseFloat($<HTMLInputElement>('#grTarget').value);
            const future = parseFloat($<HTMLInputElement>('#grFuture').value);
            if (credits && future > 0 && isFinite(target)) {
              const n = neededAverage(points, credits, target, future, max);
              need.innerHTML =
                row(t('grade.row.needed'), n.possible ? n.required.toFixed(2) : t('grade.value.impossible', { n: n.required.toFixed(2) })) +
                row(t('grade.row.possible'), n.possible === false ? t('grade.verdict.no') : n.alreadyThere ? t('grade.verdict.already') : t('grade.verdict.yes')) +
                row(t('grade.row.ifPerfect'), n.best.toFixed(2));
            } else {
              need.innerHTML = '';
            }

            status.textContent = bad.length
              ? t('grade.say.unreadable', { n: bad.length })
              : t('grade.status.idle');
            status.className = 'tool-status' + (bad.length ? ' error' : credits ? ' ok' : '');
            Toolbox.trackUse?.('calc');
          }

          container.querySelectorAll('#grScale .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#grScale .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              scale = scaleOf((chip as HTMLElement).dataset.scale);
              max = maxOf(scale);
              run();
            };
          });
          [list, $<HTMLInputElement>('#grTarget'), $<HTMLInputElement>('#grFuture')].forEach((el) =>
            el.addEventListener('input', run)
          );

          list.value = '3 A+\n3 B0\n2 A0\n1 B+';
          run();
                  });
        }
      }
    ]
  });
})();
