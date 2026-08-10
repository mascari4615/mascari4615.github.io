/**
 * 속도측정 — 한 판이 끝나면 기록 원장에 남는다 (TASK-KL-148).
 * 예전에는 저장이 한 줄도 없었다: 아무리 빨라도 창을 닫으면 없던 일이었다.
 */
import { mountPlayBoard, renderPlayResult, submitPlay, type PlaySpec } from '../lib/plays';
import { t, loadNamespace } from '../lib/i18n';

/** 클수록 좋다(1MB 를 옮긴 속도). */
const SPEC: PlaySpec = { game: 'speed', better: 'high', unit: 'MB/s', decimals: 2 };

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'speed',
    title: t('widgets.speed.title', undefined, "속도측정"),
    category: 'play',
    desc: t('widgets-desc.speed.desc', undefined, "드래그 속도를 측정합니다"),
    layout: 'form',
    icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('speed.t03', undefined, "속도측정"),
        build: function (container: HTMLElement): void {
          void loadNamespace('speed').then(function () {

          Mdd.linePreset('tool_run', { msg: t('speed.t05') });
          container.innerHTML = `
                <div style="display:flex; flex-direction:column; padding:20px; height:380px; box-sizing:border-box; text-align:center;">
                    <div style="font-size:14px; color:var(--text-secondary); margin-bottom:10px;">${esc(t('speed.t01'))}</div>
                    <div id="dropZone" style="flex:1; background:rgba(0,0,0,0.3); border:2px dashed #444; border-radius:8px; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                        <div id="targetArea" style="position:absolute; right:20px; width:80px; height:80px; background:rgba(0, 200, 0, 0.1); border:2px dashed var(--success); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--success); font-size:var(--font-size-xs); font-weight:bold;">GOAL</div>
                        <div id="dragBlock" style="position:absolute; left:20px; width:60px; height:60px; background:var(--accent); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:var(--font-size-xs); cursor:grab; box-shadow:0 4px 6px rgba(0,0,0,0.3); user-select:none; touch-action:none;">1 MB</div>
                    </div>
                    <div id="speedResult" style="margin-top:15px; font-size:15px; font-weight:bold; color:var(--text-primary); min-height:20px;"></div>
                    <div id="speedRecord" hidden style="margin-top:10px;"></div>
                    <div id="speedBoard" hidden style="margin-top:12px;"></div>
                </div>
            `;
          const dragBlockEl = container.querySelector('#dragBlock') as HTMLElement | null;
          const targetAreaEl = container.querySelector('#targetArea') as HTMLElement | null;
          const dropZoneEl = container.querySelector('#dropZone') as HTMLElement | null;
          const resultEl = container.querySelector('#speedResult') as HTMLElement | null;
          const recordEl = container.querySelector('#speedRecord') as HTMLElement | null;
          const boardEl = container.querySelector('#speedBoard') as HTMLElement | null;
          if (!dragBlockEl || !targetAreaEl || !dropZoneEl || !resultEl || !recordEl || !boardEl) return;

          const dragBlock = dragBlockEl;
          const targetArea = targetAreaEl;
          const dropZone = dropZoneEl;
          const result = resultEl;
          const recordOut = recordEl;
          const boardOut = boardEl;

          // 「남들은 몇 MB/s 인가」를 먼저 보여 준다. 못 받으면 아무것도 안 붙는다.
          mountPlayBoard(boardOut, SPEC);

          let startTime: number | null = null;
          let isDragging = false;

          /* 폰에서는 **아예 못 놀았다** (TASK-KL-151 ③).
             마우스 사건만 듣고 있었는데 유입은 대부분 폰이다 — 열어 보고 블럭이 안 움직이면
             그 사람에게 이 도구는 고장난 것이다. 두 입력을 한 자리로 모은다. */
          const pointOf = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
            const touches = (e as TouchEvent).touches;
            const p = touches && touches.length ? touches[0] : (e as MouseEvent);
            return { x: p.clientX, y: p.clientY };
          };

          const onStart = (e: MouseEvent | TouchEvent): void => {
            isDragging = true;
            if (startTime === null) startTime = performance.now();
            dragBlock.style.cursor = 'grabbing';

            const at = pointOf(e);
            const offsetX = at.x - dragBlock.getBoundingClientRect().left;
            const offsetY = at.y - dragBlock.getBoundingClientRect().top;

            function onMouseMove(moveEvent: MouseEvent | TouchEvent): void {
              if (!isDragging) return;
              // 손가락으로 끌 때 화면이 같이 스크롤되면 블럭이 도착을 못 한다.
              if ((moveEvent as TouchEvent).touches) moveEvent.preventDefault();
              const moved = pointOf(moveEvent);
              const r = dropZone.getBoundingClientRect();
              let x = moved.x - r.left - offsetX;
              let y = moved.y - r.top - offsetY;

              x = Math.max(0, Math.min(x, r.width - 60));
              y = Math.max(0, Math.min(y, r.height - 60));

              dragBlock.style.left = `${x}px`;
              dragBlock.style.top = `${y}px`;

              const tr = targetArea.getBoundingClientRect();
              const br = dragBlock.getBoundingClientRect();

              if (br.right > tr.left && br.left < tr.right && br.bottom > tr.top && br.top < tr.bottom) {
                isDragging = false;
                dragBlock.style.cursor = 'default';
                stopListening();

                const endTime = performance.now();
                const st = startTime;
                if (st === null) return;
                const tookMs = endTime - st;
                const speed = 1000 / tookMs;

                result.innerHTML = `이동 시간: 무려 <span style="color:var(--warning)">${tookMs.toFixed(0)} ms</span>!<br>${esc(t('speed.t02'))} <span style="color:var(--success)">${speed.toFixed(2)} MB/s</span> 이에요!`;
                startTime = null;

                // 한 판 끝 — 기록 원장에 남긴다 (실패해도 위 결과는 이미 떠 있다).
                void submitPlay(SPEC, speed).then((r) => {
                  if (!recordOut.isConnected) return;
                  renderPlayResult(recordOut, SPEC, r);
                  if (r.server && r.server.improved) mountPlayBoard(boardOut, SPEC);
                });
              }
            }

            function stopListening(): void {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              document.removeEventListener('touchmove', onMouseMove);
              document.removeEventListener('touchend', onMouseUp);
            }

            function onMouseUp(): void {
              isDragging = false;
              dragBlock.style.cursor = 'grab';
              stopListening();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            // 손가락 끌기는 기본 동작(스크롤)을 막아야 해서 passive 를 꺼 둔다.
            document.addEventListener('touchmove', onMouseMove, { passive: false });
            document.addEventListener('touchend', onMouseUp);
          };

          dragBlock.addEventListener('mousedown', onStart);
          dragBlock.addEventListener('touchstart', onStart, { passive: true });
                  });
        }
      }
    ]
  });
})();
