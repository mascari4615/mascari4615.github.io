/**
 * 「동반자」 위젯 — KarmoLab 안에서 말하는 봇에게 말을 걸고, 곁에 있는지 본다.
 *
 * 왜 새로 만드나(흡수 검토 결과): 서버 모니터는 「프로세스가 떠 있나」까지만 말한다 —
 * 켜 놓고도 얘가 무슨 말을 했는지, 나를 뭘 안다고 생각하는지는 안 보인다. 챗봇 위젯은
 * 그 자리에서 시작해 그 자리에서 끝나는 대화(기억·기분·먼저 말 걸기가 없다)라 다른 것이다.
 *
 * ★ **얼굴을 여기다 다시 그리지 않는다.** 3D 몸·말풍선·목소리는 봇이 띄우는 창이 정본이고
 *   (`packages/companion` 웹 몸), 여기는 **관제**만 한다 — 살아있나 · 한 줄 던지기 ·
 *   오간 말 · 아는 것 · 첫 소리까지. 표면을 두 벌 만들면 반드시 갈라진다.
 *
 * 붙는 자리: 봇은 이 기계에서 도는 로컬 서버다. 배포된 https 페이지에서는 브라우저가
 * http 로컬 주소를 막으므로(mixed content) **앱이나 로컬 dev 에서만** 붙는다 —
 * 못 붙을 때 「고장」처럼 보이지 않게 화면이 그 이유를 직접 말한다.
 */
(function (): void {
  const BASE = 'http://127.0.0.1:4620';
  const 안붙는곳 = location.protocol === 'https:' && location.hostname.endsWith('github.io');

  type Entry = { role: 'sensed' | 'said'; channel: string; text: string; at: number };
  type Stats = { 샘플수: number; 첫소리중앙값ms: number | null; 최악ms: number | null };
  type State = {
    창붙음: number;
    몸: '3D' | '큐브' | null;
    인격?: string | null;
    머리?: string | null;
    목소리들?: string[];
    흉내준비?: boolean | null;
    흉내자동?: boolean;
  };

  function injectStyles(): void {
    if (document.getElementById('companion-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'companion-widget-styles';
    style.textContent = `
      .cmp-state { display:flex; align-items:center; gap:10px; padding:14px 16px;
        background:var(--bg-tertiary); border:1px solid var(--border, var(--border-color));
        border-radius:var(--radius-md); margin-bottom:14px; }
      .cmp-dot { width:10px; height:10px; border-radius:50%; background:#8a867e; flex:0 0 auto; }
      .cmp-dot.on { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,.6); }
      .cmp-dot.off { background:#f87171; }
      .cmp-state-text { font-size:.92rem; color:var(--text-primary, #e8e8e8); }
      .cmp-state-sub { font-size:.78rem; color:var(--text-tertiary, #8a867e); margin-top:2px;
        font-family:var(--font-mono, monospace); }
      .cmp-open { margin-left:auto; display:flex; gap:8px; }
      .cmp-btn { background:none; border:1px solid var(--border, var(--border-color));
        color:var(--text-tertiary, #8a867e); border-radius:var(--radius-sm); padding:6px 10px;
        font-size:.78rem; cursor:pointer; text-decoration:none; }
      .cmp-btn:hover { color:var(--text-primary, #e8e8e8); border-color:var(--accent, #a99bf5); }
      .cmp-say { display:flex; gap:8px; margin-bottom:14px; }
      .cmp-say input { flex:1; background:var(--bg-secondary); color:var(--text-primary, #e8e8e8);
        border:1px solid var(--border, var(--border-color)); border-radius:var(--radius-sm);
        padding:10px 12px; font-size:.92rem; }
      .cmp-say input:focus { outline:none; border-color:var(--accent, #a99bf5); }
      .cmp-log { display:flex; flex-direction:column; gap:8px; max-height:340px; overflow-y:auto;
        padding:12px; background:var(--bg-secondary); border:1px solid var(--border, var(--border-color));
        border-radius:var(--radius-md); }
      .cmp-line { font-size:.88rem; line-height:1.55; color:var(--text-primary, #e8e8e8); }
      .cmp-line.me { color:var(--text-tertiary, #8a867e); }
      .cmp-who { font-family:var(--font-mono, monospace); font-size:.74rem; margin-right:8px;
        color:var(--text-tertiary, #8a867e); }
      .cmp-empty { font-size:.84rem; color:var(--text-tertiary, #8a867e); }
      .cmp-known { margin-top:14px; padding:12px 14px; background:var(--bg-tertiary);
        border:1px solid var(--border, var(--border-color)); border-radius:var(--radius-md);
        font-size:.84rem; line-height:1.7; color:var(--text-primary, #e8e8e8); white-space:pre-wrap; }
      .cmp-h { font-size:.76rem; letter-spacing:.06em; text-transform:uppercase;
        color:var(--text-tertiary, #8a867e); margin:0 0 8px; }
      .cmp-note { margin-top:14px; font-size:.78rem; color:var(--text-tertiary, #8a867e); line-height:1.6; }
      .cmp-bits { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .cmp-bit { display:flex; align-items:center; gap:6px; padding:6px 10px; font-size:.8rem;
        background:var(--bg-secondary); border:1px solid var(--border, var(--border-color));
        border-radius:var(--radius-sm); color:var(--text-primary, #e8e8e8); }
      .cmp-bit b { font-weight:600; color:var(--text-tertiary, #8a867e); font-size:.74rem; }
      .cmp-bit.warn { border-color:#d9a441; }
    `;
    document.head.appendChild(style);
  }

  function esc(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('companion'),
    tabs: [
      {
        id: 'main',
        label: '동반자',
        build: function (container: HTMLElement): void {
          injectStyles();
          container.innerHTML = `
            <div class="cmp-state">
              <span class="cmp-dot" id="cmpDot"></span>
              <div>
                <div class="cmp-state-text" id="cmpText">확인하는 중…</div>
                <div class="cmp-state-sub" id="cmpSub"></div>
              </div>
              <div class="cmp-open">
                <a class="cmp-btn" href="${BASE}/" target="_blank" rel="noopener noreferrer">창 열기</a>
                <button class="cmp-btn" id="cmpAgain" type="button">다시 확인</button>
              </div>
            </div>
            <div class="cmp-bits" id="cmpBits"></div>
            <div class="cmp-say">
              <input id="cmpInput" type="text" placeholder="한 줄 던지기 — 답은 저쪽 창과 목소리로 나간다" autocomplete="off">
              <button class="cmp-btn" id="cmpSend" type="button">말 걸기</button>
            </div>
            <p class="cmp-h">오간 말</p>
            <div class="cmp-log" id="cmpLog"><span class="cmp-empty">아직 못 읽었다.</span></div>
            <p class="cmp-h" style="margin-top:18px">나를 뭘 안다고 생각하나</p>
            <div class="cmp-known" id="cmpKnown">아직 못 읽었다.</div>
            <p class="cmp-note">얼굴·목소리는 봇이 띄우는 창이 정본이다 — 여기는 곁에 있는지 보고 한 줄 던지는 자리.<br>
            안 떠 있으면 <b>서버 모니터 → 「동반자 (말하는 봇)」</b> 카드로 켠다.</p>`;

          const dot = container.querySelector('#cmpDot') as HTMLElement;
          const text = container.querySelector('#cmpText') as HTMLElement;
          const sub = container.querySelector('#cmpSub') as HTMLElement;
          const again = container.querySelector('#cmpAgain') as HTMLButtonElement;
          const input = container.querySelector('#cmpInput') as HTMLInputElement;
          const send = container.querySelector('#cmpSend') as HTMLButtonElement;
          const log = container.querySelector('#cmpLog') as HTMLElement;
          const known = container.querySelector('#cmpKnown') as HTMLElement;
          const bits = container.querySelector('#cmpBits') as HTMLElement;

          function 못붙음(why: string): void {
            dot.className = 'cmp-dot off';
            text.textContent = '지금은 안 잡힌다';
            sub.textContent = why;
            input.disabled = true;
            send.disabled = true;
            bits.innerHTML = '';
          }

          /**
           * 창·몸·목소리를 눈에 보이게 — 오늘(2026-08-08) 사고 셋이 전부 **조용히** 빠진
           * 것이었다. 로컬 목소리가 목록에서 사라지고, 3D 몸이 큐브로 바뀌고, 창이 옛
           * 방식으로 떴는데 전부 기록에만 남았다. 기록은 아무도 안 본다.
           */
          function 상태그리기(st: State | null): void {
            if (st === null) {
              bits.innerHTML = '';
              return;
            }
            const 칸: { 이름: string; 값: string; 경고?: boolean }[] = [
              { 이름: '창', 값: st.창붙음 > 0 ? `${st.창붙음}개 붙음` : '안 떠 있음', 경고: st.창붙음 === 0 },
              // 큐브 = 3D 몸을 못 세운 것. 그냥 두면 「원래 저런가 보다」가 된다.
              { 이름: '몸', 값: st.몸 ?? '모름', 경고: st.몸 === '큐브' },
              { 이름: '인격', 값: st.인격 ?? '없음' },
              { 이름: '머리', 값: st.머리 ?? '모름' },
            ];
            if (Array.isArray(st.목소리들)) {
              const 흉내있나 = st.목소리들.includes('흉내');
              const 값 =
                흉내있나 === false
                  ? st.목소리들.join(' + ') || '없음'
                  : st.흉내준비 === true
                    ? `흉내(준비됨) + ${st.목소리들.filter((v) => v !== '흉내').join(' + ')}`
                    : `흉내(${st.흉내자동 === false ? '자동 꺼둠' : '켜는 중'}) + ${st.목소리들.filter((v) => v !== '흉내').join(' + ')}`;
              칸.push({ 이름: '목소리', 값, 경고: 흉내있나 === false });
            }
            bits.innerHTML = 칸
              .map((c) => `<span class="cmp-bit${c.경고 === true ? ' warn' : ''}"><b>${c.이름}</b>${esc(c.값)}</span>`)
              .join('');
          }

          async function 읽기<T>(길: string): Promise<T> {
            // 시간 제한이 없으면 「확인하는 중」에서 영영 멈춘다 — 꺼진 것과 구분이 안 된다.
            const res = await fetch(`${BASE}${길}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as T;
          }

          function 대화그리기(entries: readonly Entry[]): void {
            const 최근 = entries.slice(-40);
            if (최근.length === 0) {
              log.innerHTML = '<span class="cmp-empty">아직 나눈 말이 없다.</span>';
              return;
            }
            log.innerHTML = 최근
              .map((e) => {
                const 나 = e.role === 'sensed';
                return `<div class="cmp-line${나 ? ' me' : ''}"><span class="cmp-who">${나 ? '나' : '얘'}</span>${esc(e.text)}</div>`;
              })
              .join('');
            log.scrollTop = log.scrollHeight;
          }

          async function 확인(): Promise<void> {
            if (안붙는곳) {
              못붙음('배포된 페이지에서는 로컬 봇에 못 붙는다 — 앱이나 로컬 dev 에서 열어라');
              return;
            }
            dot.className = 'cmp-dot';
            text.textContent = '확인하는 중…';
            sub.textContent = '';
            const 시작 = Date.now();
            try {
              await 읽기<{ offline: boolean }>('/ears');
              dot.className = 'cmp-dot on';
              text.textContent = '곁에 있다';
              input.disabled = false;
              send.disabled = false;
              const [stats, hist, kn, st] = await Promise.all([
                읽기<Stats>('/stats').catch(() => null),
                읽기<Entry[]>('/history').catch(() => null),
                읽기<{ known: string | null }>('/known').catch(() => null),
                읽기<State>('/state').catch(() => null),
              ]);
              상태그리기(st);
              const 첫소리 =
                stats === null || stats.첫소리중앙값ms === null
                  ? '첫 소리 아직 안 쟀다'
                  : `첫 소리 중앙값 ${(stats.첫소리중앙값ms / 1000).toFixed(1)}초 (${stats.샘플수}번)`;
              sub.textContent = `${Date.now() - 시작}ms · ${첫소리}`;
              if (hist !== null) 대화그리기(hist);
              known.textContent = kn?.known?.trim() || '아직 아는 게 없다.';
            } catch (e) {
              // 브라우저는 「막혔다」와 「안 떠 있다」를 똑같은 오류로 준다 — 아는 척하지 않고
              // 둘 다 말한다. 하나로 단정하면 엉뚱한 데를 뒤지게 된다(실제로 그랬다).
              못붙음(
                (e as Error).name === 'TimeoutError'
                  ? '답이 없다 (안 켜져 있을 수 있다)'
                  : '안 켜졌거나, 봇이 이 창에 문을 안 열어 준다'
              );
            }
          }

          async function 말걸기(): Promise<void> {
            const 말 = input.value.trim();
            if (말 === '') return;
            send.disabled = true;
            try {
              const res = await fetch(`${BASE}/say`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: 말 }),
                signal: AbortSignal.timeout(4000),
              });
              // 400 = 깨진 글이라 안 받은 것. 조용히 지나가면 「보냈는데 반응이 없다」가 된다.
              if (res.status === 400) {
                const 이유 = (await res.json().catch(() => ({}))) as { 안받은이유?: string };
                Toolbox.showToast?.(`안 받았다 — ${이유.안받은이유 ?? '깨진 글'}`, 'error', undefined);
                return;
              }
              if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
              input.value = '';
              // 답은 저쪽 창에서 만들어진다 — 잠깐 뒤에 다시 읽어야 대화에 잡힌다.
              window.setTimeout(() => void 확인(), 1200);
            } catch (e) {
              Toolbox.showToast?.(`말을 못 걸었다 — ${(e as Error).message}`, 'error', undefined);
            } finally {
              send.disabled = false;
            }
          }

          again.addEventListener('click', () => void 확인());
          send.addEventListener('click', () => void 말걸기());
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') void 말걸기();
          });
          void 확인();
        },
      },
    ],
  });
})();
