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
        bubble: boolean;
        bubbleMs: number;
        idleMs: number;
        tapReact: boolean;
    }

    const PREF_DEFAULTS: MddPrefs = {
        enabled: true, width: 300, framing: 'bust', showOnMobile: false,
        opacity: 0.85, blink: true, gaze: true, breathe: true, motion: true,
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
        /** 눈을 통째로 갈아 끼우는 조각(감은 눈·웃는 눈…). null 이면 기본 눈 */
        eyeArt: string | null;
        /** 입 조각. null 이면 기본 입 */
        mouthArt: string | null;
    }

    const NEUTRAL: AvatarPose = {
        eyeOpen: 1, eyeSquint: 0, browTilt: 0, browRaise: 0,
        mouthOpen: 1, mouthWide: 1, blush: 0, tilt: 0, bob: 0,
        armL: 0, armR: 0, gaze: null, eyeArt: null, mouthArt: null,
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
        shock:    { eyeArt: 'eyes-wide', mouthArt: 'mouth-wide', tilt: -2, bob: -8, armL: -14, armR: 14 },
        think:    { eyeOpen: 0.88, mouthWide: 0.85, tilt: 16, gaze: { x: 0.9, y: -0.75 } },
        sleep:    { eyeOpen: 0, eyeSquint: 0.3, mouthOpen: 1.4, tilt: 20, bob: 16 },
        angry:    { eyeOpen: 0.92, mouthArt: 'mouth-frown', blush: 0.45, tilt: 2, bob: -4, armL: 14, armR: -14 },
        love:     { eyeArt: 'eyes-happy', mouthArt: 'mouth-open', blush: 1, tilt: -12, bob: -6 },
        smug:     { eyeOpen: 0.84, mouthWide: 1.3, tilt: -16, gaze: { x: -0.75, y: 0.25 } },
        eating:   { eyeArt: 'eyes-happy', mouthArt: 'mouth-open', blush: 0.3, tilt: 5, bob: 4 },
        pointing: { eyeOpen: 1.25, mouthArt: 'mouth-open', tilt: -7, bob: -9, armL: 0, armR: -38 },
        cheer:    { eyeArt: 'eyes-happy', mouthArt: 'mouth-wide', blush: 0.5, tilt: 0, bob: -18, armL: -46, armR: 46 },
    };

    /** x/y/w/h = 원본 캔버스에서의 자리, s* = 아틀라스에서 잘라 올 자리 */
    interface PartBox { x: number; y: number; w: number; h: number;
                        sx: number; sy: number; sw: number; sh: number }
    interface Manifest {
        canvas: [number, number];
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
    const FRAMING = {
        bust: { x: 398, y: 74, w: 246, h: 268 },
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
            const isHead = HEAD_PARTS.has(name);
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
            // 화면 절반쯤 떨어지면 눈이 끝까지 돌아간다
            gazeTarget.x = clamp((clientX - cx) / (window.innerWidth * 0.45), -1, 1);
            gazeTarget.y = clamp((clientY - cy) / (window.innerHeight * 0.45), -1, 1);
        }

        function frame(now: number): void {
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
            const headRot = pose.tilt + sway + gaze.x * 2.5;
            for (const g of headGroups) {
                g.style.transformOrigin = `${headPivotX}px ${headPivotY}px`;
                g.style.transform =
                    `rotate(${headRot}deg) translate(${gaze.x * 1.6}px, ${gaze.y * 1.2}px)`;
            }

            // 눈 — 감을 때 아래로 눌린다. 눈웃음은 아래에서 밀어 올린 모양.
            // 축은 눈 아래쪽 — 눈꺼풀은 위에서 내려온다.
            const open = clamp(pose.eyeOpen * blink * (1 - pose.eyeSquint * 0.75), 0, 2);
            for (const name of EYE_PARTS) {
                const img = layers.get(name);
                if (!img) continue;
                const sq = name === 'eyelash' ? Math.max(open, 0.3) : open;
                img.style.transformOrigin = '50% 100%';
                img.style.transform = `scaleY(${sq})`;
            }
            // 눈동자만 시선 방향으로 더 움직인다
            const iris = layers.get('irides');
            if (iris) {
                const b = manifest.parts['irides'];
                iris.style.transform =
                    `translate(${gaze.x * b.w * 0.05}px, ${gaze.y * b.h * 0.1}px) scaleY(${open})`;
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
        raf = requestAnimationFrame(frame);

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
            destroy() { cancelAnimationFrame(raf); ro?.disconnect(); el.remove(); },
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

    async function mountAvatar(): Promise<void> {
        if (!charEl) return;
        try {
            const res = await fetch(`${PARTS_BASE}/manifest.json`);
            if (!res.ok) throw new Error(`manifest ${res.status}`);
            const manifest = await res.json();
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

    /**
     * 프리셋 대사 + 포즈. opts.msg / opts.mood / opts.duration 으로 덮어쓸 수 있음.
     * @returns {boolean} 알려진 id면 true
     */
    function linePreset(id: string, opts?: { msg?: string; mood?: string; duration?: number }): boolean {
        const base = (LINE_PRESETS as Record<string, { mood: string; msg: string } | undefined>)[id];
        if (!base) return false;
        const mood = (opts && opts.mood) || base.mood;
        const msg = (opts && opts.msg != null) ? opts.msg : base.msg;
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
        getPrefs, setPrefs, resetPrefs, resetPosition, PREF_DEFAULTS,
        WIDTH_MIN, widthMax,
    };
})();
