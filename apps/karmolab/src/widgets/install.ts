/**
 * 설치 — KarmoLab 에 붙는 부품을 여기서 깐다 (TASK-KL-330).
 *
 * 왜 있나: 「켜면 있다」가 성립하려면 누군가는 굽는 단계를 맡아야 한다. 여태 그 단계가
 * 어디에도 없어서 동반자 창은 **어느 컴퓨터에서도 존재한 적이 없었다** — 안내문에 적힌
 * 명령을 그대로 쳐도 안 됐다(워크스페이스 멤버 누락, 2026-08-19). 사람이 외워야 도는
 * 것은 없는 것과 같으므로, 외울 자리를 화면으로 만든다.
 *
 * 새 Rust 커맨드는 하나도 안 쓴다:
 * - 굽기 = `localdev_start` (서버 모니터가 쓰는 그 길). `npm` 만 허용되므로(program_allowed)
 *   cargo 는 `build:*` npm script 뒤에 숨는다.
 * - 「깔렸나」 = `repofile_read('apps/karmolab-tauri/target/install.json')`. 굽기가 성공할
 *   때만 찍히는 도장이라, 반쯤 구워진 것을 깔렸다고 하지 않는다.
 */
import { isDesktop, invoke, listen } from '../tauri-bridge';
import { t } from '../lib/i18n';
import { currentWorkFolder } from '../lib/work-folder';

(function (): void {
  'use strict';

  const CATALOG_PATH = '/apps/karmolab/data/install-catalog.json';
  const STAMP_PATH = 'apps/karmolab-tauri/target/install.json';

  type Part = {
    id: string;
    name: string;
    desc: string;
    profile: string;
    artifact: string;
    weight: string;
  };
  type Stamp = { builtAt: string; bytes: number; source: string | null };
  type Stamps = Record<string, Stamp>;
  type RowUi = { button: HTMLButtonElement; log: HTMLPreElement; state: HTMLElement; dot: HTMLElement };

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 스타일을 여기 두는 이유: 이 앱의 위젯 클래스는 css 파일에 없다(서버 모니터의
     `sm-*` 도 마찬가지다 — 전부 붙는 자리가 없는 이름이다). css 파일에 적으면 purge 가
     안 쓰는 이름으로 보고 지울 수도 있다. 위젯이 제 스타일을 들고 다니면 그 둘이 다
     사라진다. 색은 셸의 변수를 빌려 쓴다 — 밝기 테마를 따라간다. */
  const STYLE = `
.install-intro { color: var(--text-secondary); font-size: .92rem; margin: 0 0 1rem; }
.install-row { border: 1px solid var(--border); border-radius: 10px; padding: .9rem 1rem; margin-bottom: .7rem; }
.install-head { display: flex; align-items: center; gap: .55rem; }
.install-name { font-size: 1.02rem; }
.install-go { margin-left: auto; padding: .35rem .9rem; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg-tertiary); color: inherit; }
.install-go:hover:not(:disabled) { border-color: var(--accent); }
.install-go:disabled { opacity: .55; cursor: default; }
.install-dot { width: .62rem; height: .62rem; border-radius: 50%; flex: none;
  background: transparent; border: 1.5px solid var(--text-secondary); }
.install-dot.on { background: var(--accent); border-color: var(--accent); }
.install-desc { margin: .5rem 0 .3rem; font-size: .9rem; }
.install-state { margin: 0; font-size: .84rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.install-log { margin: .7rem 0 0; max-height: 15rem; overflow: auto; white-space: pre-wrap;
  font-size: .78rem; line-height: 1.45; padding: .6rem .7rem; border-radius: 7px;
  background: var(--bg-void); color: var(--text-secondary); }
.install-empty { color: var(--text-secondary); }
`;

  function injectStyle(): void {
    if (document.getElementById('install-style') !== null) return;
    const el = document.createElement('style');
    el.id = 'install-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  /** 「2026-08-19 19:27」. 도는 컴퓨터의 시간대로 읽는다. */
  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const asMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  /** 「깔림 · 22.0MB · 2026-08-19 19:27 구움 · 소스 51bf5d3」 */
  function statusLine(part: Part, stamp: Stamp | undefined): string {
    if (stamp === undefined) return `${t('install.none', undefined, '안 깔림')} · ${part.weight}`;
    const source = stamp.source === null ? '' : ` · ${t('install.src', undefined, '소스')} ${stamp.source}`;
    return `${t('install.done', undefined, '깔림')} · ${asMb(stamp.bytes)} · ${formatTime(stamp.builtAt)} ${t('install.built', undefined, '구움')}${source}`;
  }

  async function readStamps(): Promise<Stamps> {
    try {
      const text = (await invoke('repofile_read', { relPath: STAMP_PATH })) as string;
      return JSON.parse(text) as Stamps;
    } catch {
      // 아직 아무것도 안 깔았으면 파일 자체가 없다 — 사고가 아니다.
      return {};
    }
  }

  async function readCatalog(): Promise<Part[]> {
    const res = await fetch(CATALOG_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { parts?: Part[] };
    return j.parts ?? [];
  }

  function build(container: HTMLElement): void {
    injectStyle();
    const root = document.createElement('div');
    root.className = 'install-root';

    const intro = document.createElement('p');
    intro.className = 'install-intro';
    intro.textContent = t(
      'install.intro',
      undefined,
      'KarmoLab 에 붙는 부품. 굽는 것은 이 컴퓨터에서 도는 일이라 데스크톱 앱에서만 보인다.'
    );
    root.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'install-list';
    root.appendChild(list);
    container.appendChild(root);

    if (!isDesktop()) {
      list.innerHTML = `<p class="install-empty">${esc(t('install.web', undefined, '데스크톱 앱에서 열어야 깔 수 있다.'))}</p>`;
      return;
    }
    void render(list);
  }

  async function render(list: HTMLElement): Promise<void> {
    list.textContent = t('install.loading', undefined, '읽는 중…');

    const root = await currentWorkFolder();
    if (root === null) {
      list.innerHTML =
        `<p class="install-empty">${esc(t('install.noroot', undefined, '작업 폴더가 아직 안 잡혀 있다 — 그게 없으면 굽지 못한다.'))}</p>` +
        `<p class="install-empty">${esc(t('install.noroot.how', undefined, '「환경 설정 › 이 컴퓨터 › 작업 폴더」에서 소스를 받아 둔 곳을 골라라. 한 번만 하면 된다.'))}</p>`;
      return;
    }

    let parts: Part[];
    try {
      parts = await readCatalog();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      list.innerHTML = `<p class="install-empty">${esc(`부품 목록을 못 읽었다 (${why})`)}</p>`;
      return;
    }
    const stamps = await readStamps();

    list.textContent = '';
    for (const part of parts) list.appendChild(makeRow(part, stamps[part.id]));
  }

  function makeRow(part: Part, stamp: Stamp | undefined): HTMLElement {
    const row = document.createElement('section');
    row.className = 'install-row';
    row.dataset.part = part.id;

    const installed = stamp !== undefined;
    const label = installed ? t('install.again', undefined, '다시 굽기') : t('install.do', undefined, '설치');

    row.innerHTML =
      '<div class="install-head">' +
      `<span class="install-dot${installed ? ' on' : ''}" aria-hidden="true"></span>` +
      `<b class="install-name">${esc(part.name)}</b>` +
      `<button type="button" class="install-go">${esc(label)}</button>` +
      '</div>' +
      `<p class="install-desc">${esc(part.desc)}</p>` +
      `<p class="install-state">${esc(statusLine(part, stamp))}</p>` +
      '<pre class="install-log" hidden></pre>';

    const ui: RowUi = {
      button: row.querySelector('.install-go') as HTMLButtonElement,
      log: row.querySelector('.install-log') as HTMLPreElement,
      state: row.querySelector('.install-state') as HTMLElement,
      dot: row.querySelector('.install-dot') as HTMLElement,
    };
    ui.button.addEventListener('click', () => {
      void runInstall(part, ui);
    });
    return row;
  }

  /**
   * 굽는다. 나오는 말은 `localdev-log` 로 흘러온다 — 서버 모니터와 같은 물길이다.
   *
   * 굽는 동안 화면이 아무 말도 안 하면 사람은 「멈췄다」고 읽는다. 그래서 나오는 말을
   * 그대로 흘려보내고, 끝나면 **도장을 다시 읽어** 상태를 갱신한다 — 「끝났다」가 아니라
   * 「깔렸다」를 증거로 말한다.
   */
  async function runInstall(part: Part, ui: RowUi): Promise<void> {
    ui.button.disabled = true;
    ui.button.textContent = t('install.working', undefined, '굽는 중…');
    ui.log.hidden = false;
    ui.log.textContent = '';

    const append = (line: string): void => {
      const joined = `${ui.log.textContent ?? ''}${line}\n`;
      // 몇 분치 컴파일 로그가 화면을 통째로 먹지 않게 꼬리만 남긴다.
      ui.log.textContent = joined.split('\n').slice(-200).join('\n');
      ui.log.scrollTop = ui.log.scrollHeight;
    };

    let unlistenLog: (() => void) | null = null;
    let unlistenDone: (() => void) | null = null;
    const cleanup = (): void => {
      unlistenLog?.();
      unlistenDone?.();
      unlistenLog = null;
      unlistenDone = null;
    };

    const finish = async (): Promise<void> => {
      cleanup();
      const stamp = (await readStamps())[part.id];
      if (stamp === undefined) {
        // 도장이 없다 = 굽기가 끝까지 못 갔다. 초록으로 속이지 않는다.
        ui.state.textContent = t('install.failed', undefined, '못 깔았다 — 위 기록을 봐라');
        ui.button.textContent = t('install.retry', undefined, '다시');
      } else {
        ui.state.textContent = statusLine(part, stamp);
        ui.dot.classList.add('on');
        ui.button.textContent = t('install.again', undefined, '다시 굽기');
      }
      ui.button.disabled = false;
    };

    try {
      unlistenLog = await listen('localdev-log', (e: { payload: unknown }) => {
        const d = e.payload as { profileId?: string; line?: string };
        if (d?.profileId !== part.profile || typeof d.line !== 'string') return;
        append(d.line);
      });
      unlistenDone = await listen('localdev-log-done', (e: { payload: unknown }) => {
        const d = e.payload as { profileId?: string };
        if (d?.profileId !== part.profile) return;
        void finish();
      });

      await invoke('localdev_start', { profileId: part.profile });
      void invoke('localdev_follow_log', { profileId: part.profile }).catch(() => {});
    } catch (e) {
      cleanup();
      append(`못 시작했다: ${e instanceof Error ? e.message : String(e)}`);
      ui.button.disabled = false;
      ui.button.textContent = t('install.retry', undefined, '다시');
    }
  }

  /* 메타는 `widgets-lazy-meta.ts` 한 곳에 산다. */
  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('install'),
    tabs: [
      {
        id: 'install-main',
        label: t('install.tab', undefined, '부품'),
        build,
      },
    ],
  });
})();
