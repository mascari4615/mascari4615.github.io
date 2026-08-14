/**
 * 견주기 — 두 글의 다른 데를 짚는다 (TASK-KL-316 / 1)
 *
 * 붙여넣는 재료 껍데기(`devtool`·`text`) 안의 할 일 한 칸이다. 알맹이는 `core/diff`.
 * 줄로 견주기가 기본이고, JSON 은 **열쇠 경로로** 견준다 — 열쇠 하나를 위로 옮겼을 뿐인데
 * 스무 줄이 빨개지는 화면을 안 만들려고.
 */
import { diffLines, countEdits, toUnified, diffStructure, structureReport, merge3, spec } from '../../core/diff';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

/** zip 안의 한 칸 — 우리가 쓰는 만큼만 적는다 (JSZip 타입을 통째로 들이지 않는다). */
interface ZipEntry {
  dir: boolean;
  async(kind: 'string'): Promise<string>;
  async(kind: 'uint8array'): Promise<Uint8Array>;
}
interface ZipArchive {
  forEach(fn: (path: string, entry: ZipEntry) => void): void;
}

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'diff',
    title: t('widgets.diff.title', undefined, '견주기'),
    category: 'tool',
    desc: t(
      'widgets-desc.diff.desc',
      undefined,
      '두 글·코드의 다른 데를 짚습니다. JSON 은 열쇠 경로로 견주고, 바탕 하나에 고침 둘도 합칩니다'
    ),
    layout: 'wide',
    icon: '<path d="M8 4v11a3 3 0 0 0 3 3h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16 6h4M18 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('diff.tab', undefined, '견주기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('diff').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('diff.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="dfMode">${esc(t('diff.label.mode'))}</label>
        <select id="dfMode" name="mode" aria-label="${esc(t('diff.label.mode'))}">
          <option value="lines">${esc(t('diff.opt.lines'))}</option>
          <option value="structure">${esc(t('diff.opt.structure'))}</option>
          <option value="merge">${esc(t('diff.opt.merge'))}</option>
          <option value="folder">${esc(t('diff.opt.folder'))}</option>
        </select>
      </div>
      <div class="tool-grid-2" id="dfZipBox" style="display:none;">
        <div>
          <div class="tool-sublabel">${esc(t('diff.label.zipA'))}</div>
          <input type="file" id="dfZipA" name="zipA" accept=".zip" aria-label="${esc(t('diff.label.zipA'))}">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('diff.label.zipB'))}</div>
          <input type="file" id="dfZipB" name="zipB" accept=".zip" aria-label="${esc(t('diff.label.zipB'))}">
        </div>
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel" id="dfLabelA">${esc(t('diff.label.a'))}</div>
          <textarea id="dfA" name="a" aria-label="${esc(t('diff.label.a'))}" class="mono-input" style="min-height:200px;"></textarea>
        </div>
        <div>
          <div class="tool-sublabel" id="dfLabelB">${esc(t('diff.label.b'))}</div>
          <textarea id="dfB" name="b" aria-label="${esc(t('diff.label.b'))}" class="mono-input" style="min-height:200px;"></textarea>
        </div>
      </div>
      <div class="field-group" id="dfBaseBox" style="display:none;">
        <div class="tool-sublabel">${esc(t('diff.label.base'))}</div>
        <textarea id="dfBase" name="base" aria-label="${esc(t('diff.label.base'))}" class="mono-input" style="min-height:120px;"></textarea>
      </div>
      <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap;" id="dfOpts">
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="dfWs" name="ignoreWs" style="width:auto;"> ${esc(t('diff.opt.ws'))}
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="dfCase" name="ignoreCase" style="width:auto;"> ${esc(t('diff.opt.case'))}
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="dfOnly" name="onlyChanged" style="width:auto;" checked> ${esc(t('diff.opt.only'))}
        </label>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
        <button class="btn btn-primary" id="dfRun">${esc(t('diff.btn.run'))}</button>
        <button class="btn btn-ghost" id="dfSwap">${esc(t('diff.btn.swap'))}</button>
        <button class="btn btn-ghost" id="dfCopy">${esc(t('diff.btn.copy'))}</button>
      </div>
      <div id="dfOut" class="mono-input" style="min-height:200px; overflow:auto; white-space:pre; padding:10px;"></div>
      <div class="tool-status" id="dfStatus">${esc(t('diff.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const mode = $<HTMLSelectElement>('#dfMode');
    const aBox = $<HTMLTextAreaElement>('#dfA');
    const bBox = $<HTMLTextAreaElement>('#dfB');
    const baseBox = $<HTMLTextAreaElement>('#dfBase');
    const out = $<HTMLElement>('#dfOut');
    const status = $<HTMLElement>('#dfStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291) — 표시가 없으면 화면낭독기가 아무 말도 안 한다. */
    markLive(status);

    let lastText = '';

    function row(kind: string, sign: string, line: string, aNo: string, bNo: string): string {
      const color =
        kind === 'add' ? 'var(--accent-success, #2e7d32)' : kind === 'del' ? 'var(--accent-danger, #c62828)' : 'inherit';
      const bg = kind === 'add' ? 'rgba(46,125,50,.10)' : kind === 'del' ? 'rgba(198,40,40,.10)' : 'transparent';
      return (
        `<div style="display:flex; gap:8px; background:${bg}; color:${color};">` +
        `<span style="min-width:3.2em; text-align:right; opacity:.45;">${esc(aNo)}</span>` +
        `<span style="min-width:3.2em; text-align:right; opacity:.45;">${esc(bNo)}</span>` +
        `<span style="flex:1;">${esc(sign + line)}</span>` +
        `</div>`
      );
    }

    /**
     * 폴더 두 개를 견준다 — 브라우저는 폴더를 못 받으니 **zip 두 개**로 받는다 (TASK-KL-316).
     * 파일 하나하나를 열어 줄로 견주고, 「몇 줄 늘고 줄었나」만 한 줄로 적는다.
     * 글이 아닌 파일(그림·바이너리)은 크기로만 같고 다름을 가린다 — 열어 봐야 소용이 없다.
     */
    async function renderFolder(): Promise<void> {
      const fa = $<HTMLInputElement>('#dfZipA').files?.[0];
      const fb = $<HTMLInputElement>('#dfZipB').files?.[0];
      if (fa === undefined || fb === undefined) {
        status.textContent = t('diff.status.needZip');
        return;
      }
      status.textContent = t('diff.status.zipReading');
      await Toolbox.ensureScript?.('vendor/jszip.min');
      const zipLib = (window as unknown as { JSZip?: { loadAsync: (f: Blob) => Promise<ZipArchive> } }).JSZip;
      if (zipLib === undefined) {
        status.textContent = t('diff.status.zipLibFail');
        return;
      }
      const [za, zb] = await Promise.all([zipLib.loadAsync(fa), zipLib.loadAsync(fb)]);
      const readAll = async (zip: ZipArchive): Promise<Map<string, ZipEntry>> => {
        const map = new Map<string, ZipEntry>();
        zip.forEach((path, entry) => {
          if (!entry.dir) map.set(path, entry);
        });
        return map;
      };
      const [ea, eb] = await Promise.all([readAll(za), readAll(zb)]);
      const names = [...new Set([...ea.keys(), ...eb.keys()])].sort();
      const isText = (name: string): boolean => /\.(txt|md|json|ya?ml|toml|ini|csv|tsv|html?|css|scss|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|cs|c|h|cpp|sh|xml|svg|sql|env|gitignore|properties)$/i.test(name);
      const rows: string[] = [];
      let added = 0;
      let removed = 0;
      let changed = 0;
      for (const name of names) {
        const inA = ea.get(name);
        const inB = eb.get(name);
        if (inA === undefined) {
          added++;
          rows.push('+ ' + name);
          continue;
        }
        if (inB === undefined) {
          removed++;
          rows.push('- ' + name);
          continue;
        }
        if (!isText(name)) {
          const [ba, bb] = await Promise.all([inA.async('uint8array'), inB.async('uint8array')]);
          if (ba.length !== bb.length) {
            changed++;
            rows.push('* ' + name + ' (' + ba.length + ' → ' + bb.length + ' B)');
          }
          continue;
        }
        const [ta, tb] = await Promise.all([inA.async('string'), inB.async('string')]);
        if (ta === tb) continue;
        const stat = countEdits(diffLines(ta, tb));
        changed++;
        rows.push('* ' + name + '  +' + stat.added + ' -' + stat.removed);
      }
      lastText = rows.join('\n');
      out.textContent = lastText === '' ? '' : lastText;
      status.textContent =
        rows.length === 0
          ? t('diff.status.same')
          : t('diff.status.folder', { add: added, del: removed, mod: changed, all: names.length });
    }

    function render(): void {
      const a = aBox.value;
      const b = bBox.value;
      const kind = mode.value;

      if (kind === 'folder') {
        void renderFolder();
        return;
      }

      if (kind === 'structure') {
        let pa: unknown;
        let pb: unknown;
        try {
          pa = JSON.parse(a === '' ? 'null' : a);
          pb = JSON.parse(b === '' ? 'null' : b);
        } catch (e) {
          out.textContent = '';
          status.textContent = t('diff.status.badJson', { msg: String((e as Error).message) });
          lastText = '';
          return;
        }
        const changes = diffStructure(pa, pb);
        lastText = structureReport(changes);
        out.textContent = lastText;
        status.textContent =
          changes.length === 0 ? t('diff.status.same') : t('diff.status.changes', { n: changes.length });
        return;
      }

      if (kind === 'merge') {
        const merged = merge3(baseBox.value, a, b);
        lastText = merged.text;
        out.textContent = merged.text;
        status.textContent =
          merged.conflicts === 0 ? t('diff.status.merged') : t('diff.status.conflicts', { n: merged.conflicts });
        return;
      }

      const edits = diffLines(a, b, {
        ignoreWs: $<HTMLInputElement>('#dfWs').checked,
        ignoreCase: $<HTMLInputElement>('#dfCase').checked
      });
      const stat = countEdits(edits);
      lastText = toUnified(edits);
      const onlyChanged = $<HTMLInputElement>('#dfOnly').checked;
      const rows: string[] = [];
      let skipped = 0;
      edits.forEach((e, i) => {
        if (onlyChanged && e.kind === 'same') {
          const near = edits.slice(Math.max(0, i - 3), i + 4).some((x) => x.kind !== 'same');
          if (!near) {
            skipped++;
            return;
          }
        }
        if (skipped > 0) {
          rows.push(row('same', '', t('diff.skipped', { n: skipped }), '', ''));
          skipped = 0;
        }
        const sign = e.kind === 'add' ? '+ ' : e.kind === 'del' ? '- ' : '  ';
        rows.push(
          row(e.kind, sign, e.text, e.aLine === undefined ? '' : String(e.aLine), e.bLine === undefined ? '' : String(e.bLine))
        );
      });
      out.innerHTML = rows.join('');
      status.textContent =
        stat.added === 0 && stat.removed === 0
          ? t('diff.status.same')
          : t('diff.status.stat', { add: stat.added, del: stat.removed });
    }

    function syncMode(): void {
      const merging = mode.value === 'merge';
      const folder = mode.value === 'folder';
      $<HTMLElement>('#dfBaseBox').style.display = merging ? '' : 'none';
      $<HTMLElement>('#dfZipBox').style.display = folder ? '' : 'none';
      container.querySelectorAll<HTMLElement>('.tool-grid-2')[1].style.display = folder ? 'none' : '';
      $<HTMLElement>('#dfOpts').style.display = mode.value === 'lines' ? '' : 'none';
      $<HTMLElement>('#dfLabelA').textContent = merging ? t('diff.label.mine') : t('diff.label.a');
      $<HTMLElement>('#dfLabelB').textContent = merging ? t('diff.label.theirs') : t('diff.label.b');
      render();
    }

    [aBox, bBox, baseBox].forEach((el) => el.addEventListener('input', render));
    [$<HTMLInputElement>('#dfZipA'), $<HTMLInputElement>('#dfZipB')].forEach((el) => el.addEventListener('change', render));
    container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));
    mode.addEventListener('change', syncMode);
    $<HTMLButtonElement>('#dfRun').onclick = render;
    $<HTMLButtonElement>('#dfSwap').onclick = (): void => {
      const keep = aBox.value;
      aBox.value = bBox.value;
      bBox.value = keep;
      render();
    };
    $<HTMLButtonElement>('#dfCopy').onclick = async (): Promise<void> => {
      if (lastText === '') return;
      await Toolbox.copyText?.(lastText, { message: t('diff.copy.done') });
    };

    // 주소로 부른 경우 (`?op=text&a=...&b=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.a !== undefined) aBox.value = String(call.args.a);
      if (call.args.b !== undefined) bBox.value = String(call.args.b);
      if (call.args.base !== undefined) baseBox.value = String(call.args.base);
      if (call.op === 'structure') mode.value = 'structure';
      if (call.op === 'merge') mode.value = 'merge';
    }

    syncMode();
  }
})();
