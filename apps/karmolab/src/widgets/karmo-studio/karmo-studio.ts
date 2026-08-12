/** Karmo Studio — KarmoLab 안에서 곡을 끝까지 만드는 브라우저 DAW (TASK-KL-220). */
import { KarmoStudioEngine, renderProject, type StudioAssetRuntime } from './audio-engine';
import {
  automationValueAt, cloneClip, findClip, findTrack, legatoNotes, newProject, newTrack, normalizeProject, projectLength, putAutomationPoint, quantizeNotes, setNoteVelocity, snapBeat, splitClip, studioId, transposeNotes,
  type StudioClip, type StudioProject, type StudioSelection, type StudioTrack
} from './model';
import { toWav } from '../tools/shared/media';
import { addAsset, hydrateAssets, importPortable, loadProject, portableProject, saveProject } from './storage';
import { ProjectHistory } from './history';
import { analysePeak, applyGain, clampBuffer, exportRange, normalizeGain, type ExportRangeMode } from './export';
import { clipMarks, dragRect, isBoxDrag, markMode, noteMarks, rectOverlaps, type ClipRef, type NoteRef } from './selection';

(function (): void {
  const esc = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const icon = '<path d="M3 17V7M7 20V4M11 15V9M15 19V5M19 14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 12h20" stroke="currentColor" stroke-width="1" opacity=".35"/>';

  Mdd.injectCSS('karmo-studio', `
    .ks-root { --ks-head:172px; --ks-beat:72px; display:flex; flex-direction:column; width:100%; user-select:none;
      height:calc(100dvh - 150px); min-height:620px; overflow:hidden; background:var(--bg-primary); color:var(--text-primary); }
    .ks-root input,.ks-root textarea { user-select:text; }
    .ks-toolbar { display:flex; align-items:center; gap:6px; padding:7px 9px; flex-wrap:wrap; flex:none;
      border-bottom:1px solid var(--border); background:var(--bg-secondary); position:relative; z-index:8; }
    .ks-toolbar > * { width:auto; flex:0 0 auto; margin:0; }
    .ks-brand { font:700 12px/1 var(--font-mono); letter-spacing:.13em; margin-right:5px; color:var(--accent); }
    .ks-btn { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-tertiary); color:var(--text-primary);
      min-height:30px; padding:4px 9px; font:11px var(--font-mono); cursor:pointer; }
    .ks-btn:hover { border-color:var(--border-hover); background:var(--bg-hover); }
    .ks-btn.is-on, .ks-btn.is-recording { color:var(--accent-hover); background:var(--accent-dim); border-color:var(--accent); }
    .ks-btn.is-recording { color:#ff7a86; }
    .ks-project-name { width:150px !important; border:0; background:transparent; color:var(--text-primary); font-weight:650; padding:4px; }
    .ks-number { width:58px !important; padding:5px; background:var(--bg-primary); color:var(--text-primary); border:1px solid var(--border); border-radius:var(--radius-sm); }
    .ks-time { min-width:82px; font:12px var(--font-mono); text-align:center; color:var(--text-secondary); }
    .ks-spacer { flex:1 1 20px !important; }
    .ks-work { display:grid; grid-template-columns:minmax(0, 1fr) 260px; min-height:0; flex:1; }
    .ks-arranger { min-width:0; min-height:0; display:flex; flex-direction:column; }
    .ks-scroll { position:relative; overflow:auto; min-height:0; flex:1; background:var(--bg-tertiary); }
    .ks-ruler { position:sticky; top:0; z-index:7; height:30px; min-width:100%; background:var(--bg-secondary); border-bottom:1px solid var(--border); }
    .ks-ruler { cursor:text; }
    .ks-loop { cursor:grab; }
    .ks-loop-grip { position:absolute; top:0; bottom:0; width:7px; left:0; cursor:ew-resize; background:var(--accent); opacity:.85; border-radius:2px; }
    .ks-loop-grip.is-end { left:auto; right:0; }
    .ks-ruler-head { position:sticky; left:0; z-index:2; width:var(--ks-head); height:30px; border-right:1px solid var(--border); background:var(--bg-secondary); }
    .ks-mark { position:absolute; top:0; height:30px; border-left:1px solid var(--border); color:var(--text-tertiary); font:10px var(--font-mono); padding:5px; }
    .ks-track-row { display:grid; grid-template-columns:var(--ks-head) auto; min-height:84px; border-bottom:1px solid var(--border); }
    .ks-track-head { position:sticky; left:0; z-index:5; padding:7px; border-right:1px solid var(--border); background:var(--bg-secondary); }
    .ks-track-title { display:flex; align-items:center; gap:5px; }
    .ks-track-color { width:9px; height:9px; border-radius:50%; flex:none; }
    .ks-track-title input { min-width:0; width:100%; border:0; padding:2px; background:transparent; color:var(--text-primary); font-size:12px; }
    .ks-track-actions { display:flex; gap:3px; margin:5px 0; }
    .ks-mini { width:25px; height:23px; padding:0; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary); border-radius:4px; font:10px var(--font-mono); cursor:pointer; }
    .ks-mini.is-on { background:var(--accent-dim); color:var(--accent-hover); border-color:var(--accent); }
    .ks-track-head input[type=range] { width:72px; height:14px; margin:0; accent-color:var(--accent); }
    .ks-lane { position:relative; height:84px; background-image:linear-gradient(to right, var(--border) 1px, transparent 1px);
      background-size:var(--ks-beat) 100%; }
    .ks-lane::after { content:""; position:absolute; inset:0; pointer-events:none; background-image:linear-gradient(to right, transparent calc(100% - 1px), color-mix(in srgb, var(--border) 55%, transparent) 1px); background-size:calc(var(--ks-beat) / 4) 100%; opacity:.45; }
    .ks-clip { position:absolute; top:9px; height:64px; min-width:8px; border:1px solid color-mix(in srgb, var(--clip) 80%, white);
      border-radius:5px; background:color-mix(in srgb, var(--clip) 42%, var(--bg-secondary)); overflow:hidden; cursor:grab; z-index:2; user-select:none; }
    .ks-root[data-tool="slice"] .ks-clip { cursor:col-resize; }
    .ks-root[data-tool="select"] .ks-lane { cursor:default; }
    .ks-root[data-tool="draw"] .ks-lane[data-kind="midi"] { cursor:crosshair; }
    .ks-clip.is-selected { outline:2px solid var(--text-primary); outline-offset:1px; }
    .ks-clip-name { height:20px; padding:3px 7px; background:color-mix(in srgb, var(--clip) 58%, transparent); font:10px var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ks-midi-notes { position:absolute; inset:23px 5px 5px; }
    .ks-midi-note { position:absolute; height:4px; border-radius:2px; background:color-mix(in srgb, var(--clip) 55%, white); }
    .ks-wave-svg { position:absolute; inset:23px 4px 4px; width:calc(100% - 8px); height:calc(100% - 27px); overflow:visible; color:color-mix(in srgb,var(--clip) 52%,white); }
    .ks-wave-svg path { fill:none; stroke:currentColor; stroke-width:1; vector-effect:non-scaling-stroke; }
    .ks-wave-missing { position:absolute; inset:26px 6px 5px; display:grid; place-items:center; color:var(--text-tertiary); font:9px var(--font-mono); }
    .ks-audio-editor { flex:1; min-height:0; position:relative; display:flex; flex-direction:column; padding:16px; gap:12px; }
    .ks-audio-wave { position:relative; flex:1; min-height:110px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-tertiary); overflow:hidden; }
    .ks-audio-wave .ks-wave-svg { inset:12px; width:calc(100% - 24px); height:calc(100% - 24px); }
    .ks-audio-zero { position:absolute; left:0; right:0; top:50%; border-top:1px solid var(--border-hover); opacity:.55; }
    .ks-audio-controls { display:grid; grid-template-columns:repeat(4,minmax(110px,1fr)); gap:10px; }
    .ks-audio-controls .ks-field { grid-template-columns:70px minmax(0,1fr); }
    .ks-handle { position:absolute; top:0; right:0; width:8px; height:100%; cursor:ew-resize; background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--clip) 70%,white)); }
    .ks-playhead { position:absolute; top:30px; bottom:0; width:1px; background:#ff5d6c; z-index:6; pointer-events:none; box-shadow:0 0 5px #ff5d6c; }
    .ks-auto { position:relative; height:46px; border-top:1px dashed var(--border); background:color-mix(in srgb,var(--bg-secondary) 60%,transparent); cursor:crosshair; }
    .ks-auto svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
    .ks-auto path { fill:none; stroke:var(--accent); stroke-width:1.5; }
    .ks-auto i { position:absolute; width:9px; height:9px; margin:-5px 0 0 -5px; border-radius:50%; background:var(--accent); border:1px solid var(--bg-primary); cursor:grab; }
    .ks-auto-tag { position:absolute; left:4px; top:2px; font:9px var(--font-mono); color:var(--text-tertiary); pointer-events:none; }
    .ks-lane.is-drop { box-shadow:inset 0 0 0 2px var(--accent); }
    .ks-export { position:fixed; left:50%; top:12%; transform:translateX(-50%); z-index:1000; width:min(420px,92vw); padding:14px; border:1px solid var(--border-hover); border-radius:8px; background:var(--bg-secondary); box-shadow:0 18px 40px rgba(0,0,0,.45); display:grid; gap:8px; }
    .ks-export h4 { margin:0; font:12px var(--font-mono); color:var(--text-secondary); letter-spacing:.08em; }
    .ks-export label { display:flex; align-items:center; justify-content:space-between; gap:10px; font:11px var(--font-mono); color:var(--text-tertiary); }
    .ks-export select, .ks-export input { font:11px var(--font-mono); }
    .ks-export-note { font:10px var(--font-mono); color:var(--text-tertiary); line-height:1.5; }
    .ks-export-actions { display:flex; gap:6px; justify-content:flex-end; }
    .ks-piano-tools { flex:none; display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:4px 8px; border-bottom:1px solid var(--border); background:var(--bg-secondary); }
    .ks-piano-tools label { display:flex; align-items:center; gap:4px; color:var(--text-tertiary); font:10px var(--font-mono); }
    .ks-velocity { position:relative; height:56px; border-top:1px solid var(--border); background:var(--bg-tertiary); overflow:hidden; flex:none; }
    .ks-velocity-scale { position:absolute; left:0; top:0; bottom:0; width:68px; border-right:1px solid var(--border); color:var(--text-tertiary); font:9px var(--font-mono); padding:3px 5px; pointer-events:none; }
    .ks-vel { position:absolute; bottom:0; width:6px; background:var(--accent); opacity:.55; cursor:ns-resize; border-radius:2px 2px 0 0; }
    .ks-vel.is-selected { opacity:1; outline:1px solid white; }
    .ks-band { position:absolute; z-index:7; pointer-events:none; border:1px solid var(--accent); background:color-mix(in srgb, var(--accent) 18%, transparent); border-radius:2px; }
    .ks-playhead::before { content:""; position:absolute; top:-5px; left:-4px; border:5px solid transparent; border-top-color:#ff5d6c; }
    .ks-loop { position:absolute; top:0; height:4px; background:var(--accent); opacity:.8; z-index:3; }
    .ks-side { min-height:0; border-left:1px solid var(--border); background:var(--bg-secondary); display:flex; flex-direction:column; }
    .ks-side-tabs { display:flex; border-bottom:1px solid var(--border); flex:none; }
    .ks-side-tabs button { flex:1; border:0; border-right:1px solid var(--border); border-radius:0; }
    .ks-side-body { overflow:auto; padding:10px; min-height:0; }
    .ks-section { margin-bottom:14px; }
    .ks-section h4 { margin:0 0 7px; font:10px var(--font-mono); letter-spacing:.1em; color:var(--text-tertiary); }
    .ks-field { display:grid; grid-template-columns:82px minmax(0,1fr); align-items:center; gap:7px; margin:5px 0; font-size:11px; color:var(--text-secondary); }
    .ks-field input,.ks-field select { min-width:0; width:100%; margin:0; padding:5px; border:1px solid var(--border); border-radius:4px; background:var(--bg-primary); color:var(--text-primary); }
    .ks-field input[type=range] { padding:0; accent-color:var(--accent); }
    .ks-meter { position:relative; height:9px; background:var(--bg-tertiary); border-radius:5px; overflow:hidden; }
    .ks-meter span { position:absolute; left:0; top:0; bottom:0; width:0; background:linear-gradient(90deg,var(--accent),#e3c15a 78%,#ff6b76 100%); transition:width .05s linear; }
    .ks-meter i { position:absolute; top:0; bottom:0; width:2px; background:white; opacity:.85; left:0; }
    .ks-meter b { position:absolute; right:0; top:0; bottom:0; width:7px; background:#ff5d6c; opacity:0; }
    .ks-meter.is-clipped b { opacity:1; }
    .ks-meter-row { display:flex; align-items:center; gap:6px; }
    .ks-meter-row .ks-meter { flex:1; }
    .ks-meter-db { min-width:52px; text-align:right; font:9px var(--font-mono); color:var(--text-tertiary); }
    .ks-editor { flex:none; height:300px; border-top:1px solid var(--border); background:var(--bg-primary); display:flex; flex-direction:column; }
    .ks-editor.is-expanded { position:fixed; inset:5dvh 3vw; width:auto; height:auto; z-index:1000;
      border:1px solid var(--border-hover); border-radius:var(--radius-md); box-shadow:0 18px 70px rgba(0,0,0,.72); }
    .ks-modal-backdrop { display:none; position:fixed; inset:0; z-index:999; background:rgba(0,0,0,.64); }
    .ks-modal-backdrop.is-open { display:block; }
    .ks-context { position:fixed; z-index:1100; min-width:180px; padding:5px; border:1px solid var(--border-hover);
      border-radius:var(--radius-sm); background:var(--bg-secondary); box-shadow:0 12px 36px rgba(0,0,0,.55); }
    .ks-context[hidden] { display:none; }
    .ks-context button { display:block; width:100%; padding:7px 10px; border:0; border-radius:var(--radius-sm);
      background:transparent; color:var(--text-primary); text-align:left; font:11px var(--font-mono); cursor:pointer; }
    .ks-context button:hover,.ks-context button:focus-visible { background:var(--bg-hover); outline:none; }
    .ks-editor-head { height:30px; display:flex; align-items:center; gap:8px; padding:4px 8px; border-bottom:1px solid var(--border); font:11px var(--font-mono); }
    .ks-piano { flex:1 1 0; min-height:96px; overflow:auto; position:relative; background:repeating-linear-gradient(to bottom,var(--bg-secondary) 0 15px,var(--border) 16px),repeating-linear-gradient(to right,transparent 0 calc(var(--ks-beat) / 4 - 1px),var(--border) calc(var(--ks-beat) / 4)); }
    .ks-key { position:absolute; left:0; width:68px; height:16px; border:1px solid var(--border); border-top:0;
      background:#e8e8e4; color:#25252b; font:9px var(--font-mono); padding:2px 5px; z-index:4; }
    .ks-key.is-black { width:45px; background:#25252b; color:#d8d8d3; border-color:#111; z-index:5; }
    .ks-piano-ruler { position:absolute; top:0; left:68px; height:24px; z-index:3; background:var(--bg-secondary); border-bottom:1px solid var(--border); }
    .ks-piano-bar { position:absolute; top:0; height:24px; border-left:1px solid var(--border-hover); padding:4px 6px; color:var(--text-tertiary); font:9px var(--font-mono); }
    .ks-note { position:absolute; height:12px; border-radius:2px; background:var(--accent); cursor:grab; min-width:5px; z-index:3; }
    .ks-note-handle { position:absolute; right:0; top:0; bottom:0; width:7px; cursor:ew-resize; background:rgba(255,255,255,.36); border-radius:0 2px 2px 0; }
    .ks-note.is-selected { outline:1px solid white; }
    .ks-empty { padding:18px 8px; text-align:center; color:var(--text-tertiary); font-size:11px; line-height:1.6; }
    .ks-status { margin-left:auto; max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-tertiary); font:10px var(--font-mono); }
    @media(max-width:850px) { .ks-root{height:auto;min-height:720px}.ks-work{grid-template-columns:1fr}.ks-side{border-left:0;border-top:1px solid var(--border);max-height:250px}.ks-scroll{height:420px}.ks-editor{height:290px}.ks-editor.is-expanded{inset:2dvh 2vw;height:auto}.ks-audio-controls{grid-template-columns:1fr 1fr}.ks-toolbar .ks-status{display:none} }
  `);

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('karmo-studio') || {}), id: 'karmo-studio', title: 'Karmo Studio', category: 'lab',
    desc: '녹음부터 편곡·믹싱·WAV 출력까지 한 프로젝트에서 완성하는 브라우저 DAW', layout: 'full', icon,
    accepts: ['audio/*', 'application/json'], produces: ['audio/wav', 'application/json'],
    tabs: [{ id: 'app', label: 'Karmo Studio', build(container: HTMLElement): void { buildStudio(container); } }]
  });

  function buildStudio(container: HTMLElement): void {
    let project = loadProject() || newProject();
    let selection: StudioSelection = { type: 'clip', trackId: project.tracks[0].id, clipId: project.tracks[0].clips[0].id };
    let playhead = 0; let pxPerBeat = 72; let sideMode: 'inspector' | 'mixer' = 'inspector';let editTool:'draw'|'select'|'slice'='draw'; let assets = new Map<string, StudioAssetRuntime>();
    let raf: number | undefined; let saveTimer: number | undefined; let recording: MediaRecorder | null = null; let recordChunks: Blob[] = []; let recordStart = 0;
    let armedTrackId=''; let metronome=false; let countIn=false; const autoLanes=new Set<string>();
    let exportOptions={range:'song' as ExportRangeMode,sampleRate:44100,mono:false,normalize:true};
    let editorExpanded = false; let editorScrollTop = 0; let editorScrollLeft = 0; let editorClipId = ''; let pianoPxPerBeat = pxPerBeat;
    let editorReturnFocus: HTMLElement | null = null; let cancelActiveGesture: (()=>void) | null = null;
    /** 묶음 clipboard — 상대 간격을 보존하려고 기준점(origin)을 함께 들고 있는다. */
    let clipboard:
      |{type:'clips';origin:number;items:{sourceTrackId:string;kind:StudioTrack['kind'];clip:StudioClip}[]}
      |{type:'notes';origin:number;notes:StudioClip['notes']}
      |null=null;
    const engine = new KarmoStudioEngine();
    const history = new ProjectHistory(project, normalizeProject);
    const marks = clipMarks();
    /** marks 는 arranger 에서 실제로 표시된 clip 묶음. focus(selection) 가 묶음 밖으로 나가면 그 하나로 접힌다. */
    function reconcileMarks(): void { marks.prune((ref)=>Boolean(findClip(project,ref.trackId,ref.clipId))); if(selection&&(selection.type==='clip'||selection.type==='note')){const ref={trackId:selection.trackId,clipId:selection.clipId};if(!marks.has(ref))marks.replace([ref]);}else marks.clear(); }
    function markedRefs(): ClipRef[] { reconcileMarks(); return marks.list(); }
    function markedClips(): { track: StudioTrack; clip: StudioClip }[] { return markedRefs().flatMap((ref)=>{const track=findTrack(project,ref.trackId);const clip=findClip(project,ref.trackId,ref.clipId);return track&&clip?[{track,clip}]:[];}); }
    const noteSel = noteMarks();
    /** piano roll 은 clip 하나만 그린다 — 편집 중인 clip 밖의 note 표시는 살려 둘 이유가 없다. */
    function reconcileNotes(): void { const clip=selectedClip(); noteSel.prune((ref)=>Boolean(clip&&ref.clipId===clip.id&&clip.notes.some((note)=>note.id===ref.noteId))); if(selection?.type==='note'){const ref={clipId:selection.clipId,noteId:selection.noteId};if(!noteSel.has(ref))noteSel.replace([ref]);}else noteSel.clear(); }
    function markedNotes(): { clip: StudioClip; note: StudioClip['notes'][number] }[] { reconcileNotes(); const clip=selectedClip(); if(!clip)return []; return noteSel.list().flatMap((ref)=>{const note=clip.notes.find((item)=>item.id===ref.noteId);return note?[{clip,note}]:[];}); }
    /** 도구가 손댈 음 — 고른 게 있으면 그것만, 없으면 클립 전체. */
    function noteTargets(): { clip: StudioClip; notes: StudioClip['notes'] } | null {
      const clip=selectedClip();if(!clip||clip.kind!=='midi')return null;
      const marked=markedNotes().map((item)=>item.note);
      return { clip, notes: marked.length?marked:clip.notes };
    }
    function applyNoteTool(act: string): void {
      const target=noteTargets();
      if(!target||!target.notes.length){status('Open a MIDI clip first');return;}
      const { clip, notes }=target;const scope=notes.length===clip.notes.length?'clip':`${notes.length} notes`;
      if(act==='quantize'||act==='quantize-half'){
        const moved=quantizeNotes(notes,project.snap,act==='quantize'?1:0.5);
        status(moved?`Quantized ${moved} of ${scope}`:'Already on the grid');
      } else if(act==='legato'){
        const changed=legatoNotes(notes,clip.duration);
        status(changed?`Legato · ${changed} notes`:'Nothing to stretch');
      } else {
        const step=act==='up'?1:act==='down'?-1:act==='octave-up'?12:-12;
        const moved=transposeNotes(notes,step,36,84);
        status(moved?`Transposed ${scope} by ${moved > 0?'+':''}${moved}`:'Pitch range reached');
      }
      for(const note of notes)note.beat=Math.max(0,Math.min(clip.duration-note.duration,note.beat));
      saveSoon(`note-tool:${act}`);renderEditor();renderTracks();renderSide();
    }

    container.innerHTML = `<div class="ks-root">
      <div class="ks-toolbar">
        <span class="ks-brand">KARMO STUDIO</span><button class="ks-btn" data-act="new">NEW</button><button class="ks-btn" data-act="open">OPEN</button><button class="ks-btn" data-act="save">SAVE</button><button class="ks-btn" data-act="undo" title="실행 취소 (Ctrl+Z)">↶</button><button class="ks-btn" data-act="redo" title="다시 실행 (Ctrl+Y)">↷</button>
        <input class="ks-project-name" data-bind="project-name" aria-label="프로젝트 이름">
        <button class="ks-btn" data-act="back" aria-label="처음으로">|◀</button><button class="ks-btn" data-act="play" aria-label="재생">▶</button><button class="ks-btn" data-act="stop" aria-label="정지">■</button><button class="ks-btn" data-act="record" aria-label="마이크 녹음">● REC</button><button class="ks-btn" data-act="metronome" title="박자 소리 (마디 첫 박은 높게)">🎵 CLICK</button><button class="ks-btn" data-act="count-in" title="녹음 전에 한 마디 세어 준다">COUNT-IN</button>
        <span class="ks-time" data-role="time">1.1.00</span><label>BPM <input class="ks-number" data-bind="bpm" type="number" min="30" max="300"></label><label>METER <select class="ks-number" data-bind="meter"><option value="3">3/4</option><option value="4">4/4</option><option value="5">5/4</option><option value="6">6/4</option><option value="7">7/4</option></select></label>
        <label>SNAP <select class="ks-number" data-bind="snap"><option value="1">1</option><option value="0.5">1/2</option><option value="0.25">1/4</option><option value="0.125">1/8</option><option value="0.0625">1/16</option></select></label>
        <button class="ks-btn is-on" data-tool="draw" title="그리기 (P)">✎ DRAW</button><button class="ks-btn" data-tool="select" title="선택 (E)">□ SELECT</button><button class="ks-btn" data-tool="slice" title="자르기 (C)">╱ SLICE</button>
        <button class="ks-btn" data-act="loop">LOOP</button><button class="ks-btn" data-act="audio">+ AUDIO</button><button class="ks-btn" data-act="midi">+ MIDI</button><button class="ks-btn" data-act="import-audio">IMPORT AUDIO</button>
        <button class="ks-btn" data-act="cut" title="잘라내기 (Ctrl+X)">CUT</button><button class="ks-btn" data-act="copy" title="복사 (Ctrl+C)">COPY</button><button class="ks-btn" data-act="paste" title="붙여넣기 (Ctrl+V)">PASTE</button>
        <span class="ks-spacer"></span><button class="ks-btn" data-act="zoom-out">−</button><button class="ks-btn" data-act="zoom-in">＋</button><button class="ks-btn" data-act="export-wav">EXPORT WAV</button><span class="ks-status" data-role="status">Ready</span>
      </div>
      <div class="ks-work"><div class="ks-arranger"><div class="ks-scroll" data-role="scroll"><div class="ks-ruler" data-role="ruler"></div><div data-role="tracks"></div><div class="ks-playhead" data-role="playhead"></div><div class="ks-band" data-role="band" hidden></div></div><div class="ks-editor" data-role="editor"></div></div>
      <aside class="ks-side"><div class="ks-side-tabs"><button class="ks-btn is-on" data-side="inspector">INSPECTOR</button><button class="ks-btn" data-side="mixer">MIXER</button></div><div class="ks-side-body" data-role="side"></div></aside></div>
      <div class="ks-modal-backdrop" data-role="backdrop"></div><div data-role="export"></div><div class="ks-context" data-role="context" role="menu" hidden></div>
      <input type="file" data-file="audio" accept="audio/*" multiple hidden><input type="file" data-file="project" accept="application/json,.json" hidden>
    </div>`;
    const root = container.querySelector('.ks-root') as HTMLElement;
    const $ = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
    const status = (message: string): void => { $<HTMLElement>('[data-role=status]').textContent = message; };
    const saveSoon = (mergeKey = ''): void => { history.record(project,mergeKey);engine.updateProject(project);if (saveTimer !== undefined) clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { try { saveProject(project); status('Saved locally'); } catch (_) { status('Local save is full — export the project'); } }, 250); };
    const restoreHistory = (direction: 'undo'|'redo'): void => { const result=direction==='undo'?history.undo(project):history.redo(project);if(!result.changed){status(direction==='undo'?'Nothing to undo':'Nothing to redo');return;}project=result.value;selection=project.tracks[0]?{type:'track',trackId:project.tracks[0].id}:null;engine.updateProject(project);if(saveTimer!==undefined)clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>saveProject(project),250);renderAll();void refreshAssets();status(direction==='undo'?'Undone':'Redone'); };
    const beatText = (beat: number): string => { const bar = Math.floor(beat / project.beatsPerBar) + 1; const within = beat % project.beatsPerBar; return `${bar}.${Math.floor(within) + 1}.${String(Math.floor((within % 1) * 100)).padStart(2, '0')}`; };
    const trackWidth = (): number => Math.max(900, projectLength(project) * pxPerBeat);

    function selectedTrack(): StudioTrack | undefined { return selection ? findTrack(project, selection.trackId) : undefined; }
    function selectedClip(): StudioClip | undefined { return selection?.type === 'clip' || selection?.type === 'note' ? findClip(project, selection.trackId, selection.clipId) : undefined; }
    function copySelection(): boolean {
      if(selection?.type==='note'){
        const chosen=markedNotes();if(!chosen.length)return false;
        const notes=chosen.map((item)=>({...item.note}));
        clipboard={type:'notes',origin:Math.min(...notes.map((note)=>note.beat)),notes};
        status(notes.length>1?`${notes.length} notes copied`:'MIDI note copied');return true;
      }
      if(selection?.type==='clip'){
        const chosen=markedClips();if(!chosen.length)return false;
        const items=chosen.map((item)=>({sourceTrackId:item.track.id,kind:item.track.kind,clip:cloneClip(item.clip,item.clip.start)}));
        clipboard={type:'clips',origin:Math.min(...items.map((item)=>item.clip.start)),items};
        status(items.length>1?`${items.length} clips copied`:'Clip copied');return true;
      }
      return false;
    }
    function pasteClipboard(): boolean {
      if(!clipboard){status('Clipboard is empty');return false;}
      const at=snapBeat(playhead,project.snap);
      if(clipboard.type==='clips'){
        const selected=selectedTrack();const pasted:ClipRef[]=[];
        for(const item of clipboard.items){
          const source=findTrack(project,item.sourceTrackId);
          const target=selected?.kind===item.kind?selected:source;
          if(!target)continue;
          const copy=cloneClip(item.clip,Math.max(0,at+(item.clip.start-clipboard.origin)));
          copy.trackId=target.id;target.clips.push(copy);pasted.push({trackId:target.id,clipId:copy.id});
        }
        if(!pasted.length){status('Compatible track not found');return false;}
        marks.replace(pasted);selection={type:'clip',trackId:pasted[0].trackId,clipId:pasted[0].clipId};
        status(pasted.length>1?`Pasted ${pasted.length} clips at ${beatText(at)}`:`Pasted clip at ${beatText(at)}`);
      } else {
        const clip=selectedClip();const track=selectedTrack();
        if(!clip||clip.kind!=='midi'||!track){status('Select a MIDI clip before pasting a note');return false;}
        const base=Math.max(0,snapBeat(at-clip.start,project.snap));const pasted:NoteRef[]=[];
        for(const source of clipboard.notes){
          const beat=Math.max(0,Math.min(clip.duration-source.duration,base+(source.beat-clipboard.origin)));
          const note={...source,id:studioId('note'),beat};clip.notes.push(note);pasted.push({clipId:clip.id,noteId:note.id});
        }
        if(!pasted.length)return false;
        noteSel.replace(pasted);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:pasted[0].noteId};
        status(pasted.length>1?`Pasted ${pasted.length} notes at ${beatText(clip.start+base)}`:`Pasted note at ${beatText(clip.start+base)}`);
      }
      saveSoon();renderAll();return true;
    }
    function cutSelection(): void { const kind=selection?.type; if(!copySelection())return; deleteSelection(); status(kind==='note'?(clipboard?.type==='notes'&&clipboard.notes.length>1?`${clipboard.notes.length} notes cut`:'MIDI note cut'):(clipboard?.type==='clips'&&clipboard.items.length>1?`${clipboard.items.length} clips cut`:'Clip cut')); }
    function duplicateSelection(): void { if(selection?.type==='note'){const chosen=markedNotes();const clip=selectedClip();const track=selectedTrack();if(clip&&track&&chosen.length){const begin=Math.min(...chosen.map((item)=>item.note.beat));const end=Math.max(...chosen.map((item)=>item.note.beat+item.note.duration));const shift=snapBeat(Math.max(end-begin,project.snap),project.snap);const copies=chosen.map((item)=>{const copy={...item.note,id:studioId('note'),beat:Math.max(0,Math.min(clip.duration-item.note.duration,snapBeat(item.note.beat+shift,project.snap)))};clip.notes.push(copy);return copy;});noteSel.replace(copies.map((copy)=>({clipId:clip.id,noteId:copy.id})));selection={type:'note',trackId:track.id,clipId:clip.id,noteId:copies[0].id};if(copies.length>1)status(`Duplicated ${copies.length} notes`);saveSoon();renderEditor();renderTracks();renderSide();}return;}const chosen=markedClips();if(!chosen.length)return;const span=chosen.reduce((end,item)=>Math.max(end,item.clip.start+item.clip.duration),0)-chosen.reduce((begin,item)=>Math.min(begin,item.clip.start),Infinity);const shift=snapBeat(Math.max(span,project.snap),project.snap);const copies=chosen.map((item)=>{const copy=cloneClip(item.clip,Math.max(0,snapBeat(item.clip.start+shift,project.snap)));item.track.clips.push(copy);return {trackId:item.track.id,clipId:copy.id};});marks.replace(copies);selection={type:'clip',trackId:copies[0].trackId,clipId:copies[0].clipId};if(copies.length>1)status(`Duplicated ${copies.length} clips`);saveSoon();renderAll(); }
    function addPianoNote(event: MouseEvent): boolean { if(editTool==='select')return false;const target=event.target as HTMLElement;const piano=target.closest<HTMLElement>('[data-piano]');const clip=selectedClip();const track=selectedTrack();if(!piano||!clip||clip.kind!=='midi'||!track||target.closest('.ks-note,.ks-key,.ks-piano-ruler'))return false;const rect=piano.firstElementChild!.getBoundingClientRect();const pitch=Math.max(36,Math.min(84,84-Math.floor((event.clientY-rect.top-24)/16)));const beat=snapBeat((event.clientX-rect.left-68)/pianoPxPerBeat,project.snap);if(beat<0||beat>=clip.duration)return false;const existing=clip.notes.find((note)=>note.pitch===pitch&&Math.abs(note.beat-beat)<project.snap/2);if(existing){selection={type:'note',trackId:track.id,clipId:clip.id,noteId:existing.id};renderEditor();renderSide();return true;}const note={id:studioId('note'),beat,duration:Math.min(project.snap*2,clip.duration-beat),pitch,velocity:.8};clip.notes.push(note);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};void engine.preview(track,pitch);saveSoon();renderEditor();renderTracks();renderSide();return true; }
    function createMidiClip(track:StudioTrack,start:number,open=false):StudioClip { const snapped=snapBeat(start,project.snap);const existing=track.clips.find((clip)=>clip.kind==='midi'&&Math.abs(clip.start-snapped)<project.snap/2);if(existing){selection={type:'clip',trackId:track.id,clipId:existing.id};renderAll();if(open)setEditorExpanded(true);return existing;}const clip:StudioClip={id:studioId('clip'),trackId:track.id,kind:'midi',name:'MIDI Clip',start:snapped,duration:project.beatsPerBar,offset:0,notes:[],gain:1,fadeIn:0,fadeOut:0};track.clips.push(clip);selection={type:'clip',trackId:track.id,clipId:clip.id};saveSoon();renderAll();if(open)setEditorExpanded(true);return clip; }
    function hideContextMenu(): void { const menu=$<HTMLElement>('[data-role=context]');menu.hidden=true;menu.innerHTML=''; }
    /** 내보내기 판 — 범위·표본율·채널·정규화를 정하고 결과를 숫자로 보고한다. */
    function closeExport(): void { $<HTMLElement>('[data-role=export]').innerHTML=''; $<HTMLElement>('[data-role=backdrop]').classList.toggle('is-open',editorExpanded); }
    function openExport(): void {
      const host=$<HTMLElement>('[data-role=export]');
      const marked=markedClips().map((item)=>item.clip);
      host.innerHTML=`<div class="ks-export" role="dialog" aria-modal="true" aria-label="WAV 내보내기">
        <h4>EXPORT WAV</h4>
        <label>범위 <select data-export="range">
          <option value="song"${exportOptions.range==='song'?' selected':''}>곡 전체</option>
          <option value="loop"${exportOptions.range==='loop'?' selected':''}>LOOP 구간 (${beatText(project.loopStart)} → ${beatText(project.loopEnd)})</option>
          <option value="selection"${exportOptions.range==='selection'?' selected':''}>고른 클립 ${marked.length}개</option>
        </select></label>
        <label>표본율 <select data-export="sampleRate">
          ${[22050,44100,48000].map((rate)=>`<option value="${rate}"${exportOptions.sampleRate===rate?' selected':''}>${rate} Hz</option>`).join('')}
        </select></label>
        <label>채널 <select data-export="mono">
          <option value="0"${exportOptions.mono?'':' selected'}>스테레오</option>
          <option value="1"${exportOptions.mono?' selected':''}>모노</option>
        </select></label>
        <label>피크 맞추기 (-1 dBFS) <input type="checkbox" data-export="normalize"${exportOptions.normalize?' checked':''}></label>
        <p class="ks-export-note" data-role="export-note">끄면 1 을 넘는 표본은 깎인다. 켜면 가장 큰 소리를 -1 dBFS 에 맞춘다.</p>
        <div class="ks-export-actions"><button class="ks-btn" data-export-act="cancel">취소</button><button class="ks-btn" data-export-act="go">내보내기</button></div>
      </div>`;
      $<HTMLElement>('[data-role=backdrop]').classList.add('is-open');
      host.querySelector<HTMLElement>('[data-export-act=go]')?.focus();
    }
    async function runExport(): Promise<void> {
      stop();
      const note=$<HTMLElement>('[data-role=export-note]');
      const marked=markedClips().map((item)=>({start:item.clip.start,duration:item.clip.duration}));
      const range=exportRange(exportOptions.range,{from:0,to:projectLength(project)},{from:project.loopStart,to:project.loopEnd},marked);
      status('Rendering WAV…');if(note)note.textContent='렌더 중…';
      try {
        const rendered=await renderProject(project,assets,range.from,range.to,exportOptions.sampleRate,exportOptions.mono?1:2);
        const before=analysePeak(rendered);
        if(exportOptions.normalize)applyGain(rendered,normalizeGain(before.peak,-1));
        const clamped=exportOptions.normalize?0:clampBuffer(rendered);
        const after=analysePeak(rendered);
        const blob=toWav(rendered);
        const suffix=exportOptions.range==='song'?'':`-${exportOptions.range}`;
        download(blob,`${project.name||'Karmo Studio'}${suffix}.wav`);
        Toolbox.offerNext?.($('[data-role=status]'),{blob,name:`${project.name}${suffix}.wav`,from:'karmo-studio'});
        const headroom=`peak ${after.dbfs.toFixed(1)} dBFS`;
        const warn=clamped?` · 깎인 표본 ${clamped}개`:before.clipped&&exportOptions.normalize?` · 원래 ${before.clipped}개가 넘쳤는데 맞춰서 내렸다`:'';
        status(`WAV ready · ${(blob.size/1048576).toFixed(1)} MB · ${headroom}${warn}`);
        closeExport();
      } catch (error) {
        const message=(error as Error).message;
        status(`Render failed: ${message}`);
        if(note)note.textContent=`실패: ${message}`;
      }
    }
    function setEditorExpanded(next: boolean): void { const editor=$<HTMLElement>('[data-role=editor]');if(next&&!editorExpanded)editorReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;editorExpanded=next;editor.classList.toggle('is-expanded',next);editor.toggleAttribute('role',next);editor.toggleAttribute('aria-modal',next);if(next){editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.tabIndex=-1;}else{editor.removeAttribute('role');editor.removeAttribute('aria-modal');editor.removeAttribute('tabindex');} $<HTMLElement>('[data-role=backdrop]').classList.toggle('is-open',next);renderEditor();if(next)editor.focus({preventScroll:true});else editorReturnFocus?.focus({preventScroll:true}); }
    function showContextMenu(x:number,y:number,items:Array<[string,string]>):void{const menu=$<HTMLElement>('[data-role=context]');menu.innerHTML=items.map(([act,label])=>`<button type="button" role="menuitem" data-context-act="${act}">${label}</button>`).join('');menu.hidden=false;menu.style.left=`${Math.min(x,window.innerWidth-200)}px`;menu.style.top=`${Math.min(y,window.innerHeight-menu.offsetHeight-8)}px`;menu.querySelector<HTMLElement>('button')?.focus({preventScroll:true});}

    function renderAll(): void {
      const scrollElement=root.querySelector<HTMLElement>('[data-role=scroll]');const arrangerLeft=scrollElement?.scrollLeft||0;const arrangerTop=scrollElement?.scrollTop||0;
      root.style.setProperty('--ks-beat', `${pxPerBeat}px`);
      root.dataset.tool=editTool;root.querySelectorAll('[data-tool]').forEach((button)=>button.classList.toggle('is-on',(button as HTMLElement).dataset.tool===editTool));
      $<HTMLInputElement>('[data-bind=project-name]').value = project.name; $<HTMLInputElement>('[data-bind=bpm]').value = String(project.bpm); $<HTMLSelectElement>('[data-bind=meter]').value = String(project.beatsPerBar); $<HTMLSelectElement>('[data-bind=snap]').value = String(project.snap);
      root.querySelector('[data-act=loop]')?.classList.toggle('is-on', project.loop);
      renderRuler(); renderTracks(); renderSide(); renderEditor(); updatePlayhead(); renderToggles();
      if(scrollElement){scrollElement.scrollLeft=arrangerLeft;scrollElement.scrollTop=arrangerTop;}
    }

    /** 켜짐 표시만 갱신 — 전체 재렌더 없이. */
    function renderToggles(): void {
      root.querySelector('[data-act=metronome]')?.classList.toggle('is-on',metronome);
      root.querySelector('[data-act=count-in]')?.classList.toggle('is-on',countIn);
      root.querySelector('[data-act=loop]')?.classList.toggle('is-on',project.loop);
    }
    function renderRuler(): void {
      const ruler = $<HTMLElement>('[data-role=ruler]'); const length = Math.ceil(projectLength(project));
      ruler.style.width = `${172 + trackWidth()}px`;
      let html = '<div class="ks-ruler-head"></div>';
      for (let beat = 0; beat <= length; beat += project.beatsPerBar) html += `<div class="ks-mark" style="left:${172 + beat * pxPerBeat}px">${beat / project.beatsPerBar + 1}</div>`;
      html += `<div class="ks-loop" data-loop style="left:${172 + project.loopStart * pxPerBeat}px;width:${(project.loopEnd - project.loopStart) * pxPerBeat}px"><b class="ks-loop-grip" data-loop-edge="start"></b><b class="ks-loop-grip is-end" data-loop-edge="end"></b></div>`; ruler.innerHTML = html;
    }

    function waveformSvg(clip: StudioClip, className = ''): string {
      const runtime=clip.assetId?assets.get(clip.assetId):undefined;const buffer=runtime?.buffer;if(!buffer)return `<div class="ks-wave-missing">${runtime?'DECODING…':'AUDIO MISSING'}</div>`;
      const data=buffer.getChannelData(0);const secondsPerBeat=60/project.bpm;const start=Math.max(0,Math.floor(clip.offset*secondsPerBeat*buffer.sampleRate));const end=Math.min(data.length,Math.ceil((clip.offset+clip.duration)*secondsPerBeat*buffer.sampleRate));const columns=96;let path='';
      for(let column=0;column<columns;column++){const from=Math.floor(start+(end-start)*column/columns);const to=Math.max(from+1,Math.floor(start+(end-start)*(column+1)/columns));let low=1,high=-1;for(let index=from;index<to;index++){const value=data[index]||0;if(value<low)low=value;if(value>high)high=value;}const x=column/(columns-1)*100;path+=`M${x.toFixed(2)} ${(16-high*14).toFixed(2)}L${x.toFixed(2)} ${(16-low*14).toFixed(2)}`;}
      return `<svg class="ks-wave-svg ${className}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="${esc(runtime?.name||clip.name)} 파형"><path d="${path}"></path></svg>`;
    }

    function clipHtml(track: StudioTrack, clip: StudioClip): string {
      const selected = marks.has({ trackId: track.id, clipId: clip.id }) || ((selection?.type === 'clip' || selection?.type === 'note') && selection.clipId === clip.id);
      const notes = clip.notes.length ? `<div class="ks-midi-notes">${clip.notes.map((note) => {
        const pitches = clip.notes.map((item) => item.pitch); const low = Math.min(...pitches); const high = Math.max(...pitches, low + 1);
        return `<i class="ks-midi-note" style="left:${note.beat / clip.duration * 100}%;width:${Math.max(1,note.duration / clip.duration * 100)}%;bottom:${(note.pitch-low)/(high-low)*90}%"></i>`;
      }).join('')}</div>` : waveformSvg(clip);
      return `<div class="ks-clip${selected ? ' is-selected' : ''}" data-clip="${clip.id}" data-track="${track.id}" style="--clip:${track.color};left:${clip.start * pxPerBeat}px;width:${clip.duration * pxPerBeat}px"><div class="ks-clip-name">${esc(clip.name)}</div>${notes}<div class="ks-handle" data-resize="1"></div></div>`;
    }

    /** 볼륨 자동화 줄 — 점을 잇는 선 하나와 점들. 화면 높이 46px 안에서 0~1.2 를 그린다. */
    const AUTO_HEIGHT=46, AUTO_MAX=1.2;
    function automationY(value: number): number { return AUTO_HEIGHT-(Math.max(0,Math.min(AUTO_MAX,value))/AUTO_MAX)*AUTO_HEIGHT; }
    function automationHtml(track: StudioTrack, width: number): string {
      if(!autoLanes.has(track.id))return '';
      const points=[...track.volumeAutomation].sort((a,b)=>a.beat-b.beat);
      const length=Math.max(projectLength(project),1);
      const line=points.length
        ? `M0,${automationY(points[0].value)} `+points.map((point)=>`L${point.beat*pxPerBeat},${automationY(point.value)}`).join(' ')+` L${width},${automationY(points[points.length-1].value)}`
        : `M0,${automationY(track.volume)} L${width},${automationY(track.volume)}`;
      const dots=points.map((point)=>`<i data-auto-point="${point.id}" data-track="${track.id}" style="left:${point.beat*pxPerBeat}px;top:${automationY(point.value)}px" title="${beatText(point.beat)} · ${Math.round(point.value*100)}%"></i>`).join('');
      return `<div class="ks-auto" data-auto="${track.id}" style="width:${width}px" title="빈 곳 클릭 = 점 추가 · 점 드래그 = 이동 · 우클릭 = 삭제"><svg viewBox="0 0 ${Math.max(1,length*pxPerBeat)} ${AUTO_HEIGHT}" preserveAspectRatio="none"><path d="${line}"></path></svg><span class="ks-auto-tag">VOLUME${points.length?` · ${points.length}점`:' · 점 없음(트랙 볼륨 그대로)'}</span>${dots}</div>`;
    }
    function renderTracks(): void {
      reconcileMarks();
      const tracks = $<HTMLElement>('[data-role=tracks]'); const width = trackWidth();
      tracks.innerHTML = project.tracks.map((track) => `<div class="ks-track-row" data-track-row="${track.id}" style="width:${172 + width}px">
        <div class="ks-track-head"><div class="ks-track-title"><span class="ks-track-color" style="background:${track.color}"></span><input data-track-name="${track.id}" value="${esc(track.name)}" aria-label="트랙 이름"></div>
        <div class="ks-track-actions"><button class="ks-mini${track.mute?' is-on':''}" data-track-act="mute" data-track="${track.id}">M</button><button class="ks-mini${track.solo?' is-on':''}" data-track-act="solo" data-track="${track.id}">S</button><button class="ks-mini${autoLanes.has(track.id)?' is-on':''}" data-track-act="auto" data-track="${track.id}" title="볼륨 자동화 줄 보이기">A</button><button class="ks-mini${armedTrackId===track.id?' is-on':''}" data-track-act="arm" data-track="${track.id}" title="${track.kind==='audio'?'녹음 대상으로 지정':'오디오 트랙만 녹음 대상이 된다'}"${track.kind==='audio'?'':' disabled'}>●</button><button class="ks-mini" data-track-act="delete" data-track="${track.id}">×</button></div>
        <input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-track-volume="${track.id}" aria-label="${esc(track.name)} 볼륨"></div>
        <div class="ks-lane" data-lane="${track.id}" data-kind="${track.kind}" style="width:${width}px">${track.clips.map((clip)=>clipHtml(track,clip)).join('')}</div>${automationHtml(track,width)}</div>`).join('');
    }

    const field = (label: string, input: string): string => `<label class="ks-field"><span>${label}</span>${input}</label>`;
    function renderSide(): void {
      root.querySelectorAll('[data-side]').forEach((button) => button.classList.toggle('is-on', (button as HTMLElement).dataset.side === sideMode));
      const side = $<HTMLElement>('[data-role=side]');
      if (sideMode === 'mixer') {
        side.innerHTML = project.tracks.map((track) => `<section class="ks-section"><h4><span style="color:${track.color}">●</span> ${esc(track.name)}</h4>${field('VOLUME',`<input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-mix="volume" data-track="${track.id}">`)}${field('PAN',`<input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-mix="pan" data-track="${track.id}">`)}<div class="ks-meter-row"><div class="ks-meter" data-meter="${track.id}" title="지금 나는 소리 — 흰 줄은 최근 최고치"><span></span><i></i><b></b></div><span class="ks-meter-db" data-meter-db="${track.id}">−∞</span></div><button class="ks-mini" data-meter-reset="${track.id}" title="넘침 표시 지우기">CLIP RESET</button></section>`).join('') + `<section class="ks-section"><h4>MASTER</h4>${field('VOLUME',`<input type="range" min="0" max="1" step="0.01" value="${project.masterVolume}" data-master="volume">`)}</section>`; return;
      }
      const track = selectedTrack(); const clip = selectedClip();
      if (!track) { side.innerHTML = '<div class="ks-empty">트랙이나 클립을 선택하세요.</div>'; return; }
      const noteSelection = selection?.type === 'note' ? selection : null;
      const chosenNote = noteSelection && clip ? clip.notes.find((note) => note.id === noteSelection.noteId) : undefined;
      side.innerHTML = `<section class="ks-section"><h4>PROJECT</h4>${field('LOOP START',`<input type="number" min="0" step="${project.snap}" value="${project.loopStart}" data-project-ins="loopStart">`)}${field('LOOP END',`<input type="number" min="${project.snap}" step="${project.snap}" value="${project.loopEnd}" data-project-ins="loopEnd">`)}</section><section class="ks-section"><h4>TRACK · ${track.kind.toUpperCase()}</h4>
        ${field('NAME',`<input value="${esc(track.name)}" data-ins="track-name">`)}${field('COLOR',`<input type="color" value="${track.color}" data-ins="color">`)}
        ${field('VOLUME',`<input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-ins="volume">`)}${field('PAN',`<input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-ins="pan">`)}
        ${track.kind==='midi'?field('SYNTH',`<select data-ins="instrument">${['sine','triangle','sawtooth','square'].map((wave)=>`<option${wave===track.instrument?' selected':''}>${wave}</option>`).join('')}</select>`):''}</section>
        <section class="ks-section"><h4>CHANNEL STRIP</h4>${field('LOW EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqLow}" data-ins="eqLow">`)}${field('MID EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqMid}" data-ins="eqMid">`)}${field('HIGH EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqHigh}" data-ins="eqHigh">`)}${field('COMP',`<input type="range" min="0" max="1" step="0.01" value="${track.compressor}" data-ins="compressor">`)}${field('REVERB',`<input type="range" min="0" max="0.8" step="0.01" value="${track.reverb}" data-ins="reverb">`)}</section>
        ${clip?`<section class="ks-section"><h4>CLIP</h4>${field('NAME',`<input value="${esc(clip.name)}" data-clip-ins="name">`)}${field('START',`<input type="number" min="0" step="${project.snap}" value="${clip.start}" data-clip-ins="start">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${clip.duration}" data-clip-ins="duration">`)}${field('GAIN',`<input type="range" min="0" max="2" step="0.01" value="${clip.gain}" data-clip-ins="gain">`)}<div style="display:flex;gap:5px"><button class="ks-btn" data-act="duplicate">DUPLICATE</button><button class="ks-btn" data-act="split">SPLIT @ PLAYHEAD</button><button class="ks-btn" data-act="delete-clip">DELETE</button></div></section>`:''}
        ${chosenNote?`<section class="ks-section"><h4>MIDI NOTE · ${chosenNote.pitch}</h4>${field('PITCH',`<input type="number" min="0" max="127" value="${chosenNote.pitch}" data-note-ins="pitch">`)}${field('START',`<input type="number" min="0" max="${clip?.duration||1}" step="${project.snap}" value="${chosenNote.beat}" data-note-ins="beat">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${chosenNote.duration}" data-note-ins="duration">`)}${field('VELOCITY',`<input type="range" min="0.05" max="1" step="0.01" value="${chosenNote.velocity}" data-note-ins="velocity">`)}</section>`:''}`;
    }

    function renderEditor(): void {
      const editor = $<HTMLElement>('[data-role=editor]'); const previousPiano = editor.querySelector<HTMLElement>('.ks-piano');
      if (previousPiano) { editorScrollTop = previousPiano.scrollTop; editorScrollLeft = previousPiano.scrollLeft; }
      const track = selectedTrack(); const clip = selectedClip(); editor.classList.toggle('is-expanded', editorExpanded);
      if (!track || !clip) { editorExpanded=false;editor.classList.remove('is-expanded');$<HTMLElement>('[data-role=backdrop]').classList.remove('is-open');editor.innerHTML = `<div class="ks-editor-head">CLIP EDITOR</div><div class="ks-empty">클립을 선택하면 편집기가 열립니다.<br>클립을 더블클릭하면 큰 전용 편집 창으로 봅니다.</div>`; return; }
      if (clip.kind === 'audio') {
        const runtime=clip.assetId?assets.get(clip.assetId):undefined;
        editor.innerHTML=`<div class="ks-editor-head"><strong>AUDIO CLIP · ${esc(clip.name)}</strong><span>${runtime?`${runtime.duration.toFixed(2)}s · ${Math.round((runtime.buffer?.sampleRate||0)/1000)}kHz`:'원본 음원을 찾을 수 없음'}</span><span class="ks-spacer"></span><span>더블클릭: 큰 편집 창</span><button class="ks-btn" data-act="toggle-editor">${editorExpanded?'작게':'크게 열기'}</button></div><div class="ks-audio-editor"><div class="ks-audio-wave"><i class="ks-audio-zero"></i>${waveformSvg(clip,'ks-wave-large')}</div><div class="ks-audio-controls">${field('START',`<input type="number" min="0" step="${project.snap}" value="${clip.start}" data-clip-ins="start">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${clip.duration}" data-clip-ins="duration">`)}${field('FADE IN',`<input type="number" min="0" step="${project.snap}" value="${clip.fadeIn}" data-clip-ins="fadeIn">`)}${field('FADE OUT',`<input type="number" min="0" step="${project.snap}" value="${clip.fadeOut}" data-clip-ins="fadeOut">`)}</div></div>`;
        return;
      }
      const high = 84, low = 36, row = 16, keyWidth = 68, rulerHeight = 24;
      pianoPxPerBeat = editorExpanded ? Math.max(pxPerBeat, Math.min(160, (window.innerWidth - 180) / Math.max(clip.duration, 8))) : pxPerBeat;
      const width = Math.max(640, clip.duration * pianoPxPerBeat);
      if (editorClipId !== clip.id) { editorClipId=clip.id;editorScrollLeft=0;const topPitch=clip.notes.length?Math.max(...clip.notes.map((note)=>note.pitch)):72;editorScrollTop=Math.max(0,(high-topPitch)*row-64); }
      const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
      let keys = ''; for (let pitch=high; pitch>=low; pitch--) { const black=[1,3,6,8,10].includes(pitch%12);keys += `<span class="ks-key${black?' is-black':''}" style="top:${rulerHeight+(high-pitch)*row}px">${names[pitch%12]}${Math.floor(pitch/12)-1}</span>`; }
      let bars='';for(let beat=0;beat<=clip.duration;beat+=project.beatsPerBar)bars+=`<span class="ks-piano-bar" style="left:${beat*pianoPxPerBeat}px">${beat/project.beatsPerBar+1}</span>`;
      reconcileNotes();
      const notes = clip.notes.map((note)=>`<i class="ks-note${noteSel.has({clipId:clip.id,noteId:note.id})||(selection?.type==='note'&&selection.noteId===note.id)?' is-selected':''}" title="${names[note.pitch%12]}${Math.floor(note.pitch/12)-1} · velocity ${Math.round(note.velocity*127)}" data-note="${note.id}" style="left:${keyWidth+note.beat*pianoPxPerBeat}px;top:${rulerHeight+(high-note.pitch)*row+Math.max(1,Math.round((1-note.velocity)*5))}px;width:${note.duration*pianoPxPerBeat}px;height:${Math.round(7+note.velocity*7)}px;opacity:${0.5+note.velocity*0.5}"><b class="ks-note-handle" data-note-resize="1"></b></i>`).join('');
      const velocityBars = clip.notes.map((note)=>`<i class="ks-vel${noteSel.has({clipId:clip.id,noteId:note.id})?' is-selected':''}" data-vel="${note.id}" title="velocity ${Math.round(note.velocity*127)}" style="left:${keyWidth+note.beat*pianoPxPerBeat}px;width:${Math.max(4,Math.min(10,note.duration*pianoPxPerBeat))}px;height:${Math.max(3,Math.round(note.velocity*50))}px"></i>`).join('');
      const pianoTools = `<div class="ks-piano-tools">
        <button class="ks-btn" data-note-act="quantize" title="선택한 음(없으면 전부)을 격자에 붙인다">QUANTIZE</button>
        <button class="ks-btn" data-note-act="quantize-half" title="격자까지 절반만 당긴다 — 사람 느낌 보존">Q 50%</button>
        <button class="ks-btn" data-note-act="legato" title="앞 음의 끝을 다음 음 시작까지 늘린다">LEGATO</button>
        <span class="ks-spacer"></span>
        <button class="ks-btn" data-note-act="octave-down" title="한 옥타브 내림">−12</button>
        <button class="ks-btn" data-note-act="down" title="반음 내림">−1</button>
        <button class="ks-btn" data-note-act="up" title="반음 올림">+1</button>
        <button class="ks-btn" data-note-act="octave-up" title="한 옥타브 올림">+12</button>
        <label>VELOCITY <input class="ks-number" type="range" min="0.05" max="1" step="0.01" value="${(clip.notes.find((note)=>noteSel.has({clipId:clip.id,noteId:note.id}))||clip.notes[0])?.velocity??0.8}" data-note-velocity aria-label="선택한 음의 세기"></label>
      </div>`;
      editor.innerHTML = `<div class="ks-editor-head"><strong>PIANO ROLL · ${esc(clip.name)}</strong><span>세로=음높이 · 가로=시간 · 밝기=세기</span><span class="ks-spacer"></span><span>DRAW: 빈 칸 좌클릭으로 음 추가 · SELECT(E): 빈 칸 드래그로 여러 음 묶기 · Shift/Ctrl 클릭으로 더하기·빼기 · 드래그: 묶음 이동 · Delete: 묶음 삭제 · Ctrl+B: 묶음 복제</span><button class="ks-btn" data-act="toggle-editor">${editorExpanded?'작게':'크게 열기'}</button></div>${pianoTools}<div class="ks-piano" data-piano="1"><div style="position:relative;width:${keyWidth+width}px;height:${rulerHeight+(high-low+1)*row}px"><div class="ks-piano-ruler" style="width:${width}px">${bars}</div>${keys}${notes}<div class="ks-band" data-role="piano-band" hidden></div></div></div><div class="ks-velocity" data-velocity><div style="position:relative;width:${keyWidth+width}px;height:100%">${velocityBars}</div><div class="ks-velocity-scale">VEL</div></div>`;
      const piano=editor.querySelector<HTMLElement>('.ks-piano');if(piano){piano.scrollTop=editorScrollTop;piano.scrollLeft=editorScrollLeft;}
    }

    function updatePlayhead(): void {
      $<HTMLElement>('[data-role=playhead]').style.left = `${172 + playhead * pxPerBeat}px`;
      $<HTMLElement>('[data-role=time]').textContent = beatText(playhead);
    }
    /** 미터 — 최근 최고치는 천천히 내려오고, 넘친 적이 있으면 표시가 걸린 채로 남는다. */
    const meterHold = new Map<string, number>();
    const meterClipped = new Set<string>();
    function paintMeters(): void {
      const levels = engine.levels();
      root.querySelectorAll<HTMLElement>('[data-meter]').forEach((element)=>{
        const id=element.dataset.meter||'';
        const level=levels.get(id);
        const peak=level?level.peak:0;
        const rms=level?level.rms:0;
        const hold=Math.max(peak,(meterHold.get(id)??0)-0.02);
        meterHold.set(id,hold);
        if(peak>=0.99)meterClipped.add(id);
        element.classList.toggle('is-clipped',meterClipped.has(id));
        const bar=element.querySelector<HTMLElement>('span');const tip=element.querySelector<HTMLElement>('i');
        if(bar)bar.style.width=`${Math.min(100,rms*140)}%`;
        if(tip)tip.style.left=`${Math.min(99,hold*100)}%`;
        const label=root.querySelector<HTMLElement>(`[data-meter-db="${id}"]`);
        if(label)label.textContent=hold>0.0005?`${(20*Math.log10(hold)).toFixed(1)} dB`:'−∞';
      });
    }
    function transportLoop(): void { if (!engine.isPlaying()) { paintMeters(); return; } paintMeters(); playhead = engine.currentBeat(); updatePlayhead(); const scroll = $<HTMLElement>('[data-role=scroll]'); const x = 172 + playhead * pxPerBeat; if (x > scroll.scrollLeft + scroll.clientWidth - 80) scroll.scrollLeft = x - scroll.clientWidth * .45; raf = requestAnimationFrame(transportLoop); }
    function play(): void { engine.setAssets(assets); engine.metronome=metronome; engine.play(project, playhead); root.querySelector('[data-act=play]')?.classList.add('is-on'); if (raf!==undefined)cancelAnimationFrame(raf); transportLoop(); }
    function stop(): void { engine.stop(); root.querySelector('[data-act=play]')?.classList.remove('is-on'); if(raf!==undefined)cancelAnimationFrame(raf); raf=undefined; meterHold.clear(); paintMeters(); }
    engine.onEnded = () => { root.querySelector('[data-act=play]')?.classList.remove('is-on'); };

    async function refreshAssets(): Promise<void> { const AC=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext; const context=new AC(); assets=await hydrateAssets(project,context); await context.close(); engine.setAssets(assets); }
    async function importAudio(files: File[]): Promise<void> {
      const armed = armedTrackId ? findTrack(project, armedTrackId) : undefined;
      const selectedAudioTrack = selectedTrack();
      /* 녹음 대상(●)이 있으면 그 트랙이 이긴다 — 없을 때만 고른 트랙 → 첫 오디오 트랙 순. */
      const audioTrack: StudioTrack = armed?.kind === 'audio'
        ? armed
        : selectedAudioTrack?.kind === 'audio'
        ? selectedAudioTrack
        : project.tracks.find((track) => track.kind === 'audio') || (() => { const track = newTrack('audio', project.tracks.length + 1); project.tracks.push(track); return track; })();
      const AC=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext; const context=new AC();
      for (const file of files) { try { const bytes=await file.arrayBuffer(); const buffer=await context.decodeAudioData(bytes.slice(0)); const asset:StudioAssetRuntime={id:studioId('asset'),name:file.name,type:file.type||'audio/wav',duration:buffer.duration,buffer}; await addAsset(new Blob([bytes],{type:asset.type}),asset); assets.set(asset.id,asset); project.assets.push(asset); const duration=buffer.duration/(60/project.bpm); const clip:StudioClip={id:studioId('clip'),trackId:audioTrack.id,kind:'audio',name:file.name.replace(/\.[^.]+$/,''),start:snapBeat(playhead,project.snap),duration,offset:0,assetId:asset.id,notes:[],gain:1,fadeIn:0.02/(60/project.bpm),fadeOut:0.02/(60/project.bpm)}; audioTrack.clips.push(clip); selection={type:'clip',trackId:audioTrack.id,clipId:clip.id}; status(`Imported ${file.name}`); } catch(error){status(`Could not decode ${file.name}`);} }
      await context.close(); saveSoon(); renderAll();
    }
    /** 카운트인 — 한 마디를 세어 준 뒤 녹음을 시작한다. 취소하면 세다가 멈춘다. */
    let countInTimer: number | undefined;
    function runCountIn(): Promise<void> {
      const bar=project.beatsPerBar;const secondsPerBeat=60/project.bpm;
      status(`Count-in · ${bar}`);
      engine.metronome=true;engine.setAssets(assets);engine.play({...project,tracks:[],loop:false},0);
      return new Promise((resolve)=>{
        let left=bar;
        countInTimer=window.setInterval(()=>{
          left--;
          if(left>0){status(`Count-in · ${left}`);return;}
          window.clearInterval(countInTimer);countInTimer=undefined;
          engine.stop();engine.metronome=metronome;
          resolve();
        },secondsPerBeat*1000);
      });
    }
    async function startRecording(): Promise<void> {
      if (recording) { recording.stop(); return; }
      if (countInTimer!==undefined) { window.clearInterval(countInTimer); countInTimer=undefined; engine.stop(); engine.metronome=metronome; status('Count-in cancelled'); return; }
      if (countIn) { root.querySelector('[data-act=record]')?.classList.add('is-recording'); await runCountIn(); }
      try { const stream=await navigator.mediaDevices.getUserMedia({audio:true}); recordChunks=[]; recording=new MediaRecorder(stream); recordStart=playhead; recording.ondataavailable=(event)=>{if(event.data.size)recordChunks.push(event.data);}; recording.onstop=()=>{const blob=new Blob(recordChunks,{type:recording?.mimeType||'audio/webm'});stream.getTracks().forEach((track)=>track.stop());recording=null;root.querySelector('[data-act=record]')?.classList.remove('is-recording');playhead=recordStart;void importAudio([new File([blob],`Recording ${new Date().toLocaleTimeString()}.webm`,{type:blob.type})]);}; recording.start(); root.querySelector('[data-act=record]')?.classList.add('is-recording'); if(!engine.isPlaying())play(); status('Recording microphone…'); } catch(_){status('Microphone permission was not granted');}
    }
    const download = (blob: Blob, name: string): void => { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000); };

    root.addEventListener('click',(event)=>{ const raw=event.target as HTMLElement;const exportAct=raw.closest<HTMLElement>('[data-export-act]')?.dataset.exportAct;if(exportAct){if(exportAct==='cancel')closeExport();else void runExport();return;}if(addPianoNote(event))return;const contextAct=raw.closest<HTMLElement>('[data-context-act]')?.dataset.contextAct;if(contextAct){hideContextMenu();if(contextAct==='open-editor')setEditorExpanded(true);else if(contextAct==='copy')copySelection();else if(contextAct==='cut')cutSelection();else if(contextAct==='duplicate')root.querySelector<HTMLElement>('[data-act=duplicate]')?.click();else if(contextAct==='duplicate-note'&&selection?.type==='note'){const noteId=selection.noteId;const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===noteId);const track=selectedTrack();if(clip&&note&&track){const copy={...note,id:studioId('note'),beat:Math.min(clip.duration-note.duration,snapBeat(note.beat+project.snap,project.snap))};clip.notes.push(copy);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:copy.id};saveSoon();renderEditor();renderTracks();}}else if(contextAct==='split')root.querySelector<HTMLElement>('[data-act=split]')?.click();else if(contextAct==='delete')deleteSelection();return;}const meterReset=raw.closest<HTMLElement>('[data-meter-reset]')?.dataset.meterReset;if(meterReset){meterClipped.delete(meterReset);paintMeters();status('Clip indicator cleared');return;}const noteAct=raw.closest<HTMLElement>('[data-note-act]')?.dataset.noteAct;if(noteAct){applyNoteTool(noteAct);return;}const tool=raw.closest<HTMLElement>('.ks-btn[data-tool]')?.dataset.tool;if(tool){editTool=tool as typeof editTool;renderAll();status(`${tool.toUpperCase()} tool`);return;} const target=raw.closest<HTMLElement>('[data-act],[data-side],[data-track-act]'); if(!target){hideContextMenu();return;}
      if(target.dataset.side){sideMode=target.dataset.side as typeof sideMode;renderSide();return;}
      const trackAct=target.dataset.trackAct; if(trackAct){const track=findTrack(project,target.dataset.track||'');if(!track)return;if(trackAct==='mute')track.mute=!track.mute;else if(trackAct==='solo')track.solo=!track.solo;else if(trackAct==='auto'){if(autoLanes.has(track.id))autoLanes.delete(track.id);else autoLanes.add(track.id);renderTracks();status(autoLanes.has(track.id)?`${track.name} 자동화 줄 열림`:'자동화 줄 닫힘');return;} else if(trackAct==='arm'){if(track.kind!=='audio'){status('Only audio tracks can be armed');return;}armedTrackId=armedTrackId===track.id?'':track.id;status(armedTrackId?`Armed ${track.name}`:'Disarmed');renderAll();return;}else if(trackAct==='delete'&&confirm(`Delete ${track.name}?`)){project.tracks=project.tracks.filter((item)=>item.id!==track.id);selection=null;}saveSoon();renderAll();return;}
      const act=target.dataset.act;
      if(act==='play')engine.isPlaying()?stop():play(); else if(act==='stop')stop(); else if(act==='back'){stop();playhead=0;updatePlayhead();} else if(act==='loop'){project.loop=!project.loop;saveSoon();renderAll();} else if(act==='metronome'){metronome=!metronome;engine.metronome=metronome;renderToggles();status(metronome?'Metronome on':'Metronome off');} else if(act==='count-in'){countIn=!countIn;renderToggles();status(countIn?'Count-in: one bar before recording':'Count-in off');}
      else if(act==='audio'||act==='midi'){const track=newTrack(act,project.tracks.length+1);project.tracks.push(track);selection={type:'track',trackId:track.id};saveSoon();renderAll();}
      else if(act==='import-audio')$<HTMLInputElement>('[data-file=audio]').click(); else if(act==='open')$<HTMLInputElement>('[data-file=project]').click();
      else if(act==='new'&&confirm('Start a new project? Export the current one first if you need it.')){stop();project=newProject();assets.clear();selection={type:'clip',trackId:project.tracks[0].id,clipId:project.tracks[0].clips[0].id};playhead=0;saveSoon();renderAll();}
      else if(act==='save'){void portableProject(project).then((json)=>download(new Blob([json],{type:'application/json'}),`${project.name||'Karmo Studio'}.karmo.json`));}
      else if(act==='export-wav'){openExport();}
      else if(act==='zoom-in'||act==='zoom-out'){pxPerBeat=Math.max(28,Math.min(180,pxPerBeat*(act==='zoom-in'?1.25:.8)));renderAll();}
      else if(act==='record')void startRecording(); else if(act==='duplicate')duplicateSelection();
      else if(act==='copy')copySelection();else if(act==='cut')cutSelection();else if(act==='paste')pasteClipboard();
      else if(act==='undo')restoreHistory('undo');else if(act==='redo')restoreHistory('redo');
      else if(act==='toggle-editor')setEditorExpanded(!editorExpanded);
      else if(act==='split'){const clip=selectedClip();const track=selectedTrack();if(clip&&track){const right=splitClip(clip,snapBeat(playhead,project.snap));if(right){track.clips.push(right);selection={type:'clip',trackId:track.id,clipId:right.id};saveSoon();renderAll();}else status('Place the playhead inside the selected clip');}}
      else if(act==='delete-clip'){deleteSelection();}
    });

    root.addEventListener('input',(event)=>{const input=event.target as HTMLInputElement; if(input.dataset.bind==='project-name')project.name=input.value;else if(input.dataset.bind==='bpm')project.bpm=Math.max(30,Math.min(300,Number(input.value)||120));else if(input.dataset.bind==='meter')project.beatsPerBar=Number(input.value);else if(input.dataset.bind==='snap')project.snap=Number(input.value);else if(input.dataset.projectIns){const key=input.dataset.projectIns;const value=Math.max(0,Number(input.value));if(key==='loopStart')project.loopStart=Math.min(value,project.loopEnd-project.snap);else project.loopEnd=Math.max(project.loopStart+project.snap,value);}else if(input.dataset.trackName){const track=findTrack(project,input.dataset.trackName);if(track)track.name=input.value;}else if(input.dataset.trackVolume){const track=findTrack(project,input.dataset.trackVolume);if(track)track.volume=Number(input.value);}else if(input.dataset.mix){const track=findTrack(project,input.dataset.track||'');if(track)(track as unknown as Record<string,unknown>)[input.dataset.mix]=Number(input.value);}else if(input.dataset.master)project.masterVolume=Number(input.value);else if(input.dataset.ins){const track=selectedTrack();if(track){const key=input.dataset.ins;if(key==='track-name')track.name=input.value;else if(key==='color')track.color=input.value;else if(key==='instrument')track.instrument=input.value as OscillatorType;else (track as unknown as Record<string,unknown>)[key]=Number(input.value);}}else if(input.dataset.clipIns){const clip=selectedClip();if(clip){const key=input.dataset.clipIns;if(key==='name')clip.name=input.value;else (clip as unknown as Record<string,unknown>)[key]=Math.max(key==='start'||key==='fadeIn'||key==='fadeOut'?0:0.0625,Number(input.value));}}else if(input.dataset.noteIns&&selection?.type==='note'){const noteId=selection.noteId;const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===noteId);if(note){const key=input.dataset.noteIns;const value=Number(input.value);if(key==='pitch')note.pitch=Math.max(0,Math.min(127,value));else if(key==='beat')note.beat=Math.max(0,Math.min((clip?.duration||1)-note.duration,value));else if(key==='duration')note.duration=Math.max(project.snap,Math.min((clip?.duration||1)-note.beat,value));else note.velocity=Math.max(.05,Math.min(1,value));}}const historyKey=`input:${input.dataset.bind||input.dataset.projectIns||input.dataset.trackName||input.dataset.trackVolume||input.dataset.mix||input.dataset.master||input.dataset.ins||input.dataset.clipIns||input.dataset.noteIns||'field'}`;saveSoon(historyKey); if(event.type==='change')renderAll();});
    root.addEventListener('change',(event)=>{const input=event.target as HTMLInputElement;if(input.dataset.bind||input.dataset.projectIns||input.dataset.ins||input.dataset.clipIns||input.dataset.noteIns||input.dataset.mix||input.dataset.master||input.dataset.trackName)renderAll();});

    const audioInput=$<HTMLInputElement>('[data-file=audio]');audioInput.onchange=()=>{if(audioInput.files)void importAudio(Array.from(audioInput.files));audioInput.value='';};
        /** 세기 막대 높이만 제자리 갱신 — 드래그 중 전체 재렌더로 슬라이더 포커스를 잃지 않는다. */
    function paintVelocity(): void {
      const clip=selectedClip();if(!clip)return;
      for(const note of clip.notes){
        const bar=root.querySelector<HTMLElement>(`.ks-vel[data-vel="${note.id}"]`);
        if(bar){bar.style.height=`${Math.max(3,Math.round(note.velocity*50))}px`;bar.title=`velocity ${Math.round(note.velocity*127)}`;}
        const element=root.querySelector<HTMLElement>(`.ks-note[data-note="${note.id}"]`);
        if(element){element.style.height=`${Math.round(7+note.velocity*7)}px`;element.style.opacity=`${0.5+note.velocity*0.5}`;}
      }
    }
    root.addEventListener('change',(event)=>{
      const field=(event.target as HTMLElement).closest<HTMLSelectElement|HTMLInputElement>('[data-export]');
      if(!field)return;
      const key=field.dataset.export;
      if(key==='range')exportOptions.range=field.value as ExportRangeMode;
      else if(key==='sampleRate')exportOptions.sampleRate=Number(field.value);
      else if(key==='mono')exportOptions.mono=field.value==='1';
      else if(key==='normalize')exportOptions.normalize=(field as HTMLInputElement).checked;
    });
    root.addEventListener('input',(event)=>{
      const input=event.target as HTMLInputElement;
      if(!('noteVelocity' in input.dataset))return;
      const target=noteTargets();if(!target)return;
      setNoteVelocity(target.notes,Number(input.value));
      saveSoon('note-velocity');paintVelocity();
    });
    /** 세기 막대를 세로로 끌어 그 음의 세기를 바꾼다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const bar=(event.target as HTMLElement).closest<HTMLElement>('.ks-vel');
      const lane=(event.target as HTMLElement).closest<HTMLElement>('[data-velocity]');
      if(!bar||!lane)return;
      const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===bar.dataset.vel);
      if(!clip||!note)return;
      const rect=lane.getBoundingClientRect();
      const original=note.velocity;
      const set=(clientY:number):void=>{note.velocity=Math.max(0.05,Math.min(1,(rect.bottom-clientY)/Math.max(1,rect.height)));paintVelocity();};
      set(event.clientY);
      try{bar.setPointerCapture(event.pointerId);}catch(_){/* capture 없이도 이어서 받는다 */}
      const move=(moveEvent:PointerEvent):void=>set(moveEvent.clientY);
      const cleanup=():void=>{bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',up);bar.removeEventListener('pointercancel',abort);bar.removeEventListener('lostpointercapture',abort);cancelActiveGesture=null;};
      const up=():void=>{cleanup();void engine.preview(selectedTrack()||project.tracks[0],note.pitch,note.velocity);saveSoon('note-velocity');renderEditor();};
      const abort=():void=>{note.velocity=original;cleanup();renderEditor();};
      cancelActiveGesture=abort;
      bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',up,{once:true});bar.addEventListener('pointercancel',abort,{once:true});bar.addEventListener('lostpointercapture',abort,{once:true});
    });
const projectInput=$<HTMLInputElement>('[data-file=project]');projectInput.onchange=()=>{const file=projectInput.files?.[0];if(!file)return;void file.text().then(importPortable).then(async(next)=>{stop();project=next;history.reset(project);await refreshAssets();selection=project.tracks[0]?{type:'track',trackId:project.tracks[0].id}:null;playhead=0;renderAll();status(`Opened ${file.name}`);}).catch((error:Error)=>status(`Open failed: ${error.message}`));projectInput.value='';};

    const scroll=$<HTMLElement>('[data-role=scroll]'); scroll.addEventListener('pointerdown',(event)=>{if(event.button!==0||!event.isPrimary)return;hideContextMenu();const target=event.target as HTMLElement;const clipEl=target.closest<HTMLElement>('.ks-clip');const lane=target.closest<HTMLElement>('.ks-lane');if(!clipEl&&!lane)return;
      if(clipEl&&editTool==='slice'){const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';const track=findTrack(project,trackId),clip=findClip(project,trackId,clipId);if(!track||!clip||!lane)return;const at=snapBeat((event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);const right=splitClip(clip,at);if(right){track.clips.push(right);selection={type:'clip',trackId,clipId:right.id};saveSoon();renderAll();status(`Split at ${beatText(at)}`);}else status('Click inside the clip to split');return;}
      if(!clipEl&&lane){
        const mode=markMode(event);
        if(editTool!=='select'&&mode==='replace'){selection={type:'track',trackId:lane.dataset.lane||''};playhead=snapBeat((event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);updatePlayhead();renderSide();return;}
        /** box selection — 빈 lane 에서 끌면 지나간 clip 을 묶는다. */
        const band=$<HTMLElement>('[data-role=band]');const startX=event.clientX,startY=event.clientY;
        const before=marks.list();let boxed=false;
        const paint=(moveEvent:PointerEvent):void=>{
          const rect=dragRect(startX,startY,moveEvent.clientX,moveEvent.clientY);
          boxed=isBoxDrag(rect);band.hidden=!boxed;if(!boxed)return;
          const surface=scroll.getBoundingClientRect();
          band.style.left=`${rect.left-surface.left+scroll.scrollLeft}px`;band.style.top=`${rect.top-surface.top+scroll.scrollTop}px`;
          band.style.width=`${rect.right-rect.left}px`;band.style.height=`${rect.bottom-rect.top}px`;
          const hit:ClipRef[]=[];
          root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>{const box=element.getBoundingClientRect();if(rectOverlaps(rect,{left:box.left,top:box.top,right:box.right,bottom:box.bottom}))hit.push({trackId:element.dataset.track||'',clipId:element.dataset.clip||''});});
          marks.replace(mode==='replace'?hit:[...before,...hit]);
          const keys=new Set(marks.list().map((ref)=>`${ref.trackId} ${ref.clipId}`));
          root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>element.classList.toggle('is-selected',keys.has(`${element.dataset.track} ${element.dataset.clip}`)));
        };
        const finish=(committed:boolean):void=>{
          window.removeEventListener('pointermove',paint);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',abort);
          band.hidden=true;cancelActiveGesture=null;
          if(!boxed){marks.replace(before);if(committed){selection={type:'track',trackId:lane.dataset.lane||''};playhead=snapBeat((startX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);updatePlayhead();renderSide();}return;}
          if(!committed){marks.replace(before);renderTracks();return;}
          const chosen=marks.list();
          selection=chosen.length?{type:'clip',trackId:chosen[0].trackId,clipId:chosen[0].clipId}:{type:'track',trackId:lane.dataset.lane||''};
          renderTracks();renderSide();renderEditor();status(chosen.length?`${chosen.length} clip${chosen.length>1?'s':''} selected`:'Selection cleared');
        };
        const done=():void=>finish(true);const abort=():void=>finish(false);
        cancelActiveGesture=abort;
        window.addEventListener('pointermove',paint);window.addEventListener('pointerup',done,{once:true});window.addEventListener('pointercancel',abort,{once:true});
        return;
      }
      if(!clipEl)return;
      const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';
      const track=findTrack(project,trackId);const source=findClip(project,trackId,clipId);
      if(!source||!track)return;
      const isResize=Boolean(target.closest('[data-resize]'));const isClone=event.altKey&&!isResize;
      reconcileMarks();
      if(!isClone)marks.apply({trackId,clipId},markMode(event));
      /** 이동 대상 한 묶음. resize 는 집은 clip 하나만, 그 외에는 표시된 clip 전부가 같이 간다. */
      type Mover={track:StudioTrack;clip:StudioClip;el:HTMLElement|null;start:number;duration:number};
      const elementFor=(refTrackId:string,refClipId:string):HTMLElement|null=>root.querySelector<HTMLElement>(`.ks-clip[data-track="${refTrackId}"][data-clip="${refClipId}"]`);
      const clones:{track:StudioTrack;clip:StudioClip}[]=[];
      let movers:Mover[];let anchor:Mover;
      if(isClone){
        const sources=marks.has({trackId,clipId})?markedClips():[{track,clip:source}];
        movers=sources.map((item)=>{const copy=cloneClip(item.clip,item.clip.start);item.track.clips.push(copy);clones.push({track:item.track,clip:copy});return {track:item.track,clip:copy,el:elementFor(item.track.id,item.clip.id),start:copy.start,duration:copy.duration};});
        marks.replace(clones.map((item)=>({trackId:item.track.id,clipId:item.clip.id})));
        anchor=movers.find((item)=>item.track.id===trackId)||movers[0];
        selection={type:'clip',trackId:anchor.track.id,clipId:anchor.clip.id};
        status(clones.length>1?`Alt-drag · cloned ${clones.length} clips`:'Alt-drag · clone clip');
      } else {
        selection={type:'clip',trackId,clipId};
        const chosen=isResize?[{track,clip:source}]:markedClips();
        movers=chosen.map((item)=>({track:item.track,clip:item.clip,el:elementFor(item.track.id,item.clip.id),start:item.clip.start,duration:item.clip.duration}));
        anchor=movers.find((item)=>item.clip.id===clipId)||movers[0];
      }
      if(!movers.length)return;
      const markedKeys=new Set(marks.list().map((ref)=>`${ref.trackId} ${ref.clipId}`));
      root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>element.classList.toggle('is-selected',markedKeys.has(`${element.dataset.track} ${element.dataset.clip}`)));
      renderSide();renderEditor();
      if(marks.size>1&&!isClone)status(`${marks.size} clips selected`);
      const startX=event.clientX,startY=event.clientY;let moved=false;
      const discardClone=()=>{for(const item of clones)item.track.clips=item.track.clips.filter((entry)=>entry.id!==item.clip.id);if(clones.length){marks.replace([{trackId,clipId}]);selection={type:'clip',trackId,clipId:source.id};}};
      if(!clipEl.isConnected){discardClone();return;}
      try{clipEl.setPointerCapture(event.pointerId);}catch(_){discardClone();return;}
      /** 세로로 끌면 같은 종류의 트랙으로 옮긴다. 실제 이동은 pointerup 에 한 번만(DOM 재부모화 회피). */
      let trackShift=0;
      const laneIndex=(id:string):number=>project.tracks.findIndex((item)=>item.id===id);
      const highlightTarget=():void=>{
        root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));
        if(!trackShift)return;
        for(const item of movers){const next=project.tracks[laneIndex(item.track.id)+trackShift];if(next)root.querySelector<HTMLElement>(`.ks-lane[data-lane="${next.id}"]`)?.classList.add('is-drop');}
      };
      const move=(moveEvent:PointerEvent)=>{
        const delta=(moveEvent.clientX-startX)/pxPerBeat;
        if(Math.abs(moveEvent.clientX-startX)>2||Math.abs(moveEvent.clientY-startY)>2)moved=true;
        if(isResize)anchor.clip.duration=Math.max(project.snap,snapBeat(anchor.duration+delta,project.snap));
        else{
          const step=snapBeat(anchor.start+delta,project.snap)-anchor.start;
          for(const item of movers)item.clip.start=Math.max(0,item.start+step);
          const under=document.elementFromPoint(moveEvent.clientX,moveEvent.clientY)?.closest<HTMLElement>('.ks-lane');
          const wanted=under?laneIndex(under.dataset.lane||'')-laneIndex(anchor.track.id):0;
          const ok=wanted!==0&&movers.every((item)=>{const next=project.tracks[laneIndex(item.track.id)+wanted];return Boolean(next)&&next.kind===item.clip.kind;});
          const nextShift=ok?wanted:0;
          if(nextShift!==trackShift){trackShift=nextShift;highlightTarget();}
        }
        for(const item of movers){if(!item.el)continue;item.el.style.left=`${item.clip.start*pxPerBeat}px`;item.el.style.width=`${item.clip.duration*pxPerBeat}px`;}
      };
      const applyTrackShift=():void=>{
        if(!trackShift)return;
        const moves=movers.map((item)=>({item,target:project.tracks[laneIndex(item.track.id)+trackShift]}));
        if(moves.some((entry)=>!entry.target||entry.target.kind!==entry.item.clip.kind))return;
        for(const entry of moves){entry.item.track.clips=entry.item.track.clips.filter((clip)=>clip.id!==entry.item.clip.id);entry.item.clip.trackId=entry.target.id;entry.target.clips.push(entry.item.clip);entry.item.track=entry.target;}
        marks.replace(movers.map((item)=>({trackId:item.track.id,clipId:item.clip.id})));
        selection={type:'clip',trackId:anchor.track.id,clipId:anchor.clip.id};
        status(movers.length>1?`Moved ${movers.length} clips to another track`:'Moved clip to another track');
      };
      const cleanup=()=>{clipEl.removeEventListener('pointermove',move);clipEl.removeEventListener('pointerup',up);clipEl.removeEventListener('pointercancel',cancel);clipEl.removeEventListener('lostpointercapture',cancel);cancelActiveGesture=null;};
      const up=()=>{cleanup();root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));if(!moved){discardClone();renderAll();return;}const crossed=trackShift!==0;applyTrackShift();saveSoon();renderAll();if(!crossed&&movers.length>1)status(`Moved ${movers.length} clips`);};
      const cancel=()=>{for(const item of movers){item.clip.start=item.start;item.clip.duration=item.duration;}trackShift=0;root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));discardClone();cleanup();renderAll();};
      cancelActiveGesture=cancel;
      clipEl.addEventListener('pointermove',move);clipEl.addEventListener('pointerup',up,{once:true});clipEl.addEventListener('pointercancel',cancel,{once:true});clipEl.addEventListener('lostpointercapture',cancel,{once:true});
    });
    /** ruler 조작 — 클릭은 재생 헤드, 빈 곳 드래그는 새 loop 구간, 손잡이·구간 드래그는 이동. */
    $<HTMLElement>('[data-role=ruler]').addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const ruler=event.currentTarget as HTMLElement;
      const target=event.target as HTMLElement;
      if(target.closest('.ks-ruler-head'))return;
      event.preventDefault();hideContextMenu();
      const beatAt=(clientX:number):number=>snapBeat((clientX-ruler.getBoundingClientRect().left-172)/pxPerBeat,project.snap);
      const edge=target.closest<HTMLElement>('[data-loop-edge]')?.dataset.loopEdge;
      const inside=Boolean(target.closest('[data-loop]'))&&!edge;
      const originStart=project.loopStart,originEnd=project.loopEnd;
      const anchorBeat=beatAt(event.clientX);
      let moved=false;
      const move=(moveEvent:PointerEvent):void=>{
        const beat=beatAt(moveEvent.clientX);
        if(Math.abs(moveEvent.clientX-event.clientX)>2)moved=true;
        if(edge==='start')project.loopStart=Math.max(0,Math.min(beat,project.loopEnd-project.snap));
        else if(edge==='end')project.loopEnd=Math.max(project.loopStart+project.snap,beat);
        else if(inside){const shift=beat-anchorBeat;project.loopStart=Math.max(0,originStart+shift);project.loopEnd=project.loopStart+(originEnd-originStart);}
        else if(moved){project.loopStart=Math.min(anchorBeat,beat);project.loopEnd=Math.max(anchorBeat+project.snap,Math.max(anchorBeat,beat));}
        else return;
        renderRuler();renderSide();
      };
      const cleanup=():void=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abort);cancelActiveGesture=null;};
      const up=():void=>{
        cleanup();
        if(!moved&&!edge&&!inside){playhead=anchorBeat;updatePlayhead();status(`Playhead ${beatText(playhead)}`);return;}
        if(!moved){renderRuler();return;}
        project.loop=true;saveSoon('loop-range');renderRuler();renderSide();
        status(`Loop ${beatText(project.loopStart)} → ${beatText(project.loopEnd)}`);
      };
      const abort=():void=>{project.loopStart=originStart;project.loopEnd=originEnd;cleanup();renderRuler();renderSide();};
      cancelActiveGesture=abort;
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',abort,{once:true});
    });
    scroll.addEventListener('click',(event)=>{if(event.button!==0||editTool!=='draw')return;const target=event.target as HTMLElement;if(target.closest('.ks-clip'))return;const lane=target.closest<HTMLElement>('.ks-lane');if(!lane||lane.dataset.kind!=='midi')return;const track=findTrack(project,lane.dataset.lane||'');if(track)createMidiClip(track,(event.clientX-lane.getBoundingClientRect().left)/pxPerBeat);});
    scroll.addEventListener('dblclick',(event)=>{if(event.button!==0)return;event.preventDefault();const target=event.target as HTMLElement;const clipElement=target.closest<HTMLElement>('.ks-clip');if(clipElement){const trackId=clipElement.dataset.track||'',clipId=clipElement.dataset.clip||'';const clip=findClip(project,trackId,clipId);if(clip){selection={type:'clip',trackId,clipId};renderTracks();renderSide();setEditorExpanded(true);}return;}const lane=target.closest<HTMLElement>('.ks-lane');if(!lane||lane.dataset.kind!=='midi')return;const track=findTrack(project,lane.dataset.lane||'');if(track)createMidiClip(track,(event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,true);});

    /** 자동화 줄 조작 — 빈 곳 클릭은 점 추가, 점 드래그는 이동, 우클릭은 삭제. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;
      const lane=target.closest<HTMLElement>('[data-auto]');
      if(!lane)return;
      const track=findTrack(project,lane.dataset.auto||'');if(!track)return;
      event.preventDefault();
      const rect=lane.getBoundingClientRect();
      const valueAt=(clientY:number):number=>Math.max(0,Math.min(AUTO_MAX,(1-(clientY-rect.top)/Math.max(1,rect.height))*AUTO_MAX));
      const beatAt=(clientX:number):number=>snapBeat((clientX-rect.left)/pxPerBeat,project.snap);
      const dot=target.closest<HTMLElement>('[data-auto-point]');
      let point=track.volumeAutomation.find((item)=>item.id===dot?.dataset.autoPoint);
      if(!point){
        track.volumeAutomation=putAutomationPoint(track.volumeAutomation,beatAt(event.clientX),valueAt(event.clientY));
        point=track.volumeAutomation.find((item)=>Math.abs(item.beat-beatAt(event.clientX))<=0.05);
        renderTracks();
        if(!point){saveSoon('automation');return;}
      }
      const held=point;const originBeat=held.beat,originValue=held.value;
      const move=(moveEvent:PointerEvent):void=>{
        held.beat=beatAt(moveEvent.clientX);held.value=valueAt(moveEvent.clientY);
        track.volumeAutomation=[...track.volumeAutomation].sort((a,b)=>a.beat-b.beat);
        renderTracks();
      };
      const cleanup=():void=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abort);cancelActiveGesture=null;};
      const up=():void=>{cleanup();saveSoon('automation');engine.updateProject(project);status(`볼륨 ${Math.round(held.value*100)}% @ ${beatText(held.beat)}`);};
      const abort=():void=>{held.beat=originBeat;held.value=originValue;cleanup();renderTracks();};
      cancelActiveGesture=abort;
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',abort,{once:true});
    });
    /** piano roll box selection — 빈 칸에서 끌면 지나간 음을 묶는다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;
      const piano=target.closest<HTMLElement>('[data-piano]');
      if(!piano||target.closest('.ks-note,.ks-key,.ks-piano-ruler'))return;
      const mode=markMode(event);
      if(editTool!=='select'&&mode==='replace')return;
      const clip=selectedClip();if(!clip)return;
      const band=piano.querySelector<HTMLElement>('[data-role=piano-band]');if(!band)return;
      const startX=event.clientX,startY=event.clientY;
      reconcileNotes();
      const before=noteSel.list();let boxed=false;
      const paint=(moveEvent:PointerEvent):void=>{
        const rect=dragRect(startX,startY,moveEvent.clientX,moveEvent.clientY);
        boxed=isBoxDrag(rect);band.hidden=!boxed;if(!boxed)return;
        const surface=(piano.firstElementChild as HTMLElement).getBoundingClientRect();
        band.style.left=`${rect.left-surface.left}px`;band.style.top=`${rect.top-surface.top}px`;
        band.style.width=`${rect.right-rect.left}px`;band.style.height=`${rect.bottom-rect.top}px`;
        const hit:NoteRef[]=[];
        piano.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>{const box=element.getBoundingClientRect();if(rectOverlaps(rect,{left:box.left,top:box.top,right:box.right,bottom:box.bottom}))hit.push({clipId:clip.id,noteId:element.dataset.note||''});});
        noteSel.replace(mode==='replace'?hit:[...before,...hit]);
        const keys=new Set(noteSel.list().map((ref)=>ref.noteId));
        piano.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>element.classList.toggle('is-selected',keys.has(element.dataset.note||'')));
      };
      const finish=(committed:boolean):void=>{
        window.removeEventListener('pointermove',paint);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',abort);
        band.hidden=true;cancelActiveGesture=null;
        if(!boxed)return;
        if(!committed){noteSel.replace(before);renderEditor();return;}
        const chosen=noteSel.list();const track=selectedTrack();
        if(chosen.length&&track)selection={type:'note',trackId:track.id,clipId:clip.id,noteId:chosen[0].noteId};
        renderEditor();renderSide();status(chosen.length?`${chosen.length} note${chosen.length>1?'s':''} selected`:'Selection cleared');
      };
      const done=():void=>finish(true);const abort=():void=>finish(false);
      cancelActiveGesture=abort;
      window.addEventListener('pointermove',paint);window.addEventListener('pointerup',done,{once:true});window.addEventListener('pointercancel',abort,{once:true});
    });
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;const noteEl=target.closest<HTMLElement>('.ks-note');
      const clip=selectedClip();const track=selectedTrack();
      if(!noteEl||!clip||!track)return;
      const note=clip.notes.find((item)=>item.id===noteEl.dataset.note);if(!note)return;
      const isResize=Boolean(target.closest('[data-note-resize]'));
      reconcileNotes();
      noteSel.apply({clipId:clip.id,noteId:note.id},markMode(event));
      selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};
      /** resize 는 집은 음 하나만, 이동은 표시된 음 전부가 같은 간격을 유지한 채 간다. */
      const group=(isResize?[{clip,note}]:markedNotes()).map((item)=>({note:item.note,el:root.querySelector<HTMLElement>(`.ks-note[data-note="${item.note.id}"]`),beat:item.note.beat,pitch:item.note.pitch,duration:item.note.duration}));
      if(!group.length)return;
      const anchor=group.find((item)=>item.note.id===note.id)||group[0];
      const keys=new Set(noteSel.list().map((ref)=>ref.noteId));
      root.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>element.classList.toggle('is-selected',keys.has(element.dataset.note||'')));
      renderSide();
      if(group.length>1&&!isResize)status(`${group.length} notes selected`);
      const startX=event.clientX,startY=event.clientY;
      if(!noteEl.isConnected)return;
      try{noteEl.setPointerCapture(event.pointerId);}catch(_){return;}
      const move=(moveEvent:PointerEvent)=>{
        if(isResize)anchor.note.duration=Math.max(project.snap,Math.min(clip.duration-anchor.note.beat,snapBeat(anchor.duration+(moveEvent.clientX-startX)/pianoPxPerBeat,project.snap)));
        else{
          const step=snapBeat(Math.max(0,anchor.beat+(moveEvent.clientX-startX)/pianoPxPerBeat),project.snap)-anchor.beat;
          const rows=Math.round((moveEvent.clientY-startY)/16);
          for(const item of group){
            item.note.beat=Math.max(0,Math.min(clip.duration-item.note.duration,item.beat+step));
            item.note.pitch=Math.max(36,Math.min(84,item.pitch-rows));
          }
        }
        for(const item of group){if(!item.el)continue;item.el.style.left=`${68+item.note.beat*pianoPxPerBeat}px`;item.el.style.top=`${24+(84-item.note.pitch)*16+2}px`;item.el.style.width=`${item.note.duration*pianoPxPerBeat}px`;}
      };
      const cleanup=()=>{noteEl.removeEventListener('pointermove',move);noteEl.removeEventListener('pointerup',up);noteEl.removeEventListener('pointercancel',cancel);noteEl.removeEventListener('lostpointercapture',cancel);cancelActiveGesture=null;};
      const up=()=>{cleanup();void engine.preview(track,anchor.note.pitch,anchor.note.velocity);saveSoon();renderEditor();renderTracks();};
      const cancel=()=>{for(const item of group){item.note.beat=item.beat;item.note.pitch=item.pitch;item.note.duration=item.duration;}cleanup();renderEditor();renderTracks();};
      cancelActiveGesture=cancel;
      noteEl.addEventListener('pointermove',move);noteEl.addEventListener('pointerup',up,{once:true});noteEl.addEventListener('pointercancel',cancel,{once:true});noteEl.addEventListener('lostpointercapture',cancel,{once:true});
    });
    root.addEventListener('contextmenu',(event)=>{const target=event.target as HTMLElement;const dot=target.closest<HTMLElement>('[data-auto-point]');if(dot){event.preventDefault();const track=findTrack(project,dot.dataset.track||'');if(track){track.volumeAutomation=track.volumeAutomation.filter((point)=>point.id!==dot.dataset.autoPoint);saveSoon('automation');engine.updateProject(project);renderTracks();status('자동화 점 삭제');}return;}const clipEl=target.closest<HTMLElement>('.ks-clip');const noteEl=target.closest<HTMLElement>('.ks-note');const lane=target.closest<HTMLElement>('.ks-lane');if(!clipEl&&!noteEl&&!lane)return;event.preventDefault();event.stopPropagation();if(noteEl){const clip=selectedClip();const track=selectedTrack();const note=clip?.notes.find((item)=>item.id===noteEl.dataset.note);if(clip&&track&&note){clip.notes=clip.notes.filter((item)=>item.id!==note.id);selection={type:'clip',trackId:track.id,clipId:clip.id};saveSoon();renderEditor();renderTracks();renderSide();status('Right-click · deleted MIDI note');}}else if(clipEl){const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';selection={type:'clip',trackId,clipId};renderSide();renderEditor();showContextMenu(event.clientX,event.clientY,[['open-editor','편집기 열기'],['copy','클립 복사'],['cut','클립 잘라내기'],['duplicate','클립 복제'],['split','재생 헤드에서 분할'],['delete','클립 삭제']]);}else if(lane){selection={type:'track',trackId:lane.dataset.lane||''};renderSide();showContextMenu(event.clientX,event.clientY,[['open-editor','클립을 더블클릭해 편집']]);}});
    function deleteSelection():void{
      const chosen=selection;if(!chosen)return;const track=findTrack(project,chosen.trackId);if(!track)return;
      if(chosen.type==='note'){const doomed=markedNotes();const clip=findClip(project,chosen.trackId,chosen.clipId);if(clip&&doomed.length){const ids=new Set(doomed.map((item)=>item.note.id));clip.notes=clip.notes.filter((note)=>!ids.has(note.id));noteSel.clear();if(doomed.length>1)status(`Deleted ${doomed.length} notes`);}selection={type:'clip',trackId:chosen.trackId,clipId:chosen.clipId};saveSoon();renderAll();return;}
      else if(chosen.type==='clip'){const doomed=markedClips();for(const item of doomed)item.track.clips=item.track.clips.filter((clip)=>clip.id!==item.clip.id);marks.clear();if(doomed.length>1)status(`Deleted ${doomed.length} clips`);}
      selection={type:'track',trackId:track.id};saveSoon();renderAll();}
    const keydown=(event:KeyboardEvent)=>{if(!root.isConnected)return;if(event.key==='Escape'){event.preventDefault();cancelActiveGesture?.();hideContextMenu();if($<HTMLElement>('[data-role=export]').innerHTML){closeExport();return;}if(editorExpanded)setEditorExpanded(false);return;}const command=event.ctrlKey||event.metaKey;if(command&&event.key.toLowerCase()==='z'){event.preventDefault();restoreHistory(event.shiftKey?'redo':'undo');return;}if(command&&event.key.toLowerCase()==='y'){event.preventDefault();restoreHistory('redo');return;}const tag=(event.target as HTMLElement).tagName;if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;if(!command&&['p','e','c'].includes(event.key.toLowerCase())){editTool=event.key.toLowerCase()==='p'?'draw':event.key.toLowerCase()==='e'?'select':'slice';renderAll();status(`${editTool.toUpperCase()} tool`);return;}if(command&&event.key.toLowerCase()==='c'){event.preventDefault();copySelection();return;}if(command&&event.key.toLowerCase()==='x'){event.preventDefault();cutSelection();return;}if(command&&event.key.toLowerCase()==='v'){event.preventDefault();pasteClipboard();return;}if(event.code==='Space'){event.preventDefault();engine.isPlaying()?stop():play();}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelection();}else if(command&&event.key.toLowerCase()==='b'){event.preventDefault();root.querySelector<HTMLElement>('[data-act=duplicate]')?.click();}};document.addEventListener('keydown',keydown);
    $<HTMLElement>('[data-role=backdrop]').addEventListener('click',()=>{if($<HTMLElement>('[data-role=export]').innerHTML){closeExport();return;}setEditorExpanded(false);});
    Toolbox.onHandoff?.('karmo-studio',(file: File)=>{if(file.type.startsWith('audio/'))void importAudio([file]);else if(file.type==='application/json')void file.text().then(importPortable).then((next: StudioProject)=>{project=next;history.reset(project);return refreshAssets();}).then(()=>renderAll());});
    Toolbox.onDispose?.(()=>{stop();engine.dispose();if(countInTimer!==undefined)clearInterval(countInTimer);document.removeEventListener('keydown',keydown);if(saveTimer!==undefined)clearTimeout(saveTimer);if(recording)recording.stop();});
    renderAll(); void refreshAssets().then(()=>{renderAll();status('Ready · autosave on');}); Mdd.linePreset('tool_run',{mood:'idle',msg:'Karmo Studio — 편곡부터 WAV까지 한 프로젝트에서.'});
  }
})();
