/**
 * 초성 맞히기 데일리 — 화면 (해자③ 둘째 게임)
 *
 * 골격만이다. 놀이 느낌(색·움직임·소리·캐릭터)은 사용자 몫이라 손대지 않았다.
 *
 * 계산·정답은 전부 `core/dailycho.ts` 다. 여기서 정답을 다시 만들면 화면과 공유 격자가
 * 서로 다른 말을 하게 된다.
 *
 * ★ 이 화면에서 절대 하면 안 되는 것 — **정답을 미리 DOM 에 넣는 것.**
 * 「맞히면 보여 준다」를 하려고 답을 숨겨 두면, 개발자 도구를 여는 순간 놀이가 끝난다.
 * 그래서 답은 자바스크립트 변수로만 들고 있고, 맞힌 칸에만 글자로 그린다.
 */
import { dateKST, humanLeft, msUntilNextKST, playKey } from '../../core/daily';
import { grade, puzzleFor, type ChoPuzzle } from '../../core/dailycho';

(function (): void {
  const esc = (s: string): string => s.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));

  Toolbox.register({
    id: 'dailycho',
    title: '오늘의 초성 맞히기',
    category: 'tool',
    desc: '초성만 보고 낱말 다섯 개. 답은 이 사이트의 도구 이름입니다',
    tabs: [
      {
        label: '오늘의 초성',
        build: function (container: HTMLElement): void {
          const today = dateKST();
          const puzzle: ChoPuzzle = puzzleFor(today);
          const done = localStorage.getItem(playKey('cho-quiz', today));

          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row" style="justify-content:space-between; align-items:baseline;">
                <strong>초성 #${puzzle.day}</strong>
                <span class="tool-hint">다음 문제까지 ${esc(humanLeft(msUntilNextKST()))}</span>
              </div>
              <p class="tool-hint">답은 이 사이트에 있는 도구의 이름입니다. 맞히면 어떤 도구인지 알려 줍니다.</p>
              <div id="chList"></div>
              <div class="tool-row">
                <button id="chDone" class="tool-btn tool-btn-primary" type="button">채점</button>
                <button id="chReset" class="tool-btn" type="button">지우기</button>
              </div>
              <div id="chSay" class="tool-note" role="status"></div>
              <pre id="chShare" style="display:none; white-space:pre-wrap;"></pre>
              <button id="chCopy" class="tool-btn" type="button" style="display:none;">결과 복사</button>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;

          /* 초성과 글자 수만 그린다 — 답도, 어떤 도구인지도 아직 안 그린다. */
          $('#chList').innerHTML = puzzle.questions
            .map(
              (q, i) => `
              <div class="tool-list-row" style="align-items:center; gap:var(--space-sm);">
                <span class="tool-list-key" style="min-width:7em; letter-spacing:.2em;">${esc(q.hint)}</span>
                <span class="tool-hint">${q.length}글자</span>
                <input id="chIn${i}" class="tool-input" type="text" autocomplete="off"
                  spellcheck="false" maxlength="8" aria-label="${i + 1}번째 답" style="max-width:12em;" />
                <span id="chMark${i}" aria-live="polite"></span>
              </div>`
            )
            .join('');

          const inputs = puzzle.questions.map((_, i) => $<HTMLInputElement>(`#chIn${i}`));
          const say = (msg: string, tone = ''): void => {
            const el = $('#chSay');
            el.textContent = msg;
            el.className = `tool-note${tone === '' ? '' : ' ' + tone}`;
          };

          const check = (): void => {
            const report = grade(puzzle, inputs.map((el) => el.value));
            puzzle.questions.forEach((q, i) => {
              const mark = $(`#chMark${i}`);
              if (report.marks[i] === 'hit') {
                /* 맞힌 칸에만 도구를 알려 준다 — 이게 이 놀이가 사이트를 가르치는 자리다. */
                mark.textContent = `🟩 ${q.tool}`;
              } else {
                mark.textContent = report.marks[i] === 'near' ? '🟨 한 글자 다름' : '⬛';
              }
            });
            say(`${report.right}/${puzzle.questions.length} 맞힘`, report.right === puzzle.questions.length ? 'ok' : '');
            $('#chShare').textContent = report.share;
            $('#chShare').style.display = '';
            $('#chCopy').style.display = '';
            $<HTMLButtonElement>('#chCopy').onclick = () =>
              void Toolbox.copyText?.(report.share, { message: '결과를 복사했어요 (정답은 안 담겨요)' });

            try {
              localStorage.setItem(playKey('cho-quiz', today), String(report.right));
            } catch {
              /* 저장이 막힌 브라우저여도 놀이는 그대로 된다 */
            }
          };

          $<HTMLButtonElement>('#chDone').onclick = check;
          $<HTMLButtonElement>('#chReset').onclick = () => {
            for (const el of inputs) el.value = '';
            puzzle.questions.forEach((_, i) => {
              $(`#chMark${i}`).textContent = '';
            });
            $('#chShare').style.display = 'none';
            $('#chCopy').style.display = 'none';
            say('처음부터');
          };

          /* 마지막 칸에서 엔터 = 채점. 다섯 개를 치고 마우스로 옮겨 가는 건 번거롭다. */
          inputs.forEach((el, i) => {
            el.addEventListener('keydown', (e) => {
              if ((e as KeyboardEvent).key !== 'Enter') return;
              if (i + 1 < inputs.length) inputs[i + 1].focus();
              else check();
            });
          });

          say(done === null ? '초성만 보고 맞혀 보세요' : `오늘은 이미 ${done}개 맞혔어요. 다시 해도 됩니다`);
        }
      }
    ]
  });
})();
