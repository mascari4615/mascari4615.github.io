/**
 * 설치. KarmoLab 에 붙는 부품을 여기서 깐다 (TASK-KL-330).
 *
 * 왜 있나: 켜면 있다가 성립하려면 누군가는 굽는 단계를 맡아야 한다. 여태 그 단계가
 * 어디에도 없어서 동반자 창은 **어느 컴퓨터에서도 존재한 적이 없었다**. 안내문에 적힌
 * 명령을 그대로 쳐도 안 됐다(워크스페이스 멤버 누락, 2026-08-19). 사람이 외워야 도는
 * 것은 없는 것과 같으므로, 외울 자리를 화면으로 만든다.
 *
 * 새 Rust 커맨드는 하나도 안 쓴다:
 * - 굽기 = `localdev_start` (서버 모니터가 쓰는 그 길). `npm` 만 허용되므로(program_allowed)
 *   cargo 는 `build:*` npm script 뒤에 숨는다.
 * - 깔렸나 = `repofile_read('apps/karmolab-tauri/target/install.json')`. 굽기가 성공할
 *   때만 찍히는 도장이라, 반쯤 구워진 것을 깔렸다고 하지 않는다.
 */
import { isDesktop, invoke, listen } from '../tauri-bridge';
import { t } from '../lib/i18n';
import { currentWorkFolder, guessWorkFolder, pickWorkFolder, savedWorkFolder, setWorkFolder } from '../lib/work-folder';

(function (): void {
  'use strict';

  const CATALOG_PATH = '/apps/karmolab/data/install-catalog.json';
  const STAMP_PATH = 'apps/karmolab-tauri/target/install.json';

  /**
   * 부품 하나. 깔리는 길이 둘이다 (TASK-KAR-227):
   *
   * - `build`. **소스에서 굽는다.** 작업 폴더가 있어야 한다. 개발자의 길
   * - `download`. **릴리스에서 받는다.** 작업 폴더도 소스도 필요 없다. 프로그램만
   *   쓰는 사람의 길이고, 이 갈래가 생기기 전까지 그 사람은 아예 못 깔았다
   */
  type Part = {
    id: string;
    how?: 'build' | 'download';
    name: string;
    desc: string;
    profile?: string;
    artifact: string;
    weight: string;
  };

  const howOf = (part: Part): 'build' | 'download' => part.how ?? 'build';
  type Stamp = { builtAt: string; bytes: number; source: string | null };
  type Stamps = Record<string, Stamp>;
  type RowUi = { button: HTMLButtonElement; log: HTMLPreElement; state: HTMLElement; dot: HTMLElement };

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 스타일을 여기 두는 이유: 이 앱의 위젯 클래스는 css 파일에 없다(서버 모니터의
     `sm-*` 도 마찬가지다. 전부 붙는 자리가 없는 이름이다). css 파일에 적으면 purge 가
     안 쓰는 이름으로 보고 지울 수도 있다. 위젯이 제 스타일을 들고 다니면 그 둘이 다
     사라진다. 색은 셸의 변수를 빌려 쓴다. 밝기 테마를 따라간다. */
  const STYLE = `
.install-intro { color: var(--text-secondary); font-size: .92rem; margin: 0 0 1rem; }
.install-row { border: 1px solid var(--border); border-radius: var(--radius-xl); padding: .9rem 1rem; margin-bottom: .7rem; }
.install-head { display: flex; align-items: center; gap: .55rem; }
.install-name { font-size: 1.02rem; }
.install-go { margin-left: auto; padding: .35rem .9rem; border-radius: var(--radius-lg); cursor: pointer;
  border: 1px solid var(--border); background: var(--bg-tertiary); color: inherit; }
.install-go:hover:not(:disabled) { border-color: var(--accent); }
.install-go:disabled { opacity: .55; cursor: default; }
.install-dot { width: .62rem; height: .62rem; border-radius: 50%; flex: none;
  background: transparent; border: 1.5px solid var(--text-secondary); }
.install-dot.on { background: var(--accent); border-color: var(--accent); }
.install-desc { margin: .5rem 0 .3rem; font-size: .9rem; }
.install-state { margin: 0; font-size: .84rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.install-log { margin: .7rem 0 0; max-height: 15rem; overflow: auto; white-space: pre-wrap;
  font-size: .78rem; line-height: 1.45; padding: .6rem .7rem; border-radius: var(--radius-lg);
  background: var(--bg-void); color: var(--text-secondary); }
.install-empty { color: var(--text-secondary); }

/* 손 못 대는 줄. 감추지 않는다. 흐리게 두되 무엇이 있는지는 그대로 읽힌다. */
.install-row--locked { opacity: .55; }
.install-row--locked .install-go { cursor: not-allowed; }
.install-needroot { border: 1px solid var(--accent); border-radius: var(--radius-xl); padding: .8rem 1rem; margin-bottom: .9rem; }
.install-needroot-why { margin: 0 0 .6rem; font-size: .92rem; }
.install-needroot-row { display: flex; gap: .5rem; flex-wrap: wrap; }
.install-folder { flex: 1 1 22rem; min-width: 12rem; padding: .35rem .6rem; border-radius: var(--radius-lg);
  border: 1px solid var(--border); background: var(--bg-void); color: inherit; font-size: .85rem; }
.install-pick, .install-save { padding: .35rem .9rem; border-radius: var(--radius-lg); cursor: pointer;
  border: 1px solid var(--border); background: var(--bg-tertiary); color: inherit; }
.install-pick:hover, .install-save:hover { border-color: var(--accent); }
.install-needroot-note { margin: .55rem 0 0; font-size: .82rem; color: var(--text-secondary); }
`;

  function injectStyle(): void {
    if (document.getElementById('install-style') !== null) return;
    const el = document.createElement('style');
    el.id = 'install-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  /** 2026-08-19 19:27. 도는 컴퓨터의 시간대로 읽는다. */
  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const asMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  /** 깔림, 22.0MB, 2026-08-19 19:27 구움, 소스 51bf5d3 */
  function statusLine(part: Part, stamp: Stamp | undefined, ready = true): string {
    // 안 본 것을 없다고 말하지 않는다. 폴더를 모르면 도장을 못 읽은 것뿐이다.
    if (stamp === undefined) {
      const head = ready ? t('install.none', undefined, '안 깔림') : t('install.unknown', undefined, '상태 모름');
      return `${head}, ${part.weight}`;
    }
    const source = stamp.source === null ? '' : `, ${t('install.src', undefined, '소스')} ${stamp.source}`;
    return `${t('install.done', undefined, '깔림')}, ${asMb(stamp.bytes)}, ${formatTime(stamp.builtAt)} ${t('install.built', undefined, '구움')}${source}`;
  }

  async function readStamps(): Promise<Stamps> {
    try {
      const text = (await invoke('repofile_read', { relPath: STAMP_PATH })) as string;
      return JSON.parse(text) as Stamps;
    } catch {
      // 아직 아무것도 안 깔았으면 파일 자체가 없다. 사고가 아니다.
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

  /**
   * 작업 폴더가 없을 때 **목록을 감추지 않는다** (조수님 결정 2026-08-19, TASK-KL-329).
   *
   * 처음엔 안내문만 띄우고 목록을 통째로 감췄다. 그건 여기 뭐가 있는지조차 안 보여
   * 주면서 딴 도구로 가라는 것이라, 사람이 무엇을 얻게 되는지 모른 채 심부름만 한다.
   * 목록은 그대로 두고 **손만 못 대게** 한다. 무엇이 있는지 보이고, 왜 지금 못 누르는지
   * 보이고, 고치는 자리가 바로 그 위에 있다.
   */
  function makeFolderBar(list: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'install-needroot';
    bar.innerHTML =
      `<p class="install-needroot-why">${esc(t('install.noroot', undefined, '작업 폴더가 아직 없다. 정하면 바로 깔 수 있다.'))}</p>` +
      '<div class="install-needroot-row">' +
      '<input type="text" class="install-folder" placeholder="C:\\...\\Mascari4615.github.io" />' +
      `<button type="button" class="install-pick">${esc(t('install.pick', undefined, '찾아보기'))}</button>` +
      `<button type="button" class="install-save">${esc(t('install.save', undefined, '저장'))}</button>` +
      '</div>' +
      `<p class="install-needroot-note">${esc(t('install.noroot.how', undefined, '소스를 받아 둔 곳. 환경 설정 › 이 컴퓨터 에서도 같은 값을 고친다.'))}</p>`;

    const input = bar.querySelector('.install-folder') as HTMLInputElement;
    const note = bar.querySelector('.install-needroot-note') as HTMLElement;
    input.value = savedWorkFolder();

    /* 빈 칸이면 기계가 짐작한 값을 채운다. 물어볼 필요 없는 것을 묻지 않는다.
       채우기만 하고 정하지는 않는다: 짐작이 맞는지는 사람이 보고 누른다. */
    if (!input.value) {
      void guessWorkFolder().then((guess) => {
        if (guess && !input.value) {
          input.value = guess;
          note.textContent = t('install.guessed', undefined, '이 자리로 짐작했다. 맞으면 저장을 눌러라.');
        }
      });
    }

    (bar.querySelector('.install-pick') as HTMLButtonElement).addEventListener('click', () => {
      void pickWorkFolder().then((picked) => {
        if (picked) input.value = picked;
        else note.textContent = t('install.nopick', undefined, '폴더 고르기 창을 못 열었다. 경로를 손으로 적어라.');
      });
    });
    (bar.querySelector('.install-save') as HTMLButtonElement).addEventListener('click', () => {
      note.textContent = t('install.saving', undefined, '확인하는 중...');
      void setWorkFolder(input.value).then((r) => {
        // 되면 그 자리에서 다시 그린다. 새로고침을 시키지 않는다.
        if (r.ok) void render(list);
        else note.textContent = `${t('install.badfolder', undefined, '이 폴더는 아니다')}: ${r.why}`;
      });
    });
    return bar;
  }

  async function render(list: HTMLElement): Promise<void> {
    list.textContent = t('install.loading', undefined, '읽는 중...');

    const root = await currentWorkFolder();

    let parts: Part[];
    try {
      parts = await readCatalog();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      list.innerHTML = `<p class="install-empty">${esc(`부품 목록을 못 읽었다 (${why})`)}</p>`;
      return;
    }
    /* 폴더를 모르면 도장도 못 읽는다(같은 자리를 딛는다). 그때는 안 깔림이라 하지
       않고 **모른다**고 한다. 안 본 것을 없다고 말하지 않는다. */
    const stamps = root === null ? null : await readStamps();

    /* 받아서 까는 부품은 **작업 폴더와 무관하다**. 그게 이 갈래의 존재 이유다.
       폴더가 없다고 그 줄까지 잠그면 소스 없는 사람은 아무것도 못 깐다가 그대로 남는다. */
    const fetched = await Promise.all(
      parts.map(async (p) => (howOf(p) === 'download' ? await fetchedPath(p.id) : null)),
    );

    // 굽는 부품이 하나라도 있고 폴더가 없을 때만 그 칸을 띄운다.
    const needFolder = root === null && parts.some((p) => howOf(p) === 'build');

    list.textContent = '';
    if (needFolder) list.appendChild(makeFolderBar(list));
    parts.forEach((part, i) => {
      const ready = howOf(part) === 'download' ? true : root !== null;
      list.appendChild(makeRow(part, stamps?.[part.id], ready, fetched[i]));
    });
  }

  /** 받아 둔 자리. 없으면 null. 안 깔림과 못 봤다를 가른다. */
  async function fetchedPath(id: string): Promise<string | null> {
    try {
      return ((await invoke('part_fetched_path', { part: id })) as string | null) ?? null;
    } catch {
      // 옛 판 앱에는 이 커맨드가 없다. 그건 안 깔림이지 고장이 아니다.
      return null;
    }
  }

  function makeRow(part: Part, stamp: Stamp | undefined, ready: boolean, fetched: string | null = null): HTMLElement {
    const row = document.createElement('section');
    row.className = ready ? 'install-row' : 'install-row install-row--locked';
    row.dataset.part = part.id;

    const download = howOf(part) === 'download';
    const installed = download ? fetched !== null : stamp !== undefined;
    const label = download
      ? installed
        ? t('install.refetch', undefined, '다시 받기')
        : t('install.get', undefined, '받아서 설치')
      : installed
        ? t('install.again', undefined, '다시 굽기')
        : t('install.do', undefined, '설치');

    row.innerHTML =
      '<div class="install-head">' +
      `<span class="install-dot${installed ? ' on' : ''}" aria-hidden="true"></span>` +
      `<b class="install-name">${esc(part.name)}</b>` +
      `<button type="button" class="install-go">${esc(label)}</button>` +
      '</div>' +
      `<p class="install-desc">${esc(part.desc)}</p>` +
      `<p class="install-state">${esc(
        download
          ? installed
            ? `${t('install.done', undefined, '깔림')}, ${t('install.fetched', undefined, '받아서 깔았다')}`
            : `${t('install.none', undefined, '안 깔림')}, ${part.weight}`
          : statusLine(part, stamp, ready),
      )}</p>` +
      '<pre class="install-log" hidden></pre>';

    const ui: RowUi = {
      button: row.querySelector('.install-go') as HTMLButtonElement,
      log: row.querySelector('.install-log') as HTMLPreElement,
      state: row.querySelector('.install-state') as HTMLElement,
      dot: row.querySelector('.install-dot') as HTMLElement,
    };

    /* 작업 폴더가 없으면 **손만 못 대게** 한다. 줄은 그대로 보인다.
       왜 못 누르는지는 단추에 달아 둔다(마우스를 올리면 뜬다). 눌러도 아무 일 없다가
       제일 나쁜 꼴이라, 눌리지 않는 것과 이유를 같이 준다. */
    if (!ready) {
      ui.button.disabled = true;
      ui.button.title = t('install.locked.why', undefined, '작업 폴더를 먼저 정해라. 위 칸에서 고르면 바로 풀린다.');
      return row;
    }

    ui.button.addEventListener('click', () => {
      if (download) void runFetch(part, ui);
      else void runInstall(part, ui);
    });
    return row;
  }

  /**
   * **받아서 깐다**. 릴리스에서 꾸러미를 내려 앱 데이터 폴더에 푼다 (TASK-KAR-227).
   *
   * 굽기와 달리 작업 폴더도 소스도 필요 없다. 그래서 이 갈래가 프로그램만 쓰는 사람이
   * 처음으로 동반자를 갖는 길이다.
   */
  async function runFetch(part: Part, ui: RowUi): Promise<void> {
    ui.button.disabled = true;
    ui.button.textContent = t('install.getting', undefined, '받는 중...');
    ui.log.hidden = false;
    ui.log.textContent = t('install.getting.note', undefined, '릴리스에서 받아 푼다. 잠깐 걸린다.');

    try {
      const got = (await invoke('part_fetch', { part: part.id })) as { path: string; asset: string; bytes: number };
      ui.log.textContent = `${got.asset}, ${asMb(got.bytes)}${String.fromCharCode(10)}${got.path}`;
      ui.state.textContent = `${t('install.done', undefined, '깔림')}, ${asMb(got.bytes)}`;
      ui.dot.classList.add('on');
      ui.button.textContent = t('install.refetch', undefined, '다시 받기');
    } catch (e) {
      // 아직 릴리스에 없다와 받다 끊겼다는 다른 일이다. Rust 가 적어 준 말을 그대로 보인다.
      ui.log.textContent = e instanceof Error ? e.message : String(e);
      ui.state.textContent = t('install.failed', undefined, '못 깔았다. 위 기록을 봐라');
      ui.button.textContent = t('install.retry', undefined, '다시');
    }
    ui.button.disabled = false;
  }

  /**
   * 굽는다. 나오는 말은 `localdev-log` 로 흘러온다. 서버 모니터와 같은 물길이다.
   *
   * 굽는 동안 화면이 아무 말도 안 하면 사람은 멈췄다고 읽는다. 그래서 나오는 말을
   * 그대로 흘려보내고, 끝나면 **도장을 다시 읽어** 상태를 갱신한다. 끝났다가 아니라
   * 깔렸다를 증거로 말한다.
   */
  async function runInstall(part: Part, ui: RowUi): Promise<void> {
    ui.button.disabled = true;
    ui.button.textContent = t('install.working', undefined, '굽는 중...');
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
        ui.state.textContent = t('install.failed', undefined, '못 깔았다. 위 기록을 봐라');
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
