/**
 * 노트북 위젯. 집에서 24시간 도는 노트북으로 가는 문.
 *
 * 왜 새로 만드나(흡수 검토 결과): 서버 모니터는 *이 기계에서 도는 로컬 프로세스*를 켜고 끄는
 * 판이라 데스크톱 앱 기능(Tauri 호출)에 묶여 있다. 이건 반대다. **다른 기계에 원격으로,
 * 폰 브라우저에서도** 되어야 한다. 읽기 전용이고 여는 링크뿐이라 그 큰 판에 얹을 이유가 없다.
 *
 * ★ 비밀번호는 여기 담지 않는다. 이 페이지는 문이 어디 있고 지금 열려 있나까지만 말하고,
 *   들어가는 것은 노트북 쪽 화면이 직접 묻는다. 공개된 사이트에 열쇠를 두지 않는다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BASE = 'https://laptop.mascari4615.com';

  type Health = { ok?: boolean; version?: string; ts?: string };

  /* ★ **말은 묶음이 온 뒤에 읽는다** (2026-08-14, 실서비스 고장 다섯 건).
     파일이 읽히는 순간 `t()` 를 부르면 아직 `loadNamespace` 전이라 되받을 글 없는 `t()` 가 던지고,
     그 묶음에 든 위젯이 통째로 안 올라간다(화면엔 오류도 안 뜬다). 부르는 시점을 늦춘다. */
  const doorList = (): { href: string; icon: string; title: string; desc: string }[] => [
    // 파일: Files 앱 내 PC 탭. 옛 laptop-ops HTML 화면은 2026-09-03 제거
    { href: 'https://files.mascari4615.com/#laptop/', icon: '📁', title: t('laptop.t03'), desc: t('laptop.t04') },
    { href: `${BASE}/builds`, icon: '🧱', title: t('laptop.t05'), desc: t('laptop.t06') },
    { href: `${BASE}/pc`, icon: '📈', title: t('laptop.t14'), desc: t('laptop.t15') },
    { href: BASE, icon: '🏠', title: t('laptop.t07'), desc: t('laptop.t08') },
  ];

  function injectStyles(): void {
    if (document.getElementById('laptop-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'laptop-widget-styles';
    style.textContent = `
      .lap-state { display:flex; align-items:center; gap:10px; padding:14px 16px;
        background:var(--bg-tertiary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-md); margin-bottom:14px; }
      .lap-dot { width:10px; height:10px; border-radius:50%; background:var(--text-tertiary); flex:0 0 auto; }
      .lap-dot.on { background:var(--success); box-shadow:0 0 8px color-mix(in srgb, var(--success) 60%, transparent); }
      .lap-dot.off { background:var(--error); }
      .lap-state-text { font-size:.92rem; color:var(--text-primary); }
      .lap-state-sub { font-size:.78rem; color:var(--text-tertiary); margin-top:2px;
        font-family:var(--font-mono, monospace); }
      .lap-again { margin-left:auto; background:none; border:1px solid var(--border, var(--border));
        color:var(--text-tertiary); border-radius:var(--radius-sm); padding:6px 10px;
        font-size:.78rem; cursor:pointer; }
      .lap-again:hover { color:var(--text-primary); }
      .lap-doors { display:grid; gap:10px; }
      .lap-door { display:flex; align-items:center; gap:14px; padding:14px 16px; text-decoration:none;
        background:var(--bg-secondary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-md); color:inherit; }
      .lap-door:hover { border-color:var(--accent); }
      .lap-door-icon { font-size:1.5rem; flex:0 0 auto; }
      .lap-door-title { font-size:.98rem; color:var(--text-primary); }
      .lap-door-desc { font-size:.8rem; color:var(--text-tertiary); margin-top:3px; line-height:1.5; }
      .lap-vitals { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; margin-top:12px; }
      .lap-v { background:var(--bg-secondary); border:1px solid var(--border, var(--border));
        border-radius:var(--radius-sm); padding:9px 11px; }
      .lap-v-k { font-size:.72rem; color:var(--text-tertiary); }
      .lap-v-v { font-size:1.15rem; font-variant-numeric:tabular-nums; color:var(--text-primary); }
      .lap-v.warn .lap-v-v { color:var(--warning); }
      .lap-v.bad .lap-v-v { color:var(--error); }
      .lap-key { display:flex; gap:8px; margin-top:12px; }
      .lap-key input { flex:1; min-width:0; background:var(--bg-secondary); color:var(--text-primary);
        border:1px solid var(--border, var(--border)); border-radius:var(--radius-sm); padding:7px 10px; font-size:.85rem; }
      .lap-key button { background:none; border:1px solid var(--border, var(--border)); color:var(--text-tertiary);
        border-radius:var(--radius-sm); padding:7px 12px; font-size:.8rem; cursor:pointer; }
      .lap-key button:hover { color:var(--text-primary); }
      .lap-why { font-size:.78rem; color:var(--text-tertiary); margin-top:8px; }
      .lap-note { margin-top:14px; font-size:.78rem; color:var(--text-tertiary); line-height:1.6; }
    `;
    document.head.appendChild(style);
  }

  Toolbox.register({
    id: 'laptop',
    title: t('widgets.laptop.title', undefined, "노트북"),
    category: 'app',
    desc: t('widgets-desc.laptop.desc', undefined, "집에서 24시간 도는 노트북. 파일 공유, 빌드 현황으로 가는 문"),
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
              ${doorList().map(
                (d) => `<a class="lap-door" href="${d.href}" target="_blank" rel="noopener noreferrer">
                  <span class="lap-door-icon">${d.icon}</span>
                  <span>
                    <span class="lap-door-title">${d.title}</span>
                    <div class="lap-door-desc">${d.desc}</div>
                  </span>
                </a>`
              ).join('')}
            </div>
            <div class="lap-vitals" id="lapVitals" hidden></div>
            <div class="lap-key">
              <input type="password" id="lapKey" autocomplete="off" placeholder="${esc(t('laptop.t16'))}">
              <button type="button" id="lapShow">${esc(t('laptop.t17'))}</button>
              <button type="button" id="lapForget" hidden>${esc(t('laptop.t18'))}</button>
            </div>
            <p class="lap-why" id="lapWhy"></p>
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
              // 시간 제한이 없으면 확인하는 중에서 영영 멈춘다. 그건 꺼진 것과 구분이 안 된다.
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
              // 왜인지까지 말한다. 안 됨만 있으면 뭘 해볼지가 없다.
              sub.textContent =
                (e as Error).name === 'TimeoutError' ? t('laptop.t13') : (e as Error).message;
            }
          }

          const vitalsBox = container.querySelector('#lapVitals') as HTMLElement;
          const keyInput = container.querySelector('#lapKey') as HTMLInputElement;
          const showBtn = container.querySelector('#lapShow') as HTMLButtonElement;
          const forgetBtn = container.querySelector('#lapForget') as HTMLButtonElement;
          const why = container.querySelector('#lapWhy') as HTMLElement;

          /* ★ 열쇠는 <b>이 브라우저에만</b> 산다. 저장소에 담으면 공개 사이트에 열쇠를 두는 꼴
             (이 파일 맨 위 원칙). localStorage 는 이 기기 밖으로 안 나가고 서버도 못 읽는다.
             막힌 브라우저와 시크릿 창에서는 읽기 자체가 던지므로 감싼다. */
          const KEY_AT = 'laptop.pc.key';
          const keepKey = (v: string): void => { try { localStorage.setItem(KEY_AT, v); } catch { /* 막힌 브라우저 */ } };
          const savedKey = (): string => { try { return localStorage.getItem(KEY_AT) ?? ''; } catch { return ''; } };
          const dropKey = (): void => { try { localStorage.removeItem(KEY_AT); } catch { /* 막힌 브라우저 */ } };

          type Now = {
            cpuPct?: number; usedPct?: number; netRecvKBs?: number;
            disks?: { drive: string; usedPct: number }[]; verdict?: string;
          };

          /** -1 은 못 잰 값 — 0 과 구분한다. 0% 는 한가했다는 뜻이라 섞으면 거짓이 된다. */
          const shown = (v: number | undefined): string =>
            typeof v === 'number' && v >= 0 ? `${v}%` : '?';

          const level = (v: number | undefined): string =>
            typeof v !== 'number' || v < 0 ? '' : v >= 92 ? ' bad' : v >= 80 ? ' warn' : '';

          const cell = (k: string, v: string, cls = ''): string =>
            `<div class="lap-v${cls}"><div class="lap-v-k">${esc(k)}</div><div class="lap-v-v">${esc(v)}</div></div>`;

          function paint(now: Now): void {
            const worstDisk = (now.disks ?? []).reduce<{ drive: string; usedPct: number } | undefined>(
              (worst, one) => (worst === undefined || one.usedPct > worst.usedPct ? one : worst),
              undefined
            );
            const recv = typeof now.netRecvKBs === 'number' && now.netRecvKBs >= 0
              ? (now.netRecvKBs >= 1024 ? `${(now.netRecvKBs / 1024).toFixed(1)} MB/s` : `${now.netRecvKBs} KB/s`)
              : '?';

            vitalsBox.innerHTML =
              cell(t('laptop.g.cpu'), shown(now.cpuPct), level(now.cpuPct)) +
              cell(t('laptop.g.mem'), shown(now.usedPct), level(now.usedPct)) +
              (worstDisk === undefined
                ? ''
                : cell(`${worstDisk.drive} ${t('laptop.g.disk')}`, shown(worstDisk.usedPct), level(worstDisk.usedPct))) +
              cell(t('laptop.g.net'), recv);
            vitalsBox.hidden = false;
            why.textContent = now.verdict ?? '';
          }

          async function readVitals(pw: string): Promise<void> {
            why.textContent = '';
            try {
              const res = await fetch(`${BASE}/pc/api?k=${encodeURIComponent(pw)}&lines=1`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
              });
              if (res.status === 401) { why.textContent = t('laptop.t19'); return; }
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const body = (await res.json()) as { ok?: boolean; now?: Now };
              if (body.ok !== true || body.now === undefined) { why.textContent = t('laptop.t20'); return; }
              keepKey(pw);
              forgetBtn.hidden = false;
              paint(body.now);
            } catch (e) {
              why.textContent = (e as Error).message;
            }
          }

          showBtn.addEventListener('click', () => {
            const pw = keyInput.value.trim();
            if (pw !== '') void readVitals(pw);
          });
          keyInput.addEventListener('keydown', (ev) => {
            if ((ev as KeyboardEvent).key === 'Enter') showBtn.click();
          });
          forgetBtn.addEventListener('click', () => {
            dropKey();
            keyInput.value = '';
            vitalsBox.hidden = true;
            forgetBtn.hidden = true;
            why.textContent = '';
          });

          again.addEventListener('click', () => {
            void check();
            const pw = savedKey();
            if (pw !== '') void readVitals(pw);
          });
          void check();
          const already = savedKey();
          if (already !== '') { keyInput.value = already; forgetBtn.hidden = false; void readVitals(already); }
                  });
        },
      },
    ],
  });
})();
