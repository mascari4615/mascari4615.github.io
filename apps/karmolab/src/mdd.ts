/**
 * MDD (Moe Driven Development) — 마스코트 매니저 + 호감도/스토리 모듈
 *
 * 이미지 기반 마스코트 캐릭터, 12가지 감정 표현, 말풍선, 바운스,
 * 호감도 시스템, 스토리 이벤트를 관리합니다.
 * 티메토 대사는 `linePreset(id, { msg?, mood?, duration? })` + `LINE_PRESETS` 로 통일합니다.
 */
const Mdd = (() => {
    const POSES = ['idle','happy','sad','shock','think','sleep','angry','love','smug','eating','pointing','cheer'];
    const MASCOT_BASE = '/apps/karmolab/img/mascot';
    const PARTS_BASE = MASCOT_BASE + '/parts';
    const IDLE_TIMEOUT = 30000;

    /* ===== 사용자 설정 =====
     * 마스코트는 화면 위에 상주하는 물건이라 취향이 제일 크게 갈린다. 끄고 싶은
     * 사람, 크게 보고 싶은 사람, 움직임이 거슬리는 사람이 다 다르다. 값은 한 곳에
     * 모아 두고 바뀌면 그 자리에서 반영한다 — 새로고침을 요구하지 않는다. */
    const PREFS_KEY = 'mdd_prefs';

    interface MddPrefs {
        enabled: boolean;
        /** 마스코트 폭(px). 슬라이더로 연속 조절한다 */
        width: number;
        framing: 'bust' | 'full';
        showOnMobile: boolean;
        opacity: number;
        blink: boolean;
        gaze: boolean;
        breathe: boolean;
        motion: boolean;          // 끄면 위 셋을 전부 덮어쓴다
        /** SF 통신 화면처럼 보이게 하는 홀로그램 효과 */
        hologram: boolean;
        bubble: boolean;
        bubbleMs: number;
        idleMs: number;
        tapReact: boolean;
    }

    const PREF_DEFAULTS: MddPrefs = {
        /* 기본은 **끔**. 그림·표정·눈 배선이 아직 다듬는 중이라, 다 만들어지기 전에
           모든 방문자 화면에 세워 두면 미완성이 기본값이 된다. 켜는 자리는 남겨 둔다
           (환경 설정 → 마스코트). 다 다듬으면 이 한 줄만 되돌린다. */
        enabled: false, width: 300, framing: 'bust', showOnMobile: false,
        opacity: 0.85, blink: true, gaze: true, breathe: true, motion: true, hologram: true,
        bubble: true, bubbleMs: 3000, idleMs: IDLE_TIMEOUT, tapReact: true,
    };

    /** 폭의 아래 한계. 위 한계는 고정값으로 두면 큰 화면에서 답답하고 작은
     *  화면에서는 화면 밖으로 나간다 — 화면에 맞춰 잰다(전신은 세로가 기니
     *  높이 기준). */
    const WIDTH_MIN = 48;

    function widthMax(): number {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        const ratio = prefs.framing === 'full' ? 500 / 940 : 246 / 268;
        // 세로로 화면의 90% 를 넘지 않게, 가로로도 80% 를 넘지 않게
        return Math.max(WIDTH_MIN, Math.round(Math.min(vh * 0.9 * ratio, vw * 0.8)));
    }

    let prefs: MddPrefs = { ...PREF_DEFAULTS };
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) prefs = { ...PREF_DEFAULTS, ...JSON.parse(raw) };
    } catch (_) { /* 깨진 값이면 기본값으로 산다 */ }

    function getPrefs(): MddPrefs { return { ...prefs }; }

    function setPrefs(patch: Partial<MddPrefs>): void {
        prefs = { ...prefs, ...patch };
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
        applyPrefs();
    }

    function resetPrefs(): void { setPrefs({ ...PREF_DEFAULTS }); }

    /** 설정을 화면에 반영한다. 새로고침 없이 그 자리에서 도는 게 요점이라
     *  붙였다 뗐다 하는 대신 이미 있는 요소의 값을 고친다. */
    function applyPrefs(): void {
        if (!container || !charEl) return;
        container.style.display = prefs.enabled ? '' : 'none';
        container.classList.toggle('mdd-on-mobile', prefs.showOnMobile);
        charEl.classList.toggle('mdd-holo', prefs.hologram);

        const w = Math.min(widthMax(), Math.max(WIDTH_MIN, Math.round(prefs.width) || PREF_DEFAULTS.width));
        const ratio = prefs.framing === 'full' ? 500 / 940 : 246 / 268;
        charEl.style.width = w + 'px';
        charEl.style.height = Math.round(w / ratio) + 'px';
        charEl.style.opacity = String(prefs.opacity);

        if (avatar) {
            avatar.setFraming(prefs.framing);
            const on = prefs.motion;
            avatar.setMotion({ blink: on && prefs.blink, gaze: on && prefs.gaze, breathe: on && prefs.breathe });
        }
        if (!prefs.bubble && bubbleEl) bubbleEl.classList.remove('visible');
        reflowPosition();     // 크기가 바뀌면 붙어 있던 벽에 다시 맞춘다
        resetIdleTimer();
    }

    /** 드래그로 옮긴 자리를 버리고 우하단으로 돌려놓는다 */
    function resetPosition(): void {
        stuck = null;
        try { localStorage.removeItem(POSITION_KEY); } catch (_) {}
        if (!container) return;
        container.style.left = '';
        container.style.top = '';
        container.style.right = '';
        container.style.bottom = '';
    }

    /* ===== 아바타 리깅 층 (원래 별도 파일이었으나, mdd.js 는 묶지 않는 전역
     * 스크립트라 import 를 쓰면 전역 `Mdd` 가 사라진다 — 같은 파일 안에 둔다) ===== */
    /**
     * 티메토 아바타 — 부위 레이어를 값으로 움직이는 리깅 층
     *
     * 표정이 「파일」이던 구조를 「값」으로 바꾼다. 그림 12장을 갈아 끼우면 전환할
     * 때마다 다른 사람이 됐지만(머리 길이·복장이 서로 달랐다), 여기서는 한 장의
     * 일러스트를 부위별로 분해한 것 하나만 쓰고 눈·눈썹·입·고개 각도를 숫자로
     * 움직인다. 그래서 중간 표정이 존재하고, 전환이 보간되고, 가만히 있어도
     * 숨을 쉬고 눈을 깜빡인다.
     *
     * 그림 출처 = `img/mascot/parts/` (See-through 로 분해한 RGBA 레이어 17장 +
     * manifest.json 의 원본 캔버스 좌표). 화풍은 일러스트에서 오고 이 파일은
     * 리깅만 한다 — 그림을 갈아 끼워도 매니페스트 이름만 같으면 그대로 돈다.
     */

    interface AvatarPose {
        /** 눈 뜬 정도 0(감음)~1(크게 뜸) */
        eyeOpen: number;
        /** 눈웃음 — 아래에서 눌러 올린 정도 0~1 */
        eyeSquint: number;
        /** 눈썹 기울기(도). +면 화난 쪽, -면 곤란한 쪽 */
        browTilt: number;
        /** 눈썹 높이(캔버스 px). -면 올라감 */
        browRaise: number;
        /** 입 벌린 정도 1=평소, 크면 벌어짐 */
        mouthOpen: number;
        /** 입 가로 폭 배율 — 웃으면 넓어진다 */
        mouthWide: number;
        /** 볼 홍조 0~1 */
        blush: number;
        /** 고개 기울기(도) */
        tilt: number;
        /** 몸 전체 상하 오프셋(캔버스 px) */
        bob: number;
        /** 왼팔·오른팔 회전(도). 어깨를 축으로 돈다. +면 손이 올라간다 */
        armL: number;
        armR: number;
        /** 시선 고정 방향. null 이면 커서를 따라본다 */
        gaze: { x: number; y: number } | null;
        /** 눈동자 크기 배율. 놀라면 작아지고(흰자가 넓어 보인다) 반하면 커진다 */
        irisScale: number;
        /** 눈을 통째로 갈아 끼우는 조각(감은 눈·웃는 눈…). null 이면 기본 눈 */
        eyeArt: string | null;
        /** 입 조각. null 이면 기본 입 */
        mouthArt: string | null;
    }

    const NEUTRAL: AvatarPose = {
        eyeOpen: 1, eyeSquint: 0, browTilt: 0, browRaise: 0,
        mouthOpen: 1, mouthWide: 1, blush: 0, tilt: 0, bob: 0,
        armL: 0, armR: 0, irisScale: 1, gaze: null, eyeArt: null, mouthArt: null,
    };

    /** 기존 12 포즈 = 이 값들의 프리셋. 사이 값도 되므로 전환이 보간된다.
     *
     * 진폭이 큰 이유: 우하단 마스코트는 92px 이고 입은 원본 1024 캔버스에서
     * 17px 짜리 선이다. 미세한 표정차는 그 크기에서 통째로 사라진다 — 실제로
     * 읽히는 건 고개 각도·몸 상하·눈 개폐·홍조뿐이라 그쪽으로 몰아 준다. */
    const POSE_PRESETS: Record<string, Partial<AvatarPose>> = {
        idle:     {},
        happy:    { eyeArt: 'eyes-happy', mouthArt: 'mouth-open', blush: 0.4, tilt: -9, bob: -5 },
        sad:      { eyeOpen: 0.82, mouthArt: 'mouth-frown', tilt: 14, bob: 12, armL: 7, armR: -7 },
        /* 놀람은 **눈을 늘리는 게 아니라 눈동자를 줄이는 것**이다 (사용자 신고: 눈이 늘어져
           이상하다). 1.35 배로 세로만 늘리면 눈이 달걀이 된다 — 24px 짜리 눈이 8px 자란다.
           크게 뜨는 건 1.12 까지만 하고, 놀란 티는 작아진 눈동자(0.72)와 올라간 눈썹이 낸다. */
        shock:    { eyeOpen: 1.12, irisScale: 0.72, browRaise: -3, mouthArt: 'mouth-wide', tilt: -2, bob: -8, armL: -14, armR: 14 },
        think:    { eyeOpen: 0.88, mouthWide: 0.85, tilt: 16, gaze: { x: 0.9, y: -0.75 } },
        /* 감은 눈은 **0 이 아니다.** 0 이면 눈이 통째로 사라지고, 남은 속눈썹만 눈 상자
           맨 아래로 눌려 「눈이 턱 쪽에 있는」 그림이 된다(사용자 신고). 얇게 남겨 둔다. */
        sleep:    { eyeOpen: 0.08, eyeSquint: 0.3, mouthOpen: 1.4, tilt: 20, bob: 16 },
        angry:    { eyeOpen: 0.92, irisScale: 0.92, mouthArt: 'mouth-frown', blush: 0.45, tilt: 2, bob: -4, armL: 14, armR: -14 },
        love:     { eyeArt: 'eyes-happy', mouthArt: 'mouth-open', blush: 1, tilt: -12, bob: -6, irisScale: 1.12 },
        smug:     { eyeOpen: 0.84, mouthWide: 1.3, tilt: -16, gaze: { x: -0.75, y: 0.25 } },
        eating:   { eyeArt: 'eyes-happy', mouthArt: 'mouth-open', blush: 0.3, tilt: 5, bob: 4 },
        pointing: { eyeOpen: 1.25, mouthArt: 'mouth-open', tilt: -7, bob: -9, armL: 0, armR: -38 },
        cheer:    { eyeArt: 'eyes-happy', mouthArt: 'mouth-wide', blush: 0.5, tilt: 0, bob: -18, armL: -46, armR: 46 },
    };

    /** x/y/w/h = 원본 캔버스에서의 자리, s* = 아틀라스에서 잘라 올 자리 */
    interface PartBox { x: number; y: number; w: number; h: number;
                        sx: number; sy: number; sw: number; sh: number }
    interface EyeSpot { cx: number; cy: number; rx: number; ry: number }

    interface Manifest {
        canvas: [number, number];
        /** 각 눈의 자리·크기. 눈동자는 그림이 아니라 이 값으로 그린다 */
        eyes?: EyeSpot[];
        atlas: { src: string; w: number; h: number };
        order: string[];
        /** 평소엔 숨어 있다가 그 표정일 때만 보이는 조각들 */
        variants?: string[];
        parts: Record<string, PartBox>;
    }

    /** 고개와 함께 도는 부위 — 목 아래는 안 돈다 */
    const HEAD_PARTS = new Set(['back-hair', 'face', 'ears', 'eyewhite', 'irides',
        'eyelash', 'eyebrow', 'nose', 'mouth', 'front-hair', 'headwear']);
    const EYE_PARTS = new Set(['eyewhite', 'irides', 'eyelash']);
    /** 팔은 어깨(위쪽 안쪽 모서리)를 축으로 돈다 */
    const ARM_PIVOT: Record<string, string> = { 'arm-l': '100% 8%', 'arm-r': '0% 8%' };

    /** 화면에 보여 줄 범위(원본 캔버스 좌표). 우하단 상주는 작아서 얼굴이 읽혀야 한다. */
    /* bust 는 y=74 에서 시작했는데 **앞머리는 y=30 에서 시작한다** — 정수리 44px 가 늘
       잘려 있었다(사용자 신고). 게다가 고개를 갸우뚱하면(±16°) 머리가 더 밖으로 나간다.
       머리 위로 여백을 두고, 좌우도 조금 넓힌다. 아래(y=342, 어깨선)는 그대로 둔다. */
    const FRAMING = {
        bust: { x: 384, y: 14, w: 274, h: 328 },
        full: { x: 262, y: 60, w: 500, h: 940 },
    } as const;

    type Framing = keyof typeof FRAMING;

    interface MotionFlags { blink: boolean; gaze: boolean; breathe: boolean }

    interface AvatarHandle {
        el: HTMLDivElement;
        setPose(id: string): void;
        /** 보여 줄 범위를 바꾼다 (흉상 ↔ 전신). 새로고침 없이 그 자리에서 */
        setFraming(f: Framing): void;
        /** 살아 있는 티를 내는 움직임을 개별로 끈다 */
        setMotion(m: Partial<MotionFlags>): void;
        /** 커서 위치를 넘겨 시선을 돌린다 (뷰포트 좌표) */
        lookAt(clientX: number, clientY: number): void;
        destroy(): void;
    }

    const REDUCED = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function createAvatar(base: string, manifest: Manifest,
                                 framing: Framing = 'bust'): AvatarHandle {
        let view: { x: number; y: number; w: number; h: number } = FRAMING[framing];
        const motion: MotionFlags = { blink: true, gaze: true, breathe: true };
        const el = document.createElement('div');
        el.className = 'mdd-av';
        el.style.aspectRatio = `${view.w} / ${view.h}`;

        const stage = document.createElement('div');
        stage.className = 'mdd-av-stage';
        // 원본 캔버스를 그대로 깔고 보여 줄 범위만큼 확대한다. 부위 좌표를 손대지
        // 않으므로 그림을 갈아 끼워도 매니페스트만 맞으면 된다.
        stage.style.width = manifest.canvas[0] + 'px';
        stage.style.height = manifest.canvas[1] + 'px';
        el.appendChild(stage);

        // 고개 회전은 부위를 감싸는 그룹이 맡는다. 회전과 부위별 변형(눈 감기·입
        // 벌리기)을 한 요소에 겹쳐 쓰면 회전용 축(목덜미)을 스케일이 그대로 물려받아
        // 눈·입이 얼굴 밖으로 튄다 — 축이 다른 두 변형은 층을 나눠야 한다.
        const layers = new Map<string, HTMLDivElement>();
        const variantNames = manifest.variants || [];
        const headGroups: HTMLDivElement[] = [];
        let group: HTMLDivElement | null = null;
        for (const name of manifest.order) {
            const box = manifest.parts[name];
            if (!box) continue;
            // 표정 조각(눈·입)도 얼굴의 일부다 — 머리 그룹 밖에 두면 고개를 갸우뚱할 때
            // 얼굴만 돌고 눈·입은 제자리에 남는다.
            const isHead = HEAD_PARTS.has(name) || variantNames.includes(name);
            if (isHead && !group) {
                group = document.createElement('div');
                group.className = 'mdd-av-group';
                stage.appendChild(group);
                headGroups.push(group);
            } else if (!isHead && group) {
                group = null;
            }
            // 파츠를 낱장으로 받으면 첫 화면에서 요청이 15번 난다. 한 장(아틀라스)에서
            // 필요한 칸만 꺼내 쓴다 — 브라우저가 받는 그림은 하나다.
            const el2 = document.createElement('div');
            el2.className = 'mdd-av-part';
            el2.dataset.part = name;      // 어느 부위인지 화면에서 바로 알아볼 수 있게
            el2.style.left = box.x + 'px';
            el2.style.top = box.y + 'px';
            el2.style.width = box.w + 'px';
            el2.style.height = box.h + 'px';
            el2.style.backgroundImage = `url(${base}/${manifest.atlas.src})`;
            // 원본 칸 크기(sw×sh)를 놓일 크기(w×h)로 늘리는 배율을 아틀라스 전체에 건다
            const kx = box.w / box.sw;
            const ky = box.h / box.sh;
            el2.style.backgroundSize = `${manifest.atlas.w * kx}px ${manifest.atlas.h * ky}px`;
            el2.style.backgroundPosition = `${-box.sx * kx}px ${-box.sy * ky}px`;
            (isHead && group ? group : stage).appendChild(el2);
            layers.set(name, el2);

            // 눈동자는 흰자 밖으로 나가면 안 된다. 아틀라스의 흰자 칸을 그대로
            // 마스크로 씌우면 눈 모양대로 잘린다 — 시선이 끝까지 가도 눈 안에 남는다.
            // (지금은 눈동자를 코드로 그리므로 아래 마스크 코드는 안 쓴다)
            if (name === 'irides' && !(manifest.eyes && manifest.eyes.length === 2)) {
                const w = manifest.parts['eyewhite'];
                if (w) {
                    const mx = box.w / w.sw;                 // 흰자 칸을 눈동자 칸 좌표로 옮긴다
                    const my = box.h / w.sh;
                    const maskImg = `url(${base}/${manifest.atlas.src})`;
                    const maskSize = `${manifest.atlas.w * mx}px ${manifest.atlas.h * my}px`;
                    const maskPos = `${-w.sx * mx + (w.x - box.x)}px ${-w.sy * my + (w.y - box.y)}px`;
                    el2.style.setProperty('-webkit-mask-image', maskImg);
                    el2.style.setProperty('mask-image', maskImg);
                    el2.style.setProperty('-webkit-mask-size', maskSize);
                    el2.style.setProperty('mask-size', maskSize);
                    el2.style.setProperty('-webkit-mask-position', maskPos);
                    el2.style.setProperty('mask-position', maskPos);
                    el2.style.setProperty('-webkit-mask-repeat', 'no-repeat');
                    el2.style.setProperty('mask-repeat', 'no-repeat');
                }
            }
        }

        /* ===== 눈동자는 코드로 그린다 =====
         *
         * 분해가 준 눈동자는 좌우가 서로 다른 모양으로 뭉개져 있었다 — 사람이 보면
         * 바로 「짝짝이」로 읽힌다. 자리와 크기만 그림에서 받아 오고, 실제 눈동자는
         * 여기서 그린다. 그래서 좌우가 정확히 같고, 시선을 따라 움직여도 흰자 밖으로
         * 걸어 나가지 않는다(흰자 모양으로 잘라 낸다). */
        const irisEls: HTMLDivElement[] = [];
        const eyeSpots = (manifest.eyes && manifest.eyes.length === 2) ? manifest.eyes : null;
        if (eyeSpots) {
            const base0 = layers.get('irides');
            if (base0) base0.style.display = 'none';           // 그림 눈동자는 물러난다

            /* 흰자 그림에는 **원본 눈동자가 같이 찍혀 있다** (분해가 눈을 통째로 잘라 왔다).
             * 그 위에 우리 눈동자를 얹으니 시선이 움직일 때마다 원본 눈알이 밑에서 비쳐
             * 나왔다 — 「눈이 두 겹」으로 보인다(사용자 신고 2026-08-08).
             * 그래서 흰자는 **그림을 안 쓴다**: 같은 칸을 마스크로만 써서 눈 모양을 얻고,
             * 안은 살짝 그늘진 흰색으로 직접 칠한다. 원본 눈동자는 이 순간 사라진다. */
            const whiteEl = layers.get('eyewhite');
            if (whiteEl) {
                const wb = manifest.parts['eyewhite'];
                const kx = wb.w / wb.sw;
                const ky = wb.h / wb.sh;
                whiteEl.style.backgroundImage = 'none';
                whiteEl.style.background =
                    'linear-gradient(to bottom, #cfc6dd 0%, #f4f1f8 34%, #ffffff 100%)';
                for (const pfx of ['-webkit-mask', 'mask']) {
                    whiteEl.style.setProperty(pfx + '-image', `url(${base}/${manifest.atlas.src})`);
                    whiteEl.style.setProperty(pfx + '-size', `${manifest.atlas.w * kx}px ${manifest.atlas.h * ky}px`);
                    whiteEl.style.setProperty(pfx + '-position', `${-wb.sx * kx}px ${-wb.sy * ky}px`);
                    whiteEl.style.setProperty(pfx + '-repeat', 'no-repeat');
                }
            }
            /* 크기는 분해가 준 눈동자 크기가 아니라 **흰자 높이**에서 잡는다.
               분해된 눈동자는 실제보다 작게 잘려 있어 그대로 쓰면 「점눈」이 된다 —
               셀 애니 눈은 홍채가 눈 높이를 거의 꽉 채운다. */
            const wh = manifest.parts['eyewhite'];
            const measured = (eyeSpots[0].ry + eyeSpots[1].ry) / 2;
            const ry = wh ? Math.max(measured, wh.h * 0.34) : measured;
            const rx = ry;                                     // 홍채는 둥글다
            const host = headGroups[headGroups.length - 1] || stage;
            const wBox = manifest.parts['eyewhite'];
            for (const spot of eyeSpots) {
                const iris = document.createElement('div');
                iris.className = 'mdd-av-iris';
                iris.dataset.part = 'iris';
                iris.style.left = (spot.cx - rx) + 'px';
                iris.style.top = (spot.cy - ry) + 'px';
                iris.style.width = (rx * 2) + 'px';
                iris.style.height = (ry * 2) + 'px';
                if (wBox) {
                    // 흰자 모양으로 잘라 낸다 — 시선이 끝까지 가도 눈 안에 머문다
                    // 배율은 「흰자 그림을 캔버스에 놓을 때」의 배율이다. 눈동자 크기로
                    // 잡으면 두 눈이 든 흰자 그림이 한쪽 눈만 한 크기로 줄어 엉뚱한
                    // 자리를 오려 낸다(눈동자가 세로 조각으로 잘렸다).
                    const kx = wBox.w / wBox.sw;
                    const ky = wBox.h / wBox.sh;
                    const mi = `url(${base}/${manifest.atlas.src})`;
                    const ms = `${manifest.atlas.w * kx}px ${manifest.atlas.h * ky}px`;
                    const mp = `${-wBox.sx * kx + (wBox.x - (spot.cx - rx))}px `
                             + `${-wBox.sy * ky + (wBox.y - (spot.cy - ry))}px`;
                    for (const pfx of ['-webkit-mask', 'mask']) {
                        iris.style.setProperty(pfx + '-image', mi);
                        iris.style.setProperty(pfx + '-size', ms);
                        iris.style.setProperty(pfx + '-position', mp);
                        iris.style.setProperty(pfx + '-repeat', 'no-repeat');
                    }
                }
                // 눈동자는 흰자 위·속눈썹 아래다. 맨 뒤에 붙이면 눈꺼풀 위로 떠올라
                // 「눈알이 얼굴에 얹힌」 그림이 된다.
                const lash = layers.get('eyelash');
                if (lash && lash.parentNode === host) host.insertBefore(iris, lash);
                else host.appendChild(iris);
                irisEls.push(iris);
            }
        }

        const blushEl = document.createElement('div');
        blushEl.className = 'mdd-av-blush';
        const faceBox = manifest.parts['face'];
        if (faceBox) {
            blushEl.style.left = faceBox.x + 'px';
            blushEl.style.top = (faceBox.y + faceBox.h * 0.52) + 'px';
            blushEl.style.width = faceBox.w + 'px';
            blushEl.style.height = (faceBox.h * 0.3) + 'px';
        }
        // 홍조는 고개와 같이 돌아야 볼에 붙어 있다. 머리 그룹 안(맨 앞)에 둔다.
        (headGroups[headGroups.length - 1] || stage).appendChild(blushEl);

        /* ===== 상태 ===== */
        let pose: AvatarPose = { ...NEUTRAL };
        let target: AvatarPose = { ...NEUTRAL };
        let gaze = { x: 0, y: 0 };          // 실제로 보고 있는 방향 -1~1
        let gazeTarget = { x: 0, y: 0 };
        let blink = 1;                       // 1=뜸, 0=감음
        let nextBlinkAt = performance.now() + 1200;
        let blinkPhase = 0;                  // >0 이면 깜빡이는 중
        let raf = 0;
        let t0 = performance.now();

        // 보여 줄 범위를 요소 폭에 맞춘다. 매 프레임 재는 대신 크기가 바뀔 때만 잰다
        // (clientWidth 를 프레임마다 읽으면 레이아웃을 강제로 다시 계산한다).
        let scale = 1;
        const measure = () => { scale = (el.clientWidth || view.w) / view.w; };
        measure();
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
        ro?.observe(el);

        function setPose(id: string): void {
            const preset = POSE_PRESETS[id] || POSE_PRESETS.idle;
            target = { ...NEUTRAL, ...preset };
        }

        function lookAt(clientX: number, clientY: number): void {
            const r = el.getBoundingClientRect();
            if (!r.width) return;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height * 0.35;
            // 기준을 화면 절반으로 잡으면, 마스코트가 구석에 사는 탓에 한쪽으로는
            // 커서를 끝까지 옮겨도 눈이 거의 안 돈다. 마스코트에서 얼마나 떨어졌는지로
            // 재고, 화면의 1/3쯤 벗어나면 끝까지 돌아간 것으로 본다.
            const reach = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.33);
            gazeTarget.x = clamp((clientX - cx) / reach, -1, 1);
            gazeTarget.y = clamp((clientY - cy) / reach, -1, 1);
        }

        /* 한 번이라도 화면에 붙었었나. 처음 몇 프레임은 아직 안 붙은 채로 돌 수 있어서
           (부르는 쪽이 만들어서 나중에 붙인다) 「붙은 적 있다」를 기억해 두고 판단한다. */
        let wasConnected = false;

        /* 아직 안 붙은 아바타를 **싸게** 기다린다.
         *
         * 부르는 쪽이 만들고 나중에 붙이는 경우가 있어서(첫 몇 프레임은 떠 있다) 곧장 포기하면
         * 마스코트가 안 움직인다. 그렇다고 rAF 로 기다리면 기다리는 것 자체가 초당 60번이다.
         * 0.5초에 한 번만 들여다보고, 한동안 안 붙으면 **버려진 것**으로 보고 손을 뗀다
         * (아무도 안 잡고 있으면 그대로 치워진다). */
        let mountWatch: ReturnType<typeof setTimeout> | null = null;
        let waitedMs = 0;
        const GIVE_UP_MS = 10_000;
        function watchForMount(): void {
            if (mountWatch || (wasConnected && !el.isConnected)) return; // 붙었다 떨어진 것은 끝난 것
            mountWatch = setTimeout(() => {
                mountWatch = null;
                waitedMs += 500;
                if (el.isConnected) {
                    t0 = performance.now();
                    if (!raf) raf = requestAnimationFrame(frame);
                    return;
                }
                if (waitedMs < GIVE_UP_MS) watchForMount();
            }, 500);
        }

        function frame(now: number): void {
            /* **떨어졌으면 스스로 멈춘다** (TASK-KL-201).
             *
             * `spot()` 은 `destroy()` 를 돌려주기만 하고, 부르는 위젯 대부분은 그걸 안 부른다 —
             * 화면이 갈릴 때 DOM 은 사라지지만 이 루프는 영영 돈다. 실측: 위젯 여섯을 열었다
             * 홈으로 돌아오면 이 함수가 초당 181번(=60fps 세 벌) 돌고 있었다. 손 안 댄 화면이
             * 배터리를 먹는다.
             *
             * `mountAvatar` 는 같은 사고를 이미 겪고 「새로 붙이기 전에 앞의 것을 끊는」 방식으로
             * 고쳤다(KL-128 ㉔). 그건 부르는 쪽이 기억해야 하는 방식이라 새 사용처가 생기면 또
             * 샌다. 그래서 여기서, 아바타 자신이 판단한다. 부르는 쪽은 아무것도 안 해도 된다. */
            if (!el.isConnected) {
                /* 예전에는 「**붙었던 적이 있고** 지금 떨어졌으면」만 멈췄다. 그래서 만들어 놓고
                   화면에 **한 번도 안 붙인** 아바타는 조건에 영영 안 걸려 계속 돌았다.
                   실측(2026-08-09): 화면엔 아바타가 **하나**뿐인데 이 루프가 일곱 벌 돌고 있었다 —
                   나머지 여섯은 아무 데도 안 붙은 채 배터리만 먹는 유령이었다.
                   붙어 있지 않으면 그릴 곳이 없다. 붙은 적이 있든 없든 잔다. */
                raf = 0;
                watchForMount();
                return;
            }
            wasConnected = true;

            /* ⚠ **여기서 「안 보이면 쉰다」를 시도했다가 되돌렸다** (TASK-KL-201, 2026-08-09).
             *
             * 숨긴 페이지는 지워지지 않고 남으므로(`isConnected` 는 계속 참) 위젯을 여럿 훑으면
             * 이 루프가 여섯 벌까지 겹친다 — 실측 초당 360회. 그래서 `checkVisibility()` 로
             * 재우려 했는데, **마스코트 자신이 크기 0 인 컨테이너 안에 산다**. 그 판정에 걸려
             * 홈에서도 마스코트가 잠들어 버렸다(실측: 움직임 정지).
             *
             * 막는 자리가 답을 더 나쁘게 만들면 안 된다. 되돌렸다. 다시 손대려면 「보이나」를
             * 요소 크기가 아니라 **셸의 화면 상태**(`.tool-page.active`)로 판단해야 한다 —
             * 다만 그건 마스코트가 셸 구조를 알게 되는 결합이라, 그 값을 셸이 알려 주는 쪽이 맞다.
             */

            const t = (now - t0) / 1000;

            // 값 보간 — 포즈가 튀지 않고 흘러간다
            const k = REDUCED ? 1 : 0.14;
            for (const key of Object.keys(NEUTRAL) as (keyof AvatarPose)[]) {
                if (key === 'gaze' || key === 'eyeArt' || key === 'mouthArt') continue;
                (pose[key] as number) += ((target[key] as number) - (pose[key] as number)) * k;
            }

            // 시선 — 포즈가 방향을 고정하면 그쪽, 아니면 커서
            const wanted = target.gaze || (motion.gaze ? gazeTarget : { x: 0, y: 0 });
            gaze.x += (wanted.x - gaze.x) * (REDUCED ? 1 : 0.1);
            gaze.y += (wanted.y - gaze.y) * (REDUCED ? 1 : 0.1);

            // 눈깜빡임 — 일정 간격이면 기계처럼 보인다. 다음 시각을 매번 새로 뽑는다
            if (!REDUCED && motion.blink && !target.eyeArt && target.eyeOpen > 0.15) {
                if (blinkPhase > 0) {
                    blinkPhase -= 1 / 7;                 // 약 7 프레임에 걸쳐 감았다 뜬다
                    blink = Math.abs(blinkPhase * 2 - 1);
                    if (blinkPhase <= 0) { blink = 1; nextBlinkAt = now + 1800 + Math.random() * 4200; }
                } else if (now >= nextBlinkAt) {
                    blinkPhase = 1;
                }
            } else {
                blink = 1;
            }

            const alive = !REDUCED && motion.breathe;
            const breathe = alive ? Math.sin(t * (Math.PI * 2) / 4) * 2.2 : 0;
            const sway = alive ? Math.sin(t * (Math.PI * 2) / 5.5) * 1.1 : 0;

            // 몸 전체 — 보여 줄 범위로 맞춘 뒤 숨쉬기 + 포즈 상하
            const ox = -view.x * scale;
            const oy = (-view.y + pose.bob + breathe) * scale;
            stage.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;

            // 고개 — 목 위쪽을 축으로 돈다
            const headPivotX = (faceBox ? faceBox.x + faceBox.w / 2 : 512);
            const headPivotY = (faceBox ? faceBox.y + faceBox.h : 512);
            const headRot = pose.tilt + sway + gaze.x * 2.2;
            for (const g of headGroups) {
                g.style.transformOrigin = `${headPivotX}px ${headPivotY}px`;
                g.style.transform =
                    `rotate(${headRot}deg) translate(${gaze.x * 3.2}px, ${gaze.y * 2.6}px)`;
            }

            // 눈 — 감을 때 아래로 눌린다. 눈웃음은 아래에서 밀어 올린 모양.
            // 축은 눈 아래쪽 — 눈꺼풀은 위에서 내려온다.
            const open = clamp(pose.eyeOpen * blink * (1 - pose.eyeSquint * 0.75), 0, 2);
            for (const name of EYE_PARTS) {
                const img = layers.get(name);
                if (!img) continue;
                /* 감을 때 눈이 **아래로만** 눌리면 감은 눈이 눈 상자 바닥에 붙는다.
                 * 실제로 눈꺼풀은 위에서 내려와 눈 가운데쯤에서 만난다 — 축을 아래가 아니라
                 * 아래쪽 3/4 지점에 두면 그 자리에서 만난다. */
                img.style.transformOrigin = name === 'eyelash' ? '50% 76%' : '50% 88%';
                const sq = name === 'eyelash' ? Math.max(open, 0.3) : open;
                const drift = name === 'eyewhite' ? 0.35 : 0;   // 흰자는 눈동자보다 덜 따라간다
                const b2 = manifest.parts[name];
                img.style.transform = drift
                    ? `translate(${gaze.x * b2.w * 0.04 * drift}px, 0px) scaleY(${sq})`
                    : `scaleY(${sq})`;
            }
            // 눈동자만 시선 방향으로 더 움직인다
            if (irisEls.length) {
                const dx = gaze.x * 2.4;
                const dy = gaze.y * 1.8;
                for (const el3 of irisEls) {
                    el3.style.transform =
                        `translate(${dx}px, ${dy}px) scale(${pose.irisScale}, ${open * pose.irisScale})`;
                }
            } else {
                const iris = layers.get('irides');
                if (iris) {
                    const b = manifest.parts['irides'];
                    iris.style.transform =
                        `translate(${gaze.x * b.w * 0.13}px, ${gaze.y * b.h * 0.18}px) scaleY(${open})`;
                }
            }

            const brow = layers.get('eyebrow');
            if (brow) {
                brow.style.transformOrigin = '50% 50%';
                brow.style.transform =
                    `translate(0px, ${pose.browRaise}px) rotate(${pose.browTilt * 0.35}deg)`;
            }

            // 표정 조각 — 눈·입을 통째로 갈아 끼운다.
            //
            // 값(scaleY·scale)으로 만드는 표정에는 천장이 있다. 입은 원본에서
            // 17px 짜리 선 하나뿐이라 아무리 늘려도 「벌린 입」이 안 된다. 같은
            // 그림의 그 부분만 다시 그려 둔 조각을 얹으면 진짜로 달라진다.
            const eyeArt = target.eyeArt;
            const mouthArt = target.mouthArt;
            for (const name of variantNames) {
                const v = layers.get(name);
                if (!v) continue;
                v.style.display = (name === eyeArt || name === mouthArt) ? '' : 'none';
            }
            // 갈아 끼운 자리의 기본 부품은 숨긴다 — 겹치면 눈이 네 개가 된다
            for (const name of EYE_PARTS) {
                const b = layers.get(name);
                if (b) b.style.display = eyeArt ? 'none' : '';
            }
            const baseMouth = layers.get('mouth');
            if (baseMouth) baseMouth.style.display = mouthArt ? 'none' : '';

            // 팔 — 어깨를 축으로. 손 흔들기·가리키기가 여기서 나온다
            for (const [name, pivot] of Object.entries(ARM_PIVOT)) {
                const arm = layers.get(name);
                if (!arm) continue;
                arm.style.transformOrigin = pivot;
                arm.style.transform = `rotate(${name === 'arm-l' ? pose.armL : pose.armR}deg)`;
            }

            const mouth = layers.get('mouth');
            if (mouth) {
                mouth.style.transformOrigin = '50% 50%';
                mouth.style.transform = `scale(${pose.mouthWide}, ${pose.mouthOpen})`;
            }

            blushEl.style.opacity = String(pose.blush);

            raf = requestAnimationFrame(frame);
        }

        /* **안 보이는 화면의 마스코트는 잔다** (TASK-KL-201, 2026-08-09 2차).
         *
         * 셸은 화면을 지우지 않고 **숨긴 채 남긴다** — `isConnected` 는 계속 참이라 위 자기중단은
         * 안 걸린다. 그래서 위젯을 훑고 홈으로 오면 이 루프가 여러 벌 겹쳐 돈다.
         * 실측: 위젯 13개를 훑고 홈 = 초당 303회(=60fps 다섯 벌). 손 안 댄 화면이 배터리를 먹는다.
         *
         * 앞서 `checkVisibility()` 로 재우려다 되돌렸다 — 마스코트가 **크기 0 컨테이너** 안에 살아
         * 홈에서도 잠들어 버렸다. 요소의 크기로 「보이나」를 물으면 안 된다는 뜻이었다.
         *
         * 그래서 묻는 대상을 바꿨다: **자기가 올라탄 도구 화면이 지금 켜져 있나**. 셸이 이미
         * `.tool-page.active` 로 그 사실을 적고 있으니, 그 한 칸만 지켜본다. 도구 화면 밖에 사는
         * 마스코트(홈·머리띠)는 `closest` 가 아무것도 못 찾으므로 **영향이 없다** — 앞 사고의
         * 재발 지점이 구조적으로 닫힌다.
         *
         * 멈출 때 `raf` 를 비우고, 켜질 때 다시 건다. 중복 기동을 막으려고 `raf` 가 0 일 때만 건다.
         */
        const ownerPage = el.closest('.tool-page');
        const pageAwake = () => !ownerPage || ownerPage.classList.contains('active');

        function wake(): void {
            if (raf) return;
            t0 = performance.now();
            raf = requestAnimationFrame(frame);
        }
        function sleep(): void {
            if (!raf) return;
            cancelAnimationFrame(raf);
            raf = 0;
        }

        let pageWatch: MutationObserver | null = null;
        if (ownerPage && typeof MutationObserver === 'function') {
            pageWatch = new MutationObserver(() => (pageAwake() ? wake() : sleep()));
            pageWatch.observe(ownerPage, { attributes: true, attributeFilter: ['class'] });
        }

        if (pageAwake()) raf = requestAnimationFrame(frame);

        return {
            el,
            setPose,
            setFraming(f: Framing): void {
                view = FRAMING[f];
                el.style.aspectRatio = `${view.w} / ${view.h}`;
                measure();
            },
            setMotion(m: Partial<MotionFlags>): void { Object.assign(motion, m); },
            lookAt,
            destroy() { cancelAnimationFrame(raf); raf = 0; if (mountWatch) clearTimeout(mountWatch); ro?.disconnect(); pageWatch?.disconnect(); el.remove(); },
        };
    }

    function clamp(v: number, lo: number, hi: number): number {
        return v < lo ? lo : v > hi ? hi : v;
    }

    const AVATAR_CSS = `
    .mdd-av { position:relative; overflow:hidden; width:100%; }
    .mdd-av-stage { position:absolute; transform-origin:0 0; will-change:transform; }
    .mdd-av-group { position:absolute; inset:0; will-change:transform; }
.mdd-av-part { position:absolute; display:block; pointer-events:none;
        -webkit-user-drag:none; user-drag:none; transform-box:fill-box; will-change:transform; }
    .mdd-spot { display:flex; flex-direction:column; align-items:center; gap:10px; padding:24px 16px; }
.mdd-spot-msg { margin:0; font-size:var(--font-size-sm,13px); color:var(--text-secondary,#9aa3b2); text-align:center; line-height:1.5; }
/* 눈동자만 **코드로 그린** 것이라 다른 부위와 선명도가 안 맞았다 — 원본 그림은 부드러운데
   눈만 벡터처럼 또렷해 「눈이 따로 논다」(사용자 신고). 아주 살짝 흐리고 채도를 낮춰
   같은 붓으로 그린 것처럼 맞춘다. 흐림은 1024 좌표계에서 걸리므로 화면에서는 그 절반쯤이다. */
.mdd-av-iris { position:absolute; border-radius:50%; transform-origin:50% 88%;
    overflow:hidden; will-change:transform;
    filter: blur(0.7px) saturate(0.88) brightness(0.98);
    /* 셀 애니 눈의 구조는 정해져 있다 — 위에서부터
       ① 속눈썹이 드리운 진한 아치  ② 홍채 본색  ③ 아래쪽 반사(가장 밝은 띠)
       ④ 한가운데 세로로 긴 동공     ⑤ 큰 하이라이트(좌상) + 작은 것(우하)
       ⑥ 홍채를 두르는 진한 테두리
       그라디언트를 부드럽게 이으면 구슬이 된다. 경계를 끊어야 「그린 눈」이 된다. */
    background:
        /* ⑤ 하이라이트 — 셀 룩이라 경계는 끊되, 아주 얇게 풀어 계단을 없앤다 */
        radial-gradient(circle at 34% 25%, #ffffff 0 19%, rgba(255,255,255,0) 21%),
        radial-gradient(circle at 70% 73%, rgba(255,255,255,0.9) 0 7%, rgba(255,255,255,0) 9%),
        /* ④ 동공 — 세로로 긴 타원 */
        radial-gradient(ellipse 24% 33% at 50% 53%, #150a22 0 92%, rgba(21,10,34,0) 100%),
        /* ③ 아래쪽 반사 */
        radial-gradient(ellipse 72% 44% at 50% 89%, #d9b8fc 0 55%, rgba(217,184,252,0) 100%),
        /* ① 위쪽 그림자 + ② 본색 */
        linear-gradient(to bottom, #33144f 0 24%, #5b2a93 25% 47%, #8c52cf 48% 77%, #b483ea 78% 100%);
    box-shadow: inset 0 0 0 1.4px rgba(24,10,38,0.9); }

/* 홀로그램 — 「지금 여기 있는 사람」이 아니라 **쏘아 보낸 상**.
 *
 * 다시 만들었다 (사용자 지시 2026-08-08 — 「지직하면서 깜빡여야 연출인지 알지」).
 *
 * 전에 뭐가 문제였나:
 *   ① **상시 색수차**(청록/자홍 ±1.6px)를 걸어 뒀는데, 부위가 여러 장이라 눈·코 같은
 *      안쪽 경계에도 테두리가 생겼다 — 「누끼가 잘못됐나」로 읽혔다(사용자 신고).
 *   ② 점 격자를 상자(::after inset:0)에 깔아서, 캐릭터가 아니라 **네모가** 떠 있었다.
 *   ③ 어긋나는 띠가 7초에 한 번 0.2초 — 눈에 걸리지만 「효과」로 안 읽히고 렌더 오류로 보였다.
 *
 * 지금은 이렇게 한다:
 *   ① **주사선은 실루엣 안에서만** — 그림 자체를 가로줄 마스크로 깎는다. 상자가 안 생긴다.
 *      줄이 위로 흐르면서 「투영 중」이 계속 보인다.
 *   ② **색수차는 지직할 때만** 튄다. 평소엔 청록 글로우만 — 안쪽에 테두리가 안 남는다.
 *   ③ 지직은 3.6초 주기의 **짧은 연타**(두 번 튀고 멈춤). 규칙적으로 오면 고장이 아니라
 *      연출로 읽힌다. 밝기도 같이 튄다 — 빛이 흔들리는 물건이라는 뜻.
 */
.mdd-holo { position:relative; }
.mdd-holo .mdd-av {
    /* 실루엣 밖으로만 번지는 빛 — 안쪽 경계에는 아무 테두리도 안 남긴다 */
    filter: drop-shadow(0 0 9px rgba(0,229,255,0.34)) saturate(1.05) brightness(1.03);
    /* 주사선: 그림을 가로줄로 깎는다 (상자가 아니라 캐릭터가 줄무늬가 된다) */
    /* 줄은 **있는지 없는지 헷갈릴 만큼** 얕게. 0.72 로 깎았더니 캐릭터가 바코드가 됐다
       (실측 스크린샷). 4px 마다 1px 을 0.9 로만 눌러 「스캔되는 중」만 남긴다. */
    -webkit-mask-image: repeating-linear-gradient(to bottom,
        #000 0 3px, rgba(0,0,0,0.9) 3px 4px);
    mask-image: repeating-linear-gradient(to bottom,
        #000 0 3px, rgba(0,0,0,0.9) 3px 4px);
    -webkit-mask-size:100% 4px; mask-size:100% 4px;
    /* 주사선은 **안 흐른다.** 흐르게 하려면 mask-position 을 매 프레임 바꿔야 하는데,
       그건 합성기가 못 맡아서 마스코트를 60fps 로 다시 칠한다 — 아무도 안 보고 있어도.
       화면이 영영 안 쉬는 원인을 하나 더 만드는 셈이다. 「투영된 상」은 줄무늬가 있다는
       사실만으로 읽히고, 살아 있다는 신호는 3.6초마다 오는 지직이 낸다. */
    animation: mdd-holo-glitch 3.6s steps(1) infinite;
}
/* 아래로 깔리는 투영 빛 — 「어딘가에서 쏘고 있다」 */
.mdd-holo::before { content:''; position:absolute; inset:-8% -5%; pointer-events:none; z-index:1;
    background:radial-gradient(ellipse at 50% 82%, rgba(0,229,255,0.16) 0%, rgba(0,229,255,0) 62%);
    animation: mdd-holo-breathe 3.6s ease-in-out infinite; }

/* 지직 — 3.6초에 한 번, 0.2초 동안 **두 번** 튄다. 이때만 색이 갈라진다. */
@keyframes mdd-holo-glitch {
    0%, 88% { transform:translateX(0); clip-path:none;
              filter:drop-shadow(0 0 9px rgba(0,229,255,0.34)) saturate(1.05) brightness(1.03); }
    89% { transform:translateX(5px); clip-path:inset(30% 0 52% 0);
          filter:drop-shadow(-3px 0 0 rgba(0,229,255,0.8)) drop-shadow(3px 0 0 rgba(255,64,190,0.65)) brightness(1.3); }
    91% { transform:translateX(-4px); clip-path:inset(58% 0 22% 0);
          filter:drop-shadow(3px 0 0 rgba(0,229,255,0.7)) drop-shadow(-3px 0 0 rgba(255,64,190,0.6)) brightness(0.86); }
    93% { transform:translateX(2px); clip-path:none; filter:brightness(1.35) saturate(1.4); }
    95%, 100% { transform:translateX(0); clip-path:none;
                filter:drop-shadow(0 0 9px rgba(0,229,255,0.34)) saturate(1.05) brightness(1.03); }
}
@keyframes mdd-holo-breathe { 0%,100% { opacity:0.75; } 50% { opacity:1; } }

@media (prefers-reduced-motion: reduce) {
    /* 움직임을 싫어하는 사람에게는 **줄무늬만** 남긴다 — 튀지 않아도 상으로는 읽힌다 */
    .mdd-holo .mdd-av { animation:none; }
    .mdd-holo::before { animation:none; }
}
.mdd-av-blush { position:absolute; pointer-events:none; opacity:0;
        background:radial-gradient(ellipse at 22% 50%, rgba(255,120,150,0.55) 0%, rgba(255,120,150,0) 60%),
                   radial-gradient(ellipse at 78% 50%, rgba(255,120,150,0.55) 0%, rgba(255,120,150,0) 60%);
        transition:opacity 0.25s; mix-blend-mode:multiply; }
    `;


    let currentMood = 'idle';
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let container: HTMLDivElement | null = null;
    let charEl: HTMLDivElement | null = null;
    let bubbleEl: HTMLDivElement | null = null;
    let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
    let _ready = false;
    let avatar: AvatarHandle | null = null;

    /* ===== 마스코트 그림 =====
     * 부위 레이어를 값으로 움직이는 아바타(mdd-avatar)가 본체다. 매니페스트를
     * 아직 못 받았거나 못 읽는 동안에는 예전 그림 12장으로 버틴다 — 마스코트가
     * 통째로 사라지는 것보다 낫다. */

    /** 파츠를 못 받았을 때 대신 세워 두는 그림 한 장.
     *
     * 예전엔 표정마다 파일이 하나씩(12장) 있었는데 서로 다른 캐릭터로 그려져
     * 있었다 — 표정이 바뀔 때마다 다른 사람이 됐다. 이제 표정은 값이 만들고,
     * 폴백은 같은 일러스트에서 잘라 낸 한 장이라 무슨 일이 있어도 같은 사람이다. */
    function getMascotImgSrc(): string {
        return `${PARTS_BASE}/fallback.webp`;
    }

    /** 부위 목록은 한 번만 받는다 — 화면 여러 곳에 티메토가 나와도 요청은 하나 */
    let manifestOnce: Promise<Manifest> | null = null;

    function loadManifest(): Promise<Manifest> {
        if (!manifestOnce) {
            manifestOnce = fetch(`${PARTS_BASE}/manifest.json`).then((r) => {
                if (!r.ok) throw new Error(`manifest ${r.status}`);
                return r.json();
            });
        }
        return manifestOnce;
    }

    /**
     * 화면 안 아무 자리에나 티메토를 세운다 — 우하단 상주 말고.
     *
     * 로딩·빈 화면·에러는 지금까지 회색 글자 한 줄이었다. 같은 캐릭터가 그 자리에
     * 나와서 말하면 「기다리는 시간」이 「누가 대신 봐 주는 시간」이 된다. 상주
     * 마스코트와 같은 그림·같은 리깅을 쓰므로 얼굴이 갈리지 않는다.
     */
    async function spot(host: HTMLElement, opts?: {
        mood?: string; msg?: string; width?: number; framing?: Framing;
        /** 이 선택자가 host 안에 아직 있을 때만 그린다 */
        onlyIf?: string;
    }): Promise<{ destroy(): void } | null> {
        const o = opts || {};
        // 마스코트가 늦게 도착하면 이 부름은 줄을 섰다가 나중에 실행된다. 그 사이
        // 기다리던 화면이 이미 다 그려졌을 수 있어서, 「아직 기다리는 중인가」를
        // 부른 쪽이 알려 준 표시로 확인한다 — 안 그러면 완성된 화면을 덮는다.
        if (o.onlyIf && !host.querySelector(o.onlyIf)) return null;
        // 탭 내용은 화면에 붙기 *전에* 그려진다 — 그 시점에 「아직 안 붙었으니 관두자」
        // 하면 영영 안 뜬다. 한 프레임 기다렸다가 다시 본다.
        if (!host.isConnected) {
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            if (!host.isConnected) return null;
            if (o.onlyIf && !host.querySelector(o.onlyIf)) return null;
        }
        try {
            const manifest = await loadManifest();
            const wrap = document.createElement('div');
            wrap.className = 'mdd-spot';
            const av = createAvatar(PARTS_BASE, manifest, o.framing || 'bust');
            av.el.style.width = (o.width || 120) + 'px';
            av.setPose(o.mood || 'idle');
            wrap.appendChild(av.el);
            if (o.msg) {
                const line = document.createElement('p');
                line.className = 'mdd-spot-msg';
                line.textContent = o.msg;
                wrap.appendChild(line);
            }
            host.replaceChildren(wrap);
            return { destroy() { av.destroy(); wrap.remove(); } };
        } catch (_) {
            return null;        // 못 세우면 부른 쪽의 원래 글자가 남는다
        }
    }

    async function mountAvatar(): Promise<void> {
        if (!charEl) return;
        try {
            const manifest = await loadManifest();
            /* 앞의 아바타를 **먼저 끊는다** (TASK-KL-128 ㉔).
             * 안 끊으면 그 아바타의 매-프레임 루프가 화면에서 떨어진 채로 영영 돈다 —
             * 다시 붙일 때마다 하나씩 늘어난다. 손을 안 대도 스타일 재계산이 초당 137회
             * (=60fps 두 벌) 돌고 있었다. 듣는 귀도 같이 늘어난다. */
            avatar?.destroy?.();
            document.removeEventListener('pointermove', onPointerLook);
            const handle = createAvatar(PARTS_BASE, manifest, 'bust');
            charEl.replaceChildren(handle.el);
            avatar = handle;
            handle.setPose(currentMood);
            // 파츠가 붙고 나면 컨테이너 높이가 확정된다. 그 전에 잡아 둔 자리는
            // 말풍선 높이가 달라진 만큼 어긋나 있으므로 다시 붙인다.
            reflowPosition();
            document.addEventListener('pointermove', onPointerLook);
        } catch (_) {
            // 파츠를 못 받았을 때만 폴백 그림을 넣는다. 미리 넣어 두면 잘 되는
            // 경우에도 모든 방문자가 안 쓸 그림 한 장을 받는다.
            charEl.innerHTML =
                `<img src="${getMascotImgSrc()}" alt="마스코트" draggable="false">`;
        }
    }

    function onPointerLook(e: PointerEvent): void {
        avatar?.lookAt(e.clientX, e.clientY);
    }

    /* ===== CSS 주입 ===== */

    function injectCSS(id: string, css: string): void {
        if (document.getElementById('mdd-css-' + id)) return;
        const style = document.createElement('style');
        style.id = 'mdd-css-' + id;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ===== 감정/포즈 전환 ===== */

    function setMood(poseId: string): void {
        if (!POSES.includes(poseId)) poseId = 'idle';
        currentMood = poseId;
        if (!charEl) return;
        if (avatar) {
            avatar.setPose(poseId);
        } else {
            /* 폴백은 한 장뿐이라 표정이 안 바뀐다 — 값이 아니라 파일로 표정을
               내던 시절의 한계다. 파츠가 오면 그때부터 진짜로 움직인다. */
        }
        resetIdleTimer();
    }

    /* ===== 말풍선 ===== */

    function say(message: string, duration = prefs.bubbleMs): void {
        const el = bubbleEl;
        if (!el || !prefs.bubble) return;
        el.textContent = message;
        el.classList.add('visible');
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => {
            el.classList.remove('visible');
        }, duration);
    }

    /* ===== 바운스 ===== */

    function bounce(): void {
        if (!charEl) return;
        charEl.classList.remove('mdd-bounce');
        void charEl.offsetWidth;
        charEl.classList.add('mdd-bounce');
    }

    /* ===== 티메토 감정별 대사 프리셋 (로드맵 기준) ===== */
    const LINE_PRESETS = {
        first_visit:   { mood: 'pointing', msg: '어서 오세요, 조수님! KarmoLab에 오신 걸 환영해요.' },
        daily_start:   { mood: 'happy',    msg: '조수님, 오늘의 실험 준비됐어요! 한 번 확인해볼래요?' },
        tool_run:      { mood: 'think',    msg: '측정 개시... 잠깐만요!' },
        success:       { mood: 'cheer',    msg: '샘플 확보! 연구 노트에 기록했어요.' },
        error:         { mood: 'sad',      msg: '장비가 잠깐 삐끗했어요... 다시 한 번만요!' },
        warn_data:     { mood: 'angry',    msg: '잠깐! 이건 중요한 데이터예요. 꼭 확인해주세요.' },
        idle_sleep:    { mood: 'sleep',    msg: 'zzZ... 조수님...?' },
        idle_wake:     { mood: 'shock',    msg: '앗! 돌아오셨군요!' },
        achievement:   { mood: 'love',     msg: '조수님 덕분에 연구소가 안정되고 있어요...!' },
        meme_done:     { mood: 'smug',     msg: '후후, 이건 명작이 될지도요?' },
        home_hub:      { mood: 'happy',    msg: '조수님, 연구소 허브예요! 자주 쓰는 장비는 즐겨찾기에 모아 두었어요.' },
        measure_done:  { mood: 'cheer',    msg: '측정 완료! 수치는 연구 노트에 반영했어요.' },
    };

    /* ===== 지금 보고 있는 도구 =====
     *
     * 대사 프리셋은 12개뿐인데 도구는 127개다. 그래서 어느 도구를 열어도 티메토는
     * 늘 같은 말을 했다 — 「측정 개시… 잠깐만요!」. 도구마다 대사를 손으로 적는
     * 것은 127벌을 관리하는 일이고 새 도구가 생기면 바로 샌다.
     *
     * 대신 화면이 이미 알고 있는 것을 쓴다: 지금 열린 도구의 **이름**. 그러면
     * 대사를 한 벌만 두고도 「JSON 포맷 꺼낼게요」처럼 그 도구의 말이 된다. */
    function currentToolName(): string {
        try {
            const page = document.querySelector('[id^="page-"].active');
            if (!page) return '';
            const head = page.querySelector('h1, h2');
            const name = head && head.textContent ? head.textContent.trim() : '';
            return name.length > 24 ? '' : name;      // 문장처럼 긴 제목은 대사에 안 어울린다
        } catch (_) {
            return '';
        }
    }

    /** 도구 이름을 넣어 말할 수 있는 프리셋과 그 말투 */
    const NAMED_LINES: Record<string, string[]> = {
        tool_run: ['{}, 꺼낼게요…', '{} 준비 중이에요!', '{} 자리 잡을게요…'],
        success: ['{} 끝났어요! 노트에 적어 뒀어요.', '{}, 결과 나왔어요!'],
        error: ['{} 가 삐끗했어요… 다시 한 번만요!', '{} 에서 걸렸어요. 한 번 더요?'],
    };

    /**
     * 프리셋 대사 + 포즈. opts.msg / opts.mood / opts.duration 으로 덮어쓸 수 있음.
     * @returns {boolean} 알려진 id면 true
     */
    function linePreset(id: string, opts?: { msg?: string; mood?: string; duration?: number }): boolean {
        const base = (LINE_PRESETS as Record<string, { mood: string; msg: string } | undefined>)[id];
        if (!base) return false;
        const mood = (opts && opts.mood) || base.mood;
        let msg = (opts && opts.msg != null) ? opts.msg : base.msg;
        // 부른 쪽이 대사를 직접 준 게 아니면, 지금 열린 도구 이름으로 말한다
        if (!(opts && opts.msg != null) && NAMED_LINES[id]) {
            const name = currentToolName();
            if (name) {
                const forms = NAMED_LINES[id];
                msg = forms[Math.floor(Math.random() * forms.length)].replace('{}', name);
            }
        }
        const duration = (opts && opts.duration != null) ? opts.duration : prefs.bubbleMs;
        setMood(mood);
        say(msg, duration);
        return true;
    }

    const TAP_QUIPS = [
        '조수님, 저를 부르셨나요?',
        '실험 데이터... 아, 장난이에요.',
        '잠깐 쉬었다 갈게요~',
        '저도 측정 한번 해볼까요?',
        '조수님 손길, 기록해 둘게요.',
        '히히, 오늘 기분 좋아요.',
        '다음 실험은 뭘까요?',
        '연구소 안전 점검... 통과예요!',
    ];

    function resetIdleTimer(): void {
        if (currentMood === 'sleep') return;
        if (idleTimer !== null) clearTimeout(idleTimer);
        if (prefs.idleMs <= 0) return;      // 0 = 안 잠든다
        idleTimer = setTimeout(() => { linePreset('idle_sleep', { duration: 4000 }); }, prefs.idleMs);
    }

    /* ===== 호감도 시스템 ===== */

    const AFFECTION_KEY = 'mdd_affection';
    const STORY_KEY = 'mdd_story_progress';
    const STORY_LOG_KEY = 'mdd_story_log';
    const GUIDE_SEEN_KEY = 'mdd_guide_seen';
    const POSITION_KEY = 'mdd_position';

    function getAffection(): number {
        try { return parseInt(localStorage.getItem(AFFECTION_KEY) || '0', 10) || 0; } catch (_) { return 0; }
    }

    function addAffection(amount: number): number {
        const current = getAffection() + amount;
        try { localStorage.setItem(AFFECTION_KEY, String(current)); } catch (_) {}
        checkStoryMilestone(current);
        return current;
    }

    function getStoryProgress(): { seen: string[]; chapter: number } {
        try { return JSON.parse(localStorage.getItem(STORY_KEY) as string) || { seen: [], chapter: 0 }; }
        catch (_) { return { seen: [], chapter: 0 }; }
    }

    function saveStoryProgress(data: { seen: string[]; chapter: number }): void {
        try { localStorage.setItem(STORY_KEY, JSON.stringify(data)); } catch (_) {}
    }

    /* 티메토 온보딩 가이드 (짧은 순서) */
    const GUIDE_MESSAGES = [
        { id: 'welcome',  msg: LINE_PRESETS.first_visit.msg },
        { id: 'drag',     msg: '저를 드래그해서 연구소 구석구석, 편한 자리로 옮길 수 있어요.' },
        { id: 'click',    msg: '가끔 눌러 주시면 반응 샘플이 쌓여요. 우클릭은 스토리 로그예요!' },
    ];

    const STORY_EVENTS = [
        { threshold: 0,    id: 'intro',     mood: 'pointing',  msg: '처음 뵙겠어요, 조수님. 실험 참여 감사드려요!' },
        { threshold: 10,   id: 'curious',   mood: 'think',     msg: '자주 오시네요... 좋은 데이터가 쌓이고 있어요.' },
        { threshold: 30,   id: 'comfort',   mood: 'happy',     msg: '이제 조수님 손길이 익숙해졌어요. 안심하고 맡겨 주세요.' },
        { threshold: 50,   id: 'trust',     mood: 'smug',      msg: '다른 분들과는 뭔가 달라요... 인정할게요.' },
        { threshold: 100,  id: 'friend',    mood: 'love',      msg: '솔직히... 조수님 오시는 날이 기다려졌어요.' },
        { threshold: 200,  id: 'partner',   mood: 'cheer',     msg: '이제 공식 파트너예요! 앞으로도 실험 같이 해요!' },
        { threshold: 500,  id: 'soulmate',  mood: 'love',      msg: '연구소가 집 같아요. 조수님이 계셔서 그래요.' },
    ];

    function appendStoryLog(entry: { id: string; msg: string; mood: string; ts: number }): void {
        try {
            const log = getStoryLog();
            log.push(entry);
            localStorage.setItem(STORY_LOG_KEY, JSON.stringify(log));
        } catch (_) {}
    }

    function getStoryLog(): Array<{ id?: string; msg: string; mood?: string; ts?: number }> {
        try { return JSON.parse(localStorage.getItem(STORY_LOG_KEY) as string) || []; }
        catch (_) { return []; }
    }

    function checkStoryMilestone(affection: number): void {
        const progress = getStoryProgress();
        for (const event of STORY_EVENTS) {
            if (affection >= event.threshold && !progress.seen.includes(event.id)) {
                progress.seen.push(event.id);
                progress.chapter = Math.max(progress.chapter, STORY_EVENTS.indexOf(event));
                saveStoryProgress(progress);
                appendStoryLog({ id: event.id, msg: event.msg, mood: event.mood, ts: Date.now() });
                setTimeout(() => {
                    setMood(event.mood);
                    say(event.msg, 5000);
                    bounce();
                    if (event.id === 'intro') setTimeout(showNextGuide, 5500);
                }, 500);
                break;
            }
        }
    }

    /* 안내 대사 표시 (최소 세트) */
    function showGuide(id: string): void {
        const g = GUIDE_MESSAGES.find(x => x.id === id);
        if (!g) return;
        if (id === 'welcome') {
            linePreset('first_visit', { duration: 4000 });
            return;
        }
        linePreset('tool_run', { msg: g.msg, duration: 4000 });
    }

    function showNextGuide(): void {
        try {
            const seen = JSON.parse(localStorage.getItem(GUIDE_SEEN_KEY) as string) || [];
            const next = GUIDE_MESSAGES.find(g => !seen.includes(g.id));
            if (next) {
                seen.push(next.id);
                localStorage.setItem(GUIDE_SEEN_KEY, JSON.stringify(seen));
                showGuide(next.id);
            }
        } catch (_) {}
    }

    function getRelationshipTitle(): string {
        const affection = getAffection();
        if (affection >= 500) return '소울메이트';
        if (affection >= 200) return '파트너';
        if (affection >= 100) return '친구';
        if (affection >= 50) return '지인';
        if (affection >= 30) return '아는 사이';
        if (affection >= 10) return '관심';
        return '낯선 사람';
    }

    /* ===== 드래그 ===== */

    /* 자리 기억 = 「어느 벽에 붙어 있고, 그 벽을 따라 얼마쯤」.
     *
     * 좌표(left/top)만 저장하면 크기가 달라지는 순간 어긋난다 — 마스코트 크기를
     * 바꾸거나, 폴백 그림에서 진짜 파츠로 갈아 끼우기만 해도 높이가 변해서
     * 화면 밖으로 20px 씩 삐져나갔다. 창 크기를 바꿔도 마찬가지다.
     * 벽과 비율로 적어 두면 무엇이 변하든 그 벽에 붙은 채로 따라간다. */
    type Wall = 'left' | 'right' | 'top' | 'bottom';
    const WALL_MARGIN = 16;

    function placeAt(wall: Wall, ratio: number): void {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const freeX = Math.max(0, window.innerWidth - rect.width - WALL_MARGIN * 2);
        const freeY = Math.max(0, window.innerHeight - rect.height - WALL_MARGIN * 2);
        let left: number;
        let top: number;
        if (wall === 'left' || wall === 'right') {
            left = wall === 'left' ? WALL_MARGIN : window.innerWidth - rect.width - WALL_MARGIN;
            top = WALL_MARGIN + freeY * ratio;
        } else {
            top = wall === 'top' ? WALL_MARGIN : window.innerHeight - rect.height - WALL_MARGIN;
            left = WALL_MARGIN + freeX * ratio;
        }
        container.style.left = Math.round(left) + 'px';
        container.style.top = Math.round(top) + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    }

    let stuck: { wall: Wall; ratio: number } | null = null;
    /* 끌고 있는 중에는 아무도 자리를 건드리면 안 된다. 늦게 도착한 load 이벤트가
       재배치를 걸어 손에 쥔 마스코트를 도로 끌어당기는 일이 실제로 있었다. */
    let dragging = false;

    function loadPosition(): void {
        if (!container) return;
        try {
            const raw = localStorage.getItem(POSITION_KEY);
            if (!raw) return;
            const v = JSON.parse(raw) as { wall?: Wall; ratio?: number };
            if (!v || typeof v.wall !== 'string' || typeof v.ratio !== 'number') return;
            stuck = { wall: v.wall, ratio: v.ratio };
            placeAt(stuck.wall, stuck.ratio);
        } catch (_) {}
    }

    function savePosition(wall: Wall, ratio: number): void {
        stuck = { wall, ratio };
        try { localStorage.setItem(POSITION_KEY, JSON.stringify(stuck)); } catch (_) {}
    }

    /** 크기·창이 바뀌면 붙어 있던 벽으로 다시 붙인다 */
    function reflowPosition(): void {
        if (dragging || !stuck) return;
        placeAt(stuck.wall, stuck.ratio);
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('resize', reflowPosition);
        window.addEventListener('load', reflowPosition);
    }

    function initDrag(): void {
        if (!charEl || !container) return;
        const el = charEl;
        const box = container;
        let dragStart: { x: number; y: number; left: number; top: number } | null = null;
        const DRAG_THRESHOLD = 8;

        const onDown = (e: PointerEvent) => {
            dragging = true;
            dragStart = { x: e.clientX, y: e.clientY, left: box.offsetLeft, top: box.offsetTop };
            const rect = box.getBoundingClientRect();
            if (box.style.left) {
                dragStart.left = rect.left;
                dragStart.top = rect.top;
            } else {
                dragStart.left = window.innerWidth - rect.width - 16;
                dragStart.top = window.innerHeight - rect.height - 16;
            }
            box.style.left = dragStart.left + 'px';
            box.style.top = dragStart.top + 'px';
            box.style.bottom = 'auto';
            box.style.right = 'auto';
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp, { once: true });
            document.addEventListener('pointercancel', onUp, { once: true });
        };

        const onMove = (e: PointerEvent) => {
            if (!dragStart) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            let left = dragStart.left + dx;
            let top = dragStart.top + dy;
            const maxLeft = window.innerWidth - box.offsetWidth;
            const maxTop = window.innerHeight - box.offsetHeight;
            left = Math.max(0, Math.min(left, maxLeft));
            top = Math.max(0, Math.min(top, maxTop));
            box.style.left = left + 'px';
            box.style.top = top + 'px';
        };

        const onUp = (e: PointerEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            dragging = false;
            if (!dragStart) return;
            const moved = Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y);
            if (moved >= DRAG_THRESHOLD) {
                snapToWall();
            } else if (prefs.tapReact) {
                bounce();
                addAffection(1);
                const q = TAP_QUIPS[Math.floor(Math.random() * TAP_QUIPS.length)];
                say(q);
                setMood(['happy', 'smug', 'love', 'idle'][Math.floor(Math.random() * 4)]);
            }
            dragStart = null;
        };

        /** 놓은 자리에서 가까운 벽에 붙인다.
         *
         * 손으로 정확히 모서리에 맞추기는 어렵고, 어중간하게 뜬 마스코트는 본문
         * 위에 얹혀 글을 가린다. 가까운 쪽 벽에 붙여 두면 어디에 뒀는지도
         * 분명해진다. 창 크기가 바뀌어도 붙은 쪽을 알면 따라갈 수 있다. */
        function snapToWall(): void {
            const rect = box.getBoundingClientRect();
            const dist: Record<Wall, number> = {
                left: rect.left,
                right: window.innerWidth - rect.right,
                top: rect.top,
                bottom: window.innerHeight - rect.bottom,
            };
            const wall = (Object.keys(dist) as Wall[])
                .reduce((a, b) => (dist[b] < dist[a] ? b : a));

            // 벽을 따라 어디쯤인지 = 움직일 수 있는 폭 대비 비율. 크기·창이 바뀌어도
            // 같은 자리로 되돌릴 수 있는 형태로 적는다.
            const freeX = Math.max(1, window.innerWidth - rect.width - WALL_MARGIN * 2);
            const freeY = Math.max(1, window.innerHeight - rect.height - WALL_MARGIN * 2);
            const ratio = (wall === 'left' || wall === 'right')
                ? clamp((rect.top - WALL_MARGIN) / freeY, 0, 1)
                : clamp((rect.left - WALL_MARGIN) / freeX, 0, 1);

            box.style.transition = 'left 0.18s ease, top 0.18s ease';
            savePosition(wall, ratio);
            placeAt(wall, ratio);
            setTimeout(() => { box.style.transition = ''; }, 220);
        }

        el.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(e); });
        el.addEventListener('dragstart', (e) => e.preventDefault());
        el.querySelector('img')?.addEventListener('dragstart', (e) => e.preventDefault());
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openStoryLog();
        });
    }

    /* ===== 스토리 로그 (미연시) ===== */
    function openStoryLog(): void {
        const log = getStoryLog();
        const overlay = document.createElement('div');
        overlay.className = 'mdd-log-overlay';
        overlay.innerHTML = `
            <div class="mdd-log-panel">
                <div class="mdd-log-header">
                    <h3>스토리 로그</h3>
                    <button class="mdd-log-close" type="button" aria-label="닫기">×</button>
                </div>
                <div class="mdd-log-body">
                    ${log.length ? log.map((e: { msg: string }) => `
                        <div class="mdd-log-entry">
                            <span class="mdd-log-msg">${escapeHtml(e.msg)}</span>
                        </div>
                    `).join('') : '<p class="mdd-log-empty">아직 기록된 스토리가 없어요, 조수님.</p>'}
                </div>
            </div>
        `;
        injectCSS('mdd-log', `
            .mdd-log-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; }
            .mdd-log-panel { background:var(--bg-secondary,#1a1a1e); border:1px solid var(--border,rgba(255,255,255,0.08)); max-width:360px; width:100%; max-height:70vh; display:flex; flex-direction:column; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.4); }
            .mdd-log-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); }
            .mdd-log-header h3 { margin:0; font-size:14px; font-weight:600; color:var(--text-primary); }
            .mdd-log-close { background:none; border:none; color:var(--text-tertiary); font-size:24px; cursor:pointer; padding:0 4px; line-height:1; }
            .mdd-log-close:hover { color:var(--text-primary); }
            .mdd-log-body { overflow-y:auto; padding:12px; }

            .mdd-log-entry { padding:8px 0; border-bottom:1px solid var(--border); font-size:13px; line-height:1.5; color:var(--text-secondary); }
            .mdd-log-entry:last-child { border-bottom:none; }
            .mdd-log-empty { color:var(--text-tertiary); font-size:13px; text-align:center; padding:24px; margin:0; }
        `);
        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', onEsc);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        const closeBtn = overlay.querySelector('.mdd-log-close');
        if (closeBtn) (closeBtn as HTMLElement).onclick = close;
        overlay.onclick = (e: MouseEvent) => { if (e.target === overlay) close(); };
        const panel = overlay.querySelector('.mdd-log-panel');
        if (panel) (panel as HTMLElement).onclick = (e: MouseEvent) => e.stopPropagation();
        document.addEventListener('keydown', onEsc);
        document.body.appendChild(overlay);
    }

    function escapeHtml(s: string): string {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /* ===== DOM 초기화 ===== */

    function init(): void {
        if (_ready) return;
        _ready = true;

        injectCSS('mdd-core', `
            .mdd-container { position:fixed; bottom:16px; right:16px; z-index:900; display:flex; flex-direction:column; align-items:flex-end; pointer-events:none; }
            .mdd-bubble { background:var(--glass-strong,rgba(8,16,30,0.85)); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid var(--border-hover,rgba(0,229,255,0.12)); color:var(--text-primary,#e4eaf6); padding:6px 10px; font-size:var(--font-size-xs); max-width:180px; text-align:left; line-height:1.4; margin-bottom:6px; opacity:0; transform:translateY(4px); transition:opacity 0.2s,transform 0.2s; pointer-events:auto; font-family:var(--font-sans,'Inter',sans-serif); box-shadow:0 4px 16px var(--vignette,rgba(0,0,0,0.3)); border-radius:var(--radius-md,8px); }
            .mdd-bubble.visible { opacity:1; transform:translateY(0); }
            .mdd-char { width:112px; height:122px; pointer-events:auto; cursor:grab; touch-action:none; transition:transform 0.15s,filter 0.3s; user-select:none; -webkit-user-select:none; opacity:0.85; }
            .mdd-char:active { cursor:grabbing; }
            .mdd-char:hover { transform:scale(1.05); opacity:1; filter:drop-shadow(0 0 8px rgba(0,229,255,0.25)); }
            .mdd-char img { width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; -webkit-user-drag:none; user-drag:none; }
            .mdd-bounce { animation:mdd-bounce 0.3s ease; }
            @keyframes mdd-bounce { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-10px)} 70%{transform:translateY(-3px)} }
            /* 폰에서는 마스코트를 띄우지 않는다 — 화면이 좁아 버튼·입력을 가린다 (사용자 결정 2026-08-06). PC 전용. */
            @media(max-width:768px){
                .mdd-container{display:none}
                /* 사용자가 폰에서도 보겠다고 하면 그 뜻이 이긴다 */
                .mdd-container.mdd-on-mobile{display:flex}
            }
        ` + AVATAR_CSS);

        container = document.createElement('div');
        container.className = 'mdd-container';

        bubbleEl = document.createElement('div');
        bubbleEl.className = 'mdd-bubble';
        container.appendChild(bubbleEl);

        charEl = document.createElement('div');
        charEl.className = 'mdd-char';
        container.appendChild(charEl);
        document.body.appendChild(container);
        void mountAvatar();

        applyPrefs();
        loadPosition();
        initDrag();

        resetIdleTimer();
        document.addEventListener('mousemove', () => { if (currentMood === 'sleep') { linePreset('idle_wake', { duration: 3500 }); } resetIdleTimer(); });
        document.addEventListener('keydown', () => { if (currentMood === 'sleep') { linePreset('idle_wake', { duration: 3500 }); } resetIdleTimer(); });

        addAffection(1);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        setMood, say, bounce, injectCSS,
        linePreset, LINE_PRESETS,
        addAffection, getAffection, getRelationshipTitle,
        getStoryProgress, getStoryLog, STORY_EVENTS,
        showGuide, showNextGuide, openStoryLog, GUIDE_MESSAGES,
        getPrefs, setPrefs, resetPrefs, resetPosition, PREF_DEFAULTS, spot,
        WIDTH_MIN, widthMax,
    };
})();
