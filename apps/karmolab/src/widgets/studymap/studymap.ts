/**
 * 개발자 스터디 맵 (TASK-KL-STUDYMAP)
 *
 * 로드맵 사이트는 많다. 그런데 대부분 **네모와 화살표**만 준다 — 「이걸 왜 배우나」와
 * 「어디까지 하면 넘어가도 되나」가 없다. 그게 없으면 지도가 아니라 목록이다.
 *
 * 그래서 노드 하나가 네 가지를 다 들고 있다: 무엇을 · 왜 · 언제 넘어가나 · 어디서 읽나.
 * 표는 `data/studymap.json` 한 곳이고 여기는 그리기만 한다 — 주제를 늘릴 때 코드를 안 건드린다.
 *
 * 진도는 이 브라우저에만 남는다(localStorage). 로그인·서버 없음 —
 * 「체크하려고 가입」이 지도를 안 열게 만드는 가장 흔한 이유라서.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';
import {
  collectHeadings,
  tocHtml,
  bindTocClicks,
  watchReading,
  highlightCode,
  addCopyButtons,
  mountDemos,
} from '../../lib/doc-view';

interface SmLink { label: string; url: string }
interface SmTool { id: string; label: string }
interface SmNode { id: string; title: string; why: string; check?: string; tool?: SmTool; links?: SmLink[]; prereq?: string[] }
interface SmStage { id: string; title: string; nodes: SmNode[] }
interface SmTrack { id: string; title: string; emoji: string; lead: string; scope?: 'personal'; stages: SmStage[] }
interface SmData { tracks: SmTrack[] }

/** 강의 한 편 — `data/lessons/<언어>/<칸id>.json`. 위젯은 그리기만 하고 내용은 표에 있다. */
/** demo = 실행되는 예제. kind 가 어떤 판에서 돌릴지 정한다(html · js 캔버스 · 프래그먼트 셰이더). */
interface SmBlock {
  type: 'p' | 'h' | 'code' | 'note' | 'try' | 'demo';
  text: string;
  lang?: string;
  label?: string;
  kind?: 'html' | 'js' | 'shader';
  height?: string;
}
interface SmQuiz { q: string; choices: string[]; answer: number; why?: string }
interface SmLesson { id: string; minutes?: number; blocks: SmBlock[]; quiz?: SmQuiz[] }

/** 다른 언어 덧씌우기 표 — id 로만 짝을 짓는다(순서·구조를 다시 적지 않는다). */
interface SmOverlay {
  tracks?: Record<string, { title?: string; lead?: string }>;
  stages?: Record<string, string>;
  nodes?: Record<string, { title?: string; why?: string; check?: string; links?: string[]; tool?: string }>;
}

function applyOverlay(data: SmData, over: SmOverlay): SmData {
  const tracks = data.tracks.map((track) => {
    const tOver = over.tracks?.[track.id];
    return {
      ...track,
      title: tOver?.title ?? track.title,
      lead: tOver?.lead ?? track.lead,
      stages: track.stages.map((stage) => ({
        ...stage,
        title: over.stages?.[stage.id] ?? stage.title,
        nodes: stage.nodes.map((node) => {
          const nOver = over.nodes?.[node.id];
          if (!nOver) return node;
          return {
            ...node,
            title: nOver.title ?? node.title,
            why: nOver.why ?? node.why,
            check: nOver.check ?? node.check,
            tool: node.tool && nOver.tool ? { ...node.tool, label: nOver.tool } : node.tool,
            /* 링크 이름만 바꾼다 — 주소는 정본 한 곳에서만 관리한다(둘로 갈리면 죽은 주소가 숨는다). */
            links: node.links?.map((link, at) => ({ ...link, label: nOver.links?.[at] ?? link.label })),
          };
        }),
      })),
    };
  });
  return { ...data, tracks };
}

(function (): void {
  const DONE_KEY = 'karmolab-studymap-done';
  const TRACK_KEY = 'karmolab-studymap-track';

  /** 본문의 **굵게** 만 살린다. 그 외는 전부 글자로 — 표에 태그를 열어 두면 그게 구멍이 된다. */
  const strong = (text: string): string =>
    String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── 진도 ── */
  function readDone(): Set<string> {
    try {
      const raw = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      return new Set();
    }
  }
  function writeDone(done: Set<string>): void {
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
    } catch {
      /* 사생활 보호 모드 등 — 진도만 안 남고 지도는 그대로 쓴다 */
    }
  }

  function injectStyles(): void {
    if (document.getElementById('studymap-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'studymap-widget-styles';
    style.textContent = `
/* 스터디 맵 — 읽는 화면이다. 글줄 길이와 여백이 첫 번째 기능. */
.sm-wrap { display: flex; flex-direction: column; gap: 20px; }

.sm-head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; justify-content: space-between; }
.sm-lead { color: var(--text-secondary); font-size: var(--font-size-xs); line-height: 1.6; max-width: 62ch; margin: 6px 0 0; }
.sm-title { font-size: var(--font-size-lg); font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
.sm-title .sm-emoji { font-size: 1.15em; }

.sm-meter { min-width: 200px; }
.sm-meter-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: var(--font-size-2xs); color: var(--text-secondary); margin-bottom: 6px; }
.sm-meter-top b { color: var(--accent); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.sm-bar { height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; }
.sm-meter-all { margin-top: 6px; text-align: right; font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.sm-found { font-size: var(--font-size-2xs); color: var(--text-secondary); margin-bottom: 14px; }
.sm-stage-find::before { display: none; }
.sm-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--secondary), var(--accent)); transition: width .35s cubic-bezier(.2,.8,.2,1); }

.sm-body { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 900px) { .sm-body { grid-template-columns: 216px minmax(0, 1fr); gap: 28px; align-items: start; } }
.sm-main { min-width: 0; }
.sm-tracks { display: flex; flex-wrap: wrap; gap: 8px; }
@media (min-width: 900px) {
  /* 갈래 17개를 알약으로 깔면 첫 화면이 목록에 덮인다 — 넓은 화면에선 옆으로 세운다. */
  .sm-tracks { position: sticky; top: 12px; flex-direction: column; flex-wrap: nowrap; gap: 2px; max-height: calc(100vh - 40px); overflow-y: auto; padding-right: 4px; }
  .sm-track-btn { width: 100%; justify-content: flex-start; border-color: transparent; background: none; border-radius: var(--radius-lg); padding: 7px 10px; }
  .sm-track-btn .sm-count { margin-left: auto; }
  .sm-track-btn.is-on { background: var(--accent-subtle); border-color: var(--accent); }
}
.sm-track-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-2xs); transition: border-color .15s, color .15s, background .15s; }
.sm-track-btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
.sm-track-btn.is-on { border-color: var(--accent); color: var(--text-primary); background: var(--accent-subtle); }
.sm-track-btn .sm-count { font-variant-numeric: tabular-nums; opacity: .7; font-size: 11px; }
.sm-track-btn.is-personal { border-style: dashed; }
/* 펼친 갈래의 속 — 단계 이름은 작게, 칸 제목은 누를 수 있게. */
.sm-track-open { display: none; }
@media (min-width: 900px) {
  .sm-track-open { display: block; margin: 2px 0 8px; padding-left: 10px; border-left: 1px solid var(--border); }
  .sm-track-stage { font-size: 10px; letter-spacing: .04em; color: var(--text-tertiary); margin: 8px 0 3px; }
  .sm-track-node { display: block; width: 100%; text-align: left; font: inherit; font-size: 11px; line-height: 1.5; padding: 3px 8px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-secondary); cursor: pointer; }
  .sm-track-node:hover { background: var(--bg-hover); color: var(--text-primary); }
  .sm-track-node.is-done { color: var(--text-tertiary); text-decoration: line-through; }
}
.sm-track-btn.is-personal.is-on { border-style: solid; }
.sm-scope-line { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--text-tertiary); margin: 10px 0 2px; }
.sm-scope-line::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.sm-badge { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 999px; border: 1px dashed var(--border-strong); color: var(--secondary); margin-left: 8px; vertical-align: middle; }

/* 찾기는 평소엔 접혀 있다 — 지도를 훑는 게 기본 동작이고, 찾기는 목적이 생겼을 때만 쓴다. */
.sm-findbar { display: flex; align-items: center; gap: 8px; }
.sm-find-btn { border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); font: inherit; font-size: 11px; padding: 5px 11px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.sm-find-btn:hover { border-color: var(--accent); color: var(--accent); }
.sm-findbar .sm-search { padding: 6px 12px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: var(--font-size-2xs); }
.sm-search { width: 100%; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: 11px; }
.sm-search:focus { outline: none; border-color: var(--accent); }

/* 단계 = 왼쪽 등뼈 한 줄. 세로로 이어지는 게 「지도」의 뼈대다. */
.sm-stage { position: relative; padding-left: 26px; }
.sm-stage::before { content: ''; position: absolute; left: 7px; top: 6px; bottom: -18px; width: 2px; background: linear-gradient(180deg, var(--secondary), var(--border)); opacity: .5; }
.sm-stage.is-clear::before { background: linear-gradient(180deg, var(--success), var(--border)); opacity: .6; }
.sm-stage:last-child::before { bottom: 12px; }
.sm-stage-dot { position: absolute; left: 0; top: 3px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-hover); background: var(--bg-primary); }
.sm-stage.is-clear .sm-stage-dot { border-color: var(--success); background: var(--success); }
.sm-stage-name { font-size: var(--font-size-xs); font-weight: 650; margin-bottom: 2px; }
.sm-stage-sub { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.sm-nodes { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 14px 0 26px; }

.sm-node { position: relative; display: flex; gap: 12px; padding: 14px; border-radius: var(--radius-xl); border: 1px solid var(--border); background: var(--bg-secondary); transition: border-color .15s, transform .15s, background .15s; }
.sm-node:hover { border-color: var(--border-hover); transform: translateY(-1px); }
.sm-node.is-done { background: var(--bg-primary); border-color: var(--success-subtle); }
.sm-node.is-done .sm-node-title { color: var(--text-tertiary); text-decoration: line-through; text-decoration-color: var(--text-tertiary); }
.sm-node.is-done .sm-node-why, .sm-node.is-done .sm-node-check { opacity: .45; }
.sm-node.is-next { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-dim), 0 6px 20px -12px var(--accent-glow); }

.sm-check { appearance: none; flex: 0 0 auto; width: 20px; height: 20px; margin-top: 2px; border-radius: 6px; border: 2px solid var(--border-hover); background: transparent; cursor: pointer; position: relative; transition: border-color .15s, background .15s; }
.sm-check:hover { border-color: var(--accent); }
.sm-check:checked { background: var(--success); border-color: var(--success); }
.sm-check:checked::after { content: ''; position: absolute; left: 5px; top: 1px; width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.sm-check:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sm-node-body { min-width: 0; flex: 1; }
.sm-node-title { font-size: var(--font-size-2xs); font-weight: 650; line-height: 1.45; }
.sm-open { display: block; width: 100%; text-align: left; background: none; border: none; padding: 0; color: inherit; font: inherit; font-weight: 650; cursor: pointer; }
.sm-open:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.sm-has-lesson { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; margin-left: 7px; border-radius: 999px; background: var(--accent-dim); color: var(--accent); vertical-align: middle; }

/* 강의 — 읽는 화면. 글줄은 68ch 를 안 넘긴다. */
.sm-lesson { max-width: 68ch; }
.sm-code pre { position: relative; }
/* 살아 있는 예제 — 결과가 위, 고칠 코드가 아래. 결과를 먼저 봐야 코드를 읽을 마음이 생긴다. */
.sm-demo { margin: 14px 0; }
.doc-demo { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-secondary); }
.doc-demo-view { width: 100%; border: 0; display: block; background: #fff; }
.doc-demo-code { width: 100%; box-sizing: border-box; border: 0; border-top: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.6; padding: 10px 12px; min-height: 92px; resize: vertical; }
.doc-demo-code:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
.doc-demo-bar { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--border); }
.doc-demo-btn { font: inherit; font-size: 11px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; }
.doc-demo-btn:hover { border-color: var(--accent); color: var(--accent); }
.doc-copy { position: absolute; top: 6px; right: 6px; font: inherit; font-size: 10px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-tertiary); cursor: pointer; opacity: 0; transition: opacity .15s; }
pre:hover .doc-copy, .doc-copy:focus-visible { opacity: 1; }
.doc-copy:hover { color: var(--accent); border-color: var(--accent); }
/* 목차 — 좁은 화면에선 접힌 채로 위에, 넓은 화면에선 글 옆에 붙어 따라온다. */
.sm-lesson-wrap { display: block; }
.doc-toc { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 14px; margin: 0 0 18px; background: var(--bg-secondary); }
.doc-toc-title { font-size: 10px; letter-spacing: .05em; color: var(--text-tertiary); margin-bottom: 8px; }
.doc-toc-list { display: flex; flex-direction: column; gap: 2px; }
.doc-toc-a { font-size: 11px; color: var(--text-secondary); text-decoration: none; padding: 3px 6px; border-radius: var(--radius-sm); border-left: 2px solid transparent; line-height: 1.5; }
.doc-toc-a:hover { background: var(--bg-hover); color: var(--text-primary); }
.doc-toc-a.is-here { color: var(--accent); border-left-color: var(--accent); background: var(--accent-dim); }
@media (min-width: 1100px) {
  .sm-lesson-wrap { display: grid; grid-template-columns: 1fr 220px; gap: 28px; align-items: start; }
  .sm-lesson { min-width: 0; }
  .doc-toc { position: sticky; top: 12px; margin: 44px 0 0; max-height: calc(100vh - 80px); overflow-y: auto; }
}
.sm-crumb { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-tertiary); margin-bottom: 14px; }
.sm-crumb-btn { background: none; border: 0; padding: 0; font: inherit; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
.sm-crumb-btn:hover { color: var(--accent); text-decoration: underline; }
.sm-pager { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--border); }
.sm-nav-btn { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); color: var(--text-primary); font: inherit; cursor: pointer; }
.sm-nav-btn.is-next { text-align: right; align-items: flex-end; }
.sm-nav-btn:hover { border-color: var(--accent); }
.sm-nav-dir { font-size: 10px; color: var(--text-tertiary); }
.sm-nav-title { font-size: 12px; line-height: 1.45; }
.sm-track-node.is-current { background: var(--accent-subtle); color: var(--text-primary); font-weight: 600; }
.sm-back { background: none; border: 1px solid var(--border); color: var(--text-secondary); font: inherit; font-size: 11px; padding: 6px 12px; border-radius: 999px; cursor: pointer; margin-bottom: 18px; }
.sm-back:hover { border-color: var(--accent); color: var(--accent); }
.sm-lesson h3 { font-size: var(--font-size-md); margin: 0 0 4px; }
.sm-lesson-meta { font-size: 11px; color: var(--text-tertiary); margin-bottom: 20px; }
.sm-lesson h4 { font-size: var(--font-size-xs); margin: 28px 0 10px; padding-top: 14px; border-top: 1px solid var(--border); }
.sm-lesson p { font-size: var(--font-size-2xs); line-height: 1.8; color: var(--text-primary); margin: 0 0 14px; }
.sm-lesson b { color: var(--accent); font-weight: 650; }
.sm-code { margin: 0 0 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-void); }
.sm-code-label { font-size: 11px; color: var(--text-tertiary); padding: 7px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.sm-code pre { margin: 0; padding: 12px 14px; overflow-x: auto; font-size: 12px; line-height: 1.7; }
.sm-callout { border-left: 3px solid var(--secondary); background: var(--secondary-subtle); padding: 12px 14px; border-radius: 0 var(--radius-md) var(--radius-md) 0; margin: 0 0 16px; font-size: 12px; line-height: 1.75; }
.sm-callout.is-try { border-color: var(--accent); background: var(--accent-subtle); }
.sm-callout .sm-callout-tag { display: block; font-size: 10px; letter-spacing: .05em; color: var(--text-tertiary); margin-bottom: 4px; }

.sm-quiz { margin-top: 12px; }
.sm-qbox { border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 14px 16px; margin-bottom: 12px; background: var(--bg-secondary); }
.sm-qtext { font-size: var(--font-size-2xs); font-weight: 600; margin-bottom: 10px; line-height: 1.6; }
.sm-choice { display: flex; gap: 9px; align-items: flex-start; padding: 8px 10px; border-radius: var(--radius-md); cursor: pointer; font-size: 12px; line-height: 1.6; }
.sm-choice:hover { background: var(--bg-hover); }
.sm-choice.is-right { background: var(--success-subtle); }
.sm-choice.is-wrong { background: var(--error-subtle); }
.sm-why { font-size: 11px; color: var(--text-secondary); line-height: 1.7; margin-top: 10px; padding-left: 10px; border-left: 2px solid var(--border-hover); }
.sm-quiz-done { font-size: var(--font-size-2xs); color: var(--success); margin-top: 8px; }
.sm-node-why { font-size: 12px; color: var(--text-secondary); line-height: 1.65; margin-top: 6px; }
.sm-node-check { font-size: 11px; color: var(--text-tertiary); line-height: 1.6; margin-top: 8px; padding-left: 10px; border-left: 2px solid var(--border-hover); }
.sm-node-check b { color: var(--secondary); font-weight: 600; }
.sm-prereq { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.sm-prereq-label { font-size: 10px; color: var(--text-tertiary); letter-spacing: .03em; }
.sm-prereq-btn { font-size: 11px; padding: 3px 8px; border-radius: 999px; border: 1px dashed var(--border-hover); background: none; color: var(--text-secondary); cursor: pointer; font-family: inherit; }
.sm-prereq-btn:hover { border-style: solid; border-color: var(--secondary); color: var(--secondary); }
.sm-prereq-btn.is-done { border-color: var(--success-subtle); color: var(--text-tertiary); text-decoration: line-through; }
.sm-node.is-flash { animation: sm-flash 1.4s ease-out; }
@keyframes sm-flash { 0%,40% { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); } 100% { box-shadow: none; } }
.sm-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sm-link { font-size: 11px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); text-decoration: none; transition: border-color .15s, color .15s; }
.sm-link:hover { border-color: var(--accent); color: var(--accent); }
.sm-tool { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); font-weight: 600; }
.sm-tool:hover { background: var(--accent-dim); }
.sm-next-tag { position: absolute; top: -8px; right: 12px; font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 2px 8px; border-radius: 999px; background: var(--accent); color: var(--bg-void); }

.sm-empty { padding: 28px; text-align: center; color: var(--text-tertiary); font-size: var(--font-size-2xs); }
.sm-foot { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.sm-reset { background: none; border: 1px solid var(--border); color: var(--text-tertiary); font: inherit; font-size: 11px; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.sm-reset:hover { border-color: var(--error); color: var(--error); }

@media (prefers-reduced-motion: reduce) {
  .sm-node, .sm-bar i, .sm-track-btn, .sm-check { transition: none; }
  .sm-node.is-flash { animation: none; border-color: var(--accent); }
}

@media (max-width: 600px) {
  .sm-nodes { grid-template-columns: 1fr; }
  .sm-stage { padding-left: 20px; }
}`;
    document.head.appendChild(style);
  }

  function buildStudymap(container: HTMLElement): void {
    injectStyles();
    container.innerHTML = `<div class="sm-empty">${esc(t('studymap.loading', undefined, '지도를 펴는 중…'))}</div>`;

    /* 내용 정본은 한국어 한 벌(`studymap.json`)이고, 다른 언어는 **덧씌우는 표**로 온다
       (`studymap.<언어>.json`). 아직 안 옮긴 칸은 한국어가 그대로 보인다 — 빈 칸보다 낫고,
       무엇이 안 옮겨졌는지도 그 자리에서 드러난다. */
    const code = locale();
    const base = fetch('/apps/karmolab/data/studymap.json').then((r) => r.json());
    const over =
      code === 'ko'
        ? Promise.resolve(null)
        : fetch(`/apps/karmolab/data/studymap.${code}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);

    Promise.all([base, over])
      .then(([data, overlay]: [SmData, SmOverlay | null]) => render(container, overlay ? applyOverlay(data, overlay) : data))
      .catch(() => {
        container.innerHTML = `<div class="sm-empty">${esc(t('studymap.failed', undefined, '지도를 못 불러왔다. 새로고침해 보라.'))}</div>`;
      });
  }

  function render(container: HTMLElement, data: SmData): void {
    const tracks = data.tracks || [];
    if (tracks.length === 0) {
      container.innerHTML = `<div class="sm-empty">${esc(t('studymap.failed', undefined, '지도를 못 불러왔다. 새로고침해 보라.'))}</div>`;
      return;
    }

    const done = readDone();
    let query = '';
    let current = localStorage.getItem(TRACK_KEY) || tracks[0].id;
    if (!tracks.some((tr) => tr.id === current)) current = tracks[0].id;

    container.innerHTML = `
      <div class="sm-wrap">
        <div class="sm-head">
          <div>
            <div class="sm-title"><span class="sm-emoji" data-sm="emoji"></span><span data-sm="title"></span></div>
            <p class="sm-lead" data-sm="lead"></p>
          </div>
          <div class="sm-meter">
            <div class="sm-meter-top"><span>${esc(t('studymap.progress', undefined, '이 갈래 진도'))}</span><span><b data-sm="pdone">0</b> / <span data-sm="ptotal">0</span></span></div>
            <div class="sm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-sm="pmeter"><i data-sm="pbar" style="width:0%"></i></div>
            <div class="sm-meter-all" data-sm="pall"></div>
          </div>
        </div>
        <div class="sm-findbar">
          <button type="button" class="sm-find-btn" data-sm="findbtn" aria-expanded="false">🔎 ${esc(t('studymap.find', undefined, '찾기'))}</button>
          <input class="sm-search" type="search" name="studymap-search" data-sm="search" hidden
                 placeholder="${esc(t('studymap.search', undefined, '주제 찾기 — 예: rebase, 인덱스, 캐시'))}"
                 aria-label="${esc(t('studymap.search', undefined, '주제 찾기 — 예: rebase, 인덱스, 캐시'))}">
        </div>
        <div class="sm-body">
          <nav class="sm-tracks" data-sm="tracks" aria-label="${esc(t('studymap.tracks', undefined, '갈래'))}"></nav>
          <div class="sm-main" data-sm="stages" aria-live="polite"></div>
        </div>
        <div class="sm-foot">
          <button type="button" class="sm-reset" data-sm="export">${esc(t('studymap.export', undefined, '진도 내보내기'))}</button>
          <button type="button" class="sm-reset" data-sm="import">${esc(t('studymap.import', undefined, '진도 가져오기'))}</button>
          <button type="button" class="sm-reset" data-sm="reset">${esc(t('studymap.reset', undefined, '이 갈래 진도 지우기'))}</button>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(key: string): T => container.querySelector(`[data-sm="${key}"]`) as T;
    const elTracks = q<HTMLDivElement>('tracks');
    const elStages = q<HTMLDivElement>('stages');
    const elSearch = q<HTMLInputElement>('search');

    /* 선수 관계는 갈래를 넘는다 — id 하나로 어느 갈래의 어느 칸인지 바로 찾을 표를 만든다. */
    const whereIs = new Map<string, { node: SmNode; trackId: string }>();
    for (const tr of tracks) for (const st of tr.stages) for (const n of st.nodes) whereIs.set(n.id, { node: n, trackId: tr.id });

    const trackOf = (id: string): SmTrack => tracks.find((tr) => tr.id === id) || tracks[0];
    const nodesOf = (tr: SmTrack): SmNode[] => tr.stages.flatMap((s) => s.nodes);

    /**
     * 지도 전체를 한 줄로 편 순서. 강의 아래 「이전·다음 칸」이 갈래 끝에서 멈추지 않고
     * 다음 갈래로 이어지게 하려는 것 — 읽던 흐름이 끊기면 사람은 거기서 그만둔다.
     */
    const flatOrder: Array<{ id: string; title: string; trackId: string; stageTitle: string }> = tracks.flatMap((tr) =>
      tr.stages.flatMap((st) => st.nodes.map((n) => ({ id: n.id, title: n.title, trackId: tr.id, stageTitle: st.title }))),
    );
    const orderAt = new Map(flatOrder.map((x, i) => [x.id, i]));

    /** 마지막으로 연 강의 — 「이어서」의 근거. 화면을 닫아도 남는다. */
    const LAST_KEY = 'karmolab-studymap-last';
    const readLast = (): string => {
      try {
        return localStorage.getItem(LAST_KEY) || '';
      } catch {
        return '';
      }
    };
    const writeLast = (id: string): void => {
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {
        /* 못 적어도 지금 읽는 데는 지장 없다 */
      }
    };
    const hits = (n: SmNode): boolean => {
      if (!query) return true;
      const hay = `${n.title} ${n.why} ${n.check || ''} ${(n.links || []).map((l) => l.label).join(' ')}`.toLowerCase();
      return hay.includes(query);
    };

    function paintTracks(): void {
      let scopeMarked = false;
      elTracks.innerHTML = tracks
        .map((tr) => {
          let divider = '';
          if (tr.scope === 'personal' && !scopeMarked) {
            scopeMarked = true;
            divider = `<div class="sm-scope-line">${esc(t('studymap.scope.personal', undefined, '내 것 — 이 저장소 이야기'))}</div>`;
          }
          const all = nodesOf(tr);
          const d = all.filter((n) => done.has(n.id)).length;
          /**
           * 고른 갈래는 **그 자리에서 펼친다** — 단계와 칸 제목이 옆 목록에 그대로 보인다.
           * 지도의 어디쯤 있는지 보면서 옮겨 다니게 하려는 것(고를 때마다 본문만 갈아 끼우면 길을 잃는다).
           */
          const open = tr.id === current;
          const inner = open
            ? `<div class="sm-track-open">${tr.stages
                .map(
                  (st) => `<div class="sm-track-stage">${esc(st.title)}</div>${st.nodes
                    .map(
                      (n) =>
                        `<button type="button" class="sm-track-node${done.has(n.id) ? ' is-done' : ''}${n.id === lessonOpen ? ' is-current' : ''}" data-${lessonOpen ? 'open' : 'goto'}="${esc(n.id)}">${esc(n.title)}</button>`,
                    )
                    .join('')}`,
                )
                .join('')}</div>`
            : '';
          return `${divider}<button type="button" class="sm-track-btn${open ? ' is-on' : ''}${tr.scope === 'personal' ? ' is-personal' : ''}" data-track="${esc(tr.id)}"${open ? ' aria-current="true"' : ''} aria-expanded="${open}">
            <span>${esc(tr.emoji)}</span><span>${esc(tr.title)}</span><span class="sm-count">${d}/${all.length}</span>
          </button>${inner}`;
        })
        .join('');
    }

    /** 칸 한 장. 찾기 결과에서도 같은 카드를 쓴다 — 두 벌로 그리면 곧 어긋난다. */
    function cardHtml(n: SmNode, nextId: string | null): string {
      const isDone = done.has(n.id);
      const isNext = n.id === nextId;
      /**
       * 카드는 **제목과 한 줄 이유**까지만 — 넘어갈 기준·먼저 볼 칸·바깥 자료는 전부 강의 안으로 옮겼다.
       * 지도는 훑는 화면이라 카드마다 링크가 붙으면 눈이 갈 곳을 잃고, 링크를 누르면 사이트 밖으로 나간다.
       */
      return `<div class="sm-node${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}" data-id="${esc(n.id)}">
        ${isNext ? `<span class="sm-next-tag">${esc(t('studymap.next', undefined, '다음'))}</span>` : ''}
        <input type="checkbox" class="sm-check" name="studymap-done-${esc(n.id)}" data-node="${esc(n.id)}" ${isDone ? 'checked' : ''}
               aria-label="${esc(n.title)}">
        <div class="sm-node-body">
          <button type="button" class="sm-node-title sm-open" data-open="${esc(n.id)}">${esc(n.title)}${hasLesson.has(n.id) ? `<span class="sm-has-lesson">${esc(t('studymap.lesson.tag', undefined, '강의'))}</span>` : ''}</button>
          <div class="sm-node-why">${esc(n.why)}</div>
        </div>
      </div>`;
    }

    /** 찾기는 **지도 전체**를 본다. 갈래 안에서만 찾으면 「없다」는 답이 거짓말이 된다. */
    function searchHtml(): string {
      const groups = tracks
        .map((tr) => ({ tr, found: nodesOf(tr).filter(hits) }))
        .filter((g) => g.found.length > 0);
      if (groups.length === 0) {
        return `<div class="sm-empty">${esc(t('studymap.nohit', undefined, '지도 어디에도 그런 주제가 없다. 다른 말로 찾아 보라.'))}</div>`;
      }
      const total = groups.reduce((s, g) => s + g.found.length, 0);
      return (
        `<div class="sm-found">${esc(t('studymap.found', { n: total, tracks: groups.length }, '지도 전체에서 {n}칸 · {tracks}갈래'))}</div>` +
        groups
          .map(
            (g) => `<section class="sm-stage sm-stage-find">
              <span class="sm-stage-dot"></span>
              <div class="sm-stage-name">${esc(g.tr.emoji)} ${esc(g.tr.title)}</div>
              <div class="sm-stage-sub">${g.found.filter((n) => done.has(n.id)).length} / ${g.found.length}</div>
              <div class="sm-nodes">${g.found.map((n) => cardHtml(n, null)).join('')}</div>
            </section>`,
          )
          .join('')
      );
    }

    /* 강의는 눌렀을 때 받아 온다 — 134편을 미리 받으면 첫 화면이 죽는다.
       한 번 받은 것은 이 화면이 열려 있는 동안 다시 안 받는다. */
    const lessonCache = new Map<string, SmLesson | null>();
    let hasLesson = new Set<string>();
    void fetch('/apps/karmolab/data/lessons/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((idx) => {
        const ids = idx?.lessons?.[locale()] || [];
        if (ids.length === 0) return;
        hasLesson = new Set<string>(ids);
        if (!query) paint();
      })
      .catch(() => {
        /* 목록을 못 받아도 강의는 눌러서 열린다 — 표시만 안 붙는다 */
      });

    /**
     * 강의를 열면 브라우저 방문 기록에 한 칸을 쌓는다.
     * 마우스 「뒤로」가 강의를 닫고 지도로 돌아오게 하려는 것 —
     * 안 그러면 뒤로 버튼이 사이트 밖(홈)으로 나가 버린다.
     * 주소는 그대로 둔다(pushState 에 url 안 넘김) — 다른 위젯의 해시와 안 싸운다.
     */
    let lessonOpen: string | null = null;
    /* 목차 감시는 화면을 갈아엎을 때마다 푼다 — 안 그러면 죽은 화면을 계속 재려 든다. */
    let stopWatching: (() => void) | null = null;

    async function openLesson(id: string, viaHistory = false): Promise<void> {
      const found = whereIs.get(id);
      if (!found) return;
      if (!viaHistory) {
        try {
          history.pushState({ smLesson: id }, '');
        } catch {
          /* 기록을 못 쌓아도 강의는 열린다 — 뒤로가기만 예전처럼 동작한다 */
        }
      }
      lessonOpen = id;
      paintTracks();   /* 옆 목록에서 지금 읽는 칸이 눈에 띄게 */
      const node = found.node;
      elStages.innerHTML = `<div class="sm-empty">${esc(t('studymap.lesson.loading', undefined, '강의를 펴는 중…'))}</div>`;

      let lesson = lessonCache.get(id);
      if (lesson === undefined) {
        lesson = await fetch(`/apps/karmolab/data/lessons/${locale()}/${id}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<SmLesson>) : null))
          .catch(() => null);
        lessonCache.set(id, lesson ?? null);
      }

      writeLast(id);
      /* 빵부스러기 — 지금 지도의 어디인지. 문서 사이트에서 길을 잃지 않게 하는 최소 장치. */
      const stageTitle = flatOrder[orderAt.get(id) ?? 0]?.stageTitle || '';
      const back = `<nav class="sm-crumb"><button type="button" class="sm-crumb-btn" data-back="1">${esc(trackOf(found.trackId).title)}</button><span>›</span><span>${esc(stageTitle)}</span></nav>`;

      /* 이전·다음 칸 — 갈래 경계를 넘어 이어진다. */
      const at = orderAt.get(id) ?? -1;
      const near = (step: number): string => {
        const x = at >= 0 ? flatOrder[at + step] : undefined;
        if (!x) return '<span></span>';
        const dir = step < 0 ? t('studymap.lesson.prev', undefined, '이전') : t('studymap.lesson.next', undefined, '다음');
        return `<button type="button" class="sm-nav-btn${step < 0 ? '' : ' is-next'}" data-open="${esc(x.id)}">
          <span class="sm-nav-dir">${step < 0 ? '‹' : ''} ${esc(dir)} ${step < 0 ? '' : '›'}</span>
          <span class="sm-nav-title">${esc(x.title)}</span>
        </button>`;
      };
      const pager = `<nav class="sm-pager">${near(-1)}${near(1)}</nav>`;
      /* 도구가 붙은 칸은 **여기서 바로 해 볼 수 있다** — 읽고 끝나면 안 남는다. */
      const toolRow = node.tool ? `<a class="sm-link sm-tool" href="#${esc(node.tool.id)}">▶ ${esc(node.tool.label)}</a>` : '';
      const linkRow =
        toolRow +
        (node.links || [])
          .map((l) => `<a class="sm-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`)
          .join('');
      /* 「먼저 이것」 — 못 하면 막힌다는 뜻이 아니라, 막혔을 때 돌아갈 자리를 알려 준다. */
      const prereqRow = (node.prereq || [])
        .map((pid) => {
          const p = whereIs.get(pid);
          if (!p) return '';
          const d = done.has(pid);
          const label = `${t('studymap.prereq', undefined, '먼저')}: ${p.node.title}`;
          return `<button type="button" class="sm-prereq-btn${d ? ' is-done' : ''}" data-goto="${esc(pid)}" aria-label="${esc(label)}">${esc(p.node.title)}</button>`;
        })
        .join('');
      const prereqBlock = prereqRow
        ? `<div class="sm-prereq"><span class="sm-prereq-label">${esc(t('studymap.prereq', undefined, '먼저'))}</span>${prereqRow}</div>`
        : '';
      const checkBlock = node.check
        ? `<div class="sm-callout"><span class="sm-callout-tag">${esc(t('studymap.check', undefined, '넘어가도 될 때'))}</span>${esc(node.check)}</div>`
        : '';

      /* 아직 안 쓴 강의 — 없는 척하지 말고 「없다」고 말한다. 카드에 있던 것은 그대로 보인다. */
      if (!lesson) {
        elStages.innerHTML = `<div class="sm-lesson">${back}
          <h3>${esc(node.title)}</h3>
          <div class="sm-lesson-meta">${esc(t('studymap.lesson.none', undefined, '이 칸의 강의는 아직 준비 중이다. 아래 자료로 먼저 시작하라.'))}</div>
          <p>${esc(node.why)}</p>
          ${prereqBlock}
          ${checkBlock}
          <div class="sm-links">${linkRow}</div>
          ${pager}
        </div>`;
        return;
      }

      const body = lesson.blocks
        .map((blk) => {
          if (blk.type === 'h') return `<h4>${esc(blk.text)}</h4>`;
          if (blk.type === 'code') {
            /* 언어를 표에 적어 둔 그대로 넘긴다 — 강조는 공용 모듈이 Prism 으로 한다. */
            const lang = /^[\w-]+$/.test(blk.lang || '') ? (blk.lang as string) : 'text';
            return `<div class="sm-code">${blk.label ? `<div class="sm-code-label">${esc(blk.label)}</div>` : ''}<pre><code class="language-${esc(lang)}">${esc(blk.text)}</code></pre></div>`;
          }
          if (blk.type === 'demo') {
            const kind = blk.kind === 'js' || blk.kind === 'shader' ? blk.kind : 'html';
            const h = /^\d{2,4}px$/.test(blk.height || '') ? blk.height : '';
            return `<div class="sm-demo">${blk.label ? `<div class="sm-code-label">${esc(blk.label)}</div>` : ''}<div data-demo="${kind}"${h ? ` data-demo-height="${esc(h)}"` : ''}>${esc(blk.text)}</div></div>`;
          }
          if (blk.type === 'note' || blk.type === 'try') {
            const tag = blk.type === 'try' ? t('studymap.lesson.try', undefined, '직접 해보기') : t('studymap.lesson.note', undefined, '기억할 것');
            return `<div class="sm-callout${blk.type === 'try' ? ' is-try' : ''}"><span class="sm-callout-tag">${esc(tag)}</span>${strong(blk.text)}</div>`;
          }
          return `<p>${strong(blk.text)}</p>`;
        })
        .join('');

      const quiz = (lesson.quiz || [])
        .map(
          (item, at) => `<div class="sm-qbox" data-quiz="${at}">
            <div class="sm-qtext">${at + 1}. ${esc(item.q)}</div>
            ${item.choices
              .map(
                (choice, ci) => `<label class="sm-choice">
                  <input type="radio" name="studymap-quiz-${esc(id)}-${at}" value="${ci}">
                  <span>${esc(choice)}</span>
                </label>`,
              )
              .join('')}
            <div class="sm-why" hidden></div>
          </div>`,
        )
        .join('');

      elStages.innerHTML = `<div class="sm-lesson-wrap"><article class="sm-lesson">${back}
        <h3>${esc(node.title)}</h3>
        <div class="sm-lesson-meta">${esc(trackOf(found.trackId).title)}${lesson.minutes ? ` · ${esc(t('studymap.lesson.minutes', { n: lesson.minutes }, '약 {n}분'))}` : ''}</div>
        ${prereqBlock}
        ${body}
        ${checkBlock}
        ${quiz ? `<h4>${esc(t('studymap.lesson.quiz', undefined, '확인 문제'))}</h4><div class="sm-quiz" data-lesson="${esc(id)}">${quiz}</div>` : ''}
        <div class="sm-links" style="margin-top:18px">${linkRow}</div>
        ${pager}
      </article></div>`;

      /* 코드 강조·복사도 문서 위젯과 같은 모듈로 — 강의는 코드가 본체다. */
      const lessonBody = elStages.querySelector('.sm-lesson');
      if (lessonBody instanceof HTMLElement) {
        addCopyButtons(lessonBody, t('studymap.copy', undefined, '복사'), t('studymap.copied', undefined, '복사됨'));
        mountDemos(lessonBody, {
          run: t('studymap.demo.run', undefined, '다시 그리기'),
          reset: t('studymap.demo.reset', undefined, '되돌리기'),
          code: t('studymap.demo.code', undefined, '예제 코드'),
          result: t('studymap.demo.result', undefined, '실행 결과'),
        });
        void highlightCode(lessonBody);
      }

      /* 목차는 공용 모듈이 만든다 — 문서 위젯과 같은 규칙을 쓰려고(SSOT). */
      const article = elStages.querySelector('.sm-lesson');
      const wrap = elStages.querySelector('.sm-lesson-wrap');
      if (article instanceof HTMLElement && wrap instanceof HTMLElement) {
        const heads = collectHeadings(article, { selector: 'h4', prefix: `sm-${id}-`, min: 3 });
        if (heads.length > 0) {
          wrap.insertAdjacentHTML('beforeend', tocHtml(heads, t('studymap.lesson.toc', undefined, '목차')));
          const tocRoot = wrap.querySelector('.doc-toc');
          if (tocRoot instanceof HTMLElement) {
            bindTocClicks(tocRoot, article);
            stopWatching?.();
            stopWatching = watchReading(article, tocRoot, heads);
          }
        }
      }

      /* 채점은 고르는 즉시. 다 맞히면 그 칸은 저절로 체크된다 — 「읽었다」가 아니라 「됐다」가 기준. */
      const quizRoot = elStages.querySelector('[data-lesson]');
      const items = lesson.quiz || [];
      if (quizRoot instanceof HTMLElement && items.length > 0) {
        quizRoot.addEventListener('change', (e) => {
          const input = e.target as HTMLInputElement;
          const box = input.closest('[data-quiz]') as HTMLElement | null;
          if (!box) return;
          const item = items[Number(box.dataset.quiz)];
          const picked = Number(input.value);
          box.querySelectorAll('.sm-choice').forEach((el, ci) => {
            el.classList.toggle('is-right', ci === item.answer);
            el.classList.toggle('is-wrong', ci === picked && picked !== item.answer);
          });
          const why = box.querySelector('.sm-why');
          if (why instanceof HTMLElement && item.why) {
            why.textContent = item.why;
            why.hidden = false;
          }
          const cleared = [...quizRoot.querySelectorAll('[data-quiz]')].every((qb) => {
            const chosen = qb.querySelector('input:checked') as HTMLInputElement | null;
            return chosen !== null && Number(chosen.value) === items[Number((qb as HTMLElement).dataset.quiz)].answer;
          });
          if (cleared && !done.has(id)) {
            done.add(id);
            writeDone(done);
            const msg = document.createElement('div');
            msg.className = 'sm-quiz-done';
            msg.textContent = t('studymap.lesson.cleared', undefined, '다 맞혔다 — 이 칸은 끝난 것으로 표시했다.');
            quizRoot.appendChild(msg);
            if (typeof Mdd !== 'undefined' && Mdd.linePreset) {
              Mdd.linePreset('success', { msg: t('studymap.mdd.step', undefined, '한 칸 나아갔어요.') });
            }
          }
        });
      }
    }

    function paint(): void {
      lessonOpen = null;
      stopWatching?.();
      stopWatching = null;
      const tr = trackOf(current);
      const all = nodesOf(tr);
      const d = all.filter((n) => done.has(n.id)).length;
      const everyNode = tracks.flatMap(nodesOf);
      const everyDone = everyNode.filter((n) => done.has(n.id)).length;

      q<HTMLElement>('emoji').textContent = tr.emoji;
      const titleEl = q<HTMLElement>('title');
      titleEl.textContent = tr.title;
      if (tr.scope === 'personal') {
        const badge = document.createElement('span');
        badge.className = 'sm-badge';
        badge.textContent = t('studymap.scope.badge', undefined, '내 것');
        titleEl.appendChild(badge);
      }
      q<HTMLElement>('lead').textContent = tr.lead;
      q<HTMLElement>('pdone').textContent = String(d);
      q<HTMLElement>('ptotal').textContent = String(all.length);
      const pct = all.length ? Math.round((d / all.length) * 100) : 0;
      q<HTMLElement>('pbar').style.width = `${pct}%`;
      const meter = q<HTMLElement>('pmeter');
      meter.setAttribute('aria-valuenow', String(pct));
      meter.setAttribute('aria-label', t('studymap.progress', undefined, '이 갈래 진도'));
      q<HTMLElement>('pall').textContent = t('studymap.all', { done: everyDone, total: everyNode.length }, '지도 전체 {done} / {total}');

      /* 「다음 한 칸」 = 아직 안 한 첫 노드. 지도를 열자마자 할 일이 하나 보여야 한다. */
      const next = all.find((n) => !done.has(n.id));

      if (query) {
        elStages.innerHTML = searchHtml();
        paintTracks();
        return;
      }

      elStages.innerHTML = tr.stages
        .map((st) => {
          const clear = st.nodes.every((n) => done.has(n.id));
          const sd = st.nodes.filter((n) => done.has(n.id)).length;
          const cards = st.nodes.map((n) => cardHtml(n, next ? next.id : null)).join('');
          return `<section class="sm-stage${clear ? ' is-clear' : ''}">
            <span class="sm-stage-dot"></span>
            <div class="sm-stage-name">${esc(st.title)}</div>
            <div class="sm-stage-sub">${sd} / ${st.nodes.length}</div>
            <div class="sm-nodes">${cards}</div>
          </section>`;
        })
        .join('');
      paintTracks();
    }

    elTracks.addEventListener('click', (e) => {
      /* 펼쳐진 목록의 칸을 누르면 본문에서 그 칸을 비춘다 — 지도 안에서 길을 잃지 않게. */
      const goto = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
      if (goto) {
        const id = goto.dataset.goto || '';
        const card = elStages.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (card instanceof HTMLElement) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('is-flash');
          setTimeout(() => card.classList.remove('is-flash'), 1500);
        }
        return;
      }
      const btn = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null;
      if (!btn) return;
      current = btn.dataset.track || current;
      try {
        localStorage.setItem(TRACK_KEY, current);
      } catch {
        /* 저장 못 해도 이번 화면은 바뀐다 */
      }
      paint();
    });

    /* 뒤로/앞으로 — 우리가 쌓은 칸이면 강의를 열고 닫는다. 남의 기록이면 손대지 않는다. */
    window.addEventListener('popstate', (e) => {
      const st = e.state as { smLesson?: string } | null;
      if (st?.smLesson) {
        if (st.smLesson !== lessonOpen) void openLesson(st.smLesson, true);
        return;
      }
      if (lessonOpen) paint();
    });

    elStages.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const open = target.closest('[data-open]') as HTMLElement | null;
      if (open) {
        void openLesson(open.dataset.open || '');
        return;
      }
      if (target.closest('[data-back]')) {
        /* 화면의 「지도로」도 뒤로가기와 같은 길로 — 기록에 빈 칸이 남지 않게 */
        if (lessonOpen && (history.state as { smLesson?: string } | null)?.smLesson) history.back();
        else paint();
        return;
      }
      const btn = target.closest('[data-goto]') as HTMLElement | null;
      if (!btn) return;
      const id = btn.dataset.goto || '';
      const found = whereIs.get(id);
      if (!found) return;
      current = found.trackId;
      query = '';
      elSearch.value = '';
      paint();
      const card = elStages.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-flash');
        setTimeout(() => card.classList.remove('is-flash'), 1500);
      }
    });

    elStages.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const id = box.dataset?.node;
      if (!id) return;
      if (box.checked) done.add(id);
      else done.delete(id);
      writeDone(done);
      paint();
      if (box.checked && typeof Mdd !== 'undefined' && Mdd.linePreset) {
        const all = nodesOf(trackOf(current));
        const cleared = all.every((n) => done.has(n.id));
        Mdd.linePreset('success', {
          msg: cleared
            ? t('studymap.mdd.clear', undefined, '한 갈래를 끝까지 걸었어요. 다음 갈래 가 볼까요?')
            : t('studymap.mdd.step', undefined, '한 칸 나아갔어요.'),
        });
      }
    });

    const elFindBtn = q<HTMLButtonElement>('findbtn');
    /* 접기·펴기. 펴면 바로 커서가 들어가고, 비운 채 접으면 지도로 돌아온다. */
    function showSearch(on: boolean): void {
      elSearch.hidden = !on;
      elFindBtn.setAttribute('aria-expanded', String(on));
      if (on) elSearch.focus();
      else if (query) {
        query = '';
        elSearch.value = '';
        paint();
      }
    }
    elFindBtn.addEventListener('click', () => showSearch(elSearch.hidden));
    elSearch.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') showSearch(false);
    });

    elSearch.addEventListener('input', () => {
      query = elSearch.value.trim().toLowerCase();
      paint();
    });

    /* 진도는 이 브라우저에만 있다 — 기기를 바꾸면 사라진다. 서버를 두는 대신
       **한 줄로 들고 다니게** 한다(가입 없이 옮기는 가장 싼 방법). */
    q<HTMLButtonElement>('export').addEventListener('click', () => {
      const code = [...done].join(' ');
      if (!code) {
        alert(t('studymap.export.empty', undefined, '아직 체크한 칸이 없다.'));
        return;
      }
      if (typeof Toolbox !== 'undefined' && Toolbox.copyText) {
        Toolbox.copyText(code, { message: t('studymap.export.done', undefined, '진도를 복사했다. 다른 기기에서 「진도 가져오기」에 붙여 넣어라.') });
        return;
      }
      prompt(t('studymap.export.done', undefined, '진도를 복사했다. 다른 기기에서 「진도 가져오기」에 붙여 넣어라.'), code);
    });

    q<HTMLButtonElement>('import').addEventListener('click', () => {
      const raw = prompt(t('studymap.import.ask', undefined, '내보낸 진도를 붙여 넣어라. (지금 진도에 더해진다)'));
      if (raw == null) return;
      const known = new Set(tracks.flatMap(nodesOf).map((n) => n.id));
      const ids = raw.split(/[\s,]+/).map((v) => v.trim()).filter((v) => known.has(v));
      if (ids.length === 0) {
        alert(t('studymap.import.bad', undefined, '알아볼 수 있는 칸이 없다. 내보내기로 만든 글만 된다.'));
        return;
      }
      ids.forEach((id) => done.add(id));
      writeDone(done);
      paint();
      alert(t('studymap.import.done', { n: ids.length }, '{n}칸을 가져왔다.'));
    });

    q<HTMLButtonElement>('reset').addEventListener('click', () => {
      const all = nodesOf(trackOf(current));
      if (!all.some((n) => done.has(n.id))) return;
      if (!confirm(t('studymap.reset.confirm', undefined, '이 갈래의 체크를 전부 지운다. 계속할까?'))) return;
      all.forEach((n) => done.delete(n.id));
      writeDone(done);
      paint();
    });

    paint();
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('studymap'),
    tabs: [
      {
        id: 'studymap',
        label: t('studymap.tab', undefined, '스터디 맵'),
        build: function (container: HTMLElement): void {
          void loadNamespace('studymap').then(function () {
            buildStudymap(container);
          });
        },
      },
    ],
  });
})();
