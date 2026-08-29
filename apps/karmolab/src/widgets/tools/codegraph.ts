/**
 * 파일 사이 부름 지도 (TASK-KL-316 / 20)
 *
 * zip 을 받아 누가 누구를 부르나를 그린다. 파일을 받는 도구라 **새 위젯**이다
 * (로그 보기, 번들 지도와 같은 이유).
 *
 * 그림은 `core/mermaidlite` 가 그린다. 그리기 엔진은 저장소에 하나면 된다.
 * 셈은 `core/codegraph`. 여기 있는 건 zip 을 여는 일과 말투뿐이다.
 */
import { build, cycles, ranks, toMermaid, unreferenced, type Graph } from '../../core/codegraph';
import { escapeHtml as esc } from './shared/text';
import { parse as parseMermaid, toSvg } from '../../core/mermaidlite';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

/** zip 안의 한 칸. 우리가 쓰는 만큼만 (JSZip 타입을 통째로 안 들인다). */
interface ZipEntry {
  dir: boolean;
  async(kind: 'string'): Promise<string>;
}
interface ZipArchive {
  forEach(fn: (path: string, entry: ZipEntry) => void): void;
}

(function (): void {

  const CODE = /\.(m?[jt]sx?|css|scss|vue|svelte)$/i;
  const SKIP = /(^|\/)(node_modules|dist|build|\.git|coverage)\//i;
  const MAX_FILES = 4000;

  Toolbox.register({
    id: 'codegraph',
    title: t('widgets.codegraph.title', undefined, '부름 지도'),
    category: 'tool',
    desc: t(
      'widgets-desc.codegraph.desc',
      undefined,
      'zip 을 넣으면 파일이 서로 무엇을 부르는지 그리고, 고리, 많이 불리는 파일, 아무도 안 부르는 파일을 짚습니다'
    ),
    layout: 'wide',
    icon: '<circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="7" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.2 7.2l7.2 .6M7 8.3l4 7.4M16.6 9.3l-3.4 6.5" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      {
        id: 'app',
        label: t('codegraph.tab', undefined, '부름'),
        build: function (container: HTMLElement): void {
          void loadNamespace('codegraph').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('codegraph.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="cgFile">${esc(t('codegraph.label.file'))}</label>
        <input type="file" id="cgFile" name="zip" accept=".zip" aria-label="${esc(t('codegraph.label.file'))}">
        <p style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-top:6px;">${esc(t('codegraph.note.skip'))}</p>
      </div>
      <div id="cgPic" style="overflow:auto; margin-bottom:10px;"></div>
      <div class="tool-sublabel">${esc(t('codegraph.label.cycles'))}</div>
      <div id="cgCycles" class="tool-list"></div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('codegraph.label.hubs'))}</div>
          <div id="cgHubs" class="tool-list"></div>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('codegraph.label.orphans'))}</div>
          <div id="cgOrphans" class="tool-list"></div>
        </div>
      </div>
      <div class="tool-status" id="cgStatus">${esc(t('codegraph.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#cgStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    function paint(graph: Graph): void {
      const loops = cycles(graph);
      $<HTMLElement>('#cgCycles').innerHTML =
        loops.length === 0
          ? '<div class="tool-list-row"><span class="tool-list-val">' + esc(t('codegraph.cycles.none')) + '</span></div>'
          : loops
              .slice(0, 12)
              .map(
                (loop) =>
                  '<div class="tool-list-row"><span class="tool-list-key" style="color:var(--error)">' + loop.length + '</span>' +
                  '<span class="mono tool-list-val">' + esc(loop.join('  →  ')) + '</span></div>'
              )
              .join('');

      $<HTMLElement>('#cgHubs').innerHTML = ranks(graph)
        .slice(0, 12)
        .map(
          (r) =>
            '<div class="tool-list-row"><span class="tool-list-key">' + r.imported + '</span>' +
            '<span class="mono tool-list-val">' + esc(r.file) + '</span>' +
            '<span class="tool-list-dim">→ ' + r.imports + '</span></div>'
        )
        .join('');

      const orphans = unreferenced(graph);
      $<HTMLElement>('#cgOrphans').innerHTML = orphans
        .slice(0, 12)
        .map((f) => '<div class="tool-list-row"><span class="mono tool-list-val">' + esc(f) + '</span></div>')
        .join('');

      try {
        $<HTMLElement>('#cgPic').innerHTML = toSvg(parseMermaid(toMermaid(graph, 40)), {
          dark: matchMedia('(prefers-color-scheme: dark)').matches
        });
      } catch {
        $<HTMLElement>('#cgPic').innerHTML = '';
      }

      status.textContent = t('codegraph.status.ok', {
        files: graph.files.length,
        edges: graph.edges.length,
        cycles: loops.length,
        orphans: orphans.length
      });
    }

    $<HTMLInputElement>('#cgFile').addEventListener('change', async (): Promise<void> => {
      const file = $<HTMLInputElement>('#cgFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('codegraph.status.reading');
      try {
        await Toolbox.ensureScript?.('vendor/jszip.min');
        const zipLib = (window as unknown as { JSZip?: { loadAsync: (f: Blob) => Promise<ZipArchive> } }).JSZip;
        if (zipLib === undefined) throw new Error(t('codegraph.err.zip'));
        const zip = await zipLib.loadAsync(file);
        const entries: Array<[string, ZipEntry]> = [];
        zip.forEach((path, entry) => {
          if (entry.dir || !CODE.test(path) || SKIP.test(path)) return;
          entries.push([path, entry]);
        });
        if (entries.length === 0) {
          status.textContent = t('codegraph.status.noCode');
          return;
        }
        const capped = entries.slice(0, MAX_FILES);
        const files: Record<string, string> = {};
        for (const [path, entry] of capped) files[path] = await entry.async('string');
        paint(build(files));
        if (entries.length> capped.length) {
          status.textContent = t('codegraph.status.capped', { shown: capped.length, all: entries.length });
        }
      } catch (e) {
        status.textContent = t('codegraph.status.bad', { msg: String((e as Error).message) });
      }
    });
  }
})();
