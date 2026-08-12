/** 흥 화면 규칙 — 위젯 본체에서 떼어 낸 문자열 하나 (TASK-KL-220). 동작은 없다. */
export const HEUNG_CSS = `
    .hu-root { --hu-head:172px; --hu-beat:72px; display:flex; flex-direction:column; width:100%; user-select:none;
      height:calc(100dvh - 150px); min-height:620px; overflow:hidden; background:var(--bg-primary); color:var(--text-primary); }
    .hu-root input,.hu-root textarea { user-select:text; }
    .hu-toolbar { display:flex; align-items:center; gap:6px; padding:7px 9px; flex-wrap:wrap; flex:none;
      border-bottom:1px solid var(--border); background:var(--bg-secondary); position:relative; z-index:8; }
    .hu-toolbar > * { width:auto; flex:0 0 auto; margin:0; }
    .hu-brand { font:700 12px/1 var(--font-mono); letter-spacing:.13em; margin-right:5px; color:var(--accent); }
    .hu-btn { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-tertiary); color:var(--text-primary);
      min-height:30px; padding:4px 9px; font:11px var(--font-mono); cursor:pointer; }
    .hu-btn:hover { border-color:var(--border-hover); background:var(--bg-hover); }
    .hu-btn.is-on, .hu-btn.is-recording { color:var(--accent-hover); background:var(--accent-dim); border-color:var(--accent); }
    .hu-btn.is-recording { color:#ff7a86; }
    .hu-project-name { width:150px !important; border:0; background:transparent; color:var(--text-primary); font-weight:650; padding:4px; }
    .hu-number { width:74px !important; min-width:74px; flex:none; padding:5px; background:var(--bg-primary); color:var(--text-primary); border:1px solid var(--border); border-radius:var(--radius-sm); }
    .hu-time { min-width:82px; font:12px var(--font-mono); text-align:center; color:var(--text-secondary); }
    .hu-spacer { flex:1 1 20px !important; }
    .hu-work { display:grid; grid-template-columns:minmax(0, 1fr) 260px; min-height:0; flex:1; }
    .hu-arranger { min-width:0; min-height:0; display:flex; flex-direction:column; }
    .hu-scroll { position:relative; overflow:auto; min-height:0; flex:1; background:var(--bg-tertiary); }
    .hu-ruler { position:sticky; top:0; z-index:7; height:30px; min-width:100%; background:var(--bg-secondary); border-bottom:1px solid var(--border); }
    .hu-ruler { cursor:text; }
    .hu-loop { cursor:grab; }
    .hu-loop-grip { position:absolute; top:0; bottom:0; width:7px; left:0; cursor:ew-resize; background:var(--accent); opacity:.85; border-radius:2px; }
    .hu-loop-grip.is-end { left:auto; right:0; }
    .hu-ruler-head { position:sticky; left:0; z-index:2; width:var(--hu-head); height:30px; border-right:1px solid var(--border); background:var(--bg-secondary); }
    .hu-mark { position:absolute; top:0; height:30px; border-left:1px solid var(--border); color:var(--text-tertiary); font:10px var(--font-mono); padding:5px; }
    .hu-track-row { display:grid; grid-template-columns:var(--hu-head) auto; min-height:var(--hu-row,84px); border-bottom:1px solid var(--border); }
    .hu-track-head { position:relative; }
    .hu-track-resize { position:absolute; left:0; right:0; bottom:-3px; height:7px; cursor:ns-resize; z-index:6; }
    .hu-track-resize:hover { background:color-mix(in srgb,var(--accent) 55%,transparent); }
    .hu-track-head { position:sticky; left:0; z-index:5; padding:7px; border-right:1px solid var(--border); background:var(--bg-secondary); }
    .hu-track-title { display:flex; align-items:center; gap:5px; }
    .hu-track-color { width:9px; height:9px; border-radius:50%; flex:none; }
    .hu-track-title input { min-width:0; width:100%; border:0; padding:2px; background:transparent; color:var(--text-primary); font-size:12px; }
    .hu-track-actions { display:flex; gap:3px; margin:5px 0; }
    .hu-mini { width:25px; height:23px; padding:0; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary); border-radius:4px; font:10px var(--font-mono); cursor:pointer; }
    .hu-mini.is-on { background:var(--accent-dim); color:var(--accent-hover); border-color:var(--accent); }
    .hu-track-head input[type=range] { width:72px; height:14px; margin:0; accent-color:var(--accent); }
    .hu-lane { position:relative; height:84px; background-image:linear-gradient(to right, var(--border) 1px, transparent 1px);
      background-size:var(--hu-beat) 100%; }
    .hu-lane::after { content:""; position:absolute; inset:0; pointer-events:none; background-image:linear-gradient(to right, transparent calc(100% - 1px), color-mix(in srgb, var(--border) 55%, transparent) 1px); background-size:calc(var(--hu-beat) / 4) 100%; opacity:.45; }
    .hu-clip { position:absolute; top:9px; height:64px; min-width:8px; border:1px solid color-mix(in srgb, var(--clip) 80%, white);
      border-radius:5px; background:color-mix(in srgb, var(--clip) 42%, var(--bg-secondary)); overflow:hidden; cursor:grab; z-index:2; user-select:none; }
    .hu-root[data-tool="slice"] .hu-clip { cursor:col-resize; }
    .hu-root[data-tool="select"] .hu-lane { cursor:default; }
    .hu-root[data-tool="draw"] .hu-lane[data-kind="midi"] { cursor:crosshair; }
    .hu-clip.is-selected { outline:2px solid var(--text-primary); outline-offset:1px; }
    .hu-clip-name { height:20px; padding:3px 7px; background:color-mix(in srgb, var(--clip) 58%, transparent); font:10px var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .hu-midi-notes { position:absolute; inset:23px 5px 5px; }
    .hu-midi-note { position:absolute; height:4px; border-radius:2px; background:color-mix(in srgb, var(--clip) 55%, white); }
    .hu-wave-svg { position:absolute; inset:23px 4px 4px; width:calc(100% - 8px); height:calc(100% - 27px); overflow:visible; color:color-mix(in srgb,var(--clip) 52%,white); }
    .hu-wave-svg path { fill:none; stroke:currentColor; stroke-width:1; vector-effect:non-scaling-stroke; }
    .hu-wave-missing { position:absolute; inset:26px 6px 5px; display:grid; place-items:center; color:var(--text-tertiary); font:9px var(--font-mono); }
    .hu-audio-editor { flex:1; min-height:0; position:relative; display:flex; flex-direction:column; padding:16px; gap:12px; }
    .hu-audio-wave { position:relative; flex:1; min-height:110px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-tertiary); overflow:hidden; }
    .hu-audio-wave .hu-wave-svg { inset:12px; width:calc(100% - 24px); height:calc(100% - 24px); }
    .hu-audio-zero { position:absolute; left:0; right:0; top:50%; border-top:1px solid var(--border-hover); opacity:.55; }
    .hu-audio-controls { display:grid; grid-template-columns:repeat(4,minmax(110px,1fr)); gap:10px; }
    .hu-audio-controls .hu-field { grid-template-columns:70px minmax(0,1fr); }
    .hu-handle { position:absolute; top:0; right:0; width:8px; height:100%; cursor:ew-resize; background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--clip) 70%,white)); }
    .hu-playhead { position:absolute; top:30px; bottom:0; width:1px; background:#ff5d6c; z-index:6; pointer-events:none; box-shadow:0 0 5px #ff5d6c; }
    .hu-guide { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:7px 10px; border-bottom:1px solid var(--border); background:color-mix(in srgb,var(--accent) 12%,var(--bg-secondary)); color:var(--text-secondary); font:11px var(--font-mono); }
    .hu-guide[hidden] { display:none; }
    .hu-guide b { color:var(--accent); letter-spacing:.06em; }
    .hu-guide em { font-style:normal; color:var(--text-primary); }
    .hu-lane-hint { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); font:10px var(--font-mono); opacity:.62; pointer-events:none; white-space:nowrap; }
    .hu-lane { position:relative; }
    .hu-track-row.is-folded .hu-lane-hint { display:none; }
    .hu-track-row.is-folded { min-height:22px; }
    .hu-track-row.is-folded .hu-track-resize { display:none; }
    .hu-track-row.is-folded .hu-track-head { padding:2px 7px; overflow:hidden; }
    .hu-track-row.is-folded .hu-track-head input[type=range] { display:none; }
    .hu-track-row.is-folded .hu-lane { height:20px; }
    .hu-track-row.is-folded .hu-clip { height:20px; }
    .hu-track-row.is-folded .hu-clip-name, .hu-track-row.is-folded .hu-midi-notes, .hu-track-row.is-folded .hu-wave-svg, .hu-track-row.is-folded .hu-wave-missing { display:none; }
    .hu-track-row.is-dragging { opacity:.45; }
    .hu-track-row.is-drop-before { box-shadow:inset 0 2px 0 var(--accent); }
    .hu-track-row.is-drop-after { box-shadow:inset 0 -2px 0 var(--accent); }
    .hu-track-grip { cursor:grab; padding:0 3px; color:var(--text-tertiary); font:11px var(--font-mono); }
    .hu-marker { position:absolute; top:0; height:30px; z-index:8; display:flex; align-items:center; gap:3px; padding:0 5px 0 3px; border-left:2px solid #e3c15a; background:color-mix(in srgb,#e3c15a 22%,var(--bg-secondary)); color:var(--text-secondary); font:9px var(--font-mono); white-space:nowrap; cursor:grab; border-radius:0 3px 3px 0; }
    .hu-marker:hover { background:color-mix(in srgb,#e3c15a 38%,var(--bg-secondary)); }
    .hu-auto { position:relative; height:46px; border-top:1px dashed var(--border); background:color-mix(in srgb,var(--bg-secondary) 60%,transparent); cursor:crosshair; }
    .hu-auto svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
    .hu-auto path { fill:none; stroke:var(--accent); stroke-width:1.5; }
    .hu-auto i { position:absolute; width:9px; height:9px; margin:-5px 0 0 -5px; border-radius:50%; background:var(--accent); border:1px solid var(--bg-primary); cursor:grab; }
    .hu-clip.is-muted { opacity:.4; filter:saturate(.3); }
    .hu-clip.is-locked { cursor:not-allowed; }
    .hu-clip.is-locked .hu-clip-name::after { content:' 🔒'; }
    .hu-clip.is-locked .hu-handle { display:none; }
    .hu-clip.is-muted .hu-clip-name::before { content:'🔇 '; }
    .hu-btn, .hu-mini { white-space:nowrap; }
    /* 셸이 상태줄 옆에 붙이는 「이어서」 줄. 다섯 단추가 390px 를 넘겨 화면 밖으로 나갔다 —
       내 판 안에 들어온 것이니 여기서 접거나 굴러가게 한다. */
    .hu-root .tool-next-row { max-width:100%; overflow-x:auto; flex-wrap:nowrap; }
    .hu-root .tool-next-btn { flex:none; }
    /* 트랙 이름칸은 좁은 머리에서 늘 길다 — 최소폭을 풀어 머리 안에 들어오게 한다. */
    .hu-track-title { min-width:0; }
    .hu-track-title input { min-width:0; width:100%; }
    .hu-auto-pick { display:flex; gap:3px; margin-top:4px; }
    .hu-auto-tag { position:sticky; float:left; left:6px; top:2px; width:max-content; font:9px var(--font-mono); color:var(--text-tertiary); pointer-events:none; }
    .hu-lane.is-drop { box-shadow:inset 0 0 0 2px var(--accent); }
    .hu-help { position:fixed; left:50%; top:8%; transform:translateX(-50%); z-index:1000; width:min(620px,94vw); max-height:84dvh; overflow:auto; padding:14px 16px; border:1px solid var(--border-hover); border-radius:8px; background:var(--bg-secondary); box-shadow:0 18px 40px rgba(0,0,0,.45); }
    .hu-help-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font:12px var(--font-mono); color:var(--text-secondary); }
    .hu-help-body { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px 18px; }
    .hu-help h5 { margin:0 0 4px; font:10px var(--font-mono); letter-spacing:.1em; color:var(--accent); }
    .hu-help p { display:flex; gap:8px; align-items:baseline; margin:0 0 3px; font:11px var(--font-mono); color:var(--text-tertiary); }
    .hu-help .hu-keys { flex:none; display:flex; gap:3px; }
    .hu-help kbd { padding:1px 5px; border:1px solid var(--border-hover); border-bottom-width:2px; border-radius:3px; background:var(--bg-tertiary); color:var(--text-secondary); font:10px var(--font-mono); }
    .hu-export { position:fixed; left:50%; top:12%; transform:translateX(-50%); z-index:1000; width:min(420px,92vw); padding:14px; border:1px solid var(--border-hover); border-radius:8px; background:var(--bg-secondary); box-shadow:0 18px 40px rgba(0,0,0,.45); display:grid; gap:8px; }
    .hu-export h4 { margin:0; font:12px var(--font-mono); color:var(--text-secondary); letter-spacing:.08em; }
    .hu-export label { display:flex; align-items:center; justify-content:space-between; gap:10px; font:11px var(--font-mono); color:var(--text-tertiary); }
    .hu-export select, .hu-export input { font:11px var(--font-mono); }
    .hu-export-note { font:10px var(--font-mono); color:var(--text-tertiary); line-height:1.5; }
    .hu-export-actions { display:flex; gap:6px; justify-content:flex-end; }
    .hu-piano-tools { flex:none; display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:4px 8px; border-bottom:1px solid var(--border); background:var(--bg-secondary); }
    .hu-piano-tools label { display:flex; align-items:center; gap:4px; color:var(--text-tertiary); font:10px var(--font-mono); }
    .hu-velocity { position:relative; height:56px; border-top:1px solid var(--border); background:var(--bg-tertiary); overflow:hidden; flex:none; }
    .hu-velocity-scale { position:absolute; left:0; top:0; bottom:0; width:68px; border-right:1px solid var(--border); color:var(--text-tertiary); font:9px var(--font-mono); padding:3px 5px; pointer-events:none; }
    .hu-vel { position:absolute; bottom:0; width:6px; background:var(--accent); opacity:.55; cursor:ns-resize; border-radius:2px 2px 0 0; }
    .hu-vel.is-selected { opacity:1; outline:1px solid white; }
    .hu-band { position:absolute; z-index:7; pointer-events:none; border:1px solid var(--accent); background:color-mix(in srgb, var(--accent) 18%, transparent); border-radius:2px; }
    .hu-playhead::before { content:""; position:absolute; top:-5px; left:-4px; border:5px solid transparent; border-top-color:#ff5d6c; }
    .hu-loop { position:absolute; top:0; height:4px; background:var(--accent); opacity:.8; z-index:3; }
    .hu-side { min-height:0; border-left:1px solid var(--border); background:var(--bg-secondary); display:flex; flex-direction:column; }
    .hu-side-tabs { display:flex; border-bottom:1px solid var(--border); flex:none; }
    .hu-side-tabs button { flex:1; border:0; border-right:1px solid var(--border); border-radius:0; }
    .hu-side-body { overflow:auto; padding:10px; min-height:0; }
    .hu-section { margin-bottom:14px; }
    .hu-section h4 { margin:0 0 7px; font:10px var(--font-mono); letter-spacing:.1em; color:var(--text-tertiary); }
    .hu-field { display:grid; grid-template-columns:82px minmax(0,1fr); align-items:center; gap:7px; margin:5px 0; font-size:11px; color:var(--text-secondary); }
    .hu-field input,.hu-field select { min-width:0; width:100%; margin:0; padding:5px; border:1px solid var(--border); border-radius:4px; background:var(--bg-primary); color:var(--text-primary); }
    .hu-field input[type=range] { padding:0; accent-color:var(--accent); }
    .hu-meter { position:relative; height:9px; background:var(--bg-tertiary); border-radius:5px; overflow:hidden; }
    .hu-meter span { position:absolute; left:0; top:0; bottom:0; width:0; background:linear-gradient(90deg,var(--accent),#e3c15a 78%,#ff6b76 100%); transition:width .05s linear; }
    .hu-meter i { position:absolute; top:0; bottom:0; width:2px; background:white; opacity:.85; left:0; }
    .hu-meter b { position:absolute; right:0; top:0; bottom:0; width:7px; background:#ff5d6c; opacity:0; }
    .hu-meter.is-clipped b { opacity:1; }
    .hu-meter-row { display:flex; align-items:center; gap:6px; }
    .hu-meter-row .hu-meter { flex:1; }
    .hu-meter-db { min-width:52px; text-align:right; font:9px var(--font-mono); color:var(--text-tertiary); }
    .hu-editor { flex:none; height:300px; border-top:1px solid var(--border); background:var(--bg-primary); display:flex; flex-direction:column; }
    .hu-editor.is-expanded { position:fixed; inset:5dvh 3vw; width:auto; height:auto; z-index:1000;
      border:1px solid var(--border-hover); border-radius:var(--radius-md); box-shadow:0 18px 70px rgba(0,0,0,.72); }
    .hu-modal-backdrop { display:none; position:fixed; inset:0; z-index:999; background:rgba(0,0,0,.64); }
    .hu-modal-backdrop.is-open { display:block; }
    .hu-context { position:fixed; z-index:1100; min-width:180px; padding:5px; border:1px solid var(--border-hover);
      border-radius:var(--radius-sm); background:var(--bg-secondary); box-shadow:0 12px 36px rgba(0,0,0,.55); }
    .hu-context[hidden] { display:none; }
    .hu-context button { display:block; width:100%; padding:7px 10px; border:0; border-radius:var(--radius-sm);
      background:transparent; color:var(--text-primary); text-align:left; font:11px var(--font-mono); cursor:pointer; }
    .hu-context button:hover,.hu-context button:focus-visible { background:var(--bg-hover); outline:none; }
    .hu-editor-head { height:30px; display:flex; align-items:center; gap:8px; padding:4px 8px; border-bottom:1px solid var(--border); font:11px var(--font-mono); }
    .hu-piano { flex:1 1 0; min-height:96px; overflow:auto; position:relative; background:repeating-linear-gradient(to bottom,var(--bg-secondary) 0 15px,var(--border) 16px),repeating-linear-gradient(to right,transparent 0 calc(var(--hu-grid, calc(var(--hu-beat) / 4)) - 1px),var(--border) var(--hu-grid, calc(var(--hu-beat) / 4))); }
    .hu-key { position:absolute; left:0; width:68px; height:16px; border:1px solid var(--border); border-top:0;
      background:#e8e8e4; color:#25252b; font:9px var(--font-mono); padding:2px 5px; z-index:4; }
    .hu-key.is-black { width:45px; background:#25252b; color:#d8d8d3; border-color:#111; z-index:5; }
    .hu-piano-ruler { position:absolute; top:0; left:68px; height:24px; z-index:3; background:var(--bg-secondary); border-bottom:1px solid var(--border); }
    .hu-piano-bar { position:absolute; top:0; height:24px; border-left:1px solid var(--border-hover); padding:4px 6px; color:var(--text-tertiary); font:9px var(--font-mono); }
    .hu-note { position:absolute; height:12px; border-radius:2px; background:var(--accent); cursor:grab; min-width:5px; z-index:3; }
    .hu-note-handle { position:absolute; right:0; top:0; bottom:0; width:7px; cursor:ew-resize; background:rgba(255,255,255,.36); border-radius:0 2px 2px 0; }
    .hu-note.is-selected { outline:1px solid white; }
    .hu-empty { padding:18px 8px; text-align:center; color:var(--text-tertiary); font-size:11px; line-height:1.6; }
    .hu-status { margin-left:auto; max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-tertiary); font:10px var(--font-mono); }
    @media(max-width:850px) { .hu-root{height:auto;min-height:720px;--hu-head:116px}.hu-track-head{padding:5px 4px}.hu-track-head input[type=range]{height:12px}.hu-track-title input{font-size:10px}.hu-editor.is-empty{height:96px}.hu-work{grid-template-columns:1fr}.hu-side{border-left:0;border-top:1px solid var(--border);max-height:250px}.hu-scroll{height:420px}.hu-editor{height:290px}.hu-editor.is-expanded{inset:2dvh 2vw;height:auto}.hu-audio-controls{grid-template-columns:1fr 1fr}.hu-toolbar .hu-status{display:none} }
`;
