/** Karmo Studio 화면 규칙 — 위젯 본체에서 떼어 낸 문자열 하나 (TASK-KL-220). 동작은 없다. */
export const KARMO_STUDIO_CSS = `
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
    .ks-track-row { display:grid; grid-template-columns:var(--ks-head) auto; min-height:var(--ks-row,84px); border-bottom:1px solid var(--border); }
    .ks-track-head { position:relative; }
    .ks-track-resize { position:absolute; left:0; right:0; bottom:-3px; height:7px; cursor:ns-resize; z-index:6; }
    .ks-track-resize:hover { background:color-mix(in srgb,var(--accent) 55%,transparent); }
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
    .ks-track-row.is-folded { min-height:22px; }
    .ks-track-row.is-folded .ks-track-resize { display:none; }
    .ks-track-row.is-folded .ks-track-head { padding:2px 7px; overflow:hidden; }
    .ks-track-row.is-folded .ks-track-head input[type=range] { display:none; }
    .ks-track-row.is-folded .ks-lane { height:20px; }
    .ks-track-row.is-folded .ks-clip { height:20px; }
    .ks-track-row.is-folded .ks-clip-name, .ks-track-row.is-folded .ks-midi-notes, .ks-track-row.is-folded .ks-wave-svg, .ks-track-row.is-folded .ks-wave-missing { display:none; }
    .ks-track-row.is-dragging { opacity:.45; }
    .ks-track-row.is-drop-before { box-shadow:inset 0 2px 0 var(--accent); }
    .ks-track-row.is-drop-after { box-shadow:inset 0 -2px 0 var(--accent); }
    .ks-track-grip { cursor:grab; padding:0 3px; color:var(--text-tertiary); font:11px var(--font-mono); }
    .ks-marker { position:absolute; top:0; height:30px; z-index:8; display:flex; align-items:center; gap:3px; padding:0 5px 0 3px; border-left:2px solid #e3c15a; background:color-mix(in srgb,#e3c15a 22%,var(--bg-secondary)); color:var(--text-secondary); font:9px var(--font-mono); white-space:nowrap; cursor:grab; border-radius:0 3px 3px 0; }
    .ks-marker:hover { background:color-mix(in srgb,#e3c15a 38%,var(--bg-secondary)); }
    .ks-auto { position:relative; height:46px; border-top:1px dashed var(--border); background:color-mix(in srgb,var(--bg-secondary) 60%,transparent); cursor:crosshair; }
    .ks-auto svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
    .ks-auto path { fill:none; stroke:var(--accent); stroke-width:1.5; }
    .ks-auto i { position:absolute; width:9px; height:9px; margin:-5px 0 0 -5px; border-radius:50%; background:var(--accent); border:1px solid var(--bg-primary); cursor:grab; }
    .ks-clip.is-muted { opacity:.4; filter:saturate(.3); }
    .ks-clip.is-locked { cursor:not-allowed; }
    .ks-clip.is-locked .ks-clip-name::after { content:' 🔒'; }
    .ks-clip.is-locked .ks-handle { display:none; }
    .ks-clip.is-muted .ks-clip-name::before { content:'🔇 '; }
    .ks-auto-pick { position:absolute; right:4px; top:2px; display:flex; gap:3px; z-index:2; }
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
`;
