/**
 * 커뮤니티 (TASK-KL-098 Cycle 4) — `/karmolab/c/`.
 *
 * 왜 위젯에서 뺐나: 게시판을 도구 위젯 안 탭으로 두면 목록·글 상세·답글이라는 **자기 구조**를
 * 못 갖는다. 글마다 주소가 없어 공유도 안 되고, 남에게 보낼 수도 없다. 사용자 발화:
 * "게시판은 좀 커뮤니티 사이트처럼 본격적이면 좋겠는데, 위젯에 너무 사로잡히지 않아도 될 것 같은데."
 *
 * 뼈대는 요즘 커뮤니티(Discourse·Flarum·NodeBB)의 공통 구조를 따랐다:
 * 목록은 **마지막 움직임 순**(대화가 살아 있는 것이 위), 글 하나마다 주소, 그 안에 답글 스레드.
 * 화려한 것보다 「지금 무슨 이야기가 오가는지」가 한눈에 보이는 것이 먼저다.
 *
 * **여기는 KarmoLab 이다.** 도구 화면과 같은 껍데기(머리띠·테마·색)를 쓰고, 본문 구조만 다르다.
 * 위젯 틀에서 나온 것이지 딴 사이트로 나간 것이 아니다.
 *
 * 주소: 목록 `/karmolab/c/` · 글 `/karmolab/c/?p=<글id>`.
 * 화면 안의 링크는 **상대 주소**로 적는다 — 그래야 배포된 주소에서도, 내 컴퓨터에서 폴더째
 * 띄워 볼 때도 똑같이 열린다 (절대 주소로 적었더니 로컬 확인이 통째로 막혔다).
 * 정적으로 올라가는 사이트라 글마다 파일을 만들 수 없다 — 물음표 주소가 지금의 정답이다.
 */
type PostKind = 'talk' | 'request';

interface Reply {
    id: string;
    text: string;
    authorHandle: string;
    createdAt: string;
    byOwner: boolean;
}

interface Post {
    id: string;
    kind: PostKind;
    title: string | null;
    text: string;
    authorHandle: string;
    createdAt: string;
    bumpedAt: string;
    votes: number;
    status: 'open' | 'planned' | 'done' | 'declined';
    replies: Reply[];
    votedByMe: boolean;
}

interface ListResponse {
    posts: Post[];
    signedIn: boolean;
    isAdmin: boolean;
    myHandle: string | null;
    maxLength: number;
    titleMaxLength: number;
    replyMaxLength: number;
}

interface DetailResponse {
    post: Post;
    signedIn: boolean;
    isAdmin: boolean;
    myHandle: string | null;
    replyMaxLength: number;
}

const API_BASE = 'https://yawnbot.mascari4615.com';

const STATUS_LABEL: Record<Post['status'], string> = {
    open: '받는 중',
    planned: '만들 예정',
    done: '만들었음',
    declined: '안 만듦',
};

const KIND_LABEL: Record<PostKind, string> = { talk: '이야기', request: '도구 요청' };

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(then));
}

/** 첫 줄만 뽑아 목록에 미리보기로 쓴다. */
function preview(text: string, max = 90): string {
    const line = text.replace(/\s+/g, ' ').trim();
    return line.length > max ? `${line.slice(0, max)}…` : line;
}

async function api(path: string, init: RequestInit = {}): Promise<unknown | null> {
    try {
        const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

const root = document.getElementById('communityRoot');

function offline(): void {
    if (!root) return;
    // 서버가 죽은 것과 「아무 글도 없다」는 다르다. 섞어서 말하지 않는다.
    root.innerHTML = `<div class="c-empty">
        <h2>지금은 커뮤니티를 못 여네요</h2>
        <p>잠시 뒤에 다시 열어 주세요. 도구는 그대로 쓸 수 있습니다.</p>
        <p><a href="/karmolab/">도구로 돌아가기</a></p>
    </div>`;
}

/* ===== 목록 ===== */

function currentKind(): PostKind {
    return new URLSearchParams(location.search).get('kind') === 'request' ? 'request' : 'talk';
}

function renderList(data: ListResponse, kind: PostKind): void {
    if (!root) return;

    const tabs = (['talk', 'request'] as PostKind[])
        .map(
            (k) =>
                `<a class="c-tab" href="./${k === 'talk' ? '' : '?kind=request'}" data-on="${k === kind ? '1' : '0'}">${KIND_LABEL[k]}</a>`,
        )
        .join('');

    const writer = data.signedIn
        ? `<form class="c-write" id="cWrite">
               ${kind === 'talk' ? `<input type="text" id="cTitle" name="cTitle" maxlength="${data.titleMaxLength}" placeholder="제목" aria-label="글 제목" required>` : ''}
               <textarea id="cText" name="cText" maxlength="${data.maxLength}" aria-label="${kind === 'talk' ? '글 본문' : '도구 요청'}"
                         placeholder="${kind === 'talk' ? '무슨 이야기든' : '어떤 도구가 있었으면 하나요?'}" required></textarea>
               <div class="c-write-foot"><button type="submit" class="c-btn c-btn-main">올리기</button></div>
           </form>`
        : `<div class="c-signin">
               <p>로그인하면 글을 쓰고 답글을 달 수 있습니다.</p>
               <button type="button" class="c-btn c-btn-main" id="cSignIn">디스코드로 시작하기</button>
           </div>`;

    const rows = data.posts.length
        ? data.posts
              .map((p) => {
                  const heading = p.kind === 'talk' ? (p.title ?? '(제목 없음)') : preview(p.text);
                  return `<li class="c-row">
                      ${p.kind === 'request' ? `<span class="c-votes" title="표">${p.votes}</span>` : ''}
                      <a class="c-row-main" href="./?p=${encodeURIComponent(p.id)}">
                          <span class="c-row-title">${escapeHtml(heading)}${
                              p.kind === 'request' && p.status !== 'open'
                                  ? `<span class="c-tag">${STATUS_LABEL[p.status]}</span>`
                                  : ''
                          }</span>
                          ${p.kind === 'talk' ? `<span class="c-row-sub">${escapeHtml(preview(p.text, 70))}</span>` : ''}
                      </a>
                      <span class="c-row-meta">
                          <span>@${escapeHtml(p.authorHandle)}</span>
                          ${p.replies.length ? `<span class="c-replies">답글 ${p.replies.length}</span>` : ''}
                          <span>${relativeTime(p.bumpedAt)}</span>
                      </span>
                  </li>`;
              })
              .join('')
        : `<li class="c-empty-row">${kind === 'talk' ? '아직 아무 글도 없습니다. 첫 글을 남겨 주세요.' : '아직 올라온 요청이 없습니다.'}</li>`;

    root.innerHTML = `
        <nav class="c-tabs">${tabs}</nav>
        ${writer}
        <ul class="c-list">${rows}</ul>`;

    document.getElementById('cSignIn')?.addEventListener('click', () => {
        location.href = `${API_BASE}/kl/auth/discord?return=${encodeURIComponent(location.href)}`;
    });

    document.getElementById('cWrite')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = (document.getElementById('cTitle') as HTMLInputElement | null)?.value ?? '';
        const text = (document.getElementById('cText') as HTMLTextAreaElement | null)?.value ?? '';
        const button = (event.currentTarget as HTMLFormElement).querySelector('button');
        if (button) button.disabled = true;
        const ok = await api('/kl/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, title, text }),
        });
        if (button) button.disabled = false;
        if (!ok) {
            // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
            alert('못 올렸어요. 하루에 올릴 수 있는 개수를 넘었거나, 잠시 연결이 끊겼습니다.');
            return;
        }
        void route();
    });
}

/* ===== 글 하나 ===== */

function renderDetail(data: DetailResponse): void {
    if (!root) return;
    const post = data.post;
    document.title = `${post.title ?? preview(post.text, 30)} — KarmoLab 커뮤니티`;

    const canDelete = data.isAdmin || (data.myHandle !== null && data.myHandle === post.authorHandle);

    const replies = post.replies.length
        ? post.replies
              .map(
                  (r) => `<li class="c-reply" data-owner="${r.byOwner ? '1' : '0'}">
                      <div class="c-reply-head">@${escapeHtml(r.authorHandle)}${r.byOwner ? ' <span class="c-tag">주인</span>' : ''} · ${relativeTime(r.createdAt)}</div>
                      <div class="c-reply-body">${escapeHtml(r.text)}</div>
                  </li>`,
              )
              .join('')
        : '<li class="c-empty-row">아직 답글이 없습니다.</li>';

    const replyForm = data.signedIn
        ? `<form class="c-write" id="cReply">
               <textarea id="cReplyText" name="cReplyText" maxlength="${data.replyMaxLength}" placeholder="답글 달기" aria-label="답글" required></textarea>
               <div class="c-write-foot"><button type="submit" class="c-btn c-btn-main">답글</button></div>
           </form>`
        : `<div class="c-signin"><p>로그인하면 답글을 달 수 있습니다.</p>
               <button type="button" class="c-btn c-btn-main" id="cSignIn">디스코드로 시작하기</button></div>`;

    root.innerHTML = `
        <div class="c-crumb"><a href="./${post.kind === 'request' ? '?kind=request' : ''}">← ${KIND_LABEL[post.kind]}</a></div>
        <article class="c-post">
            <h1 class="c-post-title">${escapeHtml(post.title ?? preview(post.text, 60))}${
                post.kind === 'request' && post.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[post.status]}</span>` : ''
            }</h1>
            <div class="c-post-meta">
                <span>@${escapeHtml(post.authorHandle)}</span><span>${relativeTime(post.createdAt)}</span>
                ${canDelete ? '<button type="button" class="c-linkbtn" id="cDelete">지우기</button>' : ''}
            </div>
            ${post.title ? `<div class="c-post-body">${escapeHtml(post.text)}</div>` : ''}
            ${
                post.kind === 'request'
                    ? `<button type="button" class="c-vote" id="cVote" data-voted="${post.votedByMe ? '1' : '0'}" ${data.signedIn ? '' : 'disabled'}>
                           <strong>${post.votes}</strong> 표 ${post.votedByMe ? '(눌렀음)' : ''}
                       </button>`
                    : ''
            }
        </article>
        <h2 class="c-section">답글 ${post.replies.length}</h2>
        <ul class="c-replies">${replies}</ul>
        ${replyForm}`;

    document.getElementById('cSignIn')?.addEventListener('click', () => {
        location.href = `${API_BASE}/kl/auth/discord?return=${encodeURIComponent(location.href)}`;
    });

    document.getElementById('cVote')?.addEventListener('click', async () => {
        const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}/vote`, { method: 'POST' });
        if (!ok) {
            alert('표를 못 넘겼어요.');
            return;
        }
        void route();
    });

    document.getElementById('cDelete')?.addEventListener('click', async () => {
        if (!confirm('이 글을 지웁니다. 계속할까요?')) return;
        const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
        if (!ok) {
            alert('못 지웠어요.');
            return;
        }
        location.href = `./${post.kind === 'request' ? '?kind=request' : ''}`;
    });

    document.getElementById('cReply')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('cReplyText') as HTMLTextAreaElement | null;
        const text = (input?.value ?? '').trim();
        if (!text) return;
        const button = (event.currentTarget as HTMLFormElement).querySelector('button');
        if (button) button.disabled = true;
        const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (button) button.disabled = false;
        if (!ok) {
            alert('답글을 못 달았어요.');
            return;
        }
        void route();
    });
}

/* ===== 라우팅 ===== */

async function route(): Promise<void> {
    if (!root) return;
    const postId = new URLSearchParams(location.search).get('p');

    if (postId) {
        const raw = await api(`/kl/posts/${encodeURIComponent(postId)}`);
        if (!raw) {
            // 「없는 글」과 「서버가 죽음」을 구별할 수 없으므로 둘 다 담아 말한다.
            root.innerHTML = `<div class="c-empty"><h2>그 글을 못 찾았어요</h2>
                <p>지워졌거나, 잠시 연결이 끊겼습니다.</p><p><a href="./">목록으로</a></p></div>`;
            return;
        }
        renderDetail(raw as DetailResponse);
        return;
    }

    const kind = currentKind();
    const raw = await api(`/kl/posts?kind=${kind}`);
    if (!raw) {
        offline();
        return;
    }
    renderList(raw as ListResponse, kind);
}

/**
 * 머리띠의 테마 단추. 본체(toolbox.js)를 통째로 안 싣는 대신 같은 열쇠를 쓴다 —
 * 여기서 바꾼 테마가 도구 화면으로 넘어가도 그대로 유지되어야 한 사이트로 느껴진다.
 */
function wireThemeToggle(): void {
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try {
            localStorage.setItem('toolbox_theme', next);
        } catch {
            /* 저장 못 해도 이번 화면에는 적용된다 */
        }
    });
}

wireThemeToggle();
// 뒤로 가기로 목록↔글을 오갈 수 있어야 커뮤니티답다.
window.addEventListener('popstate', () => void route());
void route();

export {};
