/**
 * 나만 안 되나? — 사이트가 죽었는지, 내 쪽이 문제인지 (TASK-KL-238 / 45 downdetector)
 *
 * downdetector 는 「남들도 안 된다」를 보여 주는 곳이라 알맹이가 *제보 창고*다. 그건 못 짓는다.
 * 그런데 사람이 정말 알고 싶은 건 하나다 — **내 문제인가, 저쪽 문제인가.** 그건 대조군을 같이
 * 재면 우리 손으로 답할 수 있다(`lib/reachability` 가 그 판정을 갖는다).
 *
 * 재는 법: `fetch(..., { mode: 'no-cors' })`. 다른 출처의 답은 **불투명**해서 200/500 을 못 본다 —
 * 그래서 이 도구의 「된다」는 *서버가 대답한다*는 뜻이고, 화면에도 그렇게 적는다. 대신 그걸로도
 * 「연결이 아예 안 된다」와 「대답은 한다」는 확실히 갈린다. 그 둘이 사람의 다음 행동을 가른다.
 */
import { hostOf, toUrl, verdict, type Probe } from '../../lib/reachability';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  /** 대조군 = 여러 나라·여러 회사. 한 회사만 쓰면 그 회사가 흔들릴 때 「내 인터넷이 죽었다」로 잘못 말한다. */
  const CONTROLS: Array<[string, string]> = [
    ['Cloudflare', 'https://cloudflare.com'],
    ['Google', 'https://www.google.com'],
    ['Wikipedia', 'https://www.wikipedia.org']
  ];

  const TIMEOUT_MS = 6000;

  /** 한 곳을 재 본다. 오래 걸리면 끊는다 — 안 끊으면 「안 되는 것」과 「느린 것」이 안 갈린다. */
  async function probe(name: string, url: string): Promise<Probe> {
    const started = performance.now();
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: stop.signal, redirect: 'follow' });
      return { name, ok: true, ms: Math.round(performance.now() - started) };
    } catch {
      return { name, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  Toolbox.register({
    id: 'isitdown',
    title: t('widgets.isitdown.title', undefined, '나만 안 되나?'),
    category: 'tool',
    desc: t(
      'widgets-desc.isitdown.desc',
      undefined,
      '사이트가 죽은 건지 내 인터넷이 문제인지 가려 줍니다. 늘 살아 있는 곳들을 같이 재서 견줍니다'
    ),
    layout: 'form',
    icon: '<path d="M12 20h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 12.5a10 10 0 0 1 14 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2 9a15 15 0 0 1 20 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('isitdown.tab', undefined, '확인'),
        build: function (container: HTMLElement): void {
          void loadNamespace('isitdown').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="idUrl">${esc(t('isitdown.label.url'))}</label>
        <input type="text" id="idUrl" name="url" spellcheck="false" autocapitalize="off" placeholder="naver.com">
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 var(--space-lg);">
        <button class="btn btn-primary" id="idRun">${esc(t('isitdown.btn.run'))}</button>
      </div>
      <div class="tool-display" id="idVerdict">—</div>
      <div class="tool-list" id="idRows"></div>
      <div class="tool-status" id="idStatus">${esc(t('isitdown.status.idle'))}</div>
      <p class="tool-hint tool-note">${esc(t('isitdown.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLInputElement>('#idUrl');
    const button = $<HTMLButtonElement>('#idRun');
    const display = $<HTMLElement>('#idVerdict');
    const rows = $<HTMLElement>('#idRows');
    const status = $<HTMLElement>('#idStatus');
    /* 판정은 **읽히는 자리**다 (TASK-KL-291) — 색만 바뀌면 화면낭독기 쓰는 사람에겐 아무 일도 안 일어난다. */
    markLive(status);

    let running = false;

    async function run(): Promise<void> {
      if (running) return;
      const url = toUrl(input.value);
      if (url === null) {
        display.textContent = '—';
        rows.innerHTML = '';
        status.textContent = t('isitdown.status.badUrl');
        return;
      }
      running = true;
      button.disabled = true;
      display.textContent = t('isitdown.status.working', { host: hostOf(url) });
      rows.innerHTML = '';
      status.textContent = t('isitdown.status.working', { host: hostOf(url) });

      /* 대상과 대조군을 **같이** 잰다 — 차례로 재면 그 사이에 상황이 바뀌어 견줄 수 없다. */
      const [target, ...controls] = await Promise.all([
        probe(hostOf(url), url),
        ...CONTROLS.map(([name, u]) => probe(name, u))
      ]);

      const key = verdict({ target, controls });
      display.textContent = t(`isitdown.verdict.${key}`, { host: hostOf(url) });
      display.className = 'tool-display' + (key === 'mine' || key === 'theirs' ? ' tool-display-done' : '');
      rows.innerHTML = [target, ...controls]
        .map((p) => {
          const mark = p.ok ? t('isitdown.row.ok', { ms: String(p.ms ?? 0) }) : t('isitdown.row.no');
          return `<div class="tool-list-row"><span class="tool-list-key">${esc(p.name)}</span><span class="tool-list-val">${esc(mark)}</span></div>`;
        })
        .join('');
      status.textContent = t(`isitdown.verdict.${key}`, { host: hostOf(url) });
      running = false;
      button.disabled = false;
    }

    button.onclick = () => void run();
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void run();
    });

    // 주소로 바로 부를 수 있게 (`?url=naver.com`) — 「안 되는데?」 하는 사람에게 링크 하나로 보낸다.
    const from = new URLSearchParams(location.search).get('url');
    if (from !== null && from !== '') {
      input.value = from;
      void run();
    }
  }
})();
