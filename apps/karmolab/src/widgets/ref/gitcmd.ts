/**
 * git 명령어 모음 (TASK-KL-088)
 *
 * git 은 「무엇을 하고 싶은가」 와 명령 이름이 안 맞아서 검색으로 나가게 된다.
 * 그래서 항목의 **이름을 상황으로** 적는다 — "reset --hard" 가 아니라 "고친 걸 전부 버리고 싶다".
 * 되돌릴 수 없는 명령은 위험 분류로 따로 묶었다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { SCENARIOS, stepsFor, worstRisk } from '../../core/gitundo';
import { markLive } from '../tools/shared/say';

(function (): void {
  /** [명령, 상황(=이름), 설명] */
  /* 표는 **쓸 때** 짓는다 — 실려 오는 순간 지으면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const git = (): Record<string, Array<[string, string, string]>> => ({
    [t('gitcmd.t01')]: [
      ['git status', t('gitcmd.t02'), t('gitcmd.t03')],
      ['git diff', t('gitcmd.t04'), t('gitcmd.t05')],
      ['git diff --staged', t('gitcmd.t06'), t('gitcmd.t07')],
      ['git log --oneline -10', t('gitcmd.t08'), t('gitcmd.t09')],
      ['git log --oneline --graph --all', t('gitcmd.t10'), t('gitcmd.t11')],
      [t('gitcmd.t12'), t('gitcmd.t13'), t('gitcmd.t14')],
      [t('gitcmd.t15'), t('gitcmd.t16'), t('gitcmd.t17')],
      [t('gitcmd.t18'), t('gitcmd.t19'), t('gitcmd.t20')]
    ],
    [t('gitcmd.t21')]: [
      [t('gitcmd.t22'), t('gitcmd.t23'), t('gitcmd.t24')],
      ['git add -p', t('gitcmd.t25'), t('gitcmd.t26')],
      [t('gitcmd.t27'), t('gitcmd.t28'), ''],
      ['git commit --amend', t('gitcmd.t29'), t('gitcmd.t30')],
      [t('gitcmd.t31'), t('gitcmd.t32'), t('gitcmd.t33')]
    ],
    [t('gitcmd.t34')]: [
      [t('gitcmd.t35'), t('gitcmd.t36'), t('gitcmd.t37')],
      [t('gitcmd.t38'), t('gitcmd.t39'), ''],
      ['git branch -a', t('gitcmd.t40'), t('gitcmd.t41')],
      [t('gitcmd.t42'), t('gitcmd.t43'), t('gitcmd.t44')],
      [t('gitcmd.t45'), t('gitcmd.t46'), t('gitcmd.t47')],
      [t('gitcmd.t48'), t('gitcmd.t49'), t('gitcmd.t50')],
      [t('gitcmd.t51'), t('gitcmd.t52'), '']
    ],
    [t('gitcmd.t53')]: [
      ['git fetch', t('gitcmd.t54'), t('gitcmd.t55')],
      ['git pull', t('gitcmd.t56'), 'fetch + merge'],
      ['git pull --rebase', t('gitcmd.t57'), t('gitcmd.t58')],
      ['git push', t('gitcmd.t59'), ''],
      [t('gitcmd.t60'), t('gitcmd.t61'), t('gitcmd.t62')],
      ['git remote -v', t('gitcmd.t63'), '']
    ],
    [t('gitcmd.t64')]: [
      [t('gitcmd.t65'), t('gitcmd.t66'), t('gitcmd.t67')],
      [t('gitcmd.t68'), t('gitcmd.t69'), t('gitcmd.t70')],
      ['git reset --soft HEAD~1', t('gitcmd.t71'), t('gitcmd.t72')],
      ['git reset --mixed HEAD~1', t('gitcmd.t73'), t('gitcmd.t74')],
      ['git reflog', t('gitcmd.t75'), t('gitcmd.t76')]
    ],
    [t('gitcmd.t77')]: [
      ['git stash', t('gitcmd.t78'), t('gitcmd.t79')],
      ['git stash pop', t('gitcmd.t80'), t('gitcmd.t81')],
      ['git stash list', t('gitcmd.t82'), ''],
      [t('gitcmd.t83'), t('gitcmd.t84'), t('gitcmd.t85')]
    ],
    [t('gitcmd.t86')]: [
      ['git reset --hard', t('gitcmd.t87'), t('gitcmd.t88')],
      ['git clean -fd', t('gitcmd.t89'), t('gitcmd.t90')],
      ['git push --force', t('gitcmd.t91'), t('gitcmd.t92')],
      [t('gitcmd.t93'), t('gitcmd.t94'), t('gitcmd.t95')]
    ],
    [t('gitcmd.t96')]: [
      [t('gitcmd.t97'), t('gitcmd.t98'), ''],
      [t('gitcmd.t99'), t('gitcmd.t100'), ''],
      ['git config --global init.defaultBranch main', t('gitcmd.t101'), ''],
      ['git config --list', t('gitcmd.t102'), '']
    ]
  });

  Toolbox.register({
    id: 'gitcmd',
    title: t('widgets.gitcmd.title', undefined, "git 명령어 모음"),
    category: 'ref',
    desc: t('widgets-desc.gitcmd.desc', undefined, "하려는 일로 git 명령어를 찾습니다. 되돌릴 수 없는 명령은 따로 표시"),
    layout: 'wide',
    icon: '<circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 8.5v7M8.5 6h5a4 4 0 0 1 4 4v0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('gitcmd.t105', undefined, "명령어"),
        build: function (container: HTMLElement): void {
          void loadNamespace('gitcmd').then(function () {

          Mdd.linePreset('tool_run', { msg: t('gitcmd.t106') });
          const table = git();
          const items = Object.keys(table).flatMap((group) =>
            table[group].map(([cmd, label, desc]) => ({
              copy: cmd,
              glyph: cmd,
              label,
              sub: desc,
              keywords: `${cmd} ${label} ${desc}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: t('gitcmd.t107'),
            copyNoun: t('gitcmd.t105'),
            layout: 'list',
            note: t('gitcmd.t108')
          });
                  });
        }
      },
      {
        /*
         * 「망했다」 — 찾아보는 표가 아니라 **묻고 답하는 자리** (TASK-KL-316 / 12).
         *
         * 위 표는 「하려는 일 → 명령」이라 되돌리기에는 모자란다. 되돌리기는 **밀었냐 안 밀었냐**로
         * 답이 갈리고, 그 조건을 빼고 명령만 복사해 가는 데서 사고가 난다. 그래서 조건을 먼저 묻는다.
         * 셈은 `core/gitundo`, 말은 여기서.
         */
        id: 'undo',
        label: t('gitundo.tab', undefined, '망했다'),
        build: function (container: HTMLElement): void {
          void Promise.all([loadNamespace('gitcmd'), loadNamespace('gitundo')]).then(function () {
            drawUndo(container);
          });
        }
      }
    ]
  });

  function drawUndo(container: HTMLElement): void {
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="guWhat">${esc(t('gitundo.label.what'))}</label>
        <select id="guWhat" name="what" aria-label="${esc(t('gitundo.label.what'))}">
          ${SCENARIOS.map((s) => `<option value="${s.id}">${esc(t('gitundo.case.' + s.id))}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap;">
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="guPushed" name="pushed" style="width:auto;"> ${esc(t('gitundo.ask.pushed'))}
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="guShared" name="shared" style="width:auto;"> ${esc(t('gitundo.ask.shared'))}
        </label>
      </div>
      <div id="guWarn" style="display:none; padding:10px; border-radius:10px; margin-bottom:10px;"></div>
      <div id="guSteps" class="tool-list"></div>
      <div class="tool-status" id="guStatus">${esc(t('gitundo.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#guStatus');
    markLive(status);

    function render(): void {
      const id = $<HTMLSelectElement>('#guWhat').value;
      const pushed = $<HTMLInputElement>('#guPushed').checked;
      const shared = $<HTMLInputElement>('#guShared').checked;
      const steps = stepsFor(id, { pushed, shared });
      const risk = worstRisk(steps);

      const warn = $<HTMLElement>('#guWarn');
      if (risk === 'safe') {
        warn.style.display = 'none';
      } else {
        warn.style.display = '';
        warn.style.background = risk === 'destructive' ? 'rgba(198,40,40,.12)' : 'rgba(230,160,30,.12)';
        warn.textContent = t('gitundo.warn.' + risk);
      }

      $<HTMLElement>('#guSteps').innerHTML = steps
        .map((step, i) => {
          const color = step.risk === 'destructive' ? 'var(--accent-danger, #c62828)' : step.risk === 'rewrite' ? 'var(--accent-warn, #b26a00)' : 'inherit';
          const back = step.undoable ? t('gitundo.undoable') : t('gitundo.notUndoable');
          return (
            '<div class="tool-list-row cc-copy-row" data-copy="' + esc(step.cmd) + '">' +
            '<span class="tool-list-key" style="color:' + color + '">' + (i + 1) + '</span>' +
            '<span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(step.cmd) + '</span>' +
            '<span class="tool-list-dim">' + esc(t('gitundo.step.' + step.why)) + ' · ' + esc(back) + '</span></div>'
          );
        })
        .join('');

      status.textContent = t('gitundo.status.ok', { n: steps.length });
    }

    container.querySelectorAll('select, input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));
    /* 줄을 누르면 그 명령을 복사한다 — 어차피 복사하려고 여기 온 것이다. */
    $<HTMLElement>('#guSteps').addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest('.cc-copy-row');
      if (row === null) return;
      const cmd = row.getAttribute('data-copy') ?? '';
      void Toolbox.copyText?.(cmd, { message: t('gitundo.copied') });
    });

    render();
  }
})();
