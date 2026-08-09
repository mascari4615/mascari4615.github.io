/**
 * 추첨 · 팀 나누기 (TASK-KL-088)
 *
 * 「한 명 뽑기」 와 「팀 나누기」 와 「순서 정하기」 는 결국 같은 요구다 — 목록을 공정하게 섞는 것.
 * 셋을 따로 만들면 명단을 세 번 붙여 넣어야 하니 한 화면에 둔다.
 *
 * 섞기는 Fisher-Yates 를 쓴다. `sort(() => Math.random() - 0.5)` 은 흔히 쓰이지만
 * 비교 함수가 일관되지 않아 자리마다 확률이 치우친다 — 공정함이 이 도구의 존재 이유라 안 쓴다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  Toolbox.register({
    id: 'pick',
    title: t('widgets.pick.title', undefined, "추첨 · 팀 나누기"),
    category: 'tool',
    desc: t('widgets-desc.pick.desc', undefined, "명단에서 무작위로 뽑고, 팀을 나누고, 순서를 정합니다. 중복 없이 공정하게"),
    layout: 'form',
    icon: '<circle cx="7" cy="8" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="17" cy="8" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 20a5 5 0 0 1 10 0M12 20a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pick.tab', undefined, "추첨"),
        build: function (container: HTMLElement): void {
          void loadNamespace('pick').then(function () {

          Mdd.linePreset('tool_run', { msg: t('pick.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('pick.label.list'))}</label>
              <textarea id="pkList" rows="6" spellcheck="false" placeholder="${esc(t('pick.ph.list'))}"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-chips" id="pkMode">
                <button type="button" class="tool-chip active" data-mode="one">${esc(t('pick.mode.pick'))}</button>
                <button type="button" class="tool-chip" data-mode="team">${esc(t('pick.mode.team'))}</button>
                <button type="button" class="tool-chip" data-mode="order">${esc(t('pick.mode.order'))}</button>
              </div>
            </div>

            <div class="field-group" id="pkCountWrap">
              <div class="tool-sublabel" id="pkCountLabel">${esc(t('pick.label.count'))} <span id="pkCountVal" class="range-value">${esc(t('pick.value.count'))}</span></div>
              <input type="range" id="pkCount" aria-label="${esc(t('pick.label.count'))}" min="1" max="10" value="1">
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="pkRun">${esc(t('pick.btn.run'))}</button>
              <button class="btn btn-ghost" id="pkCopy">${esc(t('pick.btn.copy'))}</button>
            </div>

            <div class="tool-list" id="pkResult"></div>
            <div class="tool-status" id="pkStatus">${esc(t('pick.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const listEl = $<HTMLTextAreaElement>('#pkList');
          const countEl = $<HTMLInputElement>('#pkCount');
          const countVal = $<HTMLElement>('#pkCountVal');
          const countLabel = $<HTMLElement>('#pkCountLabel');
          const result = $<HTMLElement>('#pkResult');
          const status = $<HTMLElement>('#pkStatus');
          let mode = 'one';

          const names = (): string[] => listEl.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}</span><span class="tool-list-val">${esc(v)}</span></div>`;

          function syncLabel(): void {
            const n = parseInt(countEl.value, 10);
            countLabel.firstChild!.textContent = mode === 'team' ? t('pick.label.howManyTeams') : t('pick.label.howManyPeople');
            countVal.textContent = mode === 'team' ? t('pick.value.teams', { n }) : t('pick.value.people', { n });
            $<HTMLElement>('#pkCountWrap').style.display = mode === 'order' ? 'none' : '';
          }

          function run(): void {
            const list = names();
            if (list.length < 2) {
              result.innerHTML = '';
              status.textContent = t('pick.err.tooFew');
              status.className = 'tool-status error';
              return;
            }
            const shuffled = shuffle(list);
            const n = Math.min(parseInt(countEl.value, 10), list.length);

            if (mode === 'one') {
              result.innerHTML = shuffled.slice(0, n).map((name, i) => row(t('pick.value.nth', { n: i + 1 }), name)).join('');
              status.textContent = t('pick.say.picked', { total: list.length, n });
            } else if (mode === 'team') {
              // 나머지를 앞 팀부터 한 명씩 얹어 인원 차이를 1 이하로 유지한다.
              const teams: string[][] = Array.from({ length: n }, () => []);
              shuffled.forEach((name, i) => teams[i % n].push(name));
              result.innerHTML = teams
                .map((team, i) => row(t('pick.value.teamOf', { n: i + 1, size: team.length }), team.join(', ')))
                .join('');
              status.textContent = t('pick.say.teamed', { total: list.length, n });
            } else {
              result.innerHTML = shuffled.map((name, i) => row(t('pick.value.no', { n: i + 1 }), name)).join('');
              status.textContent = t('pick.say.ordered', { total: list.length });
            }
            status.className = 'tool-status ok';
            Toolbox.trackUse?.(mode);
          }

          container.querySelectorAll('#pkMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#pkMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'one';
              countEl.value = mode === 'team' ? '2' : '1';
              syncLabel();
              run();
            };
          });
          countEl.addEventListener('input', () => {
            syncLabel();
            run();
          });
          $<HTMLButtonElement>('#pkRun').onclick = run;
          $<HTMLButtonElement>('#pkCopy').onclick = async () => {
            const text = [...result.querySelectorAll('.tool-list-row')]
              .map((r) => `${r.querySelector('.tool-list-key')?.textContent}: ${r.querySelector('.tool-list-val')?.textContent}`)
              .join('\n');
            if (!text) return;
            await Toolbox.copyText?.(text, { message: t('pick.copy.done') });
          };

          listEl.value = t('pick.sample');
          syncLabel();
          run();
                  });
        }
      }
    ]
  });
})();
