/**
 * **재료 먼저** 껍데기 (TASK-KL-261) — PDF·이미지·영상·소리·글이 같은 화면을 쓴다.
 *
 * [[TASK-KL-259]] 에서 PDF 화면을 「할 일 탭 열한 개」에서 「파일 먼저, 할 일은 그다음」으로
 * 뒤집었고 [[TASK-KL-260]] 에서 쪽 격자와 결과 이어받기를 얹었다. 그 결과가 좋았는데,
 * **이미지도 영상도 소리도 똑같은 화면이 필요하다**. 재료마다 한 벌씩 다시 쓰면 다섯 벌이
 * 서로 다르게 낡는다 — PDF 에만 「이어받기」가 있고 이미지에는 없는 식으로.
 *
 * 그래서 껍데기를 여기 하나 둔다. 재료마다 다른 것은 셋뿐이다:
 *   ① 무엇을 받나(`accept`) ② 왼쪽 칸에 무엇을 그리나(`preview`) ③ 할 일 목록(`groups`)
 *
 * 도구는 **한 줄도 안 고친다**. 껍데기가 하는 일:
 *   - 파일을 한 자리에 받아 두고 미리보기를 그린다
 *   - 고른 할 일을 `Toolbox.mountTool` 로 그 자리에 그린다
 *   - 그 도구의 파일 칸에 **들고 있던 파일을 넣어 준다**(`DataTransfer`) — 그래서 다시 안 올린다
 *   - 도구가 결과를 내놓으면 그것을 **손에 든 파일로 갈아 끼운다**(iLovePDF Workflows)
 */
import { fileSize } from './media';

export interface MaterialGroup {
  label: string;
  /** [도구 id, 보일 이름] */
  jobs: Array<[string, string]>;
}

export interface MaterialShellOpts {
  /** `<input accept>` — 무엇을 받나 */
  accept: string;
  /** 할 일 — 갈래별로 묶어 격자에 놓는다 */
  groups: () => MaterialGroup[];
  /** 파일을 안 들고 와도 되는 할 일(다른 것에서 이 재료를 **만드는** 쪽) */
  noInputNeeded?: Set<string>;
  /** 이어받을 결과의 형식 — 이 재료로 못 받는 결과는 무시한다 */
  accepts: RegExp;
  drop: { title: string; hint: string };
  labels: { change: string; back: string; chain: string; fail: string };
  /**
   * 왼쪽 칸을 그린다. **이 함수만 재료를 안다.**
   * @param alive 파일이 그새 바뀌었으면 `false` — 옛 그림을 붙이지 않게 매번 확인한다
   * @returns 파일 줄에 쓸 한 마디(「12쪽 · 2.4MB」 · 「1920×1080 · 340KB」)
   */
  preview: (file: File, box: HTMLElement, alive: () => boolean) => Promise<string>;
}

export function materialShell(container: HTMLElement, o: MaterialShellOpts): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  injectStyles();

  container.innerHTML = `
    <div class="pf-head" id="pfHead">
      <div class="pf-drop" id="pfDrop">
        <strong>${esc(o.drop.title)}</strong>
        <span>${esc(o.drop.hint)}</span>
        <input type="file" id="pfFile" accept="${esc(o.accept)}" hidden>
      </div>
      <div class="pf-file" id="pfFileBar" hidden>
        <span class="pf-name" id="pfName"></span>
        <span class="pf-meta" id="pfMeta"></span>
        <button type="button" class="btn" id="pfChange">${esc(o.labels.change)}</button>
      </div>
    </div>

    <div class="pf-body">
      <div class="pf-left">
        <div class="pf-preview" id="pfPreview"></div>
      </div>
      <div class="pf-right">
        <div class="pf-jobs" id="pfJobs">
          ${o
            .groups()
            .map(
              (g) => `
            <div class="pf-group">
              <div class="pf-group-label">${esc(g.label)}</div>
              <div class="pf-grid">
                ${g.jobs
                  .map(
                    ([id, label]) =>
                      `<button type="button" class="pf-job" data-job="${esc(id)}">${esc(label)}</button>`
                  )
                  .join('')}
              </div>
            </div>`
            )
            .join('')}
        </div>
        <div class="pf-mount" id="pfMount" hidden>
          <button type="button" class="pf-back" id="pfBack">← ${esc(o.labels.back)}</button>
          <div class="pf-chain" id="pfChain" hidden>
            <span id="pfChainName"></span>
            <button type="button" class="btn" id="pfChainUse">${esc(o.labels.chain)}</button>
          </div>
          <div id="pfHost"></div>
        </div>
      </div>
    </div>
  `;

  const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
  const fileInput = $<HTMLInputElement>('#pfFile');
  const preview = $<HTMLElement>('#pfPreview');
  const host = $<HTMLElement>('#pfHost');

  let file: File | null = null;
  /** 이 파일을 그리는 중이라는 표 — 파일이 바뀌면 앞의 그리기는 버린다 */
  let token = 0;
  let openJob: string | null = null;

  async function setFile(f: File): Promise<void> {
    file = f;
    $('#pfDrop').hidden = true;
    $('#pfFileBar').hidden = false;
    $('#pfName').textContent = f.name;
    const mine = ++token;
    preview.textContent = '';
    try {
      const meta = await o.preview(f, preview, () => mine === token);
      if (mine !== token) return;
      $('#pfMeta').textContent = meta || fileSize(f.size);
    } catch {
      if (mine !== token) return;
      $('#pfMeta').textContent = fileSize(f.size);
      preview.innerHTML = `<div class="pf-empty">${esc(o.labels.fail)}</div>`;
    }
    /* 열어 둔 할 일이 있으면 **거기에도** 새 파일을 넣어 준다 — 이게 이 화면의 요점이다 */
    if (openJob) handOver();
  }

  fileInput.onchange = (): void => {
    const f = fileInput.files?.[0];
    if (f) void setFile(f);
  };
  $('#pfDrop').onclick = (): void => fileInput.click();
  $('#pfChange').onclick = (): void => fileInput.click();

  const head = $('#pfHead');
  head.addEventListener('dragover', (e) => {
    e.preventDefault();
    head.classList.add('pf-over');
  });
  head.addEventListener('dragleave', () => head.classList.remove('pf-over'));
  head.addEventListener('drop', (e) => {
    e.preventDefault();
    head.classList.remove('pf-over');
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) void setFile(f);
  });

  /**
   * 들고 있는 파일을 **그 도구의 파일 칸에 넣어 준다.**
   *
   * 도구를 고치지 않으려고 이렇게 한다: 도구가 이미 갖고 있는 `input[type=file]` 에 파일을 담고
   * `change` 를 울려 주면, 도구는 사람이 고른 것과 똑같이 받아들인다. 도구마다 「파일 받는 함수」를
   * 새로 노출하게 만들면 재료 다섯 곳에서 도구 예순 개를 고쳐야 한다.
   */
  function handOver(tries = 12): void {
    if (!file) return;
    const input = host.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) {
      /* 아직 안 그려졌다 — 묶음 밖 도구는 스크립트를 **받아 온 다음** 그려진다(KL-261).
       * 한 번 찔러 보고 포기하면 「색 뽑기」 같은 것에 파일이 영영 안 들어간다. */
      if (tries > 0) setTimeout(() => handOver(tries - 1), 120);
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      /* 이 손잡이를 막는 브라우저에서는 사람이 그 도구에서 한 번 더 고르면 된다 */
    }
  }

  function openJobById(id: string): void {
    openJob = id;
    $('#pfJobs').hidden = true;
    $('#pfMount').hidden = false;
    $('#pfChain').hidden = true;
    host.textContent = '';
    const ok = Toolbox.mountTool?.(id, host);
    if (!ok) {
      host.innerHTML = `<div class="tool-status error">${esc(o.labels.fail)}</div>`;
      return;
    }
    /* 도구가 다 그려진 뒤에 넣어야 한다 — 그리는 중에는 파일 칸이 아직 없다 */
    if (!o.noInputNeeded?.has(id)) setTimeout(() => handOver(), 60);
  }

  container.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((b) => {
    b.onclick = (): void => openJobById(b.dataset.job as string);
  });

  function backToJobs(): void {
    openJob = null;
    $('#pfMount').hidden = true;
    $('#pfJobs').hidden = false;
    $('#pfChain').hidden = true;
  }
  $('#pfBack').onclick = backToJobs;

  /* ── 결과 이어받기 (iLovePDF Workflows 의 「한 번 올리면 끝까지」) ─────────
   *
   * 도구가 결과를 낼 때 `offerNext` 를 부르면 `karmolab-result` 가 울리고 결과물이
   * `peekResult()` 에 놓인다. 껍데기는 그것을 **줍기만** 한다 — 새 규약을 만들지 않는다.
   * 자동으로 갈아 끼우지는 않는다: 사람이 결과를 확인하기 전에 원본이 사라지면 안 된다.
   */
  const onResult = (e: Event): void => {
    if (!openJob) return;
    const d = (e as CustomEvent).detail as { type?: string; name?: string } | undefined;
    if (!d || !o.accepts.test(d.type || '')) return;
    $('#pfChain').hidden = false;
    $('#pfChainName').textContent = `「${d.name || ''}」`;
  };
  window.addEventListener('karmolab-result', onResult);
  Toolbox.onDispose?.(() => window.removeEventListener('karmolab-result', onResult));

  $('#pfChainUse').onclick = (): void => {
    const item = Toolbox.peekResult?.();
    if (!item || !item.blob) return;
    void setFile(new File([item.blob], item.name || 'result', { type: item.blob.type }));
    /* 이어서 **다른** 할 일을 고르러 간다 — 방금 한 일을 또 하려고 여기 온 게 아니다 */
    backToJobs();
  };
}

let styled = false;
function injectStyles(): void {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = `
.pf-head{margin-bottom:var(--space-lg);}
.pf-head.pf-over .pf-drop,.pf-head.pf-over .pf-file{outline:2px dashed rgba(128,160,255,.8);outline-offset:3px;}
.pf-drop{display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;
  padding:26px 16px;border:1px dashed rgba(128,128,128,.4);border-radius:12px;cursor:pointer;text-align:center;}
.pf-drop:hover{background:rgba(128,128,128,.06);}
.pf-drop span{font-size:12px;opacity:.6;}
.pf-file{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:10px 14px;border:1px solid rgba(128,128,128,.28);border-radius:12px;}
.pf-name{font-weight:600;word-break:break-all;}
.pf-meta{font-size:12px;opacity:.65;}
.pf-file .btn{margin-left:auto;}
.pf-body{display:grid;grid-template-columns:minmax(200px,300px) 1fr;gap:var(--space-lg);align-items:start;}
@media (max-width:720px){.pf-body{grid-template-columns:1fr;}}
.pf-preview{min-height:120px;}
.pf-empty{font-size:12px;opacity:.5;}
.pf-group{margin-bottom:14px;}
.pf-group-label{font-size:12px;opacity:.6;margin-bottom:6px;}
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
.pf-job{appearance:none;text-align:left;padding:14px;border-radius:10px;cursor:pointer;
  border:1px solid rgba(128,128,128,.28);background:transparent;font-size:14px;}
.pf-job:hover{background:rgba(128,160,255,.12);border-color:rgba(128,160,255,.5);}
.pf-back{appearance:none;background:transparent;border:0;cursor:pointer;padding:4px 0;
  font-size:13px;opacity:.7;margin-bottom:10px;}
.pf-back:hover{opacity:1;}
.pf-chain{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;
  padding:8px 12px;border-radius:10px;border:1px solid rgba(128,200,140,.5);background:rgba(128,200,140,.1);}
`;
  document.head.appendChild(el);
}
