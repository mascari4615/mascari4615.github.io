/**
 * 먹의 생김새. 한 벌뿐이라 문서에 한 번만.
 *
 * 왜 갈랐나: `meok.ts` 1,700 줄 중 100 줄이 CSS 문자열. 배선을 읽을 때마다 지나쳐야 하는
 * 덩이였고, 여기 옮겨도 부르는 쪽은 한 줄.
 */
export function injectStyles(): void {
  if (document.getElementById('meok-style')) return;
  const style = document.createElement('style');
  style.id = 'meok-style';
  style.textContent = [
    /* 높이는 **부모가 준 자리**로만. `height:100%` 금지. 부모 높이가 확정이 아닌 자리에서 auto 로
       떨어지고, 자식이 부모를 다시 정하는 순환에 화면이 굳는다 (2026-08-29 실측: 탭 두 개 응답 상실).
       옛 값 min(78vh,820px) 은 1440p 에서 상한에 걸려 화면 절반만 씀. 안 늘어나는 자리는 min-height 가 받음. */
    '.meok{--meok-gap:8px;display:flex;flex-direction:column;flex:1 1 auto;min-height:min(62vh,420px);background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;font-size:var(--font-size-2xs)}',
    '.meok-host{display:flex;flex-direction:column;flex:1;min-height:0}',
    /* 먹 탭에서만 도는 사슬. 셸에서 그림판까지 세로를 흘려 보낸다. 클래스는 탭을 떠날 때 뗀다. */
    '.tool-page.meok-page{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-width:none}',
    '.meok-page .tab-panel.active{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
    '.meok-page .pf-body{flex:1 1 auto;min-height:0;align-items:stretch}',
    '.meok-page .pf-right{display:flex;flex-direction:column;min-height:0}',
    '.meok-page .pf-mount{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
    /* 묶음 머리말은 그림 그리는 동안 자리만 먹는다 (실측 109px). 도구 사이를 오가는 `pf-head` 는 남긴다. */
    '.meok-page > .tool-page-hero{display:none}',
    /* 사진 놓는 자리도 접는다 (실측 106px). 먹에는 열기와 붙이기 버튼이 자기 머리줄에 있다. */
    '.meok-page .pf-drop{display:none}',
    '.meok-full{margin-left:2px;font-size:var(--font-size-2xs);line-height:1;padding:4px 7px}',
    '.meok:fullscreen,.meok :fullscreen{border-radius:0}',
    '.meok *{box-sizing:border-box}',
    '.meok button{border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);border-radius:var(--radius-md);padding:5px 8px;cursor:pointer;font-size:var(--font-size-2xs)}',
    '.meok button:hover{border-color:var(--accent)}',
    '.meok button.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,transparent)}',
    '.meok-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg-secondary);border-bottom:1px solid var(--border);flex-wrap:wrap}',
    '.meok-logo{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--text-primary);color:var(--bg-primary);font-size:var(--font-size-2xs);font-weight:700;flex:0 0 auto}',
    '.meok-name{flex:0 1 180px;min-width:90px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:5px 7px}',
    '.meok-sep{width:1px;height:20px;background:var(--border)}',
    '.meok-file{border:1px solid var(--border);background:var(--bg-tertiary);border-radius:var(--radius-md);padding:5px 8px;cursor:pointer}',
    '.meok-status{margin-left:auto;color:var(--text-tertiary);font-size:var(--font-size-3xs)}',
    '.meok-body{flex:1;display:grid;grid-template-columns:76px minmax(0,1fr) 216px;min-height:0}',
    '.meok-tools{display:flex;flex-direction:column;gap:5px;padding:8px;background:var(--bg-secondary);border-right:1px solid var(--border);overflow:auto}',
    '.meok-tools button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;line-height:1.1}',
    '.meok-tools small{font-size:var(--font-size-4xs);color:var(--text-tertiary);white-space:nowrap}',
    '.meok-tools svg{width:19px;height:19px}',
    '.meok-tools button.active svg{color:var(--accent)}',
    '.meok-tools hr{width:100%;border:0;border-top:1px solid var(--border);margin:4px 0}',
    '.meok-tools input[type=color]{width:100%;height:30px;padding:0;border:1px solid var(--border);border-radius:var(--radius-md);background:none}',
    '.meok-palette{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}',
    '.meok-swatch{aspect-ratio:1;padding:0;border-radius:var(--radius-sm)}',
    /* 누를 곳은 24x24 이상 (WCAG 2.2 2.5.8). 높이가 23px 이었다 */
    '.meok-mini{font-size:var(--font-size-4xs)!important;padding:5px 4px!important;line-height:1.25;white-space:normal;min-height:24px}',
    '.meok-presets{display:flex;flex-direction:column;gap:3px;margin-bottom:4px}',
    '.meok-presets button{font-size:var(--font-size-4xs);padding:4px 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meok-stage{display:flex;flex-direction:column;min-width:0;min-height:0}',
    '.meok-brush{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--bg-secondary);flex-wrap:wrap}',
    '.meok-brush label{display:flex;align-items:center;gap:5px;color:var(--text-secondary)}',
    '.meok-brush input[type=range]{width:74px}',
    '.meok-brush b{min-width:26px;color:var(--text-tertiary);font-weight:500}',
    '.meok-zoom{margin-left:auto;color:var(--text-tertiary)}',
    '.meok-selbar{display:flex;gap:4px}',
    '.meok-selbar button[disabled]{opacity:.35;cursor:default}',
    '.meok-canvas{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--bg-primary);background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--border) 60%,transparent) 1px,transparent 0);background-size:18px 18px}',
    '.meok-canvas canvas{position:absolute;inset:0;touch-action:none}',
    '.meok-timeline{display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--border);background:var(--bg-secondary)}',
    '.meok-timeline label{display:flex;align-items:center;gap:4px;color:var(--text-secondary)}',
    '.meok-timeline input[type=number]{width:52px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:3px 5px}',
    '.meok-frames{flex:1;display:flex;gap:5px;overflow-x:auto;padding:2px}',
    '.meok-frame{padding:2px;display:flex;flex-direction:column;align-items:center;gap:1px}',
    '.meok-frame canvas{width:34px;height:34px;image-rendering:pixelated;background:#fff;border-radius:var(--radius-sm)}',
    '.meok-frame small{font-size:var(--font-size-4xs);color:var(--text-tertiary)}',
    '.meok-layers{display:flex;flex-direction:column;background:var(--bg-secondary);border-left:1px solid var(--border);min-height:0;overflow:hidden}',
    '.meok-layer-head{display:flex;align-items:center;gap:4px;padding:8px}',
    '.meok-layer-head b{flex:1;font-size:var(--font-size-3xs);letter-spacing:.1em;color:var(--text-tertiary)}',
    '.meok-layer-props{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px;border-bottom:1px solid var(--border)}',
    '.meok-layer-props label{display:flex;align-items:center;gap:6px;color:var(--text-secondary)}',
    '.meok-layer-props input[type=range]{flex:1}',
    '.meok-layer-props select{flex:1;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:3px}',
    '.meok-layer-list{flex:0 1 auto;min-height:74px;max-height:38%;overflow:auto;padding:6px}',
    '.meok-fix{border-top:1px solid var(--border);padding:6px 8px 10px;flex:1;min-height:0;overflow:auto}',
    '.meok-fix summary{cursor:pointer;font-size:var(--font-size-3xs);letter-spacing:.1em;color:var(--text-tertiary);padding:2px 0}',
    '.meok-fix label{display:flex;align-items:center;gap:6px;margin:4px 0;color:var(--text-secondary)}',
    '.meok-fix label input{flex:1}',
    '.meok-fix-row{display:flex;gap:4px;margin:5px 0;flex-wrap:wrap}',
    '.meok-fix-row button{flex:1 1 0;min-width:0;font-size:var(--font-size-4xs);padding:5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.meok-fix-row button[disabled]{opacity:.35;cursor:default}',
    '.meok-filters{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px}',
    /* 이모트 판. 미리보기는 올라갈 크기 그대로. 키우거나 줄이면 보는 뜻이 없음.
       `meok-fix` 를 같이 걸지 마라. 실브라우저 검사가 `.meok-fix summary` 하나를 집는데
       둘이 되면 그 자리에서 죽는다 (2026-08-29 실측). 생김새만 여기서 따로 맞춘다. */
    '.meok-emote{border-top:1px solid var(--border);padding:6px 8px 10px}',
    '.meok-emote summary{cursor:pointer;font-size:var(--font-size-3xs);letter-spacing:.1em;color:var(--text-tertiary);padding:2px 0}',
    '.meok-emote-picks{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:4px 0 8px}',
    '.meok-emote-picks button{font-size:var(--font-size-4xs);padding:5px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.meok-emote-picks button.active{border-color:var(--accent);color:var(--text-primary)}',
    '.meok-emote-shots{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:6px;background:var(--bg-primary);border-radius:var(--radius-md);min-height:40px}',
    '.meok-emote-shot{display:flex;flex-direction:column;align-items:center;gap:2px}',
    '.meok-emote-shot canvas{background:#fff;border-radius:var(--radius-sm);image-rendering:auto}',
    '.meok-emote-shot small{font-size:var(--font-size-4xs);color:var(--text-tertiary)}',
    '.meok-emote-note{margin:6px 0 0;font-size:var(--font-size-4xs);color:var(--text-tertiary);line-height:1.4}',
    '.meok-filters button{font-size:var(--font-size-3xs);padding:5px 4px}',
    '.meok-layer{display:flex;align-items:center;gap:5px;padding:4px;border:1px solid transparent;border-radius:var(--radius-md);cursor:pointer}',
    '.meok-layer.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}',
    '.meok-layer canvas{width:34px;height:34px;background:#fff;border-radius:var(--radius-sm);image-rendering:pixelated}',
    '.meok-layer-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meok-maskmark{color:var(--accent);font-weight:400}',
    '.meok-eye,.meok-lock{padding:2px 3px!important;border-color:transparent!important;background:none!important;font-size:var(--font-size-4xs);color:var(--text-tertiary);opacity:.8;min-width:24px;min-height:24px}',
    /* 밟았을 때 그림이 달라져야 한다 (2.4.11). 이 셋은 표시가 없었다 */
    '.meok-bar button:focus,.meok-tools button:focus,.meok-layers button:focus,.meok-bar button:focus-visible,.meok-tools button:focus-visible,.meok-layers button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    '@media(max-width:860px){.meok-body{grid-template-columns:60px minmax(0,1fr)}.meok-layers{grid-column:1/-1;border-left:0;border-top:1px solid var(--border);max-height:210px}.meok{height:auto}}'
  ].join('');
  document.head.append(style);
}
