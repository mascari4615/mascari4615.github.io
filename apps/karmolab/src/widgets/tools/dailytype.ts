/**
 * 한글 타자 데일리 — 화면 (해자③ 첫 게임)
 *
 * 골격만이다. 「게임 느낌」(색·움직임·소리·캐릭터 등장)은 사용자 몫이라 손대지 않았다 —
 * 여기서는 **돌아가는 것**까지만 만든다: 오늘 문장 세 줄, 치는 칸, 끝나면 점수와 공유 격자.
 *
 * 계산은 전부 `core/dailytype.ts` 다. 화면은 시간을 재고 글자를 모아 넘길 뿐이다.
 * 그래야 「화면에서는 320타인데 공유 글에는 250타」 같은 일이 안 생긴다.
 *
 * ★ 하루 한 판을 **막지 않는다** (11 § 3-3). 다 친 사람에게 「내일 오세요」라고 하면
 * 그 사람은 내일도 안 온다. 대신 오늘 기록을 남겨 두고 연습은 계속 열어 둔다.
 */
import { dateKST, humanLeft, msUntilNextKST, playKey } from '../../core/daily';
import { grade, puzzleFor, type Puzzle } from '../../core/dailytype';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  Toolbox.register({
    id: 'dailytype',
    title: t('widgets.dailytype.title', undefined, "오늘의 한글 타자"),
    category: 'tool',
    desc: t('widgets-desc.dailytype.desc', undefined, "매일 바뀌는 세 문장. 전원 같은 문제이고, 결과는 격자로만 공유됩니다"),
    layout: 'wide',
    tabs: [
      {
        id: 'play',
        label: t('dailytype.t04', undefined, "오늘의 타자"),
        build: function (container: HTMLElement): void {
          void loadNamespace('dailytype').then(function () {

          const today = dateKST();
          const puzzle: Puzzle = puzzleFor(today);
          const done = localStorage.getItem(playKey('hangul-type', today));

          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row" style="justify-content:space-between; align-items:baseline;">
                <strong>한글타자 #${puzzle.day}</strong>
                <span class="tool-hint">다음 문제까지 ${esc(humanLeft(msUntilNextKST()))}</span>
              </div>
              <p class="tool-hint">${esc(t('dailytype.t01'))}</p>
              <div id="dtLines"></div>
              <div class="tool-row">
                <button id="dtDone" class="tool-btn tool-btn-primary" type="button">${esc(t('dailytype.btn.dtDone'))}</button>
                <button id="dtReset" class="tool-btn" type="button">${esc(t('dailytype.btn.dtReset'))}</button>
              </div>
              <div id="dtSay" class="tool-note" role="status"></div>
              <pre id="dtShare" style="display:none; white-space:pre-wrap;"></pre>
              <button id="dtCopy" class="tool-btn" type="button" style="display:none;">${esc(t('dailytype.btn.dtCopy'))}</button>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;

          $('#dtLines').innerHTML = puzzle.lines
            .map(
              (line, i) => `
              <div style="margin:var(--space-sm) 0;">
                <div class="tool-list-val" style="opacity:.85;">${esc(line)}</div>
                <input id="dtIn${i}" class="tool-input" type="text" autocomplete="off"
                  spellcheck="false" aria-label="${i + 1}번째 문장" />
              </div>`
            )
            .join('');

          let startedAt = 0;
          const inputs = puzzle.lines.map((_, i) => $<HTMLInputElement>(`#dtIn${i}`));

          const say = (msg: string, tone = ''): void => {
            const el = $('#dtSay');
            el.textContent = msg;
            el.className = `tool-note${tone === '' ? '' : ' ' + tone}`;
          };

          /* 첫 글자를 치는 순간부터 잰다 — 화면을 연 시각부터 재면 읽는 시간까지 벌점이 된다. */
          for (const input of inputs) {
            input.addEventListener('input', () => {
              if (startedAt === 0) startedAt = Date.now();
            });
          }

          const finish = (): void => {
            if (startedAt === 0) {
              say(t('dailytype.say.05'), 'error');
              return;
            }
            const seconds = Math.max(1, (Date.now() - startedAt) / 1000);
            const report = grade(puzzle, { seconds, typed: inputs.map((i) => i.value) });
            say(t('dailytype.report', { wpm: report.perMinute, acc: report.accuracy }), 'ok');
            $('#dtShare').textContent = report.share;
            $('#dtShare').style.display = '';
            $('#dtCopy').style.display = '';
            $<HTMLButtonElement>('#dtCopy').onclick = () =>
              void Toolbox.copyText?.(report.share, { message: t('dailytype.t06') });

            /* 오늘 했다는 것만 남긴다. 막지는 않는다 — 막으면 내일도 안 온다. */
            try {
              localStorage.setItem(playKey('hangul-type', today), String(report.perMinute));
            } catch {
              /* 저장이 막힌 브라우저여도 게임은 그대로 된다 */
            }
          };

          $<HTMLButtonElement>('#dtDone').onclick = finish;
          $<HTMLButtonElement>('#dtReset').onclick = () => {
            for (const input of inputs) input.value = '';
            startedAt = 0;
            $('#dtShare').style.display = 'none';
            $('#dtCopy').style.display = 'none';
            say(t('dailytype.say.07'));
          };

          say(
            done === null
              ? t('dailytype.today', { n: puzzle.strokes })
              : t('dailytype.already', { n: done })
          );
                  });
        }
      }
    ]
  });
})();
