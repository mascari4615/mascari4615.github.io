/**
 * 첫 화면 배경 장식 — **첫 화면에서만** 받는다 (TASK-KL-128 ①-c)
 *
 * 왜 따로 나왔나: 이 22KB 는 도구 화면 129장이 매번 같이 받고 있었다. 그런데 도구 화면에는
 * 붙을 자리가 없다 — 첫 화면을 그릴 때만 쓰인다. 셸(`toolbox.js`)에 박혀 있어서 같이 온 것뿐이다.
 *
 * 바깥에서 부르는 것: `window.KarmoHomeScene.mount()`.
 * 셸은 첫 화면을 그릴 때 이 파일을 그때 데려온다(`Toolbox.ensureScript('root/home-scene')`).
 * 그래서 도구만 쓰는 사람은 이 코드를 평생 안 받는다.
 *
 * 이 파일은 셸의 다른 것을 하나도 안 부른다 — 떼어낼 수 있었던 이유가 그것이다.
 * 새 것을 넣을 때 그 규칙을 깨지 마라(깨면 도로 셸에 묶인다).
 */
// @ts-nocheck — 셸에서 그대로 옮겨 온 코드 (TASK-KL-128 ①-c)
(function () {
    /* ═══════ 첫 화면 장식 (Y2K 하프톤 도형) — TASK-KL-097 ═══════
     *
     * 페이지를 **열 때마다** 새로 뽑는다. 만들어 둔 그림을 박아 두면 백 번 들어와도 같은 화면이다.
     * 도형이 일곱 개뿐이라 열 때 계산해도 티가 안 난다. 바깥에서 받아 오는 그림 파일은 0 —
     * 전부 수식에서 나온 인라인 SVG 다.
     *
     * 규칙 셋(전부 실제로 어긋나 봤고 그래서 넣은 것들):
     *   ① 글 읽는 한가운데는 비운다 — 처음엔 제목 위에 얹혀 읽기 힘들었다.
     *   ② 화면을 구역으로 나눠 한 구역에 하나씩 — 그냥 무작위로 뿌리면 한쪽에 몰린다.
     *   ③ 멀수록 작고·뿌옇고·느리다. 그리고 **제일 가까운 것이 제일 흐리다**(렌즈 바로 앞).
     *
     * `?seed=숫자` = 그 배치를 그대로 재현 (마음에 든 화면을 붙잡거나 검사할 때).
     * `?px=4` = 표현 하나로 고정 · `?px=none` = 장식 끔.
     */
    const DECOR_FIELDS = {
        sparkle: (x, y) => 1 - (Math.sqrt(Math.abs(x)) + Math.sqrt(Math.abs(y))),
        flower: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .58 + .30 * Math.cos(6 * t) - r; },
        ring: (x, y) => .20 - Math.abs(Math.hypot(x, y) - .66),
        blob: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .70 + .14 * Math.sin(3 * t + 1) - r; },
        cross: (x, y) => { const a = Math.abs(x), b = Math.abs(y); return .78 - Math.max(a, b) - 1.1 * Math.min(a, b); },
        burst: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .44 + .34 * Math.abs(Math.cos(4 * t)) - r; },
    };
    const DECOR_ZONES = [
        { x: [2, 16], y: [8, 22], band: 'mid' },
        { x: [80, 93], y: [8, 22], band: 'far' },
        { x: [1, 12], y: [42, 58], band: 'near' },
        { x: [8, 22], y: [74, 88], band: 'far' },
        { x: [44, 58], y: [82, 92], band: 'far' },
    ];
    /** 거리 3단이 그대로 시차 배수가 된다 — 멀수록 조금 밀린다 (TASK-KL-101) */
    const DECOR_DEPTH = { far: 0.18, mid: 0.34, near: 0.55 };
    const DECOR_BANDS = {
        far: { z: [38, 58], blur: [2.4, 4.0], op: [.40, .52], dur: [54, 74], amp: [12, 22] },
        mid: { z: [62, 88], blur: [0.8, 1.6], op: [.62, .76], dur: [38, 52], amp: [18, 32] },
        near: { z: [100, 132], blur: [0, 0.3], op: [.88, 1.0], dur: [28, 38], amp: [24, 42] },
    };
    const DECOR_DEFS = `<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
    <linearGradient id="kdg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--decor-a)"/><stop offset="45%" stop-color="var(--decor-b)"/><stop offset="100%" stop-color="var(--decor-c)"/></linearGradient>
    <linearGradient id="kdg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="var(--decor-c)"/><stop offset="50%" stop-color="var(--decor-d)"/><stop offset="100%" stop-color="var(--decor-e)"/></linearGradient>
    <linearGradient id="kdg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--decor-d)"/><stop offset="55%" stop-color="var(--decor-e)"/><stop offset="100%" stop-color="var(--decor-c)"/></linearGradient>
    <linearGradient id="kdgloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".9"/><stop offset="45%" stop-color="#ffffff" stop-opacity=".12"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <pattern id="kdstripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="8" fill="#ffffff" opacity=".8"/></pattern>
    <filter id="kdgrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.55"/><feComposite operator="in" in2="SourceGraphic"/></filter>
    <filter id="kdjelly" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#2a1d6b" flood-opacity=".35"/></filter>
    </defs></svg>`;

    function buildHomeDecor() {
        const q = new URLSearchParams(location.search);
        const force = q.get('px');
        const wrap = document.createElement('div');
        wrap.className = 'home-decor';
        wrap.setAttribute('aria-hidden', 'true');
        if (force === 'none') return wrap;
        // 도구 상세 페이지에도 이 셸이 쓰인다. 거기선 첫 화면이 안 보이므로 그리지 않는다
        // (안 보이는 것을 계산하는 값은 그대로 나간다).
        if (typeof window !== 'undefined' && (window.KARMOLAB_ENTRY_TOOL || window.KARMOLAB_ENTRY_STATIC)) return wrap;

        /* 폰에서는 **만들 때부터** 작게·적게 만든다 (TASK-KL-101).
         * CSS 로 `transform: scale()` 를 걸어 줄이려 했더니 아무 일도 안 일어났다 —
         * 떠다니는 움직임이 같은 transform 을 쓰므로 애니메이션이 이긴다. 그래서 폰에서는
         * 데스크톱 크기 그대로 나와 큰 꽃 하나가 카드를 덮고 있었다. */
        const narrow = typeof window !== 'undefined' && window.innerWidth <= 768;
        const k = narrow ? 0.55 : 1;      // 크기 배수
        const seed0 = (q.get('seed') | 0) || (Date.now() % 2147483647);
    /** 앞서 단 손 감지를 끊는 손잡이 — 첫 화면을 다시 그릴 때 옛 것이 남지 않게 */
    let decorStop = null;

        let s = seed0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const rng = (a, b) => a + rnd() * (b - a);
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        const names = Object.keys(DECOR_FIELDS);
        const grads = ['kdg1', 'kdg2', 'kdg3'];
        const kinds = ['halftone', 'grain', 'jelly', 'stripe', 'outline', 'misprint'];

        /* 흐림은 **그림 안에서** 건다 (2026-08-08).
         *
         * 예전에는 바깥 상자에 CSS `filter:blur()` 를 걸었다. 그러면 그 상자가 움직일 때마다
         * 브라우저가 흐림을 **다시 계산**한다 — 도형이 떠다니는 동안 내내. 실측(라이브,
         * CPU 4배 느리게): 흐림을 끄면 스크롤 중앙 프레임이 50ms → 17ms 였다.
         * 흐림을 SVG 안에 넣으면 그림 자체가 흐린 것이라 **한 번만 굽고** 그다음엔 옮기기만
         * 한다. 눈에 보이는 결과는 같다.
         * `overflow:visible` 이 필요하다 — 안 주면 번진 가장자리가 상자에 잘려 테가 생긴다. */
        let curBlur = 0;
        const svg = (z, inner) => {
            if (!(curBlur > 0)) return `<svg width="${z}" height="${z}">${inner}</svg>`;
            const id = 'kdb' + (clipId++);
            return `<svg width="${z}" height="${z}" style="overflow:visible">`
                + `<defs><filter id="${id}" x="-40%" y="-40%" width="180%" height="180%" `
                + `color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${curBlur}"/></filter></defs>`
                + `<g filter="url(#${id})">${inner}</g></svg>`;
        };
        function halftone(n, z, g) {
            // 점 간격은 화면 기준으로 잡는다 — 크기에 비례해 늘리면 렌즈 앞 큰 것이 점 몇 개로 뭉개진다
            const N = Math.max(22, Math.min(70, Math.round(z / 5.5))), cell = z / N, o = [];
            for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
                const x = (gx + .5) / N * 2 - 1, y = (gy + .5) / N * 2 - 1, v = DECOR_FIELDS[n](x, y);
                if (v <= 0) continue;
                const r = Math.min(1, v / 0.34) * cell * 0.58;
                if (r < cell * 0.10) continue;
                o.push(`<circle cx="${((gx + .5) * cell).toFixed(1)}" cy="${((gy + .5) * cell).toFixed(1)}" r="${r.toFixed(2)}"/>`);
            }
            return svg(z, `<g fill="url(#${g})">${o.join('')}</g>`);
        }
        function outlinePath(n, z) {
            const p = [], steps = 200;
            for (let i = 0; i < steps; i++) {
                const t = i / steps * Math.PI * 2;
                let lo = 0, hi = 1.6;
                for (let k = 0; k < 22; k++) {
                    const m = (lo + hi) / 2;
                    if (DECOR_FIELDS[n](Math.cos(t) * m, Math.sin(t) * m) > 0) lo = m; else hi = m;
                }
                p.push([(Math.cos(t) * lo * .5 + .5) * z, (Math.sin(t) * lo * .5 + .5) * z]);
            }
            return 'M' + p.map((c) => c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join('L') + 'Z';
        }
        let clipId = 0;
        function draw(kind, n, z, g) {
            const d = () => outlinePath(n, z);
            switch (kind) {
                case 'halftone': return halftone(n, z, g);
                case 'grain': { const p = d(); return svg(z, `<path d="${p}" fill="url(#${g})"/><path d="${p}" fill="#14121f" filter="url(#kdgrain)" opacity=".55"/>`); }
                case 'jelly': { const p = d(); return svg(z, `<path d="${p}" fill="url(#${g})" filter="url(#kdjelly)"/><path d="${p}" fill="url(#kdgloss)" opacity=".85" transform="translate(${z * .06},${z * .05}) scale(.86)"/>`); }
                case 'stripe': { const id = 'kdc' + (clipId++); return svg(z, `<defs><clipPath id="${id}"><path d="${d()}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="${z}" height="${z}" fill="url(#${g})"/><rect width="${z}" height="${z}" fill="url(#kdstripe)"/></g>`); }
                case 'outline': { const p = d(); return svg(z, `<path d="${p}" fill="none" stroke="url(#${g})" stroke-width="4"/><path d="${p}" fill="none" stroke="url(#${g})" stroke-width="1.5" opacity=".6" transform="translate(${z * .5},${z * .5}) scale(.78) translate(${-z * .5},${-z * .5})"/>`); }
                default: { const p = d(); return svg(z, `<g style="mix-blend-mode:multiply"><path d="${p}" fill="#ec4899" opacity=".72" transform="translate(-3,-3)"/><path d="${p}" fill="#22d3ee" opacity=".72" transform="translate(3,3)"/><path d="${p}" fill="#6d5bd0" opacity=".55"/></g>`); }
            }
        }
        const KIND_BY_NUM = { '2': 'grain', '3': 'jelly', '4': 'halftone', '6': 'stripe', '7': 'outline', '8': 'misprint' };
        const kindOf = () => KIND_BY_NUM[force] || pick(kinds);

        const css = [], html = [];
        let idx = 0;
        /* depth = 손가락·커서를 따라 얼마나 밀릴지. **가까운 것이 많이** 밀린다 —
         * 창밖을 보며 지나갈 때 가까운 것이 빨리 흐르는 그 원리다 (TASK-KL-101).
         * 중요: 떠다니는 움직임과 **자리를 나눠 쓴다**. 둘 다 transform 이라 한 요소에 겹치면
         * 서로 덮어쓴다. 바깥 상자가 시차, 안쪽 상자가 떠다니기를 맡는다. */
        function add(z, blur, op, dur, amp, pos, extra, depth) {
            const cls = 'kd' + (idx++);
            const ax = rng(amp[0], amp[1]).toFixed(0), ay = rng(amp[0], amp[1]).toFixed(0);
            const rot = rng(5, 20).toFixed(0), dir = rnd() < .5 ? 1 : -1;
            const secs = rng(dur[0], dur[1]).toFixed(1), delay = (-rnd() * secs).toFixed(1);
            css.push(`@keyframes ${cls}{0%{transform:translate(0,0) rotate(0deg)}`
                + `25%{transform:translate(${ax}px,${-ay}px) rotate(${rot * dir}deg)}`
                + `50%{transform:translate(${ax / 2}px,${ay}px) rotate(0deg)}`
                + `75%{transform:translate(${-ax}px,${ay / 2}px) rotate(${-rot * dir}deg)}`
                + `100%{transform:translate(0,0) rotate(0deg)}}`);
            curBlur = Number(blur) || 0;          // 이 도형의 흐림 — svg() 가 그림 안에 굽는다
            const shape = draw(kindOf(), pick(names), z, pick(grads));
            curBlur = 0;
            html.push(`<div class="home-decor-item${extra ? ' ' + extra : ''}" style="${pos};opacity:${op};`
                + `--depth:${depth}">`
                + `<div class="home-decor-float" style="animation:${cls} ${secs}s ease-in-out ${delay}s infinite">`
                + shape + '</div></div>');
        }

        // 렌즈 바로 앞 — 화면보다 크고 잘리고 초점이 나갔다. 흐리므로 글을 안 가린다.
        const corners = ['left:-22%;top:34%', 'right:-24%;top:30%', 'left:-18%;top:-26%', 'right:-20%;top:-24%'];
        add(Math.round(rng(1050, 1320) * k), rng(13, 19).toFixed(0), rng(.40, .52).toFixed(2), [110, 130], [24, 40], pick(corners), 'home-decor-lens', 1);
        // 또렷한 닻 — 좌우 중 한쪽 바깥에 걸친다
        add(Math.round(rng(300, 380) * k), 0, rng(.86, .96).toFixed(2), [62, 76], [20, 34], rnd() < .5 ? 'right:-3%;top:26%' : 'left:-4%;top:22%', null, 0.62);
        // 폰은 화면이 좁아 같은 개수를 뿌리면 빽빽하다 — 구역을 줄인다
        for (const zn of (narrow ? DECOR_ZONES.slice(0, 3) : DECOR_ZONES)) {
            const b = DECOR_BANDS[zn.band];
            add(Math.round(rng(b.z[0], b.z[1]) * k), rng(b.blur[0], b.blur[1]).toFixed(2), rng(b.op[0], b.op[1]).toFixed(2),
                b.dur, b.amp, `left:${rng(zn.x[0], zn.x[1]).toFixed(1)}%;top:${rng(zn.y[0], zn.y[1]).toFixed(1)}%`,
                null, DECOR_DEPTH[zn.band]);
        }

        const style = document.createElement('style');
        style.textContent = css.join('\n');
        document.head.appendChild(style);
        /* 도형은 **무대** 안에 넣는다. 바깥 상자는 화면 크기로 잘라 내는 틀이고, 무대는
         * 화면을 옮길 때 통째로 뒤로 물러나는 판이다 (다른 화면 = scale 축소, CSS 쪽).
         * 무대는 inset:0 이라 상자와 크기가 같다 — 도형의 % 자리 값은 그대로다 (KL-149). */
        wrap.innerHTML = DECOR_DEFS + '<div class="home-decor-stage">' + html.join('') + '</div>';
        wrap.dataset.seed = String(seed0);

        /* 손가락·커서를 따라 도형이 조금 밀린다 (TASK-KL-101).
         *
         * 값은 **한 곳(감싸는 상자)에만** 쓴다. 도형마다 스타일을 건드리면 도형 수만큼 일이
         * 늘고, 그때마다 브라우저가 배치를 다시 잰다. 각 도형은 제 depth 를 곱해 알아서 밀린다.
         * 화면을 다시 그리는 일은 프레임당 한 번으로 묶는다(rAF) — 손가락 좌표는 그보다 훨씬
         * 자주 들어온다.
         *
         * 움직임을 줄여 달라고 한 사람에게는 아예 안 건다. 「덜 움직이게」가 아니라 안 움직인다. */
        const calm = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        /* 듣는 귀는 **먼저 한 번** 새로 단다. 첫 화면은 다시 그려질 수 있어서, 옛 것이 남으면
           손 한 번에 여러 번 계산한다. 아래 두 곳(밀림·쉬게 하기)이 같은 손잡이를 쓴다. */
        decorStop?.abort();
        decorStop = new AbortController();
        const bye = { signal: decorStop.signal, passive: true } as AddEventListenerOptions;

        if (!calm) {
            /* 시차는 **아주 약하게**만 남긴다. 세게 주면 화면 전체가 손을 따라 평행 이동해서
               「종이를 미는」 느낌이 된다 — 물에 뜬 것과 정반대다. 여기서는 멀리 있는 것이
               아주 조금 흐르는 정도로만 쓴다 (TASK-KL-101). */
            const reach = narrow ? 7 : 12;
            let tx = 0, ty = 0, queued = false;
            /* 자리는 **완성된 transform 문자열**로 쓴다 — 변수(--px)와 calc() 로 쓰면 안 된다.
             *
             * 예전에는 바깥 상자에 `--px/--py` 를 얹고 CSS 가 `calc(var(--px)*var(--depth)+var(--ox))`
             * 로 풀게 했다. 한 줄이라 깔끔했지만 값이 바뀔 때마다 **하위 전체의 스타일을 다시
             * 계산**하고, 변수로 만든 transform 은 합성기가 못 맡아 매 프레임 주 스레드가 짊어졌다.
             * 실측(라이브, CPU 4배 느리게, 마우스를 1.1초 움직이는 동안):
             *   장식 켬 = 총작업 1.382초(그중 스타일 계산 0.644초) / 장식 끔 = 0.319초.
             * 조작 중 CPU 의 77%가 배경 장식이었고, 대부분이 페인트가 아니라 **스타일 계산**이었다.
             * 값을 다 계산해서 그 요소에만 직접 쓰면 무효화가 그 하나로 좁혀진다. */
            const place = (d) => {
                d.el.style.transform =
                    'translate3d(' + (cx0 * d.depth + d.ox).toFixed(2) + 'px,'
                    + (cy0 * d.depth + d.oy).toFixed(2) + 'px,0)';
            };
            const apply = () => {
                queued = false;
                cx0 += (tx - cx0) * 0.12;
                cy0 += (ty - cy0) * 0.12;
                for (const d of drifters) place(d);
                if (Math.abs(tx - cx0) > 0.2 || Math.abs(ty - cy0) > 0.2) {
                    if (!queued) { queued = true; requestAnimationFrame(apply); }
                }
            };
            const track = (x, y) => {
                tx = ((x / window.innerWidth) * 2 - 1) * -reach;
                ty = ((y / window.innerHeight) * 2 - 1) * -reach;
                if (!queued) { queued = true; requestAnimationFrame(apply); }
            };
            /* 첫 화면은 다시 그려질 수 있다(도구를 갔다 오면). 그때마다 듣는 귀를 새로 달면
             * 옛 귀가 남아 손을 한 번 움직여도 여러 번 계산한다 — 눈에는 안 보이고 느려지기만
             * 한다. 앞서 단 것을 끊고 새로 단다 (TASK-KL-101). */
            /* 가까운 것은 **물에 뜬 꽃잎**처럼 군다 (TASK-KL-101).
             *
             * 시차만 주면 손가락 위치에 딱 붙어 같이 평행 이동한다 — 종이에 그려 놓고 종이를
             * 미는 느낌이다. 물 위의 꽃잎은 손이 **지나갈 때 밀려났다가 천천히 제자리로**
             * 돌아온다. 그래서 가까운 것에는 위치가 아니라 **힘**을 준다:
             *   지나가면 밀어내는 힘 → 매 프레임 제자리로 당기는 힘(용수철) + 물의 저항(감쇠).
             * 먼 것은 그대로 시차다 — 멀리 있는 것은 손이 닿지 않는다.
             */
            /* 부드러움은 **여기서** 만든다. 예전에는 CSS 전환에 맡겼는데, 모든 도형이
             * 밀림 계산을 받게 되면서 그 전환을 꺼 버려 규칙이 죽어 있었다(잰 값 0s).
             * 목표값으로 조금씩 따라가면 전환 없이도 같은 부드러움이 나온다. */
            let cx0 = 0, cy0 = 0;
            /* 깊이는 **인라인 값**에서 읽는다. 이 상자는 아직 화면에 안 붙어 있어서
             * 계산된 값을 물으면 빈 문자열이 온다 — 처음엔 그래서 한 개도 안 잡혔다. */
            const drifters = [...wrap.querySelectorAll('.home-decor-item')]
                .map((el) => {
                    el.classList.add('home-decor-drift');
                    /* 깊이가 밀리는 정도를 정한다 — 가까운 것이 많이, 먼 것은 거의 안 밀린다.
                       예전에는 가까운 것만 골라 놓고 그 안에서는 다 똑같이 밀었다. 그래서
                       「전체가 한 덩어리로 밀리는」 느낌이 났다 (TASK-KL-101). */
                    const depth = parseFloat(el.style.getPropertyValue('--depth')) || 0.2;
                    return { el, depth, ox: 0, oy: 0, vx: 0, vy: 0, cx: 0, cy: 0, r: 0 };
                });
            const measure = () => {
                for (const d of drifters) {
                    const b = d.el.getBoundingClientRect();
                    d.cx = d.el.offsetLeft + d.el.offsetWidth / 2;
                    d.cy = d.el.offsetTop + d.el.offsetHeight / 2;
                    d.r = Math.min(b.width, b.height) / 2;   // 도형의 반지름(표면까지)
                }
            };
            /* 자리는 **손이 처음 움직일 때** 잰다. 이 상자는 만들어질 때 아직 화면에 안 붙어
             * 있어서, 그때 재면 전부 0 이 나오고 「아무리 스쳐도 안 밀리는」 상태가 된다.
             * (실제로 그랬다 — 꽃잎은 잡혔는데 밀린 거리가 계속 0 이었다.) */
            let measured = false;
            window.addEventListener('resize', () => { measured = false; }, bye);

            /* 닿는 거리는 **도형 표면 기준**이다 (TASK-KL-101).
               중심까지의 거리로 재면 큰 도형은 화면 어디서 움직여도 걸린다 — 화면을 통째로
               잡아 끄는 느낌이 그래서 났다. 표면에서 이만큼 안으로 들어와야 밀린다. */
            const MARGIN = narrow ? 55 : 85;
            const PUSH = narrow ? 14 : 20;      // 바짝 붙었을 때 밀어내는 세기
            const VMAX = narrow ? 1.6 : 2.4;    // 한 프레임에 밀릴 수 있는 최대 (밀리는 속도의 천장)
                    /* 원래 자리는 **배치 좌표**로 잰다. 화면 좌표로 재면 그 순간의 떠다니는
                     * 움직임까지 섞여, 잰 시점에 따라 중심이 수십 px 씩 달라진다. */
            let alive = false;
            function step() {
                let moving = false;
                for (const d of drifters) {
                    /* **돌아오지도, 묶이지도 않는다.** 물에 밀린 것은 제자리로 안 오고
                     * 테두리에 걸리지도 않는다. 남은 것은 물의 저항뿐이라 미끄러지다 스스로 선다.
                     * 여기서 「제자리로 당기는 힘」과 「최대 거리」를 둘 다 뺐다 — 아무리 약해도
                     * 그 둘이 있으면 자리가 정해져 있다는 느낌이 난다. */
                    d.vx *= 0.93;   // 물의 저항. 높이면 오래 미끄러지고, 낮추면 금방 선다
                    d.vy *= 0.93;
                    d.ox += d.vx;
                    d.oy += d.vy;
                    /* 화면 밖으로 나가면 반대편에서 들어온다. 안 그러면 밀어낸 만큼 화면이
                     * 비어 간다 — 물속이라면 흘러간 자리를 다른 것이 채운다. */
                    const cx = d.cx + d.ox, cy = d.cy + d.oy, pad = d.r + 60;
                    if (cx < -pad) d.ox += innerWidth + pad * 2;
                    else if (cx > innerWidth + pad) d.ox -= innerWidth + pad * 2;
                    if (cy < -pad) d.oy += innerHeight + pad * 2;
                    else if (cy > innerHeight + pad) d.oy -= innerHeight + pad * 2;
                    // 값은 **0 으로 되돌리지 않는다** — 되돌리면 그 순간 원래 자리로 튄다.
                    if (Math.abs(d.vx) < 0.02 && Math.abs(d.vy) < 0.02) {
                        place(d);
                        continue;
                    }
                    moving = true;
                    place(d);
                }
                // 다 가라앉으면 멈춘다 — 가만히 있는 화면에서 프레임을 태우지 않는다
                if (moving) requestAnimationFrame(step);
                else alive = false;
            }
            const shove = (x, y) => {
                if (!measured) { measure(); measured = true; }
                for (const d of drifters) {
                    const dx = d.cx + d.ox - x, dy = d.cy + d.oy - y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 0.001) continue;
                    const surface = dist - d.r;              // 도형 표면까지 남은 거리
                    if (surface > MARGIN) continue;          // 아직 멀다 — 아무 일도 없다
                    const near = 1 - Math.max(0, surface) / MARGIN;
                    // 바짝 붙을수록 급격히 세게 × 가까운 것일수록 더 (깊이)
                    const power = near ** 2 * PUSH * 0.16 * d.depth;
                    d.vx += (dx / dist) * power;
                    d.vy += (dy / dist) * power;
                    /* 속도에 천장을 둔다. 손을 한 번 스쳐도 밀어내는 힘이 **프레임마다 쌓여서**,
                     * 천장이 없으면 한 번 지나갔을 뿐인데 수백 px 를 날아간다(그랬다).
                     * 여기서 「얼마나 빨리 밀리나」가 정해지고, 저항이 「얼마나 멀리 가나」를 정한다. */
                    const sp = Math.hypot(d.vx, d.vy);
                    const cap = VMAX * d.depth;   // 천장도 깊이를 따른다
                    if (sp > cap) { d.vx *= cap / sp; d.vy *= cap / sp; }
                }
                if (!alive) { alive = true; requestAnimationFrame(step); }
            };

            window.addEventListener('pointermove', (e) => { track(e.clientX, e.clientY); shove(e.clientX, e.clientY); }, bye);
            window.addEventListener('touchmove', (e) => {
                const t = e.touches && e.touches[0];
                if (t) { track(t.clientX, t.clientY); shove(t.clientX, t.clientY); }
            }, bye);
            // 손을 떼거나 창을 벗어나면 제자리로 — 안 그러면 마지막 자리에 굳는다
            const home = () => { tx = 0; ty = 0; if (!queued) { queued = true; requestAnimationFrame(apply); } };
            window.addEventListener('touchend', home, bye);
            window.addEventListener('pointerleave', home, bye);
        }

        /* 배경은 **보고 있을 때만** 흐른다 (TASK-KL-128 ⑭).
         *
         * 왜: 도형이 끝없이 움직이면 브라우저가 **영영 안 쉰다**. 그리는 일 자체는 GPU 가
         * 맡아 페인트·래스터는 0ms 인데도, 화면을 초당 96번 계속 내보내느라 코어의 42% 를
         * 영구히 쓴다(잰 값: 손 안 댄 8초에 CPU 3.34초 → 멈추면 0.19초). 기계가 한가하면
         * 안 보이고, 다른 일이 붙어 있으면 그때부터 전부가 미끄럽지 않게 느껴진다.
         *
         * 그래서 **끄지 않고 재운다.** 몇 초 손을 안 대면 물살이 잦아들듯 천천히 서고,
         * 손이 닿으면 다시 흐른다. 보고 있는 동안의 모습은 이전과 똑같다.
         *
         * 갑자기 세우지 않는 이유: 도형은 제자리에 멈추므로 튀지는 않지만, 속도가 뚝
         * 끊기면 「고장 난 것」처럼 보인다. 재생 속도를 천천히 0 으로 내리면 물에서
         * 힘이 빠지는 것처럼 보인다. 속도를 바꾸는 것은 위치를 안 건드린다(WAAPI 규약).
         */
        const floats = () => [...wrap.querySelectorAll('.home-decor-float')]
            .flatMap((el) => (el.getAnimations ? el.getAnimations() : []));
        const IDLE_MS = 4000;      // 이만큼 손을 안 대면 잦아들기 시작
        const EASE_MS = 1400;      // 서는 데 걸리는 시간
        const WAKE_MS = 500;       // 다시 흐르는 데 걸리는 시간
        let idleTimer = 0;
        let rampRaf = 0;
        let parked = false;

        /** 재생 속도를 from → to 로 천천히 옮긴다. 다 내려가면 아예 멈춰 세운다. */
        function ramp(from, to, ms, thenPause) {
            cancelAnimationFrame(rampRaf);
            const t0 = performance.now();
            const tick = (now) => {
                const k = Math.min(1, (now - t0) / ms);
                const rate = from + (to - from) * (k * k * (3 - 2 * k));   // 부드럽게 들고 난다
                for (const a of floats()) {
                    try { a.updatePlaybackRate(Math.max(rate, 0.0001)); } catch { /* 안 되는 브라우저는 그냥 둔다 */ }
                }
                if (k < 1) { rampRaf = requestAnimationFrame(tick); return; }
                if (thenPause) for (const a of floats()) { try { a.pause(); } catch { /* 무시 */ } }
            };
            rampRaf = requestAnimationFrame(tick);
        }

        function park() {
            if (parked) return;
            parked = true;
            ramp(1, 0, EASE_MS, true);
        }
        function wake() {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(park, IDLE_MS);
            if (!parked) return;
            parked = false;
            for (const a of floats()) { try { a.play(); } catch { /* 무시 */ } }
            ramp(0, 1, WAKE_MS, false);
        }

        /* 「손을 댔다」의 범위를 넓게 잡는다 — 스크롤·키·바퀴까지. 좁게 잡으면 글을 읽으려고
           스크롤만 하는 사람에게는 배경이 죽은 것처럼 보인다. */
        for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'])
            window.addEventListener(ev, wake, bye);
        /* 창을 내려 두면 기다리지 않고 바로 세운다 — 브라우저가 알아서 늦추기도 하지만
           탭이 보이는 채로 가려져 있는 경우까지는 안 봐 준다. */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { clearTimeout(idleTimer); park(); } else wake();
        }, bye);
        idleTimer = setTimeout(park, IDLE_MS);

        return wrap;
    }

    /** 장식 한 장을 껍데기에 붙인다. 다시 부르면 앞의 것을 걷고 새로 뽑는다
     *  (도형은 열 때마다 새로 뽑히는 것이 원래 규칙이다). */
    function mountHomeDecor() {
        document.querySelector('.home-decor')?.remove();
        document.body.appendChild(buildHomeDecor());
    }

    window.KarmoHomeScene = { mount: mountHomeDecor };
})();
