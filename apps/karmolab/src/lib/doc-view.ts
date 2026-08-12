/**
 * 문서 보기 공용 — 목차(ToC) + 지금 읽는 위치 표시.
 *
 * 왜 lib 인가: 「긴 글을 읽히는 화면」이 KarmoLab 안에 이미 둘이다(문서 위젯 · 스터디 맵 강의).
 * 각자 목차를 따로 만들면 동작이 갈리고 한쪽만 고쳐진다 — 그래서 만드는 규칙을 여기 한 곳에 둔다.
 *
 * 하는 일은 셋뿐이다. 제목에 id 를 박고, 목차 마크업을 만들고, 스크롤에 맞춰 현재 항목을 표시한다.
 * 마크다운 파서·문법 강조는 여기 없다 — 부르는 쪽이 이미 HTML 을 갖고 온다는 전제다.
 */

export interface DocHeading {
  id: string;
  text: string;
  /** 1 = 가장 큰 제목. 화면에서 들여쓰기 깊이로 쓴다. */
  level: number;
}

export interface DocTocOptions {
  /** 목차에 넣을 제목 선택자. 기본은 h2·h3·h4. */
  selector?: string;
  /** id 가 겹치지 않게 붙이는 접두사(문서마다 다르게). */
  prefix?: string;
  /** 이 개수 미만이면 목차를 만들지 않는다 — 짧은 글에 목차는 소음이다. */
  min?: number;
  /**
   * id 를 직접 짓고 싶을 때. 문서 위젯은 제목 글자에서 뽑은 id 로 **밖에 링크가 이미 걸려 있어서**
   * 번호를 붙이는 기본 방식으로 바꾸면 그 링크들이 깨진다 — 그래서 여는 구멍.
   */
  idFrom?: (text: string, at: number) => string;
}

/** 제목 글자를 id 로. 한글을 살린다(로마자 변환은 오히려 못 읽는 id 를 만든다). */
function slug(text: string, at: number, prefix: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `${prefix}${base || 'h'}-${at}`;
}

/**
 * 본문에서 제목을 찾아 id 를 박고 목록을 돌려준다.
 * 이미 id 가 있으면 건드리지 않는다(밖에서 걸어 둔 링크를 안 깨뜨리려고).
 */
export function collectHeadings(root: HTMLElement, opts: DocTocOptions = {}): DocHeading[] {
  const selector = opts.selector || 'h2, h3, h4';
  const prefix = opts.prefix || 'doc-';
  const found: DocHeading[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((el, at) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    if (!el.id) el.id = opts.idFrom ? opts.idFrom(text, at) : slug(text, at, prefix);
    found.push({ id: el.id, text, level: Number(el.tagName.slice(1)) });
  });
  const min = opts.min ?? 3;
  return found.length >= min ? found : [];
}

/** 목차 마크업. 클래스 이름은 부르는 쪽이 자기 CSS 로 꾸민다. */
export function tocHtml(headings: DocHeading[], label: string, cls = 'doc-toc'): string {
  if (headings.length === 0) return '';
  const top = Math.min(...headings.map((h) => h.level));
  const items = headings
    .map(
      (h) =>
        `<a class="${cls}-a" data-toc-to="${h.id}" href="#${h.id}" style="padding-left:${(h.level - top) * 12}px">${h.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</a>`,
    )
    .join('');
  return `<nav class="${cls}" aria-label="${label}"><div class="${cls}-title">${label}</div><div class="${cls}-list">${items}</div></nav>`;
}

/**
 * 스크롤에 따라 현재 항목에 `is-here` 를 붙인다.
 * IntersectionObserver 로만 판단하면 「화면에 여럿 보일 때」 흔들려서,
 * 위에서부터 지나온 마지막 제목을 고르는 방식으로 고정했다.
 *
 * @returns 정리 함수 — 화면을 갈아엎을 때 부르면 감시를 푼다.
 */
export interface DocWatchOptions {
  /** 글이 창이 아니라 안쪽 상자에서 굴러갈 때 그 상자. 없으면 창 스크롤로 본다. */
  scrollRoot?: HTMLElement | null;
  /** 현재 항목에 붙일 클래스. 화면마다 이름이 달라 열어 둔다. */
  activeClass?: string;
  /** 목차 링크 선택자·id 를 읽는 방법(기본은 data-toc-to). */
  linkSelector?: string;
  idOf?: (link: HTMLElement) => string;
}

export function watchReading(
  root: HTMLElement,
  tocRoot: HTMLElement,
  headings: DocHeading[],
  opts: DocWatchOptions = {},
): () => void {
  if (headings.length === 0) return () => {};
  const activeClass = opts.activeClass || 'is-here';
  const scroller = opts.scrollRoot || null;
  const idOf = opts.idOf || ((a: HTMLElement) => a.dataset.tocTo || '');
  const links = new Map<string, HTMLElement>();
  tocRoot.querySelectorAll<HTMLElement>(opts.linkSelector || '[data-toc-to]').forEach((a) => links.set(idOf(a), a));

  let ticking = false;
  const mark = (): void => {
    ticking = false;
    /* 화면(또는 상자) 위쪽 이만큼을 「읽는 줄」로 본다 */
    const line = (scroller ? scroller.getBoundingClientRect().top : 0) + 96;
    let here = headings[0].id;
    for (const h of headings) {
      const el = root.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
      if (!el) continue;
      if (el.getBoundingClientRect().top - line <= 0) here = h.id;
      else break;
    }
    links.forEach((a, id) => a.classList.toggle(activeClass, id === here));
  };
  const onScroll = (): void => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(mark);
  };

  /**
   * 굴러가는 건 창이 아닐 수 있다 — KarmoLab 은 `.main-content` 안에서 굴린다.
   * 창에만 귀를 대면 아무 소리도 안 들려 목차 표시가 첫 항목에 굳는다(실제로 그랬다).
   * 그래서 **잡기 단계(capture)** 로 문서 전체의 스크롤을 듣는다 — 어느 상자가 굴러도 잡힌다.
   */
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll, { passive: true });
  mark();

  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', onScroll);
  };
}

/** 목차 클릭 — 부드럽게 이동하고 주소는 안 건드린다(뒤로가기가 글 밖으로 나가지 않게). */
export function bindTocClicks(tocRoot: HTMLElement, root: HTMLElement, opts: DocWatchOptions = {}): void {
  const sel = opts.linkSelector || '[data-toc-to]';
  const idOf = opts.idOf || ((a: HTMLElement) => a.dataset.tocTo || '');
  const scroller = opts.scrollRoot || null;
  tocRoot.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest(sel) as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    let el: HTMLElement | null = null;
    try {
      el = root.querySelector<HTMLElement>(`#${CSS.escape(idOf(a))}`);
    } catch {
      el = null;
    }
    if (!el) return;
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 10;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/* ─────────── 코드블록 — 문법 강조와 복사 ───────────
 * 문서 위젯이 하던 것을 여기로 올린다. 강의도 코드가 본체라 같은 대접을 받아야 하고,
 * 두 곳이 각자 Prism 을 부르면 언어 목록·복사 동작이 조용히 갈린다.
 */

type PrismLike = {
  highlightElement: (el: Element) => void;
  plugins?: { autoloader?: { languages_path?: string } };
};
/**
 * Toolbox 는 **전역 스코프의 const** 라 `window.Toolbox` 로는 안 잡힌다(그렇게 찾다 Prism 로드가
 * 조용히 실패했다). 다른 파일들과 같은 방식으로 이름 그대로 선언해 쓴다.
 */
declare const Toolbox: { ensureScript?: (path: string) => Promise<unknown> } | undefined;

/** Prism 은 첫 사용 시에만 받는다(첫 화면을 무겁게 하지 않으려고 — KL-054 와 같은 결). */
export async function ensurePrism(): Promise<PrismLike | null> {
  const w = window as unknown as { Prism?: PrismLike };
  if (w.Prism) return fixLanguagesPath(w.Prism);
  try {
    await Toolbox?.ensureScript?.('vendor/prism.min');
    await Toolbox?.ensureScript?.('vendor/prism-autoloader.min');
  } catch {
    /* 못 받아도 코드는 글자 그대로 보인다 — 강조만 없다 */
  }
  const prism = w.Prism ?? null;
  return prism ? fixLanguagesPath(prism) : null;
}

/** 언어 파일 위치를 바로잡는다. Prism 이 이미 떠 있었을 때도 반드시 거치게 따로 뺀다. */
function fixLanguagesPath(prism: PrismLike): PrismLike {
  /**
   * 언어 파일을 어디서 받을지 여기서 정한다.
   * 껍데기(index.html)는 DOMContentLoaded 에 이걸 정하는데, 그때 Prism 은 아직 없다(지연 로드).
   * 그래서 실제로는 한 번도 안 잡혔고, 자동 로더가 바깥 CDN 을 찾다 막혀 **강조가 조용히 꺼져 있었다.**
   * 부르는 자리에서 정하면 순서가 어긋날 일이 없다.
   */
  const auto = prism?.plugins?.autoloader;
  /* 자동 로더가 스스로 정한 값(`js/vendor/components/`)은 틀렸다 — 언어 파일은 `prism/` 아래 있다.
     그래서 비었을 때만이 아니라 **항상** 덮어쓴다. 안 그러면 bash·json 같은 언어가 조용히 안 칠해진다. */
  if (auto) auto.languages_path = '/apps/karmolab/js/vendor/prism/components/';
  return prism;
}

/**
 * `pre code` 에 언어 클래스를 붙이고 강조한다.
 * 언어를 못 정하면 강조하지 않는다 — 아무 언어로나 칠하면 오히려 잘못 읽힌다.
 */
export async function highlightCode(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>('pre code');
  if (blocks.length === 0) return;
  const prism = await ensurePrism();
  if (!prism) return;
  blocks.forEach((block) => {
    const lang = block.className.match(/language-([\w-]+)/)?.[1];
    if (!lang || lang === 'text') return;
    prism.highlightElement(block);
  });
}

/** 코드블록마다 복사 단추. 붙였던 자리는 건너뛴다(다시 그릴 때 두 개 생기지 않게). */
export function addCopyButtons(root: HTMLElement, label: string, doneLabel: string): void {
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    if (pre.dataset.copyReady === '1') return;
    pre.dataset.copyReady = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'doc-copy';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.textContent = doneLabel;
          setTimeout(() => (btn.textContent = label), 1200);
        })
        .catch(() => {
          /* 권한이 없으면 아무 말도 하지 않는다 — 사용자는 그냥 긁어서 복사하면 된다 */
        });
    });
    pre.appendChild(btn);
  });
}

/* ─────────── 살아 있는 예제 ───────────
 * 코드만 보여 주면 「그래서 어떻게 되는데」가 안 남는다. 결과를 옆에 띄우고, 고치면 바로 다시 그린다.
 *
 * 실행은 전부 **격리된 iframe**(sandbox=allow-scripts, 같은 출처 아님) 안에서만 한다.
 * 문서에 적힌 코드가 우리 화면의 저장소·쿠키·DOM 에 손댈 수 없다는 뜻 — 이게 이 기능의 전제다.
 */

export type DemoKind = 'html' | 'js' | 'shader';

const DEMO_LABELS = { run: '다시 그리기', reset: '되돌리기', code: '코드', result: '결과' };

/** 캔버스 한 장과 붙잡을 고리만 준 최소 판 — 예제 코드가 짧아진다. */
function jsPage(code: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#111;color:#eee;font:13px/1.5 system-ui,sans-serif;overflow:hidden}
    canvas{display:block;width:100%;height:100%}
  </style><canvas id="c"></canvas><script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    function fit(){ canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
    fit(); addEventListener('resize', fit);
    const W = () => innerWidth, H = () => innerHeight;
    try { ${code} } catch (e) { document.body.innerHTML = '<pre style="color:#f88;padding:10px;white-space:pre-wrap">' + e + '</pre>'; }
  <\/script>`;
}

/** 프래그먼트 셰이더 한 장 — u_time·u_resolution 만 준다(배우는 데 그 둘이면 충분). */
function shaderPage(frag: string): string {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block;width:100%;height:100%}
  pre{color:#f88;font:12px/1.5 ui-monospace,monospace;padding:10px;white-space:pre-wrap;margin:0}</style><canvas id="c"></canvas><script>
  const cv = document.getElementById('c');
  const gl = cv.getContext('webgl');
  const fail = (m) => { document.body.innerHTML = '<pre>' + m + '</pre>'; };
  if (!gl) fail('이 브라우저에서 WebGL 을 쓸 수 없다');
  else {
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = ${JSON.stringify(
      'precision mediump float;\nuniform float u_time;\nuniform vec2 u_resolution;\n',
    )} + ${JSON.stringify(frag)};
    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { fail(gl.getShaderInfoLog(s) || '셰이더 오류'); return null; } return s; };
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    if (v && f) {
      const pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr); gl.useProgram(pr);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const uT = gl.getUniformLocation(pr, 'u_time'), uR = gl.getUniformLocation(pr, 'u_resolution');
      const t0 = performance.now();
      (function loop(){
        cv.width = innerWidth; cv.height = innerHeight;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform1f(uT, (performance.now() - t0) / 1000);
        gl.uniform2f(uR, cv.width, cv.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(loop);
      })();
    }
  }
  <\/script>`;
}

function demoPage(kind: DemoKind, code: string): string {
  if (kind === 'js') return jsPage(code);
  if (kind === 'shader') return shaderPage(code);
  /* html — 글자 크기만 맞춰 주고 나머지는 예제가 정한다 */
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;font:14px/1.6 system-ui,sans-serif;color:#222;background:#fff}</style>${code}`;
}

/**
 * `[data-demo]` 가 붙은 자리(강의 블록·문서의 ```demo-… 울타리)를 살아 있는 판으로 바꾼다.
 * 코드는 그 자리에서 고칠 수 있고, 멈추면 다시 그린다.
 */
/** 예제에 붙는 손잡이 — 코드를 안 읽어도 값을 밀어 볼 수 있게. */
export interface DemoControl {
  id: string;
  label: string;
  type: 'range' | 'toggle' | 'select';
  min?: number;
  max?: number;
  step?: number;
  value?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
}

/** 코드 안의 `{{id}}` 를 지금 값으로 바꾼다 — 예제 코드가 손잡이를 그대로 쓸 수 있게. */
function fill(code: string, values: Record<string, string>): string {
  return code.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (whole, key) => (key in values ? values[key] : whole));
}

function controlsHtml(controls: DemoControl[], values: Record<string, string>): string {
  return controls
    .map((c) => {
      const v = values[c.id];
      if (c.type === 'toggle') {
        return `<label class="doc-demo-ctl"><input type="checkbox" data-ctl="${c.id}"${v === 'true' ? ' checked' : ''}><span>${c.label}</span></label>`;
      }
      if (c.type === 'select') {
        const opts = (c.options || []).map((o) => `<option value="${o.value}"${o.value === v ? ' selected' : ''}>${o.label}</option>`).join('');
        return `<label class="doc-demo-ctl"><span>${c.label}</span><select data-ctl="${c.id}">${opts}</select></label>`;
      }
      return `<label class="doc-demo-ctl"><span>${c.label}</span>
        <input type="range" data-ctl="${c.id}" min="${c.min ?? 0}" max="${c.max ?? 100}" step="${c.step ?? 1}" value="${v}">
        <output data-out="${c.id}">${v}</output></label>`;
    })
    .join('');
}

export function mountDemos(root: HTMLElement, labels: Partial<typeof DEMO_LABELS> = {}): void {
  const L = { ...DEMO_LABELS, ...labels };
  root.querySelectorAll<HTMLElement>('[data-demo]').forEach((host) => {
    if (host.dataset.demoReady === '1') return;
    host.dataset.demoReady = '1';
    const kind = (host.dataset.demo || 'html') as DemoKind;
    const source = (host.textContent || '').replace(/\s+$/, '');
    host.textContent = '';
    host.classList.add('doc-demo');

    const frame = document.createElement('iframe');
    frame.className = 'doc-demo-view';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', L.result);
    frame.style.height = host.dataset.demoHeight || '220px';

    const editor = document.createElement('textarea');
    editor.className = 'doc-demo-code';
    editor.spellcheck = false;
    editor.value = source;
    editor.setAttribute('aria-label', L.code);

    /**
     * 손잡이(슬라이더·토글·고르기) — 있으면 **코드 위에** 둔다.
     * 처음 만나는 사람은 코드를 고치기 전에 값을 밀어 본다. 그 한 번이 이해의 대부분이다.
     */
    let controls: DemoControl[] = [];
    try {
      controls = host.dataset.demoControls ? (JSON.parse(host.dataset.demoControls) as DemoControl[]) : [];
    } catch {
      controls = [];
    }
    const values: Record<string, string> = {};
    for (const c of controls) values[c.id] = String(c.value ?? (c.type === 'toggle' ? false : c.min ?? 0));

    const knobs = document.createElement('div');
    knobs.className = 'doc-demo-knobs';
    if (controls.length) knobs.innerHTML = controlsHtml(controls, values);

    const bar = document.createElement('div');
    bar.className = 'doc-demo-bar';
    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'doc-demo-btn';
    run.textContent = L.run;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'doc-demo-btn';
    reset.textContent = L.reset;
    bar.append(run, reset);

    const draw = (): void => {
      frame.srcdoc = demoPage(kind, fill(editor.value, values));
    };
    let knobTimer = 0;
    knobs.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const key = (el as HTMLElement).dataset.ctl;
      if (!key) return;
      values[key] = el instanceof HTMLInputElement && el.type === 'checkbox' ? String(el.checked) : String(el.value);
      const out = knobs.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = values[key];
      /* 미는 동안 계속 다시 그리면 버벅인다 — 아주 짧게 묶는다(밀고 있다는 느낌은 남게). */
      window.clearTimeout(knobTimer);
      knobTimer = window.setTimeout(draw, 90);
    });
    let timer = 0;
    /* 타자 칠 때마다 다시 그리면 어지럽다 — 손이 멈춘 뒤에 한 번. */
    editor.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 600);
    });
    run.addEventListener('click', draw);
    reset.addEventListener('click', () => {
      editor.value = source;
      draw();
    });

    if (controls.length) host.append(frame, knobs, editor, bar);
    else host.append(frame, editor, bar);
    draw();
  });
}
