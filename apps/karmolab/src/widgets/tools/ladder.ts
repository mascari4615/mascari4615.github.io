/**
 * 사다리타기 (TASK-KL-088)
 *
 * 결과만 뽑아 주면 「짜고 친 것 아니냐」 는 말이 나온다. 그래서 사다리를 **먼저 그려 보여주고**,
 * 누른 사람의 경로를 실제로 따라 내려가게 만든다 — 눈으로 검증되는 무작위.
 * 가로줄은 같은 높이에서 겹치지 않게 놓는다 (겹치면 경로가 정의되지 않는다).
 */
(function (): void {
  const COLORS = ['#e8635a', '#f0a33c', '#e8cf4a', '#5fc27e', '#4aa8e8', '#7b7ae8', '#d06ad0', '#4fc7c7', '#9aa04a', '#e88fa8'];

  interface Ladder {
    cols: number;
    rows: number;
    /** rungs[r] = 왼쪽 기둥 인덱스 집합 (i ↔ i+1 연결) */
    rungs: number[][];
  }

  function makeLadder(cols: number): Ladder {
    const rows = Math.max(8, cols * 2 + 2);
    const rungs: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      // 왼쪽부터 훑으며 확률적으로 놓되, 직전 칸에 놓았으면 건너뛴다 (겹침 방지).
      for (let c = 0; c < cols - 1; c++) {
        if (row.indexOf(c - 1) >= 0) continue;
        if (Math.random() < 0.45) row.push(c);
      }
      rungs.push(row);
    }
    // 모든 기둥이 최소 한 번은 섞이도록 보정 — 안 그러면 「그대로 내려오는」 열이 생긴다.
    for (let c = 0; c < cols - 1; c++) {
      const touched = rungs.some((row) => row.indexOf(c) >= 0);
      if (!touched) {
        const r = Math.floor(Math.random() * rows);
        if (rungs[r].indexOf(c - 1) < 0 && rungs[r].indexOf(c + 1) < 0) rungs[r].push(c);
      }
    }
    return { cols, rows, rungs };
  }

  /** 시작 열 → 도착 열. 경로 좌표(열, 행) 목록도 함께 돌려준다. */
  function trace(l: Ladder, start: number): { end: number; path: [number, number][] } {
    let c = start;
    const path: [number, number][] = [[c, 0]];
    for (let r = 0; r < l.rows; r++) {
      const row = l.rungs[r];
      if (row.indexOf(c) >= 0) {
        path.push([c, r + 1], [c + 1, r + 1]);
        c += 1;
      } else if (row.indexOf(c - 1) >= 0) {
        path.push([c, r + 1], [c - 1, r + 1]);
        c -= 1;
      }
    }
    path.push([c, l.rows + 1]);
    return { end: c, path };
  }

  Toolbox.register({
    id: 'ladder',
    title: '사다리타기',
    category: 'tool',
    desc: '이름과 결과를 넣으면 사다리를 그리고, 누른 사람의 경로를 따라 내려가며 짝을 정합니다',
    layout: 'wide',
    icon: '<path d="M7 3v18M17 3v18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 8h10M7 13h10M7 18h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '사다리',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '결과는 사다리한테 물어보세요.' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">참가자 — 한 줄에 한 명</div>
                  <textarea id="ldNames" rows="6" spellcheck="false" placeholder="가나\n다라\n마바\n사아"></textarea>
                </div>
                <div>
                  <div class="tool-sublabel">결과 — 한 줄에 하나 (비우면 당첨/꽝)</div>
                  <textarea id="ldPrizes" rows="6" spellcheck="false" placeholder="커피\n꽝\n꽝\n꽝"></textarea>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="ldNew">사다리 새로 만들기</button>
              <button class="btn btn-ghost" id="ldAll">전체 결과 보기</button>
              <button class="btn btn-ghost" id="ldCopy">결과 복사</button>
            </div>

            <div class="ld-stage"><svg id="ldSvg" role="img" aria-label="사다리"></svg></div>
            <div class="tool-list" id="ldResult"></div>
            <div class="tool-status" id="ldStatus">이름을 넣고 사다리를 만든 뒤, 위쪽 이름을 누르세요.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const namesEl = $<HTMLTextAreaElement>('#ldNames');
          const prizesEl = $<HTMLTextAreaElement>('#ldPrizes');
          const svg = container.querySelector('#ldSvg') as SVGSVGElement;
          const resultEl = $<HTMLElement>('#ldResult');
          const status = $<HTMLElement>('#ldStatus');

          let ladder: Ladder | null = null;
          let names: string[] = [];
          let prizes: string[] = [];
          let revealed: number[] = [];

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function readLines(el: HTMLTextAreaElement): string[] {
            return el.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          }

          function build(): void {
            names = readLines(namesEl);
            if (names.length < 2) {
              status.textContent = '참가자를 두 명 이상 적어 주세요.';
              status.className = 'tool-status error';
              svg.innerHTML = '';
              return;
            }
            if (names.length > 10) names = names.slice(0, 10);
            prizes = readLines(prizesEl);
            // 결과를 안 적었거나 모자라면 첫 줄만 당첨인 기본 판을 만든다.
            while (prizes.length < names.length) prizes.push(prizes.length === 0 ? '당첨' : '꽝');
            prizes = prizes.slice(0, names.length);
            ladder = makeLadder(names.length);
            revealed = [];
            draw();
            status.textContent = `${names.length}명 · 위쪽 이름을 누르면 경로를 따라갑니다.`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('new');
          }

          function draw(): void {
            if (!ladder) return;
            const cols = ladder.cols;
            const W = Math.max(320, cols * 92);
            const topH = 34;
            const botH = 34;
            const bodyH = 260;
            const H = topH + bodyH + botH;
            const x = (c: number): number => 40 + (c * (W - 80)) / Math.max(1, cols - 1);
            const y = (r: number): number => topH + (r * bodyH) / (ladder!.rows + 1);

            const parts: string[] = [];
            for (let c = 0; c < cols; c++) {
              parts.push(
                `<line x1="${x(c)}" y1="${topH}" x2="${x(c)}" y2="${topH + bodyH}" class="ld-pole"/>`
              );
            }
            ladder.rungs.forEach((row, r) => {
              row.forEach((c) => {
                parts.push(`<line x1="${x(c)}" y1="${y(r + 1)}" x2="${x(c + 1)}" y2="${y(r + 1)}" class="ld-rung"/>`);
              });
            });

            // 밝혀진 경로만 색을 입혀 겹쳐 그린다 (기본 사다리는 회색 그대로).
            revealed.forEach((start) => {
              const { path } = trace(ladder!, start);
              const d = path.map(([c, r], i) => `${i === 0 ? 'M' : 'L'}${x(c)} ${y(r)}`).join(' ');
              parts.push(`<path d="${d}" class="ld-path" style="stroke:${COLORS[start % COLORS.length]}"/>`);
            });

            for (let c = 0; c < cols; c++) {
              const on = revealed.indexOf(c) >= 0;
              parts.push(
                `<text x="${x(c)}" y="20" class="ld-name${on ? ' on' : ''}" data-col="${c}" style="${on ? `fill:${COLORS[c % COLORS.length]}` : ''}">${esc(names[c])}</text>`
              );
              const end = ladder.rungs.length ? trace(ladder, c).end : c;
              parts.push(`<text x="${x(c)}" y="${H - 10}" class="ld-prize" data-end="${c}">${esc(prizes[c] || '')}</text>`);
              void end;
            }

            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.setAttribute('width', '100%');
            svg.style.height = `${H}px`;
            svg.innerHTML = parts.join('');

            svg.querySelectorAll('.ld-name').forEach((el) => {
              (el as SVGTextElement).onclick = () => {
                const c = Number((el as SVGElement).getAttribute('data-col'));
                if (revealed.indexOf(c) < 0) revealed.push(c);
                draw();
                renderResult();
                Toolbox.trackUse?.('reveal');
              };
            });
          }

          function renderResult(): void {
            if (!ladder) return;
            resultEl.innerHTML = revealed
              .map((c) => {
                const { end } = trace(ladder!, c);
                return `<div class="tool-list-row"><span class="tool-list-key" style="color:${COLORS[c % COLORS.length]}">${esc(names[c])}</span><span class="tool-list-val">${esc(prizes[end] || '')}</span></div>`;
              })
              .join('');
          }

          $<HTMLButtonElement>('#ldNew').onclick = build;
          $<HTMLButtonElement>('#ldAll').onclick = () => {
            if (!ladder) return;
            revealed = names.map((_, i) => i);
            draw();
            renderResult();
          };
          $<HTMLButtonElement>('#ldCopy').onclick = async () => {
            if (!ladder || !revealed.length) return;
            const text = revealed
              .map((c) => `${names[c]} → ${prizes[trace(ladder!, c).end] || ''}`)
              .join('\n');
            await Toolbox.copyText?.(text, { message: '결과를 복사했어요' });
          };

          namesEl.value = '가나\n다라\n마바\n사아';
          prizesEl.value = '커피\n꽝\n꽝\n꽝';
          build();
        }
      }
    ]
  });
})();
