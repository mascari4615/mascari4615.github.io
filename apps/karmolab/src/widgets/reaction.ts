/**
 * 반응속도 — 한 판이 끝나면 기록 원장에 남는다 (TASK-KL-148).
 *
 * 예전에는 저장이 한 줄도 없어서 새로고침 한 번이면 없던 일이 됐다. 이제 최고·순위·「어제의 나」가
 * 그 자리에 붙는다. 서버가 죽거나 로그인을 안 했으면 이 브라우저 최고만 뜨고 놀이는 그대로 된다.
 */
import { mountPlayBoard, renderPlayResult, submitPlay, type PlaySpec } from '../lib/plays';
import { copyResultCard } from '../lib/result-card';
import { t, loadNamespace } from '../lib/i18n';

/** 작을수록 좋다 — 이건 놀이 자체의 성질이라 놀이가 말한다. 순위는 서버가 매긴다. */
const SPEC: PlaySpec = { game: 'reaction', better: 'low', unit: 'ms', decimals: 0 };

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'reaction',
    title: t('widgets.reaction.title', undefined, "반응속도"),
    category: 'play',
    desc: t('widgets-desc.reaction.desc', undefined, "반응 속도를 측정합니다"),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    tabs: [
      {
        id: 'app',
        label: t('reaction.t01', undefined, "반응속도"),
        build: function (container: HTMLElement): void {
          void loadNamespace('reaction').then(function () {

          Mdd.linePreset('tool_run', { msg: t('reaction.t03') });

          const STATES = { WAITING: 0, READY: 1, GREEN: 2, RESULT: 3, EARLY: 4 } as const;
          type ReactionState = (typeof STATES)[keyof typeof STATES];

          let state: ReactionState = STATES.WAITING;
          let greenTime = 0;
          let timeout: ReturnType<typeof setTimeout> | null = null;
          const results: number[] = [];

          container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:20px;max-width:500px;margin:0 auto;width:100%;">
                    <div id="reactionBox" style="width:100%;height:280px;border-radius:var(--radius-lg);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:background 0.15s;background:var(--bg-tertiary);border:1px solid var(--border);">
                        <div id="reactionIcon" style="font-size:48px;margin-bottom:16px;">🎯</div>
                        <div id="reactionText" style="font-size:18px;font-weight:700;color:var(--text-primary);">${esc(t('reaction.label.text'))}</div>
                        <div id="reactionSub" style="font-size:var(--font-size-sm);color:var(--text-tertiary);margin-top:8px;">${esc(t('reaction.label.sub'))}</div>
                    </div>
                    <div id="reactionResults" style="width:100%;font-size:var(--font-size-sm);color:var(--text-secondary);text-align:center;min-height:24px;"></div>
                    <div id="reactionHistory" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;"></div>
                    <div id="reactionBest" style="font-size:var(--font-size-xs);color:var(--text-tertiary);"></div>
                    <button type="button" id="reactionShare" class="btn btn-ghost" hidden>${esc(t('reaction.btn.share'))}</button>
                    <div id="reactionBoard" hidden style="width:100%;"></div>
                </div>
            `;

          const boxEl = container.querySelector('#reactionBox') as HTMLElement | null;
          const iconEl = container.querySelector('#reactionIcon') as HTMLElement | null;
          const textEl = container.querySelector('#reactionText') as HTMLElement | null;
          const subEl = container.querySelector('#reactionSub') as HTMLElement | null;
          const resultsEl = container.querySelector('#reactionResults') as HTMLElement | null;
          const historyEl = container.querySelector('#reactionHistory') as HTMLElement | null;
          const bestEl = container.querySelector('#reactionBest') as HTMLElement | null;
          const boardEl = container.querySelector('#reactionBoard') as HTMLElement | null;
          if (!boxEl || !iconEl || !textEl || !subEl || !resultsEl || !historyEl || !bestEl || !boardEl) return;

          const box = boxEl;
          const icon = iconEl;
          const text = textEl;
          const sub = subEl;
          const resultsOut = resultsEl;
          const historyOut = historyEl;
          const bestOut = bestEl;
          const boardOut = boardEl;

          /* 자랑은 그림으로 (TASK-KL-151 ②) — 「247ms」는 글로 붙여넣으면 아무도 안 본다.
             한 판이라도 해야 뜬다: 아직 아무 기록도 없는데 자랑 단추부터 있으면 빈 카드가 나간다. */
          const shareBtn = container.querySelector<HTMLButtonElement>('#reactionShare')!;
          shareBtn.addEventListener('click', () => {
            const best = Toolbox.getProgress?.('reaction_best') ?? 0;
            if (!best) return;
            const avg = results.length ? Math.round(results.reduce((a, b) => a + b, 0) / results.length) : best;
            void copyResultCard(
              {
                kicker: t('reaction.t01'),
                headline: `${best}ms`,
                lines: [t('reaction.triesAvg', { n: results.length, avg }), best < 200 ? t('reaction.t04') : '']
                  .filter(Boolean)
              },
              `karmolab-reaction-${best}ms.png`
            ).then((msg) => {
              resultsOut.textContent = msg;
            });
          });

          const bestTime = Toolbox.getProgress?.('reaction_best');
          if (bestTime) bestOut.textContent = t('reaction.best', { ms: bestTime });

          // 순위판은 들어오자마자 붙인다 — 「남들은 어느 정도인가」가 한 판 하게 만드는 힘이다.
          // 서버에 못 닿거나 아직 아무도 안 놀았으면 아무것도 안 붙는다.
          mountPlayBoard(boardEl, SPEC);

          function setState(newState: ReactionState): void {
            state = newState;
            if (timeout !== null) clearTimeout(timeout);
            timeout = null;

            switch (state) {
              case STATES.WAITING:
                box.style.background = 'var(--bg-tertiary)';
                box.style.borderColor = 'var(--border)';
                icon.textContent = '🎯';
                text.textContent = t('reaction.label.text');
                text.style.color = 'var(--text-primary)';
                sub.textContent = t('reaction.label.sub');
                break;

              case STATES.READY:
                box.style.background = '#1a1a2e';
                box.style.borderColor = '#2a2a4e';
                icon.textContent = '⏳';
                text.textContent = t('reaction.t05');
                text.style.color = '#fbbf24';
                sub.textContent = '';
                timeout = setTimeout(() => setState(STATES.GREEN), 1000 + Math.random() * 4000);
                break;

              case STATES.GREEN:
                greenTime = Date.now();
                box.style.background = '#065f46';
                box.style.borderColor = '#34d399';
                icon.textContent = '⚡';
                text.textContent = t('reaction.t06');
                text.style.color = '#34d399';
                sub.textContent = '';
                break;

              case STATES.EARLY:
                box.style.background = '#450a0a';
                box.style.borderColor = '#f87171';
                icon.textContent = '❌';
                text.textContent = t('reaction.t07');
                text.style.color = '#f87171';
                sub.textContent = t('reaction.t08');
                Mdd.linePreset('idle_wake', { msg: t('reaction.t09') });
                break;

              default:
                break;
            }
          }

          box.onclick = () => {
            switch (state) {
              case STATES.WAITING:
              case STATES.RESULT:
              case STATES.EARLY:
                setState(STATES.READY);
                break;
              case STATES.READY:
                setState(STATES.EARLY);
                break;
              case STATES.GREEN: {
                const reactionTime = Date.now() - greenTime;
                state = STATES.RESULT;
                results.push(reactionTime);

                box.style.background = 'var(--accent-subtle)';
                box.style.borderColor = 'var(--accent)';
                icon.textContent = '🏆';
                text.textContent = `${reactionTime}ms`;
                text.style.color = 'var(--accent)';
                sub.textContent = t('reaction.t08');

                const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
                resultsOut.textContent = t('reaction.avgTries', { avg, n: results.length });

                const chip = document.createElement('span');
                chip.style.cssText = `padding:4px 10px;border-radius:100px;font-size:var(--font-size-xs);font-weight:600;background:var(--bg-tertiary);color:${reactionTime < 250 ? 'var(--success)' : reactionTime < 400 ? 'var(--accent)' : 'var(--text-secondary)'};`;
                chip.textContent = `${reactionTime}ms`;
                historyOut.appendChild(chip);

                const currentBest = Toolbox.getProgress?.('reaction_best') ?? 0;
                if (!currentBest || reactionTime < currentBest) {
                  // 도전과제·계정 동기화가 이 값을 본다. 화면에 보이는 「최고」는 아래 기록 원장이 그린다
                  // (두 곳에서 그리면 하나가 낡은 값을 들고 남는다).
                  Toolbox.setProgress?.('reaction_best', reactionTime);
                  Mdd.linePreset('success', { msg: t('reaction.t10') });
                } else if (reactionTime < 200) {
                  Mdd.linePreset('idle_wake', { msg: t('reaction.t11') });
                } else if (reactionTime < 300) {
                  Mdd.linePreset('success', { mood: 'happy', msg: t('reaction.t12') });
                } else {
                  Mdd.linePreset('meme_done', { msg: t('reaction.t13') });
                }

                if (reactionTime < 200) {
                  Toolbox.completeAchievement?.('reaction_200', { title: t('reaction.t14') });
                }
                if (reactionTime < 150) {
                  Toolbox.completeAchievement?.('reaction_150', { title: t('reaction.t15') });
                }
                // 한 판이 끝났다 — 기록 원장에 남긴다. 실패해도 위 화면은 이미 다 그려져 있다.
                void submitPlay(SPEC, reactionTime).then((result) => {
                  if (!bestOut.isConnected) return;
                  renderPlayResult(bestOut, SPEC, result);
                  // 순위가 바뀐 판만 다시 받는다 (매 판 부르면 서버를 놀이 속도로 두드린다).
                  if (result.server && result.server.improved) mountPlayBoard(boardOut, SPEC);
                });

                shareBtn.hidden = false;
                Mdd.addAffection(1);
                break;
              }
              default:
                break;
            }
          };
                  });
        }
      }
    ]
  });
})();
