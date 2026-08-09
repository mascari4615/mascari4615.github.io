/**
 * 「노트북」 위젯 — 집에서 24시간 도는 노트북으로 가는 문.
 *
 * 왜 새로 만드나(흡수 검토 결과): 서버 모니터는 *이 기계에서 도는 로컬 프로세스*를 켜고 끄는
 * 판이라 데스크톱 앱 기능(Tauri 호출)에 묶여 있다. 이건 반대다 — **다른 기계에 원격으로,
 * 폰 브라우저에서도** 되어야 한다. 읽기 전용이고 여는 링크뿐이라 그 큰 판에 얹을 이유가 없다.
 *
 * ★ 비밀번호는 여기 담지 않는다. 이 페이지는 「문이 어디 있고 지금 열려 있나」까지만 말하고,
 *   들어가는 것은 노트북 쪽 화면이 직접 묻는다. 공개된 사이트에 열쇠를 두지 않는다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BASE = 'https://laptop.mascari4615.com';

  type Health = { ok?: boolean; version?: string; ts?: string };

  const DOORS: { href: string; icon: string; title: string; desc: string }[] = [
    { href: `${BASE}/files`, icon: '📁', title: t('laptop.t03'), desc: t('laptop.t04') },
    { href: `${BASE}/builds`, icon: '🧱', title: t('laptop.t05'), desc: t('laptop.t06') },
    { href: BASE, icon: '🏠', title: t('laptop.t07'), desc: t('laptop.t08') },
  ];

  function injectStyles(): void {
    if (document.getElementById('laptop-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'laptop-widget-styles';
    style.textContent = `
      .lap-state { display:flex; align-items:center; gap:10px; padding:14px 16px;
        background:var(--bg-tertiary); border:1px solid var(--border, var(--border-color));
        border-radius:var(--radius-md); margin-bottom:14px; }
      .lap-dot { width:10px; height:10px; border-radius:50%; background:#8a867e; flex:0 0 auto; }
      .lap-dot.on { background:#4ade80; box-shadow:0 0 8px rgba(74,222,128,.6); }
      .lap-dot.off { background:#f87171; }
      .lap-state-text { font-size:.92rem; color:var(--text-primary, #e8e8e8); }
      .lap-state-sub { font-size:.78rem; color:var(--text-tertiary, #8a867e); margin-top:2px;
        font-family:var(--font-mono, monospace); }
      .lap-again { margin-left:auto; background:none; border:1px solid var(--border, var(--border-color));
        color:var(--text-tertiary, #8a867e); border-radius:var(--radius-sm); padding:6px 10px;
        font-size:.78rem; cursor:pointer; }
      .lap-again:hover { color:var(--text-primary, #e8e8e8); }
      .lap-doors { display:grid; gap:10px; }
      .lap-door { display:flex; align-items:center; gap:14px; padding:14px 16px; text-decoration:none;
        background:var(--bg-secondary); border:1px solid var(--border, var(--border-color));
        border-radius:var(--radius-md); color:inherit; }
      .lap-door:hover { border-color:var(--accent, #a99bf5); }
      .lap-door-icon { font-size:1.5rem; flex:0 0 auto; }
      .lap-door-title { font-size:.98rem; color:var(--text-primary, #e8e8e8); }
      .lap-door-desc { font-size:.8rem; color:var(--text-tertiary, #8a867e); margin-top:3px; line-height:1.5; }
      .lap-note { margin-top:14px; font-size:.78rem; color:var(--text-tertiary, #8a867e); line-height:1.6; }
    `;
    document.head.appendChild(style);
  }

  Toolbox.register({
    id: 'laptop',
    title: t('widgets.laptop.title', undefined, "노트북"),
    category: 'lab',
    desc: t('widgets-desc.laptop.desc', undefined, "집에서 24시간 도는 노트북 — 파일 공유·빌드 현황으로 가는 문"),
    layout: 'form',
    icon: '<rect x="3" y="5" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'main',
        label: t('laptop.t09', undefined, "노트북"),
        build: function (container: HTMLElement): void {
          void loadNamespace('laptop').then(function () {

          injectStyles();
          container.innerHTML = `
            <div class="lap-state">
              <span class="lap-dot" id="lapDot"></span>
              <div>
                <div class="lap-state-text" id="lapText">${esc(t('laptop.label.lapText'))}</div>
                <div class="lap-state-sub" id="lapSub"></div>
              </div>
              <button class="lap-again" id="lapAgain" type="button">${esc(t('laptop.btn.lapAgain'))}</button>
            </div>
            <div class="lap-doors">
              ${DOORS.map(
                (d) => `<a class="lap-door" href="${d.href}" target="_blank" rel="noopener noreferrer">
                  <span class="lap-door-icon">${d.icon}</span>
                  <span>
                    <span class="lap-door-title">${d.title}</span>
                    <div class="lap-door-desc">${d.desc}</div>
                  </span>
                </a>`
              ).join('')}
            </div>
            <p class="lap-note">${esc(t('laptop.t01'))}<br>
            ${esc(t('laptop.t02'))}</p>`;

          const dot = container.querySelector('#lapDot') as HTMLElement;
          const text = container.querySelector('#lapText') as HTMLElement;
          const sub = container.querySelector('#lapSub') as HTMLElement;
          const again = container.querySelector('#lapAgain') as HTMLButtonElement;

          async function check(): Promise<void> {
            dot.className = 'lap-dot';
            text.textContent = t('laptop.label.lapText');
            sub.textContent = '';
            const started = Date.now();
            try {
              // 시간 제한이 없으면 「확인하는 중」에서 영영 멈춘다 — 그건 꺼진 것과 구분이 안 된다.
              const res = await fetch(`${BASE}/health`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(6000),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const body = (await res.json()) as Health;
              dot.className = 'lap-dot on';
              text.textContent = t('laptop.t11');
              sub.textContent = t('laptop.pingResult', { ms: Date.now() - started, version: (body.version ?? '').slice(0, 8) || t('laptop.unknownVersion') });
            } catch (e) {
              dot.className = 'lap-dot off';
              text.textContent = t('laptop.t12');
              // 왜인지까지 말한다 — 「안 됨」만 있으면 뭘 해볼지가 없다.
              sub.textContent =
                (e as Error).name === 'TimeoutError' ? t('laptop.t13') : (e as Error).message;
            }
          }

          again.addEventListener('click', () => void check());
          void check();
                  });
        },
      },
    ],
  });
})();
