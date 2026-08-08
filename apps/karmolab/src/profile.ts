/**
 * 공개 프로필 페이지 (TASK-KL-098 Cycle 1) — `/karmolab/u/?h=<핸들>`.
 *
 * 「북적북적」이 실제로 보이는 첫 자리다. **로그인 없이 남이 열려야** 의미가 있다 —
 * 그래서 로그인은 있으면 좋은 것이지 있어야 하는 것이 아니다.
 * 프로필 본문 요청에만 쿠키를 함께 보낸다 (TASK-KL-152 C8): 「내가 이 사람을 따라가고 있나」는
 * 보는 사람이 누구냐에 따라 답이 달라서, 그것 없이는 단추를 그릴 수 없다.
 * 로그인 안 한 사람에게는 지금까지와 똑같이 보인다(단추만 없다).
 *
 * 왜 `?h=` 인가: 이 사이트는 정적으로 올라간다 — `/karmolab/u/<핸들>/` 같은 주소는 핸들마다
 * 파일이 하나씩 있어야 성립한다. 사람이 생길 때마다 배포할 수는 없으므로 Cycle 1 은 물음표
 * 주소로 간다. 나중에 서버가 프로필 HTML 을 직접 내보내면 예쁜 주소로 옮긴다.
 *
 * 이 파일은 별도 스크립트다 — 페이지 안에 직접 쓴 스크립트는 한 글자만 틀려도 화면이
 * 통째로 비고 로그도 안 남는다. 빌드와 타입 검사를 받는 자리에 둔다.
 */
interface PublicProfile {
    handle: string;
    displayName: string;
    avatarPath: string | null;
    joinedAt: string;
    achievements: string[];
    badges: string[];
    streaks: Record<string, { current: number; longest: number }>;
    updatedAt: string | null;
    /** 본인이 일부러 가린 칸 (TASK-KL-152 C4). 「아직 없다」와 다르다. */
    hidden?: string[];
    /** 프로필 꾸미기 (TASK-KL-152 C5). 안 채웠으면 빈 값. */
    card?: { bio: string; pins: string[] };
    /** 따라가기 (TASK-KL-152 C8). 보는 사람이 누구냐에 따라 답이 다르다. */
    followers?: number;
    following?: boolean;
    canFollow?: boolean;
    /** 지금 접속 중 (TASK-KL-156 D5). 본인이 안 켰으면 null — 그때는 칸 자체를 안 그린다. */
    online?: boolean | null;
}

const API_BASE = 'https://yawnbot.mascari4615.com';

/** 트랙 id → 사람이 읽는 이름. 모르는 id 는 id 그대로 (지어내지 않는다). */
const STREAK_LABELS: Record<string, string> = {
    daily_review: '일일 리뷰',
    exercise: '운동',
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    // 사이트 전체가 KST 기준으로 말한다.
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(date);
}

function renderMessage(root: HTMLElement, title: string, detail: string): void {
    root.innerHTML = `
        <div class="profile-empty">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(detail)}</p>
            <p><a href="/karmolab/">KarmoLab 으로 돌아가기</a></p>
        </div>`;
}

/**
 * 명함 자리 (TASK-KL-152 C5) — 한 줄 소개와 대표 도구.
 *
 * 여태 프로필은 아무나 똑같이 생겼다(이름·아바타·숫자뿐). 이 두 줄이 있어야 「누구」인지가 보인다.
 * 대표 도구는 **우리 도구 주소로만** 링크한다 — 남이 넣은 글자가 링크가 되는 일은 없다.
 */
/** 도구 id → 사람이 아는 이름. 목록이 아직 안 왔거나 모르는 id 면 id 그대로 (지어내지 않는다). */
function toolTitle(id: string): string {
    const list = (window as { KARMOLAB_LAZY_META?: Array<{ id: string; title?: string }> }).KARMOLAB_LAZY_META ?? [];
    return list.find((meta) => meta.id === id)?.title || id;
}

function cardHtml(profile: PublicProfile): string {
    const bio = profile.card?.bio ?? '';
    const pins = profile.card?.pins ?? [];
    if (!bio && pins.length === 0) return '';
    return `
        <section class="profile-card-note">
            ${bio ? `<p class="profile-bio">${escapeHtml(bio)}</p>` : ''}
            ${pins.length
                ? `<div class="profile-pins">${pins
                      .map(
                          (id) =>
                              `<a class="profile-pin" href="/karmolab/t/${encodeURIComponent(id)}/">${escapeHtml(toolTitle(id))}</a>`,
                      )
                      .join('')}</div>`
                : ''}
        </section>`;
}

/**
 * 가려 둔 칸이 있으면 그렇게 적는다 (TASK-KL-152 C4).
 * 빈 칸을 그냥 두면 보는 사람이 「아무것도 안 했나 보다」로 읽는다 — 그건 틀린 말이다.
 */
const HIDDEN_LABELS: Record<string, string> = {
    achievements: '도전과제',
    badges: '뱃지',
    streaks: '연속 기록',
    community: '커뮤니티 활동',
    activity: '발자국',
};

function hiddenNote(profile: PublicProfile): string {
    const hidden = (profile.hidden ?? []).map((key) => HIDDEN_LABELS[key] ?? key);
    if (!hidden.length) return '';
    return `<p class="profile-note">${escapeHtml(hidden.join(' · '))} 은(는) 본인이 가려 뒀습니다.</p>`;
}

function renderProfile(root: HTMLElement, profile: PublicProfile): void {
    document.title = `${profile.displayName} — KarmoLab`;

    const streakEntries = Object.entries(profile.streaks).sort((a, b) => b[1].longest - a[1].longest);
    const avatar = profile.avatarPath ? `${API_BASE}${profile.avatarPath}` : null;

    const streaksHtml = streakEntries.length
        ? `<table class="profile-table">
               <thead><tr><th>연속 기록</th><th>지금</th><th>최장</th></tr></thead>
               <tbody>${streakEntries
                   .map(
                       ([id, s]) =>
                           `<tr><td>${escapeHtml(STREAK_LABELS[id] ?? id)}</td><td>${s.current}일</td><td>${s.longest}일</td></tr>`,
                   )
                   .join('')}</tbody>
           </table>`
        : '<p class="profile-note">아직 이어 온 기록이 없습니다.</p>';

    root.innerHTML = `
        <article class="profile-card">
            <header class="profile-head">
                ${avatar ? `<img class="profile-avatar" src="${escapeHtml(avatar)}" alt="">` : '<div class="profile-avatar profile-avatar-blank">◍</div>'}
                <div>
                    <h1 class="profile-name">${escapeHtml(profile.displayName)}</h1>
                    <p class="profile-handle">@${escapeHtml(profile.handle)}${
                        profile.online === true ? ' <span class="profile-online">● 지금 접속 중</span>' : ''
                    }</p>
                    <p class="profile-joined">${escapeHtml(formatDate(profile.joinedAt))}부터</p>
                </div>
                ${profile.canFollow
                    ? `<div class="profile-actions">
                           <button type="button" class="profile-follow${profile.following ? ' on' : ''}" id="profileFollow">${profile.following ? '따라가는 중' : '따라가기'}</button>
                           <button type="button" class="profile-block" id="profileBlock">막기</button>
                       </div>`
                    : ''}
            </header>
            ${cardHtml(profile)}
            ${hiddenNote(profile)}
            <section class="profile-stats">
                <div class="profile-stat"><strong>${profile.followers ?? 0}</strong><span>팔로워</span></div>
                <div class="profile-stat"><strong>${profile.achievements.length}</strong><span>도전과제</span></div>
                <div class="profile-stat"><strong>${profile.badges.length}</strong><span>뱃지</span></div>
                <div class="profile-stat"><strong>${streakEntries.length}</strong><span>연속 기록 트랙</span></div>
            </section>
            ${streaksHtml}
            <div id="profileActivity"></div>
            <footer class="profile-foot">
                <a href="/karmolab/">KarmoLab 에서 도구 보기</a>
            </footer>
        </article>`;
}

/** 이 사람이 쓴 글·답글 — 「무엇을 했나」가 없으면 프로필은 빈 명함이다. */
async function loadActivity(handle: string): Promise<void> {
    const root = document.getElementById('profileActivity');
    if (!root) return;
    try {
        const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(handle)}/activity`);
        if (!response.ok) return;
        const data = (await response.json()) as {
            posts: Array<{ id: string; title: string | null; text: string; replyCount: number; createdAt: string }>;
            replies: Array<{ postId: string; postTitle: string; text: string; createdAt: string }>;
            counts: { posts: number; replies: number };
        };
        if (data.counts.posts === 0 && data.counts.replies === 0) return;

        const link = (postId: string): string => `/karmolab/?p=${encodeURIComponent(postId)}#community`;
        const posts = data.posts
            .map(
                (p) =>
                    `<li><a href="${link(p.id)}">${escapeHtml(p.title ?? p.text.slice(0, 40))}</a>` +
                    `${p.replyCount ? ` <span class="profile-dim">답글 ${p.replyCount}</span>` : ''}</li>`,
            )
            .join('');
        const replies = data.replies
            .map(
                (r) =>
                    `<li><a href="${link(r.postId)}">${escapeHtml(r.text.slice(0, 40))}</a>` +
                    ` <span class="profile-dim">— ${escapeHtml(r.postTitle)}</span></li>`,
            )
            .join('');

        root.innerHTML = `
            <section class="profile-act">
                <h2>커뮤니티 활동 <span class="profile-dim">글 ${data.counts.posts} · 답글 ${data.counts.replies}</span></h2>
                ${posts ? `<h3>쓴 글</h3><ul class="profile-list">${posts}</ul>` : ''}
                ${replies ? `<h3>단 답글</h3><ul class="profile-list">${replies}</ul>` : ''}
            </section>`;
    } catch {
        /* 활동을 못 받아도 프로필 자체는 보인다 */
    }
}

/**
 * 따라가기 단추 (TASK-KL-152 C8).
 *
 * 로그인 안 했거나 자기 프로필이면 **단추 자체가 없다** — 눌러도 아무 일 없는 단추가 제일 나쁘다.
 * 이 페이지는 남이 로그인 없이 여는 자리라, 쿠키는 이 요청에서만 함께 보낸다.
 */
function mountFollow(root: HTMLElement, profile: PublicProfile): void {
    const button = root.querySelector<HTMLButtonElement>('#profileFollow');
    if (!button) return;
    let on = !!profile.following;
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(profile.handle)}/follow`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ on: !on }),
            });
            if (!response.ok) throw new Error(String(response.status));
            const body = (await response.json()) as { following: boolean; count: number };
            on = body.following;
            button.textContent = on ? '따라가는 중' : '따라가기';
            button.classList.toggle('on', on);
            const followerCell = root.querySelector('.profile-stat strong');
            if (followerCell) followerCell.textContent = String(body.count);
        } catch {
            // 못 바꿨으면 화면도 그대로 둔다 — 눌렀는데 안 된 것을 된 것처럼 보이면 안 된다.
        } finally {
            button.disabled = false;
        }
    });
}

/**
 * 막기 (TASK-KL-156 D2).
 *
 * 되돌릴 수 있는 일이지만 남과의 관계를 끊는 일이라 **무엇이 일어나는지 먼저 말하고** 묻는다.
 * 막았다는 사실은 상대에게 안 알린다.
 */
function mountBlock(root: HTMLElement, profile: PublicProfile): void {
    const button = root.querySelector<HTMLButtonElement>('#profileBlock');
    if (!button) return;
    button.addEventListener('click', async () => {
        const ok = confirm(
            [
                `@${profile.handle} 님을 막습니다.`,
                '',
                '· 그 사람 글이 내 피드·알림에서 사라집니다',
                '· 서로 따라가기가 끊깁니다',
                '· 막았다는 사실은 상대에게 안 알립니다',
                '',
                '내 정보 › 계정 에서 언제든 풀 수 있습니다. 계속할까요?',
            ].join('\n'),
        );
        if (!ok) return;
        button.disabled = true;
        try {
            const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(profile.handle)}/block`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ on: true }),
            });
            if (!response.ok) throw new Error(String(response.status));
            button.textContent = '막았어요';
            const follow = root.querySelector<HTMLButtonElement>('#profileFollow');
            if (follow) {
                follow.textContent = '따라가기';
                follow.classList.remove('on');
            }
        } catch {
            button.disabled = false;
        }
    });
}

async function main(): Promise<void> {
    const root = document.getElementById('profileRoot');
    if (!root) return;

    const handle = new URLSearchParams(location.search).get('h') ?? '';
    if (!handle) {
        renderMessage(root, '프로필 주소가 아니에요', '주소 끝에 ?h=핸들 이 있어야 합니다.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(handle)}`, { credentials: 'include' });
        // 잠근 것과 없는 것은 다르다 — 링크를 걸어 둔 사람이 왜 안 열리는지 알아야 한다 (KL-152 C4).
        if (response.status === 403) {
            renderMessage(root, '비공개 프로필이에요', `@${handle} 님이 프로필을 남에게 안 보이게 해 뒀습니다.`);
            return;
        }
        if (response.status === 404) {
            renderMessage(root, '그런 사람이 없어요', `@${handle} 는 아직 없는 프로필입니다.`);
            return;
        }
        if (!response.ok) throw new Error(`상태 ${response.status}`);
        const data = (await response.json()) as { profile?: PublicProfile };
        if (!data.profile) throw new Error('프로필이 비어 있음');
        renderProfile(root, data.profile);
        mountFollow(root, data.profile);
        mountBlock(root, data.profile);
        void loadActivity(data.profile.handle);
    } catch (error) {
        console.warn('[profile] 프로필을 못 불러왔다:', error);
        // 서버가 잠깐 죽은 것과 「없는 사람」은 다르다. 섞어서 말하지 않는다.
        renderMessage(root, '지금은 프로필을 못 보여드려요', '잠시 뒤에 다시 열어 주세요.');
    }
}

void main();

export {};
