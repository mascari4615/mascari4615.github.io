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
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BASE = 'http://127.0.0.1:4620';
  const unattachable = location.protocol === 'https:' && location.hostname.endsWith('github.io');

  type Entry = { role: 'sensed' | 'said'; channel: string; text: string; at: number };
  type Stats = { sampleCount: number; firstSoundMedianMs: number | null; worstMs: number | null };
  type State = {
    windowAttached: number;
    body: '3D' | '큐브' | null;
    persona?: string | null;
    head?: string | null;
    voices?: string[];
    stubPrepare?: boolean | null;
    stubAuto?: boolean;
  };

  function injectStyles(): void {
    if (document.getElementById('companion-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'companion-widget-styles';
    style.textContent = `
      .cmp-state { display:flex; align-items:center; gap:10px; padding:14px 16px;
        background:var(--bg-tertiary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-md); margin-bottom:14px; }
      .cmp-dot { width:10px; height:10px; border-radius:50%; background:#8a867e; flex:0 0 auto; }
      .cmp-dot.on { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,.6); }
      .cmp-dot.off { background:#f87171; }
      .cmp-state-text { font-size:.92rem; color:var(--text-primary, #e8e8e8); }
      .cmp-state-sub { font-size:.78rem; color:var(--text-tertiary, #8a867e); margin-top:2px;
        font-family:var(--font-mono, monospace); }
      .cmp-open { margin-left:auto; display:flex; gap:8px; }
      .cmp-btn { background:none; border:1px solid var(--border, var(--border));
        color:var(--text-tertiary, #8a867e); border-radius:var(--radius-sm); padding:6px 10px;
        font-size:.78rem; cursor:pointer; text-decoration:none; }
      .cmp-btn:hover { color:var(--text-primary, #e8e8e8); border-color:var(--accent, #a99bf5); }
      .cmp-say { display:flex; gap:8px; margin-bottom:14px; }
      .cmp-say input { flex:1; background:var(--bg-secondary); color:var(--text-primary, #e8e8e8);
        border:1px solid var(--border, var(--border)); border-radius:var(--radius-sm);
        padding:10px 12px; font-size:.92rem; }
      .cmp-say input:focus { outline:none; border-color:var(--accent, #a99bf5); }
      .cmp-log { display:flex; flex-direction:column; gap:8px; max-height:340px; overflow-y:auto;
        padding:12px; background:var(--bg-secondary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-md); }
      .cmp-line { font-size:.88rem; line-height:1.55; color:var(--text-primary, #e8e8e8); }
      .cmp-line.me { color:var(--text-tertiary, #8a867e); }
      .cmp-who { font-family:var(--font-mono, monospace); font-size:.74rem; margin-right:8px;
        color:var(--text-tertiary, #8a867e); }
      .cmp-empty { font-size:.84rem; color:var(--text-tertiary, #8a867e); }
      .cmp-known { margin-top:14px; padding:12px 14px; background:var(--bg-tertiary);
        border:1px solid var(--border, var(--border)); border-radius:var(--radius-md);
        font-size:.84rem; line-height:1.7; color:var(--text-primary, #e8e8e8); white-space:pre-wrap; }
      .cmp-h { font-size:.76rem; letter-spacing:.06em; text-transform:uppercase;
        color:var(--text-tertiary, #8a867e); margin:0 0 8px; }
      .cmp-note { margin-top:14px; font-size:.78rem; color:var(--text-tertiary, #8a867e); line-height:1.6; }
      .cmp-bits { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .cmp-bit { display:flex; align-items:center; gap:6px; padding:6px 10px; font-size:.8rem;
        background:var(--bg-secondary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-sm); color:var(--text-primary, #e8e8e8); }
      .cmp-bit b { font-weight:600; color:var(--text-tertiary, #8a867e); font-size:.74rem; }
      .cmp-bit.warn { border-color:#d9a441; }
    `;
    document.head.appendChild(style);
  }


  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('companion'),
    tabs: [
      {
        id: 'main',
        label: t('companion.t09', undefined, "동반자"),
        build: function (container: HTMLElement): void {
          void loadNamespace('companion').then(function () {

          injectStyles();
          container.innerHTML = `
            <div class="cmp-state">
              <span class="cmp-dot" id="cmpDot"></span>
              <div>
                <div class="cmp-state-text" id="cmpText">${esc(t('companion.label.cmpText'))}</div>
                <div class="cmp-state-sub" id="cmpSub"></div>
              </div>
              <div class="cmp-open">
                <a class="cmp-btn" href="${BASE}/" target="_blank" rel="noopener noreferrer">${esc(t('companion.t01'))}</a>
                <button class="cmp-btn" id="cmpAgain" type="button">${esc(t('companion.btn.cmpAgain'))}</button>
              </div>
            </div>
            <div class="cmp-bits" id="cmpBits"></div>
            <div class="cmp-say">
              <input id="cmpInput" type="text" placeholder="${esc(t('companion.ph.cmpInput'))}" autocomplete="off">
              <button class="cmp-btn" id="cmpSend" type="button">${esc(t('companion.btn.cmpSend'))}</button>
            </div>
            <p class="cmp-h">${esc(t('companion.t02'))}</p>
            <div class="cmp-log" id="cmpLog"><span class="cmp-empty">${esc(t('companion.t03'))}</span></div>
            <p class="cmp-h" style="margin-top:18px">${esc(t('companion.t04'))}</p>
            <div class="cmp-known" id="cmpKnown">${esc(t('companion.t03'))}</div>
            <p class="cmp-note">${esc(t('companion.t05'))}<br>
            ${esc(t('companion.t06'))} <b>${esc(t('companion.t07'))}</b> ${esc(t('companion.t08'))}</p>`;

          const dot = container.querySelector('#cmpDot') as HTMLElement;
          const text = container.querySelector('#cmpText') as HTMLElement;
          const sub = container.querySelector('#cmpSub') as HTMLElement;
          const again = container.querySelector('#cmpAgain') as HTMLButtonElement;
          const input = container.querySelector('#cmpInput') as HTMLInputElement;
          const send = container.querySelector('#cmpSend') as HTMLButtonElement;
          const log = container.querySelector('#cmpLog') as HTMLElement;
          const known = container.querySelector('#cmpKnown') as HTMLElement;
          const bits = container.querySelector('#cmpBits') as HTMLElement;

          function notAttached(why: string): void {
            dot.className = 'cmp-dot off';
            text.textContent = t('companion.t10');
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
          function renderState(st: State | null): void {
            if (st === null) {
              bits.innerHTML = '';
              return;
            }
            const cell: { name: string; value: string; warn?: boolean }[] = [
              { name: t('companion.t11'), value: st.windowAttached > 0 ? t('companion.attached', { n: st.windowAttached }) : t('companion.t12'), warn: st.windowAttached === 0 },
              // 큐브 = 3D 몸을 못 세운 것. 그냥 두면 「원래 저런가 보다」가 된다.
              { name: t('companion.t13'), value: st.body ?? t('companion.t14'), warn: st.body === t('companion.t15') },
              { name: t('companion.t16'), value: st.persona ?? t('companion.t17') },
              { name: t('companion.t18'), value: st.head ?? t('companion.t14') },
            ];
            if (Array.isArray(st.voices)) {
              const hasStub = st.voices.includes(t('companion.t19'));
              const value2 =
                hasStub === false
                  ? st.voices.join(' + ') || '없음'
                  : st.stubPrepare === true
                    ? `${t('companion.mimicReady')} + ${st.voices.filter((v) => v !== t('companion.t19')).join(' + ')}`
                    : `${t('companion.mimicState', { state: st.stubAuto === false ? t('companion.t20') : t('companion.t21') })} + ${st.voices.filter((v) => v !== t('companion.t19')).join(' + ')}`;
              cell.push({ name: t('companion.t22'), value: value2, warn: hasStub === false });
            }
            bits.innerHTML = cell
              .map((c) => `<span class="cmp-bit${c.warn === true ? ' warn' : ''}"><b>${c.name}</b>${esc(c.value)}</span>`)
              .join('');
          }

          async function read<T>(path: string): Promise<T> {
            // 시간 제한이 없으면 「확인하는 중」에서 영영 멈춘다 — 꺼진 것과 구분이 안 된다.
            const res = await fetch(`${BASE}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as T;
          }

          function renderConversation(entries: readonly Entry[]): void {
            const recent = entries.slice(-40);
            if (recent.length === 0) {
              log.innerHTML = t('companion.t23');
              return;
            }
            log.innerHTML = recent
              .map((e) => {
                const self = e.role === 'sensed';
                return `<div class="cmp-line${self ? ' me' : ''}"><span class="cmp-who">${self ? t('companion.me') : t('companion.t24')}</span>${esc(e.text)}</div>`;
              })
              .join('');
            log.scrollTop = log.scrollHeight;
          }

          async function confirm(): Promise<void> {
            if (unattachable) {
              notAttached(t('companion.t25'));
              return;
            }
            dot.className = 'cmp-dot';
            text.textContent = t('companion.label.cmpText');
            sub.textContent = '';
            const start = Date.now();
            try {
              await read<{ offline: boolean }>('/ears');
              dot.className = 'cmp-dot on';
              text.textContent = t('companion.t26');
              input.disabled = false;
              send.disabled = false;
              const [stats, hist, kn, st] = await Promise.all([
                read<Stats>('/stats').catch(() => null),
                read<Entry[]>('/history').catch(() => null),
                read<{ known: string | null }>('/known').catch(() => null),
                read<State>('/state').catch(() => null),
              ]);
              renderState(st);
              const initialJamo =
                stats === null || stats.firstSoundMedianMs === null
                  ? t('companion.t27')
                  : t('companion.firstSound', { sec: (stats.firstSoundMedianMs / 1000).toFixed(1), n: stats.sampleCount });
              sub.textContent = `${Date.now() - start}ms · ${initialJamo}`;
              if (hist !== null) renderConversation(hist);
              known.textContent = kn?.known?.trim() || '아직 아는 게 없다.';
            } catch (e) {
              // 브라우저는 「막혔다」와 「안 떠 있다」를 똑같은 오류로 준다 — 아는 척하지 않고
              // 둘 다 말한다. 하나로 단정하면 엉뚱한 데를 뒤지게 된다(실제로 그랬다).
              notAttached(
                (e as Error).name === 'TimeoutError'
                  ? t('companion.t28')
                  : t('companion.t29')
              );
            }
          }

          async function speak(): Promise<void> {
            const text2 = input.value.trim();
            if (text2 === '') return;
            send.disabled = true;
            try {
              const res = await fetch(`${BASE}/say`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: text2 }),
                signal: AbortSignal.timeout(4000),
              });
              // 400 = 깨진 글이라 안 받은 것. 조용히 지나가면 「보냈는데 반응이 없다」가 된다.
              if (res.status === 400) {
                const reason = (await res.json().catch(() => ({}))) as { notAcceptedReason?: string };
                Toolbox.showToast?.(`안 받았다 — ${reason.notAcceptedReason ?? t('companion.t30')}`, 'error', undefined);
                return;
              }
              if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
              input.value = '';
              // 답은 저쪽 창에서 만들어진다 — 잠깐 뒤에 다시 읽어야 대화에 잡힌다.
              window.setTimeout(() => void confirm(), 1200);
            } catch (e) {
              Toolbox.showToast?.(`말을 못 걸었다 — ${(e as Error).message}`, 'error', undefined);
            } finally {
              send.disabled = false;
            }
          }

          again.addEventListener('click', () => void confirm());
          send.addEventListener('click', () => void speak());
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') void speak();
          });
          void confirm();
                  });
        },
      },
    ],
  });
})();
