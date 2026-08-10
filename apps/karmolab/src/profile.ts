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
import { t, loadNamespace, locale } from './lib/i18n';

/* 이 파일은 위젯이 아니라 **셸·라이브러리**다 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 이 파일을 읽으므로 document 가 있을 때만 부른다. */
if (typeof document !== 'undefined') void loadNamespace('profile');

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    /** 잔디 (TASK-KL-175 E6). 가렸거나 기록이 없으면 null — 빈 잔디를 그리지 않는다. */
    footprint?: { days: Record<string, number>; streak: { current: number; longest: number } } | null;
}

const API_BASE = 'https://yawnbot.mascari4615.com';

/** 트랙 id → 사람이 읽는 이름. 모르는 id 는 id 그대로 (지어내지 않는다). */
const STREAK_LABELS: Record<string, string> = {
    daily_review: t('profile.t16', undefined, '일일 리뷰'),
    exercise: t('profile.t17', undefined, '운동'),
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
    return new Intl.DateTimeFormat(locale(), { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(date);
}

function renderMessage(root: HTMLElement, title: string, detail: string): void {
    root.innerHTML = `
        <div class="profile-empty">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(detail)}</p>
            <p><a href="/karmolab/">${esc(t('profile.t02'))}</a></p>
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
    achievements: t('profile.t08', undefined, '도전과제'),
    badges: t('profile.t09', undefined, '뱃지'),
    streaks: t('profile.t04', undefined, '연속 기록'),
    community: t('profile.t13', undefined, '커뮤니티 활동'),
    activity: t('profile.t03', undefined, '발자국'),
};

function hiddenNote(profile: PublicProfile): string {
    const hidden = (profile.hidden ?? []).map((key) => HIDDEN_LABELS[key] ?? key);
    if (!hidden.length) return '';
    return `<p class="profile-note">${t('profile.hidden', { what: escapeHtml(hidden.join(' · ')) })}</p>`;
}

/**
 * 잔디 (TASK-KL-175 E6).
 *
 * 내 화면에만 있던 것을 남의 화면에도 놓는다 — 프로필이 숫자 네 칸이던 자리에 **시간이** 보인다.
 * 가렸거나 기록이 없으면 통째로 안 그린다(빈 잔디는 「안 왔다」로 읽혀 거짓말이 된다).
 * 안 온 날과 「둘러보기만 한 날」을 다르게 칠하는 규칙은 내 화면과 같다.
 */
function grassHtml(profile: PublicProfile): string {
    const footprint = profile.footprint;
    if (!footprint) return '';
    const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()));
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (53 * 7 - 1));

    const cells: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const future = d > today;
        const value = footprint.days[key];
        const level = future ? 'x' : value === undefined ? '0' : value === 0 ? '1' : value < 3 ? '2' : value < 8 ? '3' : '4';
        cells.push(`<i data-lv="${level}"${future ? '' : ` title="${key} · ${value === undefined ? t('profile.t18') : value === 0 ? t('profile.t19') : `${value}번`}"`}></i>`);
    }
    return `
        <section class="profile-grass-wrap">
            <h2>${esc(t('profile.t03'))} <span class="profile-dim">지금 연속 ${footprint.streak.current}일 · 최장 ${footprint.streak.longest}일</span></h2>
            <div class="profile-grass" role="img" aria-label="${esc(t('profile.t01'))}">${cells.join('')}</div>
        </section>`;
}

function renderProfile(root: HTMLElement, profile: PublicProfile): void {
    document.title = `${profile.displayName} — KarmoLab`;

    const streakEntries = Object.entries(profile.streaks).sort((a, b) => b[1].longest - a[1].longest);
    const avatar = profile.avatarPath ? `${API_BASE}${profile.avatarPath}` : null;

    const streaksHtml = streakEntries.length
        ? `<table class="profile-table">
               <thead><tr><th>${esc(t('profile.t04'))}</th><th>${esc(t('profile.t05'))}</th><th>${esc(t('profile.t06'))}</th></tr></thead>
               <tbody>${streakEntries
                   .map(
                       ([id, s]) =>
                           `<tr><td>${escapeHtml(STREAK_LABELS[id] ?? id)}</td><td>${escapeHtml(t('profile.days', { n: s.current }))}</td><td>${escapeHtml(t('profile.days', { n: s.longest }))}</td></tr>`,
                   )
                   .join('')}</tbody>
           </table>`
        : t('profile.t20');

    root.innerHTML = `
        <article class="profile-card">
            <header class="profile-head">
                ${avatar ? `<img class="profile-avatar" src="${escapeHtml(avatar)}" alt="">` : '<div class="profile-avatar profile-avatar-blank">◍</div>'}
                <div>
                    <h1 class="profile-name">${escapeHtml(profile.displayName)}</h1>
                    <p class="profile-handle">@${escapeHtml(profile.handle)}${
                        profile.online === true ? t('profile.t21') : ''
                    }</p>
                    <p class="profile-joined">${escapeHtml(formatDate(profile.joinedAt))}부터</p>
                </div>
                ${profile.canFollow
                    ? `<div class="profile-actions">
                           <button type="button" class="profile-follow${profile.following ? ' on' : ''}" id="profileFollow">${profile.following ? t('profile.t22') : t('profile.t23')}</button>
                           <button type="button" class="profile-block" id="profileBlock">${esc(t('profile.btn.block'))}</button>
                       </div>`
                    : ''}
            </header>
            ${cardHtml(profile)}
            ${hiddenNote(profile)}
            <section class="profile-stats">
                <div class="profile-stat"><strong>${profile.followers ?? 0}</strong><span>${esc(t('profile.t07'))}</span></div>
                <div class="profile-stat"><strong>${profile.achievements.length}</strong><span>${esc(t('profile.t08'))}</span></div>
                <div class="profile-stat"><strong>${profile.badges.length}</strong><span>${esc(t('profile.t09'))}</span></div>
                <div class="profile-stat"><strong>${streakEntries.length}</strong><span>${esc(t('profile.t10'))}</span></div>
            </section>
            ${grassHtml(profile)}
            ${streaksHtml}
            <div id="profileWorks"></div>
            <div id="profileActivity"></div>
            <footer class="profile-foot">
                <a href="/karmolab/">${esc(t('profile.t11'))}</a>
                <!-- 공유용 주소 (TASK-KL-156 D9). 이 주소로 붙여넣어야 카드 그림이 펼쳐진다 —
                     지금 주소(?h=)는 어느 사람이든 미리보기가 같다. -->
                <button type="button" class="profile-share" id="profileShare">${esc(t('profile.btn.share'))}</button>
            </footer>
        </article>`;
}

/**
 * 작업실 (TASK-KL-182 F3) — 「무엇을 만들었나」.
 *
 * 프로필은 활동과 기록까지 왔지만 **만든 것**은 없었다. 건 것이 없으면 이 자리는 통째로
 * 안 그려진다 — 빈 액자만 걸린 벽은 없느니만 못하다.
 */
async function loadWorks(handle: string): Promise<void> {
    const root = document.getElementById('profileWorks');
    if (!root) return;
    try {
        const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(handle)}/works`);
        if (!response.ok) return;
        type Work = {
            id: string;
            title: string;
            toolId: string | null;
            kind?: string;
            preview?: boolean;
            note?: string | null;
        };
        const works = ((await response.json()) as { works?: Work[] }).works ?? [];
        if (!works.length) return;
        /* 그림이 아닌 것도 걸린다 (TASK-KL-191 축3). 미리보기가 없으면 **없는 그림을 부르지
         * 않는다** — 부르면 깨진 칸이 남고, 그건 「안 걸린 것」처럼 보인다. 대신 갈래 표시와
         * 단서 한 줄(크기 또는 글 앞머리)을 그 자리에 둔다. */
        const FACE: Record<string, string> = {
            image: '🖼', pdf: '📄', audio: '🎵', video: '🎬', text: '📝', file: '📦',
        };
        const faceOf = (work: Work): string => {
            if (work.preview !== false) {
                return `<img src="${API_BASE}/kl/img/${encodeURIComponent(work.id)}" alt="${escapeHtml(work.title)}" loading="lazy">`;
            }
            return (
                `<span class="profile-work-blank"><b>${FACE[work.kind ?? 'file'] ?? '📦'}</b>` +
                `${work.note ? `<i>${escapeHtml(work.note)}</i>` : ''}</span>`
            );
        };
        root.innerHTML = `
            <section class="profile-works">
                <h2>${esc(t('profile.t12'))} <span class="profile-dim">${works.length}점</span></h2>
                <div class="profile-works-grid">
                    ${works
                        .map(
                            (work) =>
                                `<figure>${faceOf(work)}` +
                                `<figcaption>${escapeHtml(work.title)}${work.toolId ? ` <span class="profile-dim">${escapeHtml(toolTitle(work.toolId))}</span>` : ''}</figcaption></figure>`,
                        )
                        .join('')}
                </div>
            </section>`;
    } catch {
        /* 작업실을 못 받아도 프로필 자체는 보인다 */
    }
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
                <h2>${esc(t('profile.t13'))} <span class="profile-dim">글 ${data.counts.posts} · 답글 ${data.counts.replies}</span></h2>
                ${posts ? `<h3>${esc(t('profile.t14'))}</h3><ul class="profile-list">${posts}</ul>` : ''}
                ${replies ? `<h3>${esc(t('profile.t15'))}</h3><ul class="profile-list">${replies}</ul>` : ''}
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
            button.textContent = on ? t('profile.t22') : t('profile.t23');
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
                t('profile.t24'),
                t('profile.t25'),
                t('profile.t26'),
                '',
                t('profile.t27'),
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
            button.textContent = t('profile.t28');
            const follow = root.querySelector<HTMLButtonElement>('#profileFollow');
            if (follow) {
                follow.textContent = t('profile.t23');
                follow.classList.remove('on');
            }
        } catch {
            button.disabled = false;
        }
    });
}

/**
 * 공유 주소 복사 (TASK-KL-156 D9).
 *
 * 사람이 보는 주소와 **붙여넣을 주소가 다르다**. 지금 프로필 주소는 정적 한 장이라 어느
 * 사람이든 미리보기가 같게 나간다 — 서버가 내주는 주소로 붙여야 그 사람 카드가 펼쳐진다.
 */
function mountShare(root: HTMLElement, profile: PublicProfile): void {
    const button = root.querySelector<HTMLButtonElement>('#profileShare');
    if (!button) return;
    button.addEventListener('click', () => {
        const url = `${API_BASE}/kl/u/${encodeURIComponent(profile.handle)}/card`;
        void navigator.clipboard?.writeText(url);
        button.textContent = t('profile.t29');
        setTimeout(() => {
            button.textContent = t('profile.btn.share');
        }, 2000);
    });
}

async function main(): Promise<void> {
    const root = document.getElementById('profileRoot');
    if (!root) return;

    const handle = new URLSearchParams(location.search).get('h') ?? '';
    if (!handle) {
        renderMessage(root, t('profile.t30'), t('profile.t31'));
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/kl/u/${encodeURIComponent(handle)}`, { credentials: 'include' });
        // 잠근 것과 없는 것은 다르다 — 링크를 걸어 둔 사람이 왜 안 열리는지 알아야 한다 (KL-152 C4).
        if (response.status === 403) {
            renderMessage(root, t('profile.t32'), `@${handle} 님이 프로필을 남에게 안 보이게 해 뒀습니다.`);
            return;
        }
        if (response.status === 404) {
            renderMessage(root, t('profile.t33'), `@${handle} 는 아직 없는 프로필입니다.`);
            return;
        }
        if (!response.ok) throw new Error(`상태 ${response.status}`);
        const data = (await response.json()) as { profile?: PublicProfile };
        if (!data.profile) throw new Error(t('profile.err.34'));
        renderProfile(root, data.profile);
        mountFollow(root, data.profile);
        mountBlock(root, data.profile);
        mountShare(root, data.profile);
        void loadWorks(data.profile.handle);
        void loadActivity(data.profile.handle);
    } catch (error) {
        console.warn(t('profile.t35'), error);
        // 서버가 잠깐 죽은 것과 「없는 사람」은 다르다. 섞어서 말하지 않는다.
        renderMessage(root, t('profile.t36'), t('profile.t37'));
    }
}

void main();

export {};
