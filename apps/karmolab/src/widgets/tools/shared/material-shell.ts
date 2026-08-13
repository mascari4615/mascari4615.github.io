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
  /**
   * 무엇을 들고 오나 (TASK-KL-262).
   *
   * `file` = 파일을 놓는다(PDF·이미지·영상·소리). `text` = **붙여넣는다**(글).
   * 글은 파일로 오지 않는다 — 사람은 글을 복사해서 온다. 그래서 받는 칸이 다르고,
   * 도구에 건네는 자리도 다르다(파일 칸이 아니라 글 칸).
   */
  intake?: 'file' | 'text';
  /**
   * 쓰는 대로 곧바로 (TASK-KL-264). 셈 공책은 **치는 동안** 답이 서야 한다 —
   * 0.4초를 기다리면 계산기가 아니라 제출 양식이 된다. 칸도 더 크게 연다.
   */
  live?: boolean;
  /** `<input accept>` — 무엇을 받나 (`intake: 'file'` 일 때) */
  accept: string;
  /** 할 일 — 갈래별로 묶어 격자에 놓는다 */
  groups: () => MaterialGroup[];
  /** 파일을 안 들고 와도 되는 할 일(다른 것에서 이 재료를 **만드는** 쪽) */
  noInputNeeded?: Set<string>;
  /** 이어받을 결과의 형식 — 이 재료로 못 받는 결과는 무시한다 */
  accepts: RegExp;
  drop: { title: string; hint: string };
  labels: { change: string; back: string; chain: string; fail: string; pasted?: string };
  /**
   * 왼쪽 칸을 그린다. **이 함수만 재료를 안다.**
   * @param alive 파일이 그새 바뀌었으면 `false` — 옛 그림을 붙이지 않게 매번 확인한다
   * @returns 파일 줄에 쓸 한 마디(「12쪽 · 2.4MB」 · 「1920×1080 · 340KB」)
   */
  preview: (file: File, box: HTMLElement, alive: () => boolean) => Promise<string>;
  /**
   * **들고 온 것을 보고 할 일을 짚어 준다** (TASK-KL-263 — JSON Crack·JSON Hero 를 보고).
   *
   * 붙여넣은 것이 JSON 이면 「보기 좋게」·「타입 뽑기」가, JWT 면 「뜯어보기」가 맞다.
   * 열여섯 개를 다 읽게 하지 말고 **맞는 것을 앞에 띄운다**. 짚는 것뿐이라 나머지도 그대로 눌린다.
   */
  suggest?: (file: File) => Promise<{ ids: string[]; why: string }>;
}

/** 도구의 글 칸 — 읽기 전용(결과 칸)은 건너뛴다. 첫 칸이 늘 입력이다. */
function textBoxIn(host: HTMLElement): HTMLTextAreaElement | null {
  const all = Array.from(host.querySelectorAll('textarea'));
  return all.find((x) => !x.readOnly && !x.disabled) || all[0] || null;
}

export function materialShell(container: HTMLElement, o: MaterialShellOpts): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  injectStyles();

  container.innerHTML = `
    <div class="pf-head" id="pfHead">
      ${
        o.intake === 'text'
          ? `<div class="pf-paste" id="pfDrop">
               <textarea id="pfText" rows="${o.live ? 12 : 6}" spellcheck="false" placeholder="${esc(o.drop.title)}"></textarea>
               <span class="pf-paste-hint">${esc(o.drop.hint)}</span>
             </div>`
          : `<div class="pf-drop" id="pfDrop">
               <strong>${esc(o.drop.title)}</strong>
               <span>${esc(o.drop.hint)}</span>
               <input type="file" id="pfFile" accept="${esc(o.accept)}" hidden>
             </div>`
      }
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
          <div class="pf-tip" id="pfTip" hidden></div>
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
  const asText = o.intake === 'text';
  const fileInput = $<HTMLInputElement>('#pfFile');
  const preview = $<HTMLElement>('#pfPreview');
  const host = $<HTMLElement>('#pfHost');

  let file: File | null = null;
  /** 이 파일을 그리는 중이라는 표 — 파일이 바뀌면 앞의 그리기는 버린다 */
  let token = 0;
  let openJob: string | null = null;

  async function setFile(f: File): Promise<void> {
    file = f;
    /* 셈 공책은 쓰는 칸이 **계속 보여야** 한다 — 한 줄 치고 칸이 사라지면 이어 쓸 수가 없다 */
    $('#pfDrop').hidden = !o.live;
    $('#pfFileBar').hidden = false;
    $('#pfName').textContent = asText ? o.labels.pasted || f.name : f.name;
    const mine = ++token;
    preview.textContent = '';
    try {
      const meta = await o.preview(f, preview, () => mine === token);
      if (mine !== token) return;
      $('#pfMeta').textContent = meta || fileSize(f.size);
      if (o.suggest) {
        const hit = await o.suggest(f);
        if (mine !== token) return;
        container.querySelectorAll('.pf-job').forEach((b) => b.classList.remove('pf-hot'));
        const tip = $('#pfTip');
        if (hit.ids.length) {
          hit.ids.forEach((id) => container.querySelector(`.pf-job[data-job="${id}"]`)?.classList.add('pf-hot'));
          tip.textContent = hit.why;
          tip.hidden = false;
        } else {
          tip.hidden = true;
        }
      }
    } catch {
      if (mine !== token) return;
      $('#pfMeta').textContent = fileSize(f.size);
      preview.innerHTML = `<div class="pf-empty">${esc(o.labels.fail)}</div>`;
    }
    /* 열어 둔 할 일이 있으면 **거기에도** 새 파일을 넣어 준다 — 이게 이 화면의 요점이다 */
    if (openJob) handOver();
  }

  if (asText) {
    /* 글은 **붙여넣기**가 기본이다 (TASK-KL-262). 파일 줄에 이름 대신 「붙여넣은 글」이 서고,
     * 「바꾸기」를 누르면 다시 붙여넣는 칸으로 돌아간다. 타이핑마다 다시 재면 시끄러우니
     * 0.4초 쉬면 그때 센다. */
    const box = $<HTMLTextAreaElement>('#pfText');
    let timer = 0;
    box.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const v = box.value;
        if (!v.trim()) return;
        void setFile(new File([v], o.labels.pasted || 'text.txt', { type: 'text/plain' }));
      }, o.live ? 70 : 400);
    });
    Toolbox.onDispose?.(() => window.clearTimeout(timer));
    $('#pfChange').onclick = (): void => {
      $('#pfDrop').hidden = false;
      $('#pfFileBar').hidden = true;
      box.focus();
    };
  } else {
    fileInput.onchange = (): void => {
      const f = fileInput.files?.[0];
      if (f) void setFile(f);
    };
    $('#pfDrop').onclick = (): void => fileInput.click();
    $('#pfChange').onclick = (): void => fileInput.click();
  }

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
  /* 글 모드에서 파일을 떨어뜨렸으면 **읽어서 칸에 넣는다** — 글은 파일로도 온다(로그·csv) */
  if (asText) {
    head.addEventListener('drop', (e) => {
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (!f) return;
      void f.text().then((v) => {
        const box = container.querySelector<HTMLTextAreaElement>('#pfText');
        if (box) box.value = v;
      });
    });
  }

  /**
   * 들고 있는 파일을 **그 도구의 파일 칸에 넣어 준다.**
   *
   * 도구를 고치지 않으려고 이렇게 한다: 도구가 이미 갖고 있는 `input[type=file]` 에 파일을 담고
   * `change` 를 울려 주면, 도구는 사람이 고른 것과 똑같이 받아들인다. 도구마다 「파일 받는 함수」를
   * 새로 노출하게 만들면 재료 다섯 곳에서 도구 예순 개를 고쳐야 한다.
   */
  function handOver(tries = 12): void {
    if (!file) return;
    if (asText) {
      /* 글은 **글 칸**에 넣는다. 도구는 사람이 타이핑한 것과 똑같이 받는다
       * (`input` 을 울려야 실시간으로 세는 도구들이 반응한다). */
      const box = textBoxIn(host);
      if (!box) {
        if (tries > 0) setTimeout(() => handOver(tries - 1), 120);
        return;
      }
      void file.text().then((v) => {
        const put = (): void => {
          box.value = v;
          box.dispatchEvent(new Event('input', { bubbles: true }));
          box.dispatchEvent(new Event('change', { bubbles: true }));
        };
        put();
        /* **도구가 늦게 덮어쓴다** (TASK-KL-263 에서 잡음). 도구 화면은 말 묶음을 받은 뒤에
         * 그려지는데(`loadNamespace(...).then`), 그중 몇은 그때 **보기 글을 채운다**
         * (정규식 도구가 예제 문장을 넣는 식). 우리가 먼저 넣어도 그 뒤에 지워졌다.
         *
         * 한 번만 확인했더니 **덮어쓰는 시점이 기계마다 달라** 어떤 판에서는 늦어서 놓쳤다
         * (검사가 간헐로 빨개졌다 — 잡음이 아니라 진짜 경합이다). 그래서 세 번 본다.
         * 사람이 0.7초 안에 고쳐 쓸 일은 없으니 사람 입력을 덮을 걱정은 없다. */
        for (const at of [140, 350, 700]) {
          window.setTimeout(() => {
            if (box.isConnected && box.value !== v) put();
          }, at);
        }
      });
      return;
    }
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

  /* ── 찾아온 도구를 연다 (TASK-KL-273) ─────────────────────────────
   *
   * 도구들은 재료 묶음 안으로 들어갔지만 **자기 주소는 살아 있다**(검색으로 들어오는 길).
   * 예전엔 묶음이 탭이라 `switchTab(도구id)` 로 열렸는데, 재료 화면을 한 판으로 바꾸면서
   * 그 길이 끊겼다 — 찾아온 사람이 재료 첫 화면만 봤다. 껍데기가 직접 집어서 연다.
   */
  const jobIds = new Set(o.groups().flatMap((g) => g.jobs.map(([id]) => id)));
  const openIfMine = (id: string | null | undefined): void => {
    if (id && jobIds.has(id)) openJobById(id);
  };
  openIfMine(Toolbox.takeBundleRequest?.());
  const onBundleOpen = (e: Event): void => {
    const d = (e as CustomEvent).detail as { tool?: string } | undefined;
    /* 이미 집어 갔으면 `take` 가 비어 있다 — 그래도 알림에 실린 이름으로 연다 */
    openIfMine(d?.tool);
  };
  window.addEventListener('karmolab-open-in-bundle', onBundleOpen);
  Toolbox.onDispose?.(() => window.removeEventListener('karmolab-open-in-bundle', onBundleOpen));

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
.pf-paste{display:flex;flex-direction:column;gap:6px;}
.pf-paste textarea{width:100%;min-height:110px;resize:vertical;font-family:inherit;
  padding:12px 14px;border-radius:12px;border:1px solid rgba(128,128,128,.35);background:transparent;}
.pf-paste-hint{font-size:12px;opacity:.6;}
.pf-drop span{font-size:12px;opacity:.6;}
.pf-file[hidden]{display:none;}
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
.pf-job.pf-hot{border-color:rgba(120,200,140,.75);background:rgba(120,200,140,.12);font-weight:600;}
.pf-tip{font-size:12px;margin-bottom:10px;padding:8px 12px;border-radius:10px;
  border:1px solid rgba(120,200,140,.45);background:rgba(120,200,140,.09);}
.pf-back{appearance:none;background:transparent;border:0;cursor:pointer;padding:4px 0;
  font-size:13px;opacity:.7;margin-bottom:10px;}
.pf-back:hover{opacity:1;}
/* display:flex 는 hidden 속성을 이긴다 — 이 한 줄이 없으면 「이어서」 줄이 결과도 없는데
   늘 서 있다 (2026-08-13 검사가 잡았다, TASK-KL-282). 숨김이 필요한 칸마다 짝으로 적는다.
   (여기는 템플릿 문자열 안이라 홑따옴표 기울임표를 쓰면 문자열이 끊긴다.) */
.pf-chain[hidden]{display:none;}
.pf-chain{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;
  padding:8px 12px;border-radius:10px;border:1px solid rgba(128,200,140,.5);background:rgba(128,200,140,.1);}
`;
  document.head.appendChild(el);
}
