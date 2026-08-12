/** 「본」 — 화면 꾸밈. 먹과 같은 방식으로 한 번만 심는다(위젯을 갈아 끼워도 안 쌓인다). */
export function injectBonStyles(): void {
  if (document.getElementById('bon-style')) return;
  const style = document.createElement('style');
  style.id = 'bon-style';
  style.textContent = `
.bon-wrap {
      display:flex; flex-direction:column; gap:10px;
      /* 먹과 같은 결 — 창 높이에 맞춰 접히되 너무 납작해지지 않는다. */
      height:min(78vh, 820px); min-height:520px;
      background:var(--bg-primary); color:var(--text-primary);
      border:1px solid var(--border); border-radius:var(--radius-md);
      padding:10px; overflow:hidden; font-size:12px;
    }
    .bon-wrap * { box-sizing:border-box; }
    .bon-wrap button { border:1px solid var(--border); background:var(--bg-tertiary);
      color:var(--text-primary); border-radius:6px; padding:5px 9px; cursor:pointer; font-size:12px; }
    .bon-wrap button:hover { border-color:var(--accent); }
    .bon-wrap input[type=number], .bon-wrap input[type=color] {
      background:var(--bg-primary); color:var(--text-primary);
      border:1px solid var(--border); border-radius:6px; padding:4px 6px; font-size:12px; }
    .bon-wrap input[type=number] { width:64px; }
    .bon-wrap input[type=color] { width:40px; height:26px; padding:2px; }
    .bon-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex-shrink:0;
      padding-bottom:8px; border-bottom:1px solid var(--border); }
    .bon-bar > strong { font-size:14px; }
    .bon-bar label.bon-row { gap:5px; }
    .bon-bar label.bon-row > span { color:var(--text-secondary); }
    .bon-bar input[type=range] { width:92px; }
    .bon-bar .spacer { flex:1; }
    .bon-body { display:flex; gap:14px; flex:1; min-height:0; }

    /* 왼쪽 도구 — 글리프가 아니라 선 그림이다(글꼴 따라 안 달라진다) */
    .bon-tools { display:flex; flex-direction:column; gap:4px; flex-shrink:0; }
    .bon-tools button {
      width:40px; height:40px; display:flex; align-items:center; justify-content:center;
      background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-sm);
      color:var(--text-secondary); cursor:pointer; transition:all var(--transition);
    }
    .bon-tools button:hover { border-color:var(--accent); color:var(--text-primary); }
    .bon-tools button.active { background:var(--accent); border-color:var(--accent); color:#fff; }
    .bon-tools svg { width:20px; height:20px; }

    /* 가운데 판 — 투명한 곳은 체크무늬로 보인다 */
    .bon-canvas {
      flex:1; min-width:0; overflow:auto; display:flex; align-items:center; justify-content:center;
      background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-sm);
      padding:24px;
    }
    .bon-stage { position:relative; flex-shrink:0; box-shadow:0 2px 16px rgba(0,0,0,.25);
      background-color:#ffffff;
      background-image:
        linear-gradient(45deg, #d8d8d8 25%, transparent 25%, transparent 75%, #d8d8d8 75%),
        linear-gradient(45deg, #d8d8d8 25%, transparent 25%, transparent 75%, #d8d8d8 75%);
      background-size:16px 16px; background-position:0 0, 8px 8px;
    }
    .bon-art { position:absolute; inset:0; }
    .bon-art svg { display:block; }
    .bon-guides { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .bon-grid { stroke:rgba(90,120,180,.30); stroke-width:1; fill:none; }
    .bon-sel { fill:none; stroke:var(--accent); stroke-width:1.5; stroke-dasharray:4 3; }
    .bon-slice { stroke:#ff9f43; stroke-width:1.4; stroke-dasharray:6 4; fill:none; }
    .bon-handle { fill:var(--bg-primary); stroke:var(--accent); stroke-width:1.5; }

    /* 오른쪽 — 고른 도형의 숫자 */
    .bon-side { width:250px; flex-shrink:0; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
    .bon-card { border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px;
      display:flex; flex-direction:column; gap:8px; background:var(--bg-secondary); }
    .bon-card h4 { margin:0; font-size:var(--font-size-2xs); font-weight:600; color:var(--text-secondary);
      letter-spacing:.06em; text-transform:uppercase; }
    .bon-row { display:flex; align-items:center; gap:8px; font-size:var(--font-size-xs); }
    .bon-row label { width:52px; flex-shrink:0; color:var(--text-secondary); }
    .bon-row input[type=range] { flex:1; min-width:0; }
    .bon-row input[type=number] { width:62px; }
    .bon-row output { width:38px; text-align:right; font-variant-numeric:tabular-nums;
      color:var(--text-secondary); }

    /* 레이어 — 위가 앞이다 */
    .bon-layers { gap:3px; }
    .bon-layer { display:flex; align-items:center; gap:7px; padding:5px 7px;
      border:1px solid transparent; border-radius:5px; cursor:pointer; font-size:12px; }
    .bon-layer:hover { background:var(--bg-tertiary); }
    .bon-layer.active { border-color:var(--accent); background:var(--bg-tertiary); }
    .bon-layer-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bon-layer-count { color:var(--text-secondary); font-variant-numeric:tabular-nums; font-size:11px; }
    .bon-eye { width:22px; height:22px; padding:0; display:flex; align-items:center; justify-content:center;
      background:transparent; border:none; color:var(--text-secondary); font-size:11px; }
    .bon-eye:hover { color:var(--text-primary); }
    .bon-layer-acts { gap:4px; margin-top:4px; }
    .bon-layer-acts button { flex:1; padding:4px 2px; font-size:11px; }
    .bon-foot { display:flex; align-items:center; gap:7px; flex-shrink:0;
      padding-top:8px; border-top:1px solid var(--border); }
    .bon-foot-label { color:var(--text-secondary); font-size:11px; letter-spacing:.06em; }
    .bon-foot-hint { color:var(--text-tertiary, var(--text-secondary)); font-size:11px; margin-left:6px; }
    .bon-empty { color:var(--text-secondary); font-size:var(--font-size-xs); padding:6px 2px; }
`;
  document.head.append(style);
}
