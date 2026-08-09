/**
 * presentation-svg.ts — **발표를 한 장으로** (TASK-KL-202 방향③, Sozi 계보).
 *
 * 지금 발표 모드는 이 도구 안에서만 돈다. 그런데 발표는 대개 **남의 기계**에서 열린다 —
 * 강의실 노트북, 남에게 보낸 파일, 오프라인. 그래서 결과물이 브라우저만 있으면 도는 SVG 한 장이어야 한다.
 *
 * 만드는 법: 이미 만든 그림 SVG 에 **장면 목록 + 아주 작은 스크립트**를 얹는다. 화살표(←→)·클릭으로
 * 장면을 옮기고, `viewBox` 를 부드럽게 갈아 끼운다. 라이브러리 0, 서버 0.
 */

export interface SvgScene {
  title: string;
  note?: string;
  /** world 좌표 사각형 — 이 자리를 화면에 꽉 채운다. */
  rect: { x: number; y: number; w: number; h: number };
}

/** 장면 안내(제목·설명)를 그리는 자리 — 그림을 가리지 않게 아래에 얇게 깐다. */
const OVERLAY = `
  <g id="km-stage" transform="translate(0,0)">
    <rect id="km-stage-bg" x="0" y="0" width="100" height="34" fill="rgba(0,0,0,0.6)"></rect>
    <text id="km-stage-title" x="10" y="15" fill="#fff" font-size="11" font-family="system-ui, sans-serif"></text>
    <text id="km-stage-note" x="10" y="28" fill="rgba(255,255,255,0.75)" font-size="9" font-family="system-ui, sans-serif"></text>
  </g>`;

/**
 * @param svg `canvas-export` 가 만든 그림 SVG 문자열
 * @param scenes 장면들(하나도 없으면 그냥 그림 그대로 돌려준다 — 발표할 게 없는데 조작만 붙이면 성가시다)
 */
export function withPresentation(svg: string, scenes: SvgScene[]): string {
  if (scenes.length === 0) return svg;
  const data = JSON.stringify(scenes);
  const script = `
  <script type="application/ecmascript"><![CDATA[
    (function () {
      var scenes = ${data};
      var svg = document.documentElement;
      var i = 0;
      var stage = document.getElementById('km-stage');
      var title = document.getElementById('km-stage-title');
      var note = document.getElementById('km-stage-note');
      var bg = document.getElementById('km-stage-bg');
      var from = null;

      function boxOf(s) { return [s.rect.x, s.rect.y, s.rect.w, s.rect.h]; }
      function setBox(b) { svg.setAttribute('viewBox', b.join(' ')); layoutStage(b); }
      function layoutStage(b) {
        // 안내는 **지금 보는 자리**의 아래쪽에 붙어야 한다 — viewBox 가 바뀌면 같이 따라간다.
        var h = Math.max(18, b[3] * 0.08);
        stage.setAttribute('transform', 'translate(' + b[0] + ',' + (b[1] + b[3] - h) + ')');
        bg.setAttribute('width', b[2]); bg.setAttribute('height', h);
        title.setAttribute('font-size', h * 0.42); note.setAttribute('font-size', h * 0.3);
        title.setAttribute('y', h * 0.45); note.setAttribute('y', h * 0.82);
        title.setAttribute('x', b[2] * 0.02); note.setAttribute('x', b[2] * 0.02);
      }
      function show(n, animate) {
        i = (n + scenes.length) % scenes.length;
        var s = scenes[i];
        title.textContent = (i + 1) + '/' + scenes.length + '  ' + s.title;
        note.textContent = s.note || '';
        var to = boxOf(s);
        if (!animate || !from) { from = to; setBox(to); return; }
        // 톡 끊어 점프하면 「어디서 어디로 갔는지」가 안 남는다 — 400ms 로 미끄러뜨린다.
        var a = from, t0 = performance.now();
        (function step(now) {
          var k = Math.min(1, (now - t0) / 400);
          var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          setBox([0, 1, 2, 3].map(function (j) { return a[j] + (to[j] - a[j]) * e; }));
          if (k < 1) requestAnimationFrame(step); else from = to;
        })(t0);
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ') show(i + 1, true);
        if (e.key === 'ArrowLeft') show(i - 1, true);
      });
      svg.addEventListener('click', function () { show(i + 1, true); });
      show(0, false);
    })();
  ]]></script>`;

  return svg.replace('</svg>', `${OVERLAY}${script}</svg>`);
}
