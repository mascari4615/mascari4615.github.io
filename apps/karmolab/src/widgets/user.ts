/**
 * 내 정보 — 프로필 · 성과 · 활동 · 계정 (TASK-KL-139).
 *
 * 환경 설정(테마·API 키·저장소)은 여기 없다 → `widgets/settings.ts`.
 */
(function (): void {
    const PROGRESS_KEY = 'pet_strokes';
    /** [karmolab-react-src DEFAULT_TRACKS] id → 표시 이름 */
    const STREAK_TRACK_LABELS: Record<string, string> = { daily_review: '일일 리뷰', exercise: '운동' };

    type UserAchievement = {
        id: string;
        title: string;
        desc: string;
        icon: string;
        source: string;
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
            { id: 'pet_100', title: '100번 쓰다듬기', desc: '고양이를 100번 쓰다듬었다', icon: '🐱', source: 'pet' },
            { id: 'pet_1000', title: '1,000번 쓰다듬기', desc: '고양이를 1,000번 쓰다듬었다', icon: '🐱', source: 'pet' },
            { id: 'pet_10000', title: '10,000번 쓰다듬기', desc: '집사 가끔 대단해요', icon: '🐱', source: 'pet' },
            { id: 'pet_100000', title: '100,000번 쓰다듬기', desc: '진짜로 하고 있었어요?!', icon: '🐱', source: 'pet' },
            { id: 'pet_500000', title: '500,000번 쓰다듬기', desc: '반이에요... 설마 진심이에요?!', icon: '🐱', source: 'pet' },
            { id: 'first_chat', title: '첫 대화', desc: '챗봇과 첫 대화를 나눴다', icon: '💬', source: 'chatbot' },
            { id: 'first_image', title: '첫 이미지 생성', desc: '첫 이미지를 생성했다', icon: '🎨', source: 'imagegen' },
            { id: 'streak_first', title: '첫 줄기', desc: '처음으로 스트릭 하루를 채웠다', icon: '🌱', source: 'streak' },
            { id: 'streak_7', title: '7일 연속', desc: '어느 트랙이든 7일 연속 달성', icon: '🔥', source: 'streak' },
            { id: 'streak_30', title: '30일 연속', desc: '어느 트랙이든 30일 연속 달성', icon: '🔥', source: 'streak' },
            { id: 'streak_100', title: '100일 연속', desc: '어느 트랙이든 100일 연속 달성', icon: '🔥', source: 'streak' },
            { id: 'reaction_200', title: '초고속 반응 200ms', desc: '번개같은 반사신경', icon: '⚡', source: 'reaction' },
            { id: 'reaction_150', title: '번개 반응 150ms', desc: '인간의 한계를 넘었다', icon: '⚡', source: 'reaction' },
        ],
        badges: [
            { id: 'pet_marriage', title: '검의 서약', desc: '100만번 쓰다듬고 결혼했어요 💍', icon: '💖', source: 'pet' },
            { id: 'toolbox_explorer', title: '탐험가', desc: '5개 이상 도구를 사용했다', icon: '🧭', source: 'system' },
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
                <div id="userServerSlot"></div>
            </div>`;

        renderStats(container.querySelector<HTMLElement>('#userStats'));
        mountIdentity(container.querySelector<HTMLElement>('#userIdentity'));
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
            [`${(data.achievements ?? []).length}/${DEFS.achievements.length}`, '도전과제'],
            [`${(data.badges ?? []).length}/${DEFS.badges.length}`, '뱃지'],
            [String(maxStreakCurrent), '최고 연속(일)'],
            [petStrokes.toLocaleString(), '쓰담'],
            [String(totalChat), '채팅'],
            [String(totalImage), '이미지'],
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
            ? `@${escapeHtml(me.handle)} · <a href="${escapeHtml(me.profileUrl)}">남에게 보이는 프로필</a>`
            : canOffer
              ? '지금 기록은 이 브라우저에만 있습니다 — 계정을 만들면 기기를 바꿔도 남습니다.'
              : '이 브라우저에 기록 중';

        slot.innerHTML = `
            <div class="user-id">
                <div class="user-id-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : '👤'}</div>
                <div class="user-id-main">
                    <h2>${escapeHtml(me ? me.displayName : 'Toolbox 사용자')}</h2>
                    <p class="user-id-sub">${sub}</p>
                    <p class="user-id-mascot">마스코트 관계: <strong style="color:var(--secondary)">${Mdd.getRelationshipTitle()}</strong> · 호감도 ${Mdd.getAffection()}</p>
                </div>
                <div class="user-id-actions">
                    ${me ? '<button type="button" class="user-account-btn user-account-btn-quiet" data-signout>로그아웃</button>' : ''}
                    ${!me && canOffer ? '<button type="button" class="user-account-btn" data-signin>디스코드로 시작하기</button>' : ''}
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
                <h3>🗣 커뮤니티에 남긴 것</h3>
                <p class="user-act-lead">글 ${posts.length}개 · 답글 ${replies.length}개 — 이건 기기를 바꿔도 남습니다.</p>
                <div class="user-acts">${rows}</div>
                <a class="user-act-more" href="/karmolab/u/?h=${encodeURIComponent(handle)}">남에게 보이는 내 프로필 →</a>
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
            slot.innerHTML = '<p class="user-act-lead">계정 기능이 지금 꺼져 있습니다. 도구는 그대로 씁니다.</p>';
            return;
        }

        let drawnFor: string | null = null;
        const off = account.subscribe((state) => {
            if (state.loading) return;
            if (!state.reachable) {
                drawnFor = null;
                slot.innerHTML = '<p class="user-act-lead">계정 서버에 지금 못 닿았습니다. 잠시 뒤에 다시 열어 주세요 — 도구는 그대로 씁니다.</p>';
                return;
            }
            const key = state.account ? `in:${state.account.handle}:${state.account.displayName}` : 'out';
            if (drawnFor === key) return;
            drawnFor = key;

            if (!state.account) {
                slot.innerHTML = `
                    <div class="user-account-card">
                        <div class="user-account-text">
                            <strong>기록을 이 브라우저 밖에도 남기기</strong>
                            <span>지금 도전과제·연속기록은 이 브라우저에만 있습니다. 계정을 만들면 기기를 바꿔도 남고, 공개 프로필 주소가 생깁니다.</span>
                        </div>
                        <button type="button" class="user-account-btn" id="userSignInBtn">디스코드로 시작하기</button>
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
                            <span>공개 프로필 · <a href="${escapeHtml(me.profileUrl)}">/karmolab/u/?h=${escapeHtml(me.handle)}</a></span>
                        </div>
                    </div>
                    <button type="button" class="user-account-btn user-account-btn-quiet" id="userSignOutBtn">로그아웃</button>
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
                <label class="user-acct-label" for="userDisplayName">보이는 이름</label>
                <input id="userDisplayName" type="text" maxlength="24" value="${escapeHtml(displayName)}"
                    data-name-input aria-label="보이는 이름">
                <button type="submit" class="user-account-btn user-account-btn-quiet">바꾸기</button>
                <span class="user-acct-hint">주소(@아이디)는 그대로입니다 — 남이 걸어 둔 링크가 깨지지 않게.</span>
            </form>
            <div class="user-acct-row">
                <span class="user-acct-label">로그인 중인 기기</span>
                <span class="user-acct-value" data-sessions>세는 중…</span>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-revoke>다른 기기 전부 로그아웃</button>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">내 것 내려받기</span>
                <a class="user-account-btn user-account-btn-quiet" href="${base}/kl/me/export" download>JSON 으로</a>
                <span class="user-acct-hint">계정 · 도전과제 · 연속기록 · 커뮤니티에 남긴 것 전부.</span>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">복구 코드</span>
                <span class="user-acct-value" data-recovery-left>세는 중…</span>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-recovery-new>새로 만들기</button>
                <span class="user-acct-hint">디스코드 계정을 잃어도 이 코드로 들어올 수 있습니다.
                    <b>만들 때 한 번만 보입니다</b> — 서버도 원문을 모릅니다. 새로 만들면 옛 코드는 못 씁니다.</span>
                <div class="user-acct-codes" data-recovery-out hidden></div>
            </div>
            <div class="user-acct-row">
                <span class="user-acct-label">다른 기기 로그인</span>
                <span class="user-acct-value" data-link-out>—</span>
                <button type="button" class="user-account-btn user-account-btn-quiet" data-link-new>코드 받기</button>
                <span class="user-acct-hint">디스코드 로그인이 어려운 기기(티비 등)에서 이 코드를 넣으면 들어와집니다. 5분간 · 한 번만.</span>
            </div>
            <form class="user-acct-row" data-card-form>
                <label class="user-acct-label" for="userBio">한 줄 소개</label>
                <input id="userBio" type="text" maxlength="80" data-bio aria-label="한 줄 소개" placeholder="아직 비어 있어요">
                <button type="submit" class="user-account-btn user-account-btn-quiet">저장</button>
                <span class="user-acct-hint">남에게 보이는 프로필 맨 위에 붙습니다. 안 채우면 지금과 같은 모습입니다.</span>
            </form>
            <div class="user-acct-row">
                <span class="user-acct-label">대표 도구</span>
                <div class="fp-pins" data-pins>불러오는 중…</div>
                <span class="user-acct-hint">가장 많이 쓴 도구에서 3개까지 고릅니다 — 무엇을 하는 사람인지 한눈에 보이게.</span>
            </div>
            <div class="user-acct-row" data-visibility-row>
                <span class="user-acct-label">남에게 보이기</span>
                <div class="fp-vis" data-visibility>불러오는 중…</div>
                <span class="user-acct-hint">끈 것은 **화면에서만 숨는 게 아니라** 서버 응답에서 아예 빠집니다 —
                    주소를 직접 열어도 안 보입니다. 프로필 자체를 끄면 남은 열 수 없고, 본인은 계속 볼 수 있습니다.</span>
            </div>
            <div class="user-acct-row user-acct-danger">
                <span class="user-acct-label">계정 지우기</span>
                <button type="button" class="user-account-btn user-account-btn-danger" data-delete>지우기</button>
                <span class="user-acct-hint">되돌릴 수 없습니다. 이미 남긴 글은 남고 <b>글쓴이 이름만 지워집니다</b> —
                    답글이 달린 글을 통째로 지우면 남의 답글이 뜻을 잃기 때문입니다.</span>
            </div>`;
        slot.appendChild(box);

        const sessionSlot = box.querySelector('[data-sessions]');
        void (async () => {
            try {
                const res = await fetch(`${base}/kl/me/sessions`, { credentials: 'include' });
                if (!res.ok || !sessionSlot) return;
                const body = (await res.json()) as { sessions?: unknown[] };
                const count = Array.isArray(body.sessions) ? body.sessions.length : 0;
                sessionSlot.textContent = count > 1 ? `${count}곳` : '이 기기 하나';
            } catch {
                if (sessionSlot) sessionSlot.textContent = '지금은 못 셌어요';
            }
        })();

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
                Toolbox.showToast?.(res.ok ? '이름을 바꿨어요' : '이름을 못 바꿨어요');
                if (res.ok) location.reload();
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
            }
        });

        box.querySelector('[data-revoke]')?.addEventListener('click', async () => {
            if (!confirm('이 기기만 남기고 다른 곳의 로그인을 전부 끊을까요?')) return;
            try {
                const res = await fetch(`${base}/kl/me/sessions/revoke-others`, {
                    method: 'POST',
                    credentials: 'include',
                });
                const body = (await res.json()) as { revoked?: number };
                Toolbox.showToast?.(res.ok ? `${body.revoked ?? 0}곳을 끊었어요` : '지금은 안 되네요');
                if (sessionSlot) sessionSlot.textContent = '이 기기 하나';
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
            }
        });

        const leftSlot = box.querySelector('[data-recovery-left]');
        void (async () => {
            try {
                const res = await fetch(`${base}/kl/me/recovery-codes`, { credentials: 'include' });
                if (!res.ok || !leftSlot) return;
                const body = (await res.json()) as { left?: number };
                leftSlot.textContent = body.left ? `${body.left}장 남음` : '아직 없음';
            } catch {
                if (leftSlot) leftSlot.textContent = '지금은 못 봤어요';
            }
        })();

        box.querySelector('[data-recovery-new]')?.addEventListener('click', async () => {
            if (!confirm('새로 만들면 지금까지의 복구 코드는 못 쓰게 됩니다. 계속할까요?')) return;
            try {
                const res = await fetch(`${base}/kl/me/recovery-codes`, { method: 'POST', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.('지금은 안 되네요');
                    return;
                }
                const body = (await res.json()) as { codes: string[] };
                const out = box.querySelector<HTMLElement>('[data-recovery-out]');
                if (!out) return;
                // 여기서 못 옮겨 적으면 영영 못 본다 — 그 사실을 화면에도 적는다.
                out.hidden = false;
                out.innerHTML =
                    '<p class="user-acct-hint"><b>지금 한 번만 보입니다.</b> 안전한 곳에 옮겨 적어 두세요.</p>' +
                    `<ol class="user-acct-codelist">${body.codes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol>` +
                    '<button type="button" class="user-account-btn user-account-btn-quiet" data-copy-codes>전부 복사</button>';
                out.querySelector('[data-copy-codes]')?.addEventListener('click', () => {
                    void navigator.clipboard?.writeText(body.codes.join('\n'));
                    Toolbox.showToast?.('복사했어요');
                });
                if (leftSlot) leftSlot.textContent = `${body.codes.length}장 남음`;
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
            }
        });

        box.querySelector('[data-link-new]')?.addEventListener('click', async () => {
            try {
                const res = await fetch(`${base}/kl/me/link-code`, { method: 'POST', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.('지금은 안 되네요');
                    return;
                }
                const body = (await res.json()) as { code: string };
                const out = box.querySelector('[data-link-out]');
                if (out) out.textContent = `${body.code} (5분)`;
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
            }
        });

        mountVisibility(box.querySelector<HTMLElement>('[data-visibility]'), base);
        mountCard(box, base);

        box.querySelector('[data-delete]')?.addEventListener('click', async () => {
            // 되돌릴 수 없는 일은 **무엇이 사라지고 무엇이 남는지** 먼저 말한 뒤에 묻는다.
            const ok = confirm(
                [
                    '계정을 지웁니다. 되돌릴 수 없습니다.',
                    '',
                    '· 계정 · 도전과제 · 연속기록 · 로그인 → 사라집니다',
                    '· 이미 남긴 글과 답글 → 남습니다 (글쓴이 이름만 지워집니다)',
                    '',
                    '내려받기를 먼저 하시는 편이 좋습니다. 계속할까요?',
                ].join('\n'),
            );
            if (!ok) return;
            try {
                const res = await fetch(`${base}/kl/me`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) {
                    Toolbox.showToast?.('지금은 안 되네요');
                    return;
                }
                alert('지웠습니다. 그동안 고마웠습니다.');
                location.reload();
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
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
            if (pinSlot) pinSlot.textContent = '지금은 못 봤어요';
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
                : '<span class="user-acct-hint">아직 고를 것이 없어요 — 도구를 몇 개 써 보면 여기 뜹니다.</span>';
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
                    Toolbox.showToast?.('3개까지예요');
                    return;
                }
                const next = on ? card.pins.filter((p) => p !== id) : [...card.pins, id];
                if (!(await savePins(next))) {
                    Toolbox.showToast?.('지금은 안 되네요');
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
                Toolbox.showToast?.(res.ok ? '저장했어요' : '지금은 안 되네요');
            } catch {
                Toolbox.showToast?.('지금은 안 되네요');
            }
        });
    }

    /** 공개 범위 (TASK-KL-152 C4) — 끄면 서버 응답에서 빠진다. 여기 칸 이름은 서버 칸 이름과 같다. */
    const VISIBILITY_LABELS: Array<[string, string]> = [
        ['profile', '프로필 자체'],
        ['achievements', '도전과제'],
        ['badges', '뱃지'],
        ['streaks', '연속 기록'],
        ['community', '커뮤니티에 남긴 것'],
        ['activity', '발자국(잔디)'],
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
                slot.textContent = '지금은 못 봤어요';
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
                        Toolbox.showToast?.(input.checked ? '남에게 보입니다' : '가렸어요');
                    } catch {
                        // 못 바꿨으면 **화면도 되돌린다** — 껐다고 믿는데 안 꺼진 것이 제일 나쁘다.
                        input.checked = !input.checked;
                        Toolbox.showToast?.('지금은 안 되네요');
                    }
                });
            });
        })();
    }

    function buildUsage(container: HTMLElement): void {
        container.innerHTML = '<div class="user-layout"><div id="userFootprint"></div><div id="userDash"></div></div>';
        const dash = container.querySelector<HTMLElement>('#userDash');
        if (dash && typeof window.DashboardBuild === 'function') window.DashboardBuild(dash);
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
                <h3>🌱 내 발자국</h3>
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
                    <button type="button" class="user-account-btn user-account-btn-quiet" data-share>내 발자국 복사</button>
                    <span class="user-acct-hint">숫자는 전부 실제로 열린 것만 셉니다. 지어낸 값은 없습니다.</span>
                </div>
            </div>`;

        slot.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => Toolbox.switchPage?.(button.dataset.tool ?? ''));
        });
        slot.querySelector('[data-share]')?.addEventListener('click', () => {
            void navigator.clipboard?.writeText(shareText(activity!, top));
            Toolbox.showToast?.('복사했어요');
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
            '🌱 KarmoLab 내 발자국',
            `연속 ${activity.streak.current}일 (최장 ${activity.streak.longest}일)`,
            `다녀간 날 ${activity.totals.activeDays}일 · 도구 ${activity.totals.opens}번 · 써 본 도구 ${activity.totals.distinctTools}가지`,
        ];
        if (top.length) lines.push(`많이 쓴 것: ${top.slice(0, 3).map(([id, n]) => `${toolTitle(id)}(${n})`).join(' · ')}`);
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
            [String(activity.streak.current), '지금 연속(일)'],
            [String(activity.streak.longest), '최장 연속(일)'],
            [String(activity.totals.activeDays), '다녀간 날'],
            [String(activity.totals.opens), '도구 연 횟수'],
            [String(activity.totals.distinctTools), '써 본 도구'],
        ];
        const first = activity.firstSeenAt ? new Date(activity.firstSeenAt) : null;
        const firstText = first && !Number.isNaN(first.getTime())
            ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(first)
            : null;
        return `
            <div class="user-stats fp-recap">${cells
                .map(([v, l]) => `<div class="user-stat"><b>${v}</b><span>${l}</span></div>`)
                .join('')}</div>
            ${firstText ? `<p class="user-act-lead">${escapeHtml(firstText)}부터 여기 있었습니다.</p>` : ''}`;
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
            const title = future ? '' : `${key} · ${value === undefined ? '안 옴' : value === 0 ? '둘러봄' : `${value}번`}`;
            cells.push(`<i class="fp-cell" data-lv="${level}"${title ? ` title="${title}"` : ''}></i>`);
        }
        return `<div class="fp-grass" role="img" aria-label="지난 1년 활동">${cells.join('')}</div>`;
    }

    /**
     * 성과 (TASK-KL-139) — 도전과제·뱃지·스트릭은 「내가 쌓은 것」 하나의 이야기다.
     * 탭 셋으로 흩어 두면 어느 탭에 뭐가 있었는지를 사람이 외워야 한다 (Steam 도 한 화면이다).
     */
    function buildAchievements(container: HTMLElement): void {
        Mdd.linePreset('achievement', { msg: '지금까지 쌓은 거 보여줄게요~' });
        renderAchievements(container);
    }

    function renderAchievements(container: HTMLElement): void {
        const data = (Toolbox.getUserData?.() as UserData | undefined) ?? {};
        const achievements = data.achievements ?? [];
        const badges = data.badges ?? [];
        const streaks = data.streaks ?? {};
        const streakIds = Object.keys(streaks);

        const achGrid = DEFS.achievements.map((a) => {
            const unlocked = achievements.includes(a.id);
            return `<div class="user-item ${unlocked ? '' : 'locked'}" title="${escapeHtml(a.desc)}">
                <div class="user-item-icon">${unlocked ? a.icon : '🔒'}</div>
                <div class="user-item-title">${escapeHtml(a.title)}</div>
                <div class="user-item-desc">${escapeHtml(a.desc)}</div>
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
                <div class="user-section">
                    <h3>🔥 스트릭 (${streakIds.length} 트랙)</h3>
                    ${streakIds.length === 0
                        ? '<p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin:0;">아직 기록이 없어요. 플래너에서 오늘 완료를 눌러보세요.</p>'
                        : `<div class="user-grid">${streakGrid}</div>`}
                </div>
            </div>`;
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
            { id: 'user-overview', label: '프로필', build: buildProfile },
            { id: 'user-achievements', label: '성과', build: buildAchievements },
            { id: 'user-usage', label: '활동', build: buildUsage },
            { id: 'user-account', label: '계정', build: buildAccount },
        ]
    });
})();
