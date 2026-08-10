/**
 * 내 정보 — 프로필 · 성과 · 활동 · 계정 (TASK-KL-139).
 *
 * 환경 설정(테마·API 키·저장소)은 여기 없다 → `widgets/settings.ts`.
 */
import { t, loadNamespace, locale } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const PROGRESS_KEY = 'pet_strokes';
    /** [karmolab-react-src DEFAULT_TRACKS] id → 표시 이름 */
    const STREAK_TRACK_LABELS: Record<string, string> = { daily_review: t('user.t58'), exercise: t('user.t59') };

    type UserAchievement = {
        id: string;
        title: string;
        desc: string;
        icon: string;
        source: string;
        /**
         * 얼마나 왔나를 셀 수 있는 것만 (TASK-KL-175 E7).
         * `track` = 누적 카운터 이름, `goal` = 목표치. 없으면 잠김/열림 두 상태 그대로다 —
         * 셀 수 없는 것에 가짜 막대를 그리지 않는다.
         */
        track?: string;
        goal?: number;
    };

    type UserBadge = {
        id: string;
        title: string;
        desc: string;
        icon: string;
        source: string;
    };

    type UserStreak = {
        current?: number;
        longest?: number;
        lastActivityDate?: string;
    };

    type UserData = {
        achievements?: string[];
        badges?: string[];
        progress?: Record<string, number>;
        streaks?: Record<string, UserStreak>;
    };

    const DEFS: {
        achievements: UserAchievement[];
        badges: UserBadge[];
    } = {
        achievements: [
            { id: 'pet_100', title: t('user.t60'), desc: t('user.t61'), icon: '🐱', source: 'pet', track: 'pet_strokes', goal: 100 },
            { id: 'pet_1000', title: t('user.t62'), desc: t('user.t63'), icon: '🐱', source: 'pet', track: 'pet_strokes', goal: 1000 },
            { id: 'pet_10000', title: t('user.t64'), desc: t('user.t65'), icon: '🐱', source: 'pet', track: 'pet_strokes', goal: 10000 },
            { id: 'pet_100000', title: t('user.t66'), desc: t('user.t67'), icon: '🐱', source: 'pet', track: 'pet_strokes', goal: 100000 },
            { id: 'pet_500000', title: t('user.t68'), desc: t('user.t69'), icon: '🐱', source: 'pet', track: 'pet_strokes', goal: 500000 },
            { id: 'first_chat', title: t('user.t70'), desc: t('user.t71'), icon: '💬', source: 'chatbot' },
            { id: 'first_image', title: t('user.t72'), desc: t('user.t73'), icon: '🎨', source: 'imagegen' },
            { id: 'streak_first', title: t('user.t74'), desc: t('user.t75'), icon: '🌱', source: 'streak' },
            { id: 'streak_7', title: t('user.t76'), desc: t('user.t77'), icon: '🔥', source: 'streak' },
            { id: 'streak_30', title: t('user.t78'), desc: t('user.t79'), icon: '🔥', source: 'streak' },
            { id: 'streak_100', title: t('user.t80'), desc: t('user.t81'), icon: '🔥', source: 'streak' },
            { id: 'reaction_200', title: t('user.t82'), desc: t('user.t83'), icon: '⚡', source: 'reaction' },
            { id: 'reaction_150', title: t('user.t84'), desc: t('user.t85'), icon: '⚡', source: 'reaction' },
        ],
        badges: [
            { id: 'pet_marriage', title: t('user.t86'), desc: t('user.t87'), icon: '💖', source: 'pet' },
            { id: 'toolbox_explorer', title: t('user.t88'), desc: t('user.t89'), icon: '🧭', source: 'system' },
        ],
    };

    DEFS.achievements.forEach((a) => Toolbox.registerAchievement?.(a.id, a));
    DEFS.badges.forEach((b) => Toolbox.unlockBadge?.(b.id, b));

    Mdd.injectCSS('user-page', `
        .user-layout { display:flex; flex-direction:column; gap:24px; }
        .user-section h3{ font-size:14px; color:var(--text-secondary); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
        .user-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:12px; }
        .user-item { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; text-align:center; transition:opacity 0.2s; }
        .user-item.locked { opacity:0.5; filter:grayscale(0.8); }
        .user-item .user-item-icon { font-size:32px; margin-bottom:8px; }
        .user-item .user-item-title { font-size:var(--font-size-xs); font-weight:600; color:var(--text-primary); margin-bottom:4px; }
        .user-item .user-item-desc { font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .user-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
        .user-link { font-size:var(--font-size-sm); color:var(--accent); text-decoration:none; }
        .user-link:hover { text-decoration:underline; }
        /* 계정 자리 (TASK-KL-098)— 서버에 못 닿으면 통째로 안 그려지므로 빈 칸도 안 남는다. */
        .user-account-slot:empty { display:none; }
        .user-account-card { display:flex; align-items:center; gap:16px; flex-wrap:wrap; justify-content:space-between;
            margin-top:16px; padding:14px 16px; border:1px solid var(--border); border-radius:10px; background:var(--bg-secondary); }
        .user-account-who { display:flex; align-items:center; gap:12px; min-width:0; }
        .user-account-avatar { width:40px; height:40px; border-radius:50%; object-fit:cover; }
        .user-account-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .user-account-text strong { font-size:var(--font-size-sm); color:var(--text-primary); }
        .user-account-text span { font-size:var(--font-size-xs); color:var(--text-secondary); }
        .user-account-btn { padding:8px 14px; border-radius:8px; border:1px solid var(--accent); background:var(--accent);
            color:var(--bg-primary); font-size:var(--font-size-xs); font-weight:600; cursor:pointer; white-space:nowrap; }
        .user-account-btn:hover { filter:brightness(1.08); }
        .user-account-btn-quiet { background:transparent; color:var(--text-secondary); border-color:var(--border); }
        .user-act-lead { margin:0 0 10px; font-size:var(--font-size-xs); color:var(--text-secondary); }
        .user-acts { display:flex; flex-direction:column; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); overflow:hidden; }
        .user-act-row { display:flex; align-items:center; gap:12px; padding:10px 14px;
            border-top:1px solid var(--border); text-decoration:none; color:inherit; }
        .user-act-row:first-child { border-top:0; }
        .user-act-row:hover { background:var(--bg-tertiary); }
        .user-act-title { flex:1; min-width:0; font-size:var(--font-size-xs); color:var(--text-primary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .user-act-meta { flex:0 0 auto; font-size:11px; color:var(--text-tertiary); }
        .user-acct { display:flex; flex-direction:column; gap:14px; margin-top:16px; padding:16px;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .user-acct-row { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
        .user-acct-label { flex:0 0 110px; font-size:var(--font-size-xs); color:var(--text-secondary); font-weight:600; }
        .user-acct-value { font-size:var(--font-size-xs); color:var(--text-primary); }
        .user-acct-row input { flex:1 1 160px; min-width:0; }
        .user-acct-hint { flex:1 1 100%; font-size:11px; color:var(--text-tertiary); line-height:1.55; }
        .user-acct-codes { flex:1 1 100%; margin-top:8px; }
        .user-acct-codelist { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));
            gap:6px; margin:8px 0; padding-left:20px; }
        .user-acct-codelist li { font-family:var(--font-mono); font-size:var(--font-size-xs);
            color:var(--text-primary); letter-spacing:.04em; }
        .user-acct-danger { border-top:1px solid var(--border); padding-top:14px; }
        .user-account-btn-danger { background:transparent; color:#dc2626; border-color:rgba(220,38,38,.45); }
        html[data-theme="dark"] .user-account-btn-danger { color:#fca5a5; border-color:rgba(252,165,165,.45); }
        .user-account-btn-danger:hover { background:rgba(220,38,38,.12); }
        .user-act-more { display:inline-block; margin-top:10px; font-size:var(--font-size-xs); color:var(--accent); }

        /* 신원 배지 (TASK-KL-139) — 「내 정보」의 나와 「계정」의 나는 한 사람이다.
           두 칸으로 나뉘어 있으면 로그인한 뒤에도 위쪽에는 여전히 남이 서 있다. */
        .user-id { display:flex; align-items:center; gap:20px; flex-wrap:wrap;
            padding:22px 24px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-lg); }
        .user-id-avatar { width:72px; height:72px; border-radius:50%; flex:0 0 auto; overflow:hidden;
            background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%);
            display:flex; align-items:center; justify-content:center; font-size:36px; }
        .user-id-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .user-id-main { flex:1 1 220px; min-width:0; }
        .user-id-main h2 { font-size:20px; font-weight:600; margin:0 0 4px; color:var(--text-primary); }
        .user-id-sub { font-size:var(--font-size-sm); color:var(--text-secondary); margin:0 0 4px; }
        .user-id-sub a { color:var(--accent); text-decoration:none; }
        .user-id-sub a:hover { text-decoration:underline; }
        .user-id-mascot { font-size:var(--font-size-xs); color:var(--text-tertiary); margin:0; }
        .user-id-actions { display:flex; gap:8px; flex:0 0 auto; }
        .user-stats { display:flex; gap:10px; flex-wrap:wrap; }
        .user-stat { flex:1 1 100px; min-width:96px; padding:12px 14px; text-align:center;
            background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); }
        .user-stat b { display:block; font-size:20px; font-weight:700; color:var(--accent); font-family:var(--font-mono, monospace); }
        .user-stat span { display:block; margin-top:2px; font-size:var(--font-size-xs); color:var(--text-secondary); }

        /* 잔디 (TASK-KL-152 C2) — 세로 7칸(일~토)으로 흘러 한 열이 한 주다.
           안 온 날과 「둘러보기만 한 날」을 다르게 칠한다: 둘을 같게 칠하면 온 날이 사라진다. */
        .fp-recap { margin-bottom:14px; }
        .fp-grass { display:grid; grid-auto-flow:column; grid-template-rows:repeat(7, 11px);
            gap:3px; overflow-x:auto; padding:4px 0 8px; }
        .fp-cell { width:11px; height:11px; border-radius:2px; background:var(--bg-tertiary); }
        .fp-cell[data-lv="1"] { background:color-mix(in srgb, var(--accent) 22%, var(--bg-tertiary)); }
        .fp-cell[data-lv="2"] { background:color-mix(in srgb, var(--accent) 45%, var(--bg-tertiary)); }
        .fp-cell[data-lv="3"] { background:color-mix(in srgb, var(--accent) 70%, var(--bg-tertiary)); }
        .fp-cell[data-lv="4"] { background:var(--accent); }
        .fp-cell[data-lv="x"] { background:transparent; }
        .fp-top { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
        .fp-top-item { display:flex; align-items:baseline; gap:6px; padding:7px 12px; cursor:pointer;
            border:1px solid var(--border); border-radius:999px; background:var(--bg-secondary); font:inherit; }
        .fp-top-item:hover { border-color:var(--accent); }
        .fp-top-item b { font-size:var(--font-size-xs); color:var(--text-primary); }
        .fp-top-item span { font-size:11px; color:var(--text-tertiary); }
        .fp-pins { display:flex; flex-wrap:wrap; gap:6px; flex:1 1 240px; }
        .fp-pin { padding:5px 11px; border-radius:999px; border:1px solid var(--border); cursor:pointer;
            background:transparent; color:var(--text-secondary); font:inherit; font-size:var(--font-size-xs); }
        .fp-pin:hover { border-color:var(--accent); }
        .fp-pin.on { background:var(--accent); border-color:var(--accent); color:var(--bg-primary); font-weight:600; }
        .fp-sessions, .fp-events { display:flex; flex-direction:column; gap:6px; flex:1 1 260px; }
        .fp-session, .fp-event { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
            padding:7px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-tertiary); }
        .fp-session-name, .fp-event-kind { flex:1 1 140px; font-size:var(--font-size-xs); color:var(--text-primary); }
        .fp-session-name b { color:var(--accent); font-size:11px; }
        .fp-session-when, .fp-event-when { font-size:11px; color:var(--text-tertiary); white-space:nowrap; }
        .fp-event-meta { flex:2 1 160px; font-size:11px; color:var(--text-secondary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* 얼마나 왔나 (TASK-KL-175 E7) — 잠긴 것에만 붙는다. 연 것에 막대는 뜻이 없다. */
        .user-item-progress { position:relative; height:14px; margin-top:8px; border-radius:999px;
            background:var(--bg-secondary); overflow:hidden; }
        .user-item-progress i { display:block; height:100%; background:var(--accent); opacity:.55; }
        .user-item-progress span { position:absolute; inset:0; display:grid; place-items:center;
            font-size:10px; color:var(--text-secondary); font-family:var(--font-mono, monospace); }
        .user-item-rarity { margin-top:6px; font-size:11px; color:var(--accent); }
        .fp-follows { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
        .fp-follows > div { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
        .fp-follows > div > span { font-size:11px; color:var(--text-tertiary); margin-right:4px; }
        .fp-person { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px;
            border:1px solid var(--border); background:var(--bg-secondary); font-size:var(--font-size-xs);
            color:var(--text-primary); text-decoration:none; }
        .fp-person:hover { border-color:var(--accent); }
        .fp-person b { font-size:10px; color:var(--accent); font-weight:600; }
        .fp-blocked { display:flex; flex-wrap:wrap; gap:6px; flex:1 1 240px; font-size:var(--font-size-xs); color:var(--text-secondary); }
        .fp-blocked-item { display:inline-flex; align-items:center; gap:6px; padding:4px 10px;
            border:1px solid var(--border); border-radius:999px; background:var(--bg-tertiary); }
        .fp-blocked-item button { background:none; border:0; color:var(--accent); font:inherit; font-size:11px; cursor:pointer; }
        .fp-season { font-size:11px; color:var(--text-tertiary); font-weight:400; margin-left:6px; }
        .fp-missions { display:flex; flex-direction:column; gap:10px; }
        .fp-mission { display:flex; flex-direction:column; gap:4px; padding:10px 12px;
            border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-secondary); }
        .fp-mission.done { border-color:var(--accent); }
        .fp-mission-title { font-size:var(--font-size-xs); color:var(--text-primary); }
        .fp-mission .user-item-progress { margin-top:2px; }
        .fp-vis { display:flex; flex-wrap:wrap; gap:8px 16px; flex:1 1 240px; }
        .fp-vis-item { display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-primary); cursor:pointer; }
        .fp-share { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; }
        .fp-share .user-acct-hint { flex:1 1 200px; }
    `);

    /**
     * 프로필 (TASK-KL-139).
     *
     * 예전에는 이 화면 맨 위에 「Toolbox 사용자 👤」가 서 있고, **그 아래 따로** 계정 칸이 있었다.
     * 로그인을 해도 위쪽은 여전히 남이었다 — 한 사람을 두 칸으로 그리면 둘 중 하나는 늘 거짓말이다.
     * 이제 신원 배지는 하나뿐이고, 로그인하면 그 배지가 곧 내 계정이다.
     */
    function buildProfile(container: HTMLElement): void {
        container.innerHTML = `
            <div class="user-layout">
                <div id="userIdentity"></div>
                <div class="user-stats" id="userStats"></div>
                <div id="userMissions"></div>
                <div id="userFeed"></div>
                <div id="userServerSlot"></div>
            </div>`;

        renderStats(container.querySelector<HTMLElement>('#userStats'));
        mountIdentity(container.querySelector<HTMLElement>('#userIdentity'));
        mountMissions(container.querySelector<HTMLElement>('#userMissions'));
        mountFeed(container.querySelector<HTMLElement>('#userFeed'));
        watchServerSlot(container.querySelector('#userServerSlot'));
    }

    function renderStats(slot: HTMLElement | null): void {
        if (!slot) return;
        const data = (Toolbox.getUserData?.() as UserData | undefined) ?? {};
        const progress = data.progress ?? {};
        const petStrokes = progress[PROGRESS_KEY] ?? 0;
        const usageStats = Toolbox.getUsageStats?.() ?? {};
        let totalChat = 0, totalImage = 0;
        (Object.values(usageStats) as Array<{ chatCount?: number; imageCount?: number }>).forEach((s) => {
            totalChat += s.chatCount ?? 0;
            totalImage += s.imageCount ?? 0;
        });

        const streaks = data.streaks ?? {};
        const streakIds = Object.keys(streaks);
        let maxStreakCurrent = 0;
        streakIds.forEach((id) => {
            const sc = streaks[id] && streaks[id].current;
            if (typeof sc === 'number' && sc > maxStreakCurrent) maxStreakCurrent = sc;
        });

        const cells: Array<[string, string]> = [
            [`${(data.achievements ?? []).length}/${DEFS.achievements.length}`, t('user.t90')],
            [`${(data.badges ?? []).length}/${DEFS.badges.length}`, t('user.t91')],
            [String(maxStreakCurrent), t('user.t92')],
            [petStrokes.toLocaleString(), t('user.t93')],
            [String(totalChat), t('user.t94')],
            [String(totalImage), t('user.t95')],
        ];
        slot.innerHTML = cells.map(([value, label]) => `<div class="user-stat"><b>${value}</b><span>${label}</span></div>`).join('');
    }

    /**
     * 신원 배지 — 로그인 여부에 따라 **같은 자리**가 달라진다 (칸이 새로 생기지 않는다).
     *
     * 서버에 못 닿으면 이름·마스코트만 남고 단추가 사라진다. 눌러도 아무 일 없는 단추가 제일 나쁘다.
     */
    function mountIdentity(slot: HTMLElement | null): void {
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) {
            paintIdentity(slot, null);
            return;
        }
        /*  로 막으면 안 된다 (실측): 위젯은 패널을 **DOM 에 붙이기 전에** 그린다 —
         * 첫 호출이 그 검사에 걸려 한 번도 안 그려지고, 상태가 더 바뀌지 않으면 영영 빈칸이었다.
         * 대신 화면이 갈릴 때 구독을 끊는다(핫리로드 규약과 같은 자리). */
        const off = account.subscribe((state) => paintIdentity(slot, state));
        Toolbox.onDispose?.(off);
    }

    type AccountState = { account: { handle: string; displayName: string; avatarPath: string | null; joinedAt: string; profileUrl: string } | null; reachable: boolean; loading: boolean };

    function paintIdentity(slot: HTMLElement, state: AccountState | null): void {
        const account = window.KarmoAccount;
        const me = state?.account ?? null;
        const canOffer = !!state && !state.loading && state.reachable;
        const avatar = me && account ? account.avatarUrl(me.avatarPath) : null;

        const sub = me
            ? `@${escapeHtml(me.handle)} · <a href="${escapeHtml(me.profileUrl)}">${esc(t('user.t02'))}</a>`
            : canOffer
              ? t('user.t96')
              : t('user.t97');

        slot.innerHTML = `
            <div class="user-id">
                <div class="user-id-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : '👤'}</div>
                <div class="user-id-main">
                    <h2>${escapeHtml(me ? me.displayName : t('user.t98'))}</h2>
                    <p class="user-id-sub">${sub}</p>
                    <p class="user-id-mascot">${esc(t('user.t03'))} <strong style="color:var(--secondary)">${Mdd.getRelationshipTitle()}</strong> · 호감도 ${Mdd.getAffection()}</p>
                </div>
                <div class="user-id-actions">
                    ${me ? t('user.t99') : ''}
                    ${!me && canOffer ? t('user.t100') : ''}
                </div>
            </div>`;

        slot.querySelector('[data-signin]')?.addEventListener('click', () => account?.signIn());
        slot.querySelector('[data-signout]')?.addEventListener('click', () => {
            void account?.signOut();
        });
    }

    /**
     * 서버가 들고 있는 내 것 (TASK-KL-098).
     *
     * 지금까지 「내 정보」는 **이 브라우저 안의 것**만 보여 줬다. 그런데 내가 쓴 글·답글은
     * 서버에 있고, 그건 남의 공개 프로필에서만 볼 수 있었다 — 내 것을 남의 화면으로 봐야 했다.
     *
     * 로그인 안 했거나 서버에 못 닿으면 **아무것도 안 그린다**. 여기 없는 게 정상인 상태다.
     */
    function watchServerSlot(slot: Element | null): void {
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) return;
        // 로그인 상태는 처음엔 「아직 모름」이다. 한 번만 물어보면 늘 「없음」으로 끝난다.
        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            const handle = state.account?.handle ?? null;
            if (!handle) {
                drawnFor = null;
                slot.innerHTML = '';
                return;
            }
            if (drawnFor === handle) return;
            drawnFor = handle;
            void renderServerSlot(slot, handle);
        });
        Toolbox.onDispose?.(off);
    }

    async function renderServerSlot(slot: Element, handle: string): Promise<void> {
        const account = window.KarmoAccount;
        const base = account?.apiBase;
        if (!account || !base || !slot.isConnected) return;

        let activity: { posts?: unknown[]; replies?: unknown[] } | null = null;
        try {
            const response = await fetch(`${base}/kl/u/${encodeURIComponent(handle)}/activity`, {
                credentials: 'include',
            });
            if (!response.ok) return;
            activity = (await response.json()) as { posts?: unknown[]; replies?: unknown[] };
        } catch {
            return;
        }
        if (!slot.isConnected || !activity) return;

        const posts = Array.isArray(activity.posts) ? activity.posts : [];
        const replies = Array.isArray(activity.replies) ? activity.replies : [];
        if (posts.length === 0 && replies.length === 0) return;

        const rows = posts
            .slice(0, 5)
            .map((raw) => {
                const p = raw as { id?: string; title?: string | null; text?: string; votes?: number; replyCount?: number };
                const heading = p.title || String(p.text ?? '').replace(/\s+/g, ' ').slice(0, 40);
                return `<a class="user-act-row" href="/karmolab/?p=${encodeURIComponent(String(p.id ?? ''))}#community">
                            <span class="user-act-title">${escapeHtml(heading)}</span>
                            <span class="user-act-meta">답글 ${p.replyCount ?? 0}</span>
                        </a>`;
            })
            .join('');

        slot.innerHTML = `
            <div class="user-section">
                <h3>${esc(t('user.t04'))}</h3>
                <p class="user-act-lead">글 ${posts.length}개 · 답글 ${replies.length}개 — 이건 기기를 바꿔도 남습니다.</p>
                <div class="user-acts">${rows}</div>
                <a class="user-act-more" href="/karmolab/u/?h=${encodeURIComponent(handle)}">${esc(t('user.t05'))}</a>
            </div>`;
    }

    /**
     * 계정 탭 (TASK-KL-098 → KL-135).
     *
     * 서버에 못 닿으면 **아무것도 안 그린다** — 눌러도 아무 일 없는 단추가 제일 나쁘다.
     * 로그인은 기록을 옮기는 일이지 기능을 여는 일이 아니므로, 없어도 화면이 멀쩡해야 한다.
     */
    function buildAccount(container: HTMLElement): void {
        container.innerHTML = '<div class="user-layout"><div id="userAccountSlot" class="user-account-slot"></div></div>';
        const slot = container.querySelector<HTMLElement>('#userAccountSlot');
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) {
            slot.innerHTML = t('user.t101');
            return;
        }

        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            if (state.loading) return;
            if (!state.reachable) {
                drawnFor = null;
                slot.innerHTML = t('user.t102');
                return;
            }
            const key = state.account ? `in:${state.account.handle}:${state.account.displayName}` : 'out';
            if (drawnFor === key) return;
            drawnFor = key;

            if (!state.account) {
                slot.innerHTML = `
                    <div class="user-account-card">
                        <div class="user-account-text">
                            <strong>${esc(t('user.t06'))}</strong>
                            <span>${esc(t('user.t07'))}</span>
                        </div>
                        <button type="button" class="user-account-btn" id="userSignInBtn">${esc(t('user.btn.userSignInBtn'))}</button>
                    </div>`;
                slot.querySelector('#userSignInBtn')?.addEventListener('click', () => account.signIn());
                return;
            }

            const me = state.account;
            const avatar = account.avatarUrl(me.avatarPath);
            slot.innerHTML = `
                <div class="user-account-card">
                    <div class="user-account-who">
                        ${avatar ? `<img class="user-account-avatar" src="${escapeHtml(avatar)}" alt="">` : ''}
                        <div class="user-account-text">
                            <strong>${escapeHtml(me.displayName)}</strong>
                            <span>${esc(t('user.t08'))} <a href="${escapeHtml(me.profileUrl)}">/karmolab/u/?h=${escapeHtml(me.handle)}</a></span>
                        </div>
                    </div>
                    <button type="button" class="user-account-btn user-account-btn-quiet" id="userSignOutBtn">${esc(t('user.btn.userSignOutBtn'))}</button>
                </div>`;
            slot.querySelector('#userSignOutBtn')?.addEventListener('click', () => {
                void account.signOut();
            });
            mountAccountTools(slot, me.displayName);
        });
        Toolbox.onDispose?.(off);
    }

    /**
     * 계정을 **내 것으로** 다루는 자리 (TASK-KL-098).
     *
     * 지금까지 할 수 있는 일이 로그아웃 하나였다. 이름은 디스코드에서 온 것으로 고정이고,
     * 내 기록을 가지고 나갈 방법도, 그만두는 방법도 없었다. 「기록이 남는다」는 약속은
     * **가지고 나갈 수 있고 지울 수 있을 때** 비로소 약속이 된다 — 못 가지고 나가는 기록은
     * 맡긴 것이 아니라 잡힌 것이다.
     */
    function mountAccountTools(slot: Element, displayName: string): void {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return;

        const box = document.createElement('div');
        box.className = 'user-acct';
        box.innerHTML = `
            <form class="user-acct-row" data-name-form>
                <label class="user-acct-label" for="userDisplayName">${esc(t('user.aria.userDisplayName'))}</label>
                <input id="userDisplayName" type="text" maxlength="24" value="${escapeHtml(displayName)}"
                    data-name-input aria-label="${esc(t('user.aria.userDisplayName'))}">
                <button type="submit" class="user-account-btn user-account-btn-quiet">${esc(t('user.t09'))}</button>
                <span class="user-acct-hint">${esc(t('user.t10'))}</span>
            </form>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t11'))}</span>
                <div class="fp-sessions" data-sessions>${esc(t('user.t12'))}</div>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-revoke>${esc(t('user.t13'))}</button>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t14'))}</span>
                <div class="fp-events" data-events>${esc(t('user.t15'))}</div>
                <span class="user-acct-hint">${esc(t('user.t16'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t17'))}</span>
                <a class="user-account-btn user-account-btn-quiet" href="${base}/kl/me/export" download>${esc(t('user.t18'))}</a>
                <span class="user-acct-hint">${esc(t('user.t19'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t20'))}</span>
                <span class="user-acct-value" data-recovery-left>${esc(t('user.t12'))}</span>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-recovery-new>${esc(t('user.t21'))}</button>
                <span class="user-acct-hint">${esc(t('user.t22'))}
                    <b>${esc(t('user.t23'))}</b> ${esc(t('user.t24'))}</span>
                <div class="user-acct-codes" data-recovery-out hidden></div>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t25'))}</span>
                <span class="user-acct-value" data-link-out>—</span>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-link-new>${esc(t('user.t26'))}</button>
                <span class="user-acct-hint">${esc(t('user.t27'))}</span>
            </div>
            <form class="user-acct-row" data-card-form>
                <label class="user-acct-label" for="userBio">${esc(t('user.aria.userBio'))}</label>
                <input id="userBio" type="text" maxlength="80" data-bio aria-label="${esc(t('user.aria.userBio'))}" placeholder="${esc(t('user.ph.userBio'))}">
                <button type="submit" class="user-account-btn user-account-btn-quiet">${esc(t('user.t28'))}</button>
                <span class="user-acct-hint">${esc(t('user.t29'))}</span>
            </form>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t30'))}</span>
                <div class="fp-pins" data-pins>${esc(t('user.t31'))}</div>
                <span class="user-acct-hint">${esc(t('user.t32'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t33'))}</span>
                <div class="fp-vis" data-notify>${esc(t('user.t31'))}</div>
                <span class="user-acct-hint">${esc(t('user.t34'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t35'))}</span>
                <div class="fp-sessions" data-passkeys>${esc(t('user.t15'))}</div>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-passkey-add>${esc(t('user.t36'))}</button>
                <span class="user-acct-hint">${esc(t('user.t37'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t38'))}</span>
                <label class="fp-vis-item"><input type="checkbox" data-weekly> ${esc(t('user.t39'))}</label>
                <span class="user-acct-hint" data-weekly-hint>${esc(t('user.t40'))}</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">${esc(t('user.t41'))}</span>
                <div class="fp-blocked" data-blocked>${esc(t('user.t15'))}</div>
                <span class="user-acct-hint">${esc(t('user.t42'))}</span>
            </div>
            <div class="user-acct-row" data-visibility-row>
                <span class="user-acct-label">${esc(t('user.t43'))}</span>
                <div class="fp-vis" data-visibility>${esc(t('user.t31'))}</div>
                <span class="user-acct-hint">${esc(t('user.t44'))}</span>
            </div>
            <div class="user-acct-row user-acct-danger">
                <span class="user-acct-label">${esc(t('user.t45'))}</span>
                <button type="button" class="user-account-btn user-account-btn-danger" data-delete>${esc(t('user.t46'))}</button>
                <span class="user-acct-hint">${esc(t('user.t47'))} <b>${esc(t('user.t48'))}</b> ${esc(t('user.t49'))}</span>
            </div>`;
        slot.appendChild(box);

        const sessionSlot = box.querySelector<HTMLElement>('[data-sessions]');
        void renderSessions(sessionSlot, base);
        void renderSecurity(box.querySelector<HTMLElement>('[data-events]'), base);

        box.querySelector<HTMLFormElement>('[data-name-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const value = box.querySelector<HTMLInputElement>('[data-name-input]')?.value ?? '';
            try {
                const res = await fetch(`${base}/kl/me`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ displayName: value }),
                });
                Toolbox.showToast?.(res.ok ? t('user.t103') : t('user.t104'));
                if (res.ok) location.reload();
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });

        box.querySelector('[data-revoke]')?.addEventListener('click', async () => {
            if (!confirm(t('user.t106'))) return;
            try {
                const res = await fetch(`${base}/kl/me/sessions/revoke-others`, {
                    method: 'POST',
                    credentials: 'include',
                });
                const body = (await res.json()) as { revoked?: number };
                Toolbox.showToast?.(res.ok ? t('user.revoked', { n: body.revoked ?? 0 }) : t('user.t105'));
                void renderSessions(sessionSlot, base);
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });

        const leftSlot = box.querySelector('[data-recovery-left]');
        void (async () => {
            try {
                const res = await fetch(`${base}/kl/me/recovery-codes`, { credentials: 'include' });
                if (!res.ok || !leftSlot) return;
                const body = (await res.json()) as { left?: number };
                leftSlot.textContent = body.left ? t('user.codesLeft', { n: body.left }) : t('user.t107');
            } catch {
                if (leftSlot) leftSlot.textContent = t('user.t108');
            }
        })();

        box.querySelector('[data-recovery-new]')?.addEventListener('click', async () => {
            if (!confirm(t('user.t109'))) return;
            try {
                const res = await fetch(`${base}/kl/me/recovery-codes`, { method: 'POST', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.(t('user.t105'));
                    return;
                }
                const body = (await res.json()) as { codes: string[] };
                const out = box.querySelector<HTMLElement>('[data-recovery-out]');
                if (!out) return;
                // 여기서 못 옮겨 적으면 영영 못 본다 — 그 사실을 화면에도 적는다.
                out.hidden = false;
                out.innerHTML =
                    t('user.t110') +
                    `<ol class="user-acct-codelist">${body.codes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol>` +
                    t('user.t111');
                out.querySelector('[data-copy-codes]')?.addEventListener('click', () => {
                    void navigator.clipboard?.writeText(body.codes.join('\n'));
                    Toolbox.showToast?.(t('user.t112'));
                });
                if (leftSlot) leftSlot.textContent = t('user.codesLeft', { n: body.codes.length });
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });

        box.querySelector('[data-link-new]')?.addEventListener('click', async () => {
            try {
                const res = await fetch(`${base}/kl/me/link-code`, { method: 'POST', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.(t('user.t105'));
                    return;
                }
                const body = (await res.json()) as { code: string };
                const out = box.querySelector('[data-link-out]');
                if (out) out.textContent = t('user.codeValid', { code: body.code });
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });

        mountVisibility(box.querySelector<HTMLElement>('[data-visibility]'), base);
        void renderBlocked(box.querySelector<HTMLElement>('[data-blocked]'), base);
        void mountWeekly(box, base);
        mountPasskeys(box, base);
        void mountNotifyPrefs(box.querySelector<HTMLElement>('[data-notify]'), base);
        mountCard(box, base);

        box.querySelector('[data-delete]')?.addEventListener('click', async () => {
            // 되돌릴 수 없는 일은 **무엇이 사라지고 무엇이 남는지** 먼저 말한 뒤에 묻는다.
            const ok = confirm(
                [
                    t('user.t113'),
                    '',
                    t('user.t114'),
                    t('user.t115'),
                    '',
                    t('user.t116'),
                ].join('\n'),
            );
            if (!ok) return;
            try {
                const res = await fetch(`${base}/kl/me`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.(t('user.t105'));
                    return;
                }
                alert(t('user.t117'));
                location.reload();
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });
    }

    /**
     * 활동 (TASK-KL-152 C2·C3).
     *
     * 위 = **내 발자국**(잔디 + 돌아보기). 서버는 오래전부터 「어느 도구가 열렸나」를 세고
     * 있었지만 익명 집계뿐이라 「내가 무엇을 했나」는 아무도 못 봤다 — 모으기만 하고
     * 안 돌려주면 없는 것과 같다.
     * 아래 = 예전부터 있던 이 브라우저의 AI 사용량(대시보드). 둘은 출처가 다르다.
     */
    /**
     * 이번 주 미션 (TASK-KL-182 F1).
     *
     * 발자국은 「무엇을 했나」를 보여 준다 — 미션은 그 옆에서 **무엇을 해 볼까**를 말한다.
     * 도구가 160개면 고르는 것 자체가 일이라, 한 줄 제안이 있는 편이 낫다.
     * 로그인 안 했으면 안 그린다(진행도를 셀 수 없는 미션은 광고일 뿐이다).
     */
    function mountMissions(slot: HTMLElement | null): void {
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) return;
        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            const handle = state.account?.handle ?? null;
            if (!handle) {
                drawnFor = null;
                slot.innerHTML = '';
                return;
            }
            if (drawnFor === handle) return;
            drawnFor = handle;
            void renderMissions(slot);
        });
        Toolbox.onDispose?.(off);
    }

    async function renderMissions(slot: HTMLElement): Promise<void> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return;
        let body: {
            week: string;
            seasonWeek: number;
            missions: Array<{ id: string; title: string; goal: number; now: number; done: boolean; kind: string }>;
            clearedThisWeek: number;
        } | null = null;
        try {
            const res = await fetch(`${base}/kl/me/missions`, { credentials: 'include' });
            if (!res.ok) return;
            body = await res.json();
        } catch {
            return;
        }
        if (!body || !body.missions.length) return;

        slot.innerHTML = `
            <div class="user-section">
                <h3>${esc(t('user.t50'))} <span class="fp-season">시즌 ${body.seasonWeek}/4주차 · ${body.clearedThisWeek}/${body.missions.length} 깸</span></h3>
                <div class="fp-missions">
                    ${body.missions
                        .map((mission) => {
                            const pct = Math.min(100, Math.round((mission.now / mission.goal) * 100));
                            return `
                                <div class="fp-mission${mission.done ? ' done' : ''}">
                                    <span class="fp-mission-title">${mission.done ? '✅ ' : ''}${escapeHtml(mission.title)}</span>
                                    <div class="user-item-progress"><i style="width:${pct}%"></i><span>${mission.now} / ${mission.goal}</span></div>
                                </div>`;
                        })
                        .join('')}
                </div>
                <p class="user-acct-hint">${esc(t('user.t51'))}</p>
            </div>`;
    }

    /**
     * 내 피드 (TASK-KL-152 C8) — 내가 따라가는 사람들이 남긴 것.
     *
     * 아무도 안 따라가면 **빈 목록이 아니라 「아직 없다」**다. 그 둘을 같게 그리면
     * 「따라가는데 글이 없다」와 「아무도 안 따라간다」가 한 화면이 된다.
     */
    function mountFeed(slot: HTMLElement | null): void {
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) return;
        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            const handle = state.account?.handle ?? null;
            if (!handle) {
                drawnFor = null;
                slot.innerHTML = '';
                return;
            }
            if (drawnFor === handle) return;
            drawnFor = handle;
            void renderFeed(slot);
        });
        Toolbox.onDispose?.(off);
    }

    /** 내가 따라가는 사람 얼굴 줄 (TASK-KL-175 E5). 못 받아 오면 빈 문자열 — 피드는 그대로 뜬다. */
    async function followRows(): Promise<string> {
        const base = window.KarmoAccount?.apiBase;
        const handle = window.KarmoAccount?.state.account?.handle;
        if (!base || !handle) return '';
        try {
            const res = await fetch(`${base}/kl/u/${encodeURIComponent(handle)}/follows`, { credentials: 'include' });
            if (!res.ok) return '';
            const body = (await res.json()) as {
                following?: Array<{ handle: string; displayName: string; mutual: boolean }>;
                followers?: Array<{ handle: string; displayName: string }>;
            };
            const following = body.following ?? [];
            const followers = body.followers ?? [];
            if (!following.length && !followers.length) return '';
            const chips = (rows: Array<{ handle: string; displayName: string; mutual?: boolean }>): string =>
                rows
                    .map(
                        (row) =>
                            `<a class="fp-person" href="/karmolab/u/?h=${encodeURIComponent(row.handle)}">` +
                            `${escapeHtml(row.displayName)}${row.mutual ? t('user.t118') : ''}</a>`,
                    )
                    .join('');
            return `
                <div class="fp-follows">
                    ${following.length ? `<div><span>${t('user.following', { n: following.length })}</span>${chips(following)}</div>` : ''}
                    ${followers.length ? `<div><span>${t('user.followers', { n: followers.length })}</span>${chips(followers)}</div>` : ''}
                </div>`;
        } catch {
            return '';
        }
    }

    async function renderFeed(slot: HTMLElement): Promise<void> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return;
        let body: { following: number; posts: Array<{ id: string; title: string | null; text: string; handle: string; replyCount?: number }> } | null = null;
        try {
            const res = await fetch(`${base}/kl/me/feed`, { credentials: 'include' });
            if (!res.ok) return;
            body = await res.json();
        } catch {
            return;
        }
        if (!body || body.following === 0) {
            slot.innerHTML = '';
            return; // 아무도 안 따라가면 이 자리는 통째로 없다 — 빈 상자를 두지 않는다.
        }

        const rows = body.posts
            .map((post) => {
                const heading = post.title || String(post.text ?? '').replace(/\s+/g, ' ').slice(0, 40);
                return `<a class="user-act-row" href="/karmolab/?p=${encodeURIComponent(post.id)}#community">
                            <span class="user-act-title">${escapeHtml(heading)}</span>
                            <span class="user-act-meta">@${escapeHtml(post.handle)}</span>
                        </a>`;
            })
            .join('');

        // 누구를 따라가는지 얼굴로 보여 준다 (TASK-KL-175 E5) — 수만 보이면 계기판이지 사회가 아니다.
        const people = await followRows();
        slot.innerHTML = `
            <div class="user-section">
                <h3>${esc(t('user.t52'))}</h3>
                ${people}
                <p class="user-act-lead">${body.following}명을 따라가는 중${body.posts.length === 0 ? t('user.t119') : ''}</p>
                ${rows ? `<div class="user-acts">${rows}</div>` : ''}
            </div>`;
    }

    /** 사람이 읽는 상대 시각 — 「3일 전」이 「2026-08-05T…」보다 판단하기 쉽다. */
    function whenText(iso: string | null): string {
        if (!iso) return t('user.t120');
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return '';
        const minutes = Math.floor((Date.now() - then) / 60000);
        if (minutes < 1) return t('user.t121');
        if (minutes < 60) return t('user.ago.min', { n: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('user.ago.hour', { n: hours });
        return t('user.ago.day', { n: Math.floor(hours / 24) });
    }

    type SessionRow = { id: string; createdAt: string; lastSeenAt: string | null; device: string; current: boolean };

    /**
     * 로그인한 기기 목록 (TASK-KL-152 C6).
     *
     * 예전에는 「2곳」이라는 숫자 하나였다 — 그것만 보고는 끊을 결심을 못 한다.
     * 무엇이 어디서 언제 쓰였는지가 보여야 「이건 내가 아니다」를 알아본다.
     */
    async function renderSessions(slot: HTMLElement | null, base: string): Promise<void> {
        if (!slot) return;
        let sessions: SessionRow[] = [];
        try {
            const res = await fetch(`${base}/kl/me/sessions`, { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            sessions = ((await res.json()) as { sessions?: SessionRow[] }).sessions ?? [];
        } catch {
            slot.textContent = t('user.t122');
            return;
        }

        slot.innerHTML = sessions
            .map(
                (session) => `
                <div class="fp-session">
                    <span class="fp-session-name">${escapeHtml(session.device)}${session.current ? t('user.t123') : ''}</span>
                    <span class="fp-session-when">마지막 ${escapeHtml(whenText(session.lastSeenAt ?? session.createdAt))}</span>
                    ${session.current
                        ? ''
                        : `<button type="button" class="user-account-btn user-account-btn-quiet" data-revoke-one="${escapeHtml(session.id)}">${esc(t('user.t53'))}</button>`}
                </div>`,
            )
            .join('');

        slot.querySelectorAll<HTMLButtonElement>('[data-revoke-one]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!confirm(t('user.t124'))) return;
                try {
                    const res = await fetch(`${base}/kl/me/sessions/${encodeURIComponent(button.dataset.revokeOne ?? '')}/revoke`, {
                        method: 'POST',
                        credentials: 'include',
                    });
                    const body = (await res.json()) as { revoked?: boolean };
                    Toolbox.showToast?.(res.ok && body.revoked ? t('user.t125') : t('user.t105'));
                } catch {
                    Toolbox.showToast?.(t('user.t105'));
                }
                void renderSessions(slot, base);
            });
        });
    }

    /** 보안 기록 (TASK-KL-152 C7) — 남이 내 계정에 들어와도 알 방법이 지금까지 없었다. */
    const EVENT_LABELS: Record<string, string> = {
        login: t('user.t126'),
        logout: t('user.btn.userSignOutBtn'),
        'recovery-used': t('user.t127'),
        'link-used': t('user.t128'),
        'name-changed': t('user.t129'),
        'visibility-changed': t('user.t130'),
        'sessions-revoked': t('user.t131'),
    };

    async function renderSecurity(slot: HTMLElement | null, base: string): Promise<void> {
        if (!slot) return;
        let events: Array<{ at: string; kind: string; device?: string; detail?: string }> = [];
        try {
            const res = await fetch(`${base}/kl/me/security`, { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            events = ((await res.json()) as { events?: typeof events }).events ?? [];
        } catch {
            slot.textContent = t('user.t108');
            return;
        }
        if (!events.length) {
            // 「없다」와 「못 봤다」를 구별해서 말한다.
            slot.textContent = t('user.t132');
            return;
        }
        slot.innerHTML = events
            .slice(0, 12)
            .map(
                (event) => `
                <div class="fp-event">
                    <span class="fp-event-kind">${escapeHtml(EVENT_LABELS[event.kind] ?? event.kind)}</span>
                    <span class="fp-event-meta">${escapeHtml([event.device, event.detail].filter(Boolean).join(' · '))}</span>
                    <span class="fp-event-when">${escapeHtml(whenText(event.at))}</span>
                </div>`,
            )
            .join('');
    }

    /**
     * 프로필 꾸미기 (TASK-KL-152 C5).
     *
     * 고를 수 있는 도구는 **내가 실제로 쓴 것**에서 나온다 — 도구가 160개인데 목록을 통째로
     * 늘어놓으면 아무도 안 고른다. 아직 아무것도 안 쓴 사람에겐 고를 것이 없다고 말한다.
     */
    async function mountCard(box: Element, base: string): Promise<void> {
        const bioInput = box.querySelector<HTMLInputElement>('[data-bio]');
        const pinSlot = box.querySelector<HTMLElement>('[data-pins]');

        let card: { bio: string; pins: string[] } = { bio: '', pins: [] };
        let usedTools: string[] = [];
        try {
            const [meRes, actRes] = await Promise.all([
                fetch(`${base}/kl/me`, { credentials: 'include' }),
                fetch(`${base}/kl/me/activity`, { credentials: 'include' }),
            ]);
            if (meRes.ok) {
                const me = (await meRes.json()) as { account?: { card?: { bio: string; pins: string[] } } };
                card = me.account?.card ?? card;
            }
            if (actRes.ok) {
                const activity = ((await actRes.json()) as { activity?: Footprint }).activity;
                usedTools = Object.entries(activity?.tools ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([id]) => id);
            }
        } catch {
            if (pinSlot) pinSlot.textContent = t('user.t108');
            return;
        }

        if (bioInput) bioInput.value = card.bio;

        // 이미 고른 것은 지금 안 쓰는 도구여도 목록에 남는다 — 안 그러면 저장한 것이 사라져 보인다.
        const choices = [...new Set([...card.pins, ...usedTools])];
        if (pinSlot) {
            pinSlot.innerHTML = choices.length
                ? choices
                      .map(
                          (id) =>
                              `<button type="button" class="fp-pin${card.pins.includes(id) ? ' on' : ''}" data-pin="${escapeHtml(id)}">${escapeHtml(toolTitle(id))}</button>`,
                      )
                      .join('')
                : t('user.t133');
        }

        const savePins = async (pins: string[]): Promise<boolean> => {
            try {
                const res = await fetch(`${base}/kl/me/card`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pins }),
                });
                if (!res.ok) return false;
                card.pins = ((await res.json()) as { card: { pins: string[] } }).card.pins;
                return true;
            } catch {
                return false;
            }
        };

        pinSlot?.querySelectorAll<HTMLButtonElement>('[data-pin]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = button.dataset.pin ?? '';
                const on = card.pins.includes(id);
                if (!on && card.pins.length >= 3) {
                    Toolbox.showToast?.(t('user.t134'));
                    return;
                }
                const next = on ? card.pins.filter((p) => p !== id) : [...card.pins, id];
                if (!(await savePins(next))) {
                    Toolbox.showToast?.(t('user.t105'));
                    return;
                }
                // 서버가 답한 목록으로 다시 칠한다 — 화면과 서버가 갈라지지 않게.
                pinSlot?.querySelectorAll<HTMLButtonElement>('[data-pin]').forEach((other) => {
                    other.classList.toggle('on', card.pins.includes(other.dataset.pin ?? ''));
                });
            });
        });

        box.querySelector<HTMLFormElement>('[data-card-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const res = await fetch(`${base}/kl/me/card`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bio: bioInput?.value ?? '' }),
                });
                Toolbox.showToast?.(res.ok ? t('user.t135') : t('user.t105'));
            } catch {
                Toolbox.showToast?.(t('user.t105'));
            }
        });
    }

    /** 받을 알림 갈래 (TASK-KL-175 E1). 이름은 서버 칸 이름과 같다. */
    const NOTIFY_LABELS: Array<[string, string]> = [
        ['community', t('user.t136')],
        ['follow', t('user.t137')],
        ['system', t('user.t138')],
    ];

    async function mountNotifyPrefs(slot: HTMLElement | null, base: string): Promise<void> {
        if (!slot) return;
        let prefs: Record<string, boolean> | null = null;
        try {
            const res = await fetch(`${base}/kl/me/notify-prefs`, { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            prefs = ((await res.json()) as { prefs?: Record<string, boolean> }).prefs ?? null;
        } catch {
            slot.textContent = t('user.t108');
            return;
        }
        if (!prefs) return;
        const current = prefs;
        slot.innerHTML = NOTIFY_LABELS.map(
            ([key, label]) =>
                `<label class="fp-vis-item"><input type="checkbox" data-notify-key="${key}"${current[key] === false ? '' : ' checked'}> ${escapeHtml(label)}</label>`,
        ).join('');
        slot.querySelectorAll<HTMLInputElement>('[data-notify-key]').forEach((input) => {
            input.addEventListener('change', async () => {
                try {
                    const res = await fetch(`${base}/kl/me/notify-prefs`, {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ [input.dataset.notifyKey ?? '']: input.checked }),
                    });
                    if (!res.ok) throw new Error(String(res.status));
                    Toolbox.showToast?.(input.checked ? t('user.t139') : t('user.t140'));
                } catch {
                    input.checked = !input.checked;
                    Toolbox.showToast?.(t('user.t105'));
                }
            });
        });
    }

    /* ── 패스키 (TASK-KL-156 D7) ─────────────────────────────────────
     *
     * 이 브라우저가 패스키를 모르면 **단추 자체를 안 그린다** — 눌러도 아무 일 없는 단추가 제일 나쁘다.
     */
    /* 반환형을 `Uint8Array<ArrayBuffer>` 로 못 박는다.
     * 기본형(`Uint8Array<ArrayBufferLike>`)은 공유 버퍼일 수도 있다고 보여서 `BufferSource`
     * 자리에 못 넣는다 — 타입 검사가 통째로 빨개지고, 그러면 배포가 전부 멈춘다(TS 5.7+). */
    function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
        const bytes = new Uint8Array(new ArrayBuffer(raw.length));
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    function bytesToB64url(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function mountPasskeys(box: Element, base: string): void {
        const slot = box.querySelector<HTMLElement>('[data-passkeys]');
        const addButton = box.querySelector<HTMLButtonElement>('[data-passkey-add]');
        if (!slot || !addButton) return;
        if (!window.PublicKeyCredential) {
            slot.textContent = t('user.t141');
            addButton.remove();
            return;
        }

        const paint = async (): Promise<void> => {
            try {
                const res = await fetch(`${base}/kl/me/passkeys`, { credentials: 'include' });
                if (!res.ok) throw new Error(String(res.status));
                const list = ((await res.json()) as { passkeys?: Array<{ id: string; label: string; lastUsedAt: string | null }> }).passkeys ?? [];
                slot.innerHTML = list.length
                    ? list
                          .map(
                              (key) => `
                        <div class="fp-session">
                            <span class="fp-session-name">${escapeHtml(key.label)}</span>
                            <span class="fp-session-when">${key.lastUsedAt ? t('user.lastUsed', { when: escapeHtml(whenText(key.lastUsedAt)) }) : t('user.t142')}</span>
                            <button type="button" class="user-account-btn user-account-btn-quiet" data-passkey-del="${escapeHtml(key.id)}">${esc(t('user.t46'))}</button>
                        </div>`,
                          )
                          .join('')
                    : t('user.t143');
                slot.querySelectorAll<HTMLButtonElement>('[data-passkey-del]').forEach((button) => {
                    button.addEventListener('click', async () => {
                        if (!confirm(t('user.t144'))) return;
                        await fetch(`${base}/kl/me/passkeys/${encodeURIComponent(button.dataset.passkeyDel ?? '')}`, {
                            method: 'DELETE',
                            credentials: 'include',
                        });
                        void paint();
                    });
                });
            } catch {
                slot.textContent = t('user.t108');
            }
        };

        addButton.addEventListener('click', async () => {
            addButton.disabled = true;
            try {
                const start = await fetch(`${base}/kl/me/passkeys/challenge`, { method: 'POST', credentials: 'include' });
                if (!start.ok) throw new Error(String(start.status));
                const options = (await start.json()) as {
                    challenge: string;
                    rp: { id: string; name: string };
                    user: { id: string; name: string; displayName: string };
                    exclude: string[];
                };
                const created = (await navigator.credentials.create({
                    publicKey: {
                        challenge: b64urlToBytes(options.challenge),
                        rp: options.rp,
                        user: {
                            id: b64urlToBytes(options.user.id),
                            name: options.user.name,
                            displayName: options.user.displayName,
                        },
                        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                        // 같은 기기를 두 번 담지 않는다.
                        excludeCredentials: options.exclude.map((id) => ({ type: 'public-key' as const, id: b64urlToBytes(id) })),
                        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
                        timeout: 120000,
                    },
                })) as PublicKeyCredential | null;
                if (!created) throw new Error(t('user.err.145'));
                const response = created.response as AuthenticatorAttestationResponse;
                const res = await fetch(`${base}/kl/me/passkeys`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientDataJSON: bytesToB64url(response.clientDataJSON),
                        attestationObject: bytesToB64url(response.attestationObject),
                    }),
                });
                Toolbox.showToast?.(res.ok ? t('user.t146') : t('user.t147'));
            } catch {
                // 사용자가 취소한 것과 고장은 다르지만, 둘 다 여기서는 「안 됐다」로 충분하다.
                Toolbox.showToast?.(t('user.t147'));
            } finally {
                addButton.disabled = false;
                void paint();
            }
        });

        void paint();
    }

    /** 주간 발자국 DM (TASK-KL-156 D6) — 켠 사람에게만 간다. 디스코드가 안 붙어 있으면 못 켠다. */
    async function mountWeekly(box: Element, base: string): Promise<void> {
        const input = box.querySelector<HTMLInputElement>('[data-weekly]');
        const hint = box.querySelector<HTMLElement>('[data-weekly-hint]');
        if (!input) return;
        try {
            const res = await fetch(`${base}/kl/me/weekly`, { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            const body = (await res.json()) as { weekly: boolean; hasDiscord: boolean };
            input.checked = !!body.weekly;
            if (!body.hasDiscord) {
                // 보낼 길이 없으면 켜는 시늉을 하게 두지 않는다.
                input.disabled = true;
                if (hint) hint.textContent = t('user.t148');
            }
        } catch {
            input.disabled = true;
            if (hint) hint.textContent = t('user.t149');
            return;
        }
        input.addEventListener('change', async () => {
            try {
                const res = await fetch(`${base}/kl/me/weekly`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ on: input.checked }),
                });
                if (!res.ok) throw new Error(String(res.status));
                Toolbox.showToast?.(input.checked ? t('user.t150') : t('user.t151'));
            } catch {
                input.checked = !input.checked;
                Toolbox.showToast?.(t('user.t105'));
            }
        });
    }

    /** 막은 사람 (TASK-KL-156 D2) — 푸는 길이 같은 자리에 있어야 막는 것도 마음 편하다. */
    async function renderBlocked(slot: HTMLElement | null, base: string): Promise<void> {
        if (!slot) return;
        let blocked: string[] = [];
        try {
            const res = await fetch(`${base}/kl/me/blocked`, { credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            blocked = ((await res.json()) as { blocked?: string[] }).blocked ?? [];
        } catch {
            slot.textContent = t('user.t108');
            return;
        }
        if (!blocked.length) {
            slot.textContent = t('user.t152');
            return;
        }
        slot.innerHTML = blocked
            .map(
                (handle) =>
                    `<span class="fp-blocked-item">@${escapeHtml(handle)}` +
                    `<button type="button" data-unblock="${escapeHtml(handle)}">${esc(t('user.t54'))}</button></span>`,
            )
            .join('');
        slot.querySelectorAll<HTMLButtonElement>('[data-unblock]').forEach((button) => {
            button.addEventListener('click', async () => {
                try {
                    const res = await fetch(`${base}/kl/u/${encodeURIComponent(button.dataset.unblock ?? '')}/block`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ on: false }),
                    });
                    Toolbox.showToast?.(res.ok ? t('user.t153') : t('user.t105'));
                } catch {
                    Toolbox.showToast?.(t('user.t105'));
                }
                void renderBlocked(slot, base);
            });
        });
    }

    /** 공개 범위 (TASK-KL-152 C4) — 끄면 서버 응답에서 빠진다. 여기 칸 이름은 서버 칸 이름과 같다. */
    const VISIBILITY_LABELS: Array<[string, string]> = [
        ['profile', t('user.t154')],
        ['achievements', t('user.t90')],
        ['badges', t('user.t91')],
        ['streaks', t('user.t155')],
        ['community', t('user.t156')],
        ['activity', t('user.t157')],
        // 이것만 기본이 꺼짐이다 — 새로 생기는 노출은 켜는 사람만 켠다 (TASK-KL-156 D5).
        ['presence', t('user.t158')],
    ];

    function mountVisibility(slot: HTMLElement | null, base: string): void {
        if (!slot) return;
        void (async () => {
            let visibility: Record<string, boolean> | null = null;
            try {
                const res = await fetch(`${base}/kl/me/visibility`, { credentials: 'include' });
                if (!res.ok) throw new Error(String(res.status));
                visibility = ((await res.json()) as { visibility?: Record<string, boolean> }).visibility ?? null;
            } catch {
                slot.textContent = t('user.t108');
                return;
            }
            if (!visibility) return;
            const current = visibility;
            slot.innerHTML = VISIBILITY_LABELS.map(
                ([key, label]) =>
                    `<label class="fp-vis-item"><input type="checkbox" data-vis="${key}"${current[key] === false ? '' : ' checked'}> ${escapeHtml(label)}</label>`,
            ).join('');

            slot.querySelectorAll<HTMLInputElement>('[data-vis]').forEach((input) => {
                input.addEventListener('change', async () => {
                    const key = input.dataset.vis ?? '';
                    try {
                        const res = await fetch(`${base}/kl/me/visibility`, {
                            method: 'PATCH',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: input.checked }),
                        });
                        if (!res.ok) throw new Error(String(res.status));
                        Toolbox.showToast?.(input.checked ? t('user.t159') : t('user.t160'));
                    } catch {
                        // 못 바꿨으면 **화면도 되돌린다** — 껐다고 믿는데 안 꺼진 것이 제일 나쁘다.
                        input.checked = !input.checked;
                        Toolbox.showToast?.(t('user.t105'));
                    }
                });
            });
        })();
    }

    function buildUsage(container: HTMLElement): void {
        container.innerHTML = '<div class="user-layout"><div id="userFootprint"></div><div id="userDash"></div></div>';
        const dash = container.querySelector<HTMLElement>('#userDash');
        /* 쓰임새 표는 **이 자리에서만** 쓰인다 — 그런데 그 코드가 부팅에 딸려 왔다(첫 화면에서
           받고 한 번도 안 그린다). 여기서 데려온다: 이 탭을 연 사람만 받는다 (TASK-KL-204).
           못 받아도 이 화면의 나머지는 그대로 뜬다 — 표 자리만 비어 있다. */
        if (dash) {
            void Promise.resolve(Toolbox.ensureScript?.('dashboard'))
                .then(() => {
                    if (typeof window.DashboardBuild === 'function') window.DashboardBuild(dash);
                })
                .catch(() => undefined);
        }
        mountFootprint(container.querySelector<HTMLElement>('#userFootprint'));
    }

    type Footprint = {
        days: Record<string, number>;
        tools: Record<string, number>;
        totals: { opens: number; activeDays: number; distinctTools: number };
        streak: { current: number; longest: number };
        firstSeenAt: string | null;
        lastSeenAt: string | null;
    };

    /** 로그인해야만 있는 자리다. 안 했으면 **아무것도 안 그린다** — 빈 잔디는 「기록이 없다」로 읽힌다. */
    function mountFootprint(slot: HTMLElement | null): void {
        if (!slot) return;
        const account = window.KarmoAccount;
        if (!account) return;
        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            const handle = state.account?.handle ?? null;
            if (!handle) {
                drawnFor = null;
                slot.innerHTML = '';
                return;
            }
            if (drawnFor === handle) return;
            drawnFor = handle;
            void renderFootprint(slot);
        });
        Toolbox.onDispose?.(off);
    }

    async function renderFootprint(slot: HTMLElement): Promise<void> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return;
        let activity: Footprint | null = null;
        try {
            const response = await fetch(`${base}/kl/me/activity`, { credentials: 'include' });
            if (!response.ok) return;
            activity = ((await response.json()) as { activity?: Footprint }).activity ?? null;
        } catch {
            return; // 못 받아 온 것과 「기록이 없다」는 다르다 — 못 받았으면 이 자리는 통째로 없다.
        }
        if (!activity) return;

        const top = Object.entries(activity.tools)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        slot.innerHTML = `
            <div class="user-section">
                <h3>${esc(t('user.t55'))}</h3>
                ${recapHtml(activity)}
                ${grassHtml(activity.days)}
                ${top.length
                    ? `<div class="fp-top">${top
                          .map(
                              ([id, n]) =>
                                  `<button type="button" class="fp-top-item" data-tool="${escapeHtml(id)}">
                                       <b>${escapeHtml(toolTitle(id))}</b><span>${n}번</span>
                                   </button>`,
                          )
                          .join('')}</div>`
                    : ''}
                <div class="fp-share">
                    <button type="button" class="user-account-btn user-account-btn-quiet" data-share>${esc(t('user.t56'))}</button>
                    <span class="user-acct-hint">${esc(t('user.t57'))}</span>
                </div>
            </div>`;

        slot.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => Toolbox.switchPage?.(button.dataset.tool ?? ''));
        });
        slot.querySelector('[data-share]')?.addEventListener('click', () => {
            void navigator.clipboard?.writeText(shareText(activity!, top));
            Toolbox.showToast?.(t('user.t112'));
        });
    }

    /**
     * 나눠 쓸 한 덩어리 (C3).
     *
     * 그림이 아니라 **글**인 이유: 어디에 붙여도 깨지지 않고, 우리가 지어낸 수가 하나도 없다는 것을
     * 읽는 사람이 그대로 확인할 수 있다. 그림 카드는 서버가 만드는 편이 맞다(C8).
     */
    function shareText(activity: Footprint, top: Array<[string, number]>): string {
        const lines = [
            t('user.t161'),
            t('user.streak', { now: activity.streak.current, best: activity.streak.longest }),
            t('user.totals', { days: activity.totals.activeDays, opens: activity.totals.opens, tools: activity.totals.distinctTools }),
        ];
        if (top.length) lines.push(`${t('user.topUsed')}: ${top.slice(0, 3).map(([id, n]) => `${toolTitle(id)}(${n})`).join(' · ')}`);
        lines.push('https://blog.mascari4615.com/karmolab/');
        return lines.join('\n');
    }

    /** 도구 id → 사람이 아는 이름. 모르면 id 그대로 (지어내지 않는다). */
    function toolTitle(id: string): string {
        const meta = (window.KARMOLAB_LAZY_META_BY_ID ?? {})[id] as { title?: string } | undefined;
        return meta?.title || id;
    }

    /**
     * 돌아보기 (C3) — 실측값만. 없는 값은 칸 자체를 안 만든다.
     * 「처음 온 날」은 계정 만든 날이 아니라 **실제 첫 발자국**이다.
     */
    function recapHtml(activity: Footprint): string {
        const cells: Array<[string, string]> = [
            [String(activity.streak.current), t('user.t162')],
            [String(activity.streak.longest), t('user.t163')],
            [String(activity.totals.activeDays), t('user.t164')],
            [String(activity.totals.opens), t('user.t165')],
            [String(activity.totals.distinctTools), t('user.t166')],
        ];
        const first = activity.firstSeenAt ? new Date(activity.firstSeenAt) : null;
        const firstText = first && !Number.isNaN(first.getTime())
            ? new Intl.DateTimeFormat(locale(), { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(first)
            : null;
        return `
            <div class="user-stats fp-recap">${cells
                .map(([v, l]) => `<div class="user-stat"><b>${v}</b><span>${l}</span></div>`)
                .join('')}</div>
            ${firstText ? `<p class="user-act-lead">${t('user.sinceFirst', { when: escapeHtml(firstText) })}</p>` : ''}`;
    }

    /** 잔디 — 오늘까지 53주. 값이 0 인 날과 안 온 날은 **다르게** 칠한다(둘러보기만 한 날도 온 날이다). */
    function grassHtml(days: Record<string, number>): string {
        const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()));
        const cells: string[] = [];
        // 오늘이 있는 주의 토요일까지 채워 마지막 열이 잘리지 않게 한다.
        const end = new Date(today);
        end.setDate(end.getDate() + (6 - end.getDay()));
        const start = new Date(end);
        start.setDate(start.getDate() - (53 * 7 - 1));

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10);
            const future = d > today;
            const value = days[key];
            const level = future ? 'x' : value === undefined ? '0' : value === 0 ? '1' : value < 3 ? '2' : value < 8 ? '3' : '4';
            const title = future ? '' : `${key} · ${value === undefined ? t('user.t167') : value === 0 ? t('user.t168') : `${value}번`}`;
            cells.push(`<i class="fp-cell" data-lv="${level}"${title ? ` title="${title}"` : ''}></i>`);
        }
        return `<div class="fp-grass" role="img" aria-label="${esc(t('user.t01'))}">${cells.join('')}</div>`;
    }

    /**
     * 성과 (TASK-KL-139) — 도전과제·뱃지·스트릭은 「내가 쌓은 것」 하나의 이야기다.
     * 탭 셋으로 흩어 두면 어느 탭에 뭐가 있었는지를 사람이 외워야 한다 (Steam 도 한 화면이다).
     */
    function buildAchievements(container: HTMLElement): void {
        Mdd.linePreset('achievement', { msg: t('user.t169') });
        renderAchievements(container);
    }

    /** 도전과제 희귀도 (TASK-KL-156 D1) — 전체 중 몇 %가 가졌나. 못 받아 오면 아무 말도 안 한다. */
    async function paintRarity(container: HTMLElement): Promise<void> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return;
        let rarity: { total: number; enough: boolean; counts: Record<string, number> } | null = null;
        try {
            const res = await fetch(`${base}/kl/stats/achievements`);
            if (!res.ok) return;
            rarity = await res.json();
        } catch {
            return;
        }
        if (!rarity || !rarity.enough) return; // 계정이 적으면 비율은 착시다 — 아예 안 적는다.
        container.querySelectorAll<HTMLElement>('[data-ach]').forEach((cell) => {
            const count = rarity!.counts[cell.dataset.ach ?? ''] ?? 0;
            const percent = Math.round((count / rarity!.total) * 1000) / 10;
            const slot = cell.querySelector('.user-item-rarity');
            if (slot) slot.textContent = count === 0 ? t('user.t170') : t('user.ofTotal', { percent });
        });
    }

    function renderAchievements(container: HTMLElement): void {
        const data = (Toolbox.getUserData?.() as UserData | undefined) ?? {};
        const achievements = data.achievements ?? [];
        const badges = data.badges ?? [];
        const streaks = data.streaks ?? {};
        const streakIds = Object.keys(streaks);

        const progress = data.progress ?? {};
        const achGrid = DEFS.achievements.map((a) => {
            const unlocked = achievements.includes(a.id);
            /* 얼마나 왔나 (TASK-KL-175 E7) — 셀 수 있는 것만. 잠김/열림 두 상태뿐이면
             * 「쓰담 100번」이 1번 한 사람에게도 10,000번 한 사람에게도 똑같이 보인다. */
            const now = a.track ? progress[a.track] ?? 0 : null;
            const bar =
                !unlocked && a.track && a.goal && now !== null
                    ? `<div class="user-item-progress" title="${now.toLocaleString()} / ${a.goal.toLocaleString()}">
                           <i style="width:${Math.min(100, Math.round((now / a.goal) * 100))}%"></i>
                           <span>${now.toLocaleString()} / ${a.goal.toLocaleString()}</span>
                       </div>`
                    : '';
            return `<div class="user-item ${unlocked ? '' : 'locked'}" title="${escapeHtml(a.desc)}" data-ach="${escapeHtml(a.id)}">
                <div class="user-item-icon">${unlocked ? a.icon : '🔒'}</div>
                <div class="user-item-title">${escapeHtml(a.title)}</div>
                <div class="user-item-desc">${escapeHtml(a.desc)}</div>
                ${bar}
                <div class="user-item-rarity"></div>
            </div>`;
        }).join('');

        const badgeGrid = DEFS.badges.map((b) => {
            const unlocked = badges.includes(b.id);
            return `<div class="user-item ${unlocked ? '' : 'locked'}" title="${escapeHtml(b.desc)}">
                <div class="user-item-icon">${unlocked ? b.icon : '🔒'}</div>
                <div class="user-item-title">${escapeHtml(b.title)}</div>
                <div class="user-item-desc">${escapeHtml(b.desc)}</div>
            </div>`;
        }).join('');

        const streakGrid = streakIds.map((id) => {
            const s = streaks[id];
            if (!s) return '';
            return `<div class="user-item" title="${escapeHtml(id)}">
                <div class="user-item-icon">🔥</div>
                <div class="user-item-title">${escapeHtml(STREAK_TRACK_LABELS[id] || id)}</div>
                <div class="user-item-desc">현재 ${s.current ?? 0}일 · 최장 ${s.longest ?? 0}일 · ${escapeHtml(s.lastActivityDate || '—')}</div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="user-layout">
                <div class="user-section">
                    <h3>🏆 도전과제 (${achievements.length}/${DEFS.achievements.length})</h3>
                    <div class="user-grid">${achGrid}</div>
                </div>
                <div class="user-section">
                    <h3>🎖️ 뱃지 (${badges.length}/${DEFS.badges.length})</h3>
                    <div class="user-grid">${badgeGrid}</div>
                </div>
                <div class="user-section" data-streaks>
                    <h3>🔥 스트릭 (${streakIds.length} 트랙)</h3>
                    ${streakIds.length === 0
                        ? t('user.t171')
                        : `<div class="user-grid">${streakGrid}</div>`}
                </div>
            </div>`;

        void paintRarity(container);
    }

    function escapeHtml(s: string | null | undefined): string {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* 탭 구성 (TASK-KL-139) — 계정이 있는 사이트들의 공통 골격을 따른다:
     * 프로필(나) · 성과(내가 쌓은 것) · 활동(내가 쓴 만큼) · 계정(로그인·내 것 다루기).
     * 환경 설정은 여기 없다 — 그건 「나」가 아니라 「이 브라우저」다 (#settings). */
    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('user'),
        tabs: [
            /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 그 안에서 만들어진다.
             * 탭 이름만은 **등록하는 순간** 쓰이므로 기본값을 함께 준다 (S9-b). */
            {
                id: 'user-overview',
                label: t('user.tab.profile', undefined, '프로필'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('user').then(function () {
                        buildProfile(container);
                    });
                },
            },
            {
                id: 'user-achievements',
                label: t('user.tab.achievements', undefined, '성과'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('user').then(function () {
                        buildAchievements(container);
                    });
                },
            },
            {
                id: 'user-usage',
                label: t('user.tab.activity', undefined, '활동'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('user').then(function () {
                        buildUsage(container);
                    });
                },
            },
            {
                id: 'user-account',
                label: t('user.tab.account', undefined, '계정'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('user').then(function () {
                        buildAccount(container);
                    });
                },
            },
        ]
    });
})();
