/**
 * 타이머 / 스톱워치 (TASK-KL-088)
 * - 시간 기준 = performance.now() 델타. setInterval 누적 오차(탭 백그라운드 throttle)를 안 탄다.
 * - 알림음 = WebAudio 합성 (외부 파일 0). 탭 제목에도 남은 시간을 띄워 백그라운드에서 보이게.
 */
(function (): void {
  function fmt(ms: number, withMs: boolean): string {
    const sign = ms < 0 ? '-' : '';
    const t = Math.abs(ms);
    const h = Math.floor(t / 3600000);
    const m = Math.floor((t % 3600000) / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const cs = Math.floor((t % 1000) / 10);
    const base = (h > 0 ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return sign + base + (withMs ? '.' + String(cs).padStart(2, '0') : '');
  }

  function beep(times: number): void {
    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      for (let i = 0; i < times; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + i * 0.45;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.4);
      }
      setTimeout(() => ctx.close(), times * 500 + 500);
    } catch {
      /* 사용자 제스처 없이 오디오가 막힌 경우 — 무음으로 넘어간다 */
    }
  }

  Toolbox.register({
    id: 'timer',
    title: '타이머 · 스톱워치',
    category: 'tool',
    desc: '카운트다운 타이머와 랩 기록 스톱워치. 끝나면 알림음이 울립니다',
    layout: 'form',
    icon: '<circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 9v4l3 2M9 2h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'countdown',
        label: '타이머',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '시간 재 드릴게요. 딴짓하면 안 돼요!' });
          container.innerHTML = `
            <div class="tool-display" id="tmDisplay">00:00</div>
            <div class="field-group">
              <label class="field-label">시간 설정</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <input type="text" id="tmH" inputmode="numeric" placeholder="시" style="text-align:center;">
                <span style="color:var(--text-tertiary);">:</span>
                <input type="text" id="tmM" inputmode="numeric" placeholder="분" style="text-align:center;">
                <span style="color:var(--text-tertiary);">:</span>
                <input type="text" id="tmS" inputmode="numeric" placeholder="초" style="text-align:center;">
              </div>
              <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-ghost tm-preset" data-sec="60">1분</button>
                <button class="btn btn-ghost tm-preset" data-sec="180">3분</button>
                <button class="btn btn-ghost tm-preset" data-sec="300">5분</button>
                <button class="btn btn-ghost tm-preset" data-sec="600">10분</button>
                <button class="btn btn-ghost tm-preset" data-sec="1500">25분 (뽀모도로)</button>
                <button class="btn btn-ghost tm-preset" data-sec="3600">1시간</button>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="tmStart">시작</button>
              <button class="btn btn-secondary" id="tmPause">일시정지</button>
              <button class="btn btn-ghost" id="tmReset">초기화</button>
            </div>
            <div class="tool-status" id="tmStatus" style="margin-top:var(--space-lg);">시간을 넣고 시작을 누르세요. 탭을 옮겨도 정확히 셉니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const display = $<HTMLElement>('#tmDisplay');
          const status = $<HTMLElement>('#tmStatus');
          let totalMs = 0;
          let endAt = 0;
          let remaining = 0;
          let running = false;
          let raf = 0;
          const originalTitle = document.title;

          function readInputs(): number {
            const n = (sel: string): number => parseInt(($<HTMLInputElement>(sel).value || '0').replace(/[^0-9]/g, ''), 10) || 0;
            return (n('#tmH') * 3600 + n('#tmM') * 60 + n('#tmS')) * 1000;
          }
          function paint(ms: number): void {
            display.textContent = fmt(Math.max(ms, 0), false);
            if (running) document.title = fmt(Math.max(ms, 0), false) + ' — 타이머';
          }
          function tick(): void {
            if (!running) return;
            const left = endAt - performance.now();
            if (left <= 0) {
              running = false;
              remaining = 0;
              paint(0);
              document.title = originalTitle;
              display.classList.add('tool-display-done');
              status.textContent = '시간 종료!';
              status.className = 'tool-status ok';
              beep(3);
              Toolbox.showToast?.('타이머 종료!', 'success', undefined);
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('KarmoLab 타이머', { body: '설정한 시간이 끝났어요.' });
              }
              return;
            }
            remaining = left;
            paint(left);
            raf = requestAnimationFrame(tick);
          }

          $<HTMLButtonElement>('#tmStart').onclick = () => {
            if (running) return;
            const base = remaining > 0 ? remaining : readInputs();
            if (base <= 0) {
              status.textContent = '시간을 먼저 입력해 주세요.';
              status.className = 'tool-status error';
              return;
            }
            totalMs = base;
            endAt = performance.now() + base;
            running = true;
            display.classList.remove('tool-display-done');
            status.textContent = '진행 중…';
            status.className = 'tool-status ok';
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
              Notification.requestPermission().catch(() => undefined);
            }
            tick();
            Toolbox.trackUse?.('start');
            void totalMs;
          };
          $<HTMLButtonElement>('#tmPause').onclick = () => {
            if (!running) return;
            running = false;
            cancelAnimationFrame(raf);
            document.title = originalTitle;
            status.textContent = '일시정지 — 시작을 누르면 이어서 갑니다.';
            status.className = 'tool-status';
          };
          $<HTMLButtonElement>('#tmReset').onclick = () => {
            running = false;
            cancelAnimationFrame(raf);
            remaining = 0;
            document.title = originalTitle;
            display.classList.remove('tool-display-done');
            paint(readInputs());
            status.textContent = '초기화했어요.';
            status.className = 'tool-status';
          };
          container.querySelectorAll('.tm-preset').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const sec = parseInt((btn as HTMLElement).dataset.sec || '0', 10);
              $<HTMLInputElement>('#tmH').value = String(Math.floor(sec / 3600) || '');
              $<HTMLInputElement>('#tmM').value = String(Math.floor((sec % 3600) / 60) || '');
              $<HTMLInputElement>('#tmS').value = String(sec % 60 || '');
              remaining = 0;
              paint(sec * 1000);
            };
          });
          ['#tmH', '#tmM', '#tmS'].forEach((sel) => {
            $<HTMLInputElement>(sel).addEventListener('input', () => {
              if (!running) {
                remaining = 0;
                paint(readInputs());
              }
            });
          });

          paint(0);
        }
      },
      {
        id: 'stopwatch',
        label: '스톱워치',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-display" id="swDisplay">00:00.00</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="swStart">시작</button>
              <button class="btn btn-secondary" id="swLap">랩</button>
              <button class="btn btn-ghost" id="swReset">초기화</button>
              <button class="btn btn-ghost" id="swCopy">랩 기록 복사</button>
            </div>
            <div id="swLaps" class="tool-list"></div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const display = $<HTMLElement>('#swDisplay');
          const lapsEl = $<HTMLElement>('#swLaps');
          const startBtn = $<HTMLButtonElement>('#swStart');
          let running = false;
          let startedAt = 0;
          let acc = 0;
          let raf = 0;
          const laps: number[] = [];

          function tick(): void {
            if (!running) return;
            display.textContent = fmt(acc + (performance.now() - startedAt), true);
            raf = requestAnimationFrame(tick);
          }
          function elapsed(): number {
            return running ? acc + (performance.now() - startedAt) : acc;
          }
          function renderLaps(): void {
            lapsEl.innerHTML = laps
              .map((t, i) => {
                const prev = i === 0 ? 0 : laps[i - 1];
                return `<div class="tool-list-row"><span class="tool-list-key">랩 ${i + 1}</span><span>${fmt(t - prev, true)}</span><span class="tool-list-dim">${fmt(t, true)}</span></div>`;
              })
              .reverse()
              .join('');
          }

          startBtn.onclick = () => {
            if (running) {
              running = false;
              acc = elapsed();
              cancelAnimationFrame(raf);
              startBtn.textContent = '계속';
            } else {
              running = true;
              startedAt = performance.now();
              startBtn.textContent = '정지';
              tick();
            }
          };
          $<HTMLButtonElement>('#swLap').onclick = () => {
            if (!running && acc === 0) return;
            laps.push(elapsed());
            renderLaps();
          };
          $<HTMLButtonElement>('#swReset').onclick = () => {
            running = false;
            cancelAnimationFrame(raf);
            acc = 0;
            laps.length = 0;
            renderLaps();
            display.textContent = fmt(0, true);
            startBtn.textContent = '시작';
          };
          $<HTMLButtonElement>('#swCopy').onclick = async () => {
            if (!laps.length) return;
            const text = laps
              .map((t, i) => `랩 ${i + 1}\t${fmt(t - (i === 0 ? 0 : laps[i - 1]), true)}\t${fmt(t, true)}`)
              .join('\n');
            await Toolbox.copyText?.(text, { message: '랩 기록을 복사했어요' });
          };

          display.textContent = fmt(0, true);
        }
      }
    ]
  });
})();
