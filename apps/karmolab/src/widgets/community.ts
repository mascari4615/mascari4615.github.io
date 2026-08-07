/**
 * 커뮤니티 (TASK-KL-098) — KarmoLab 의 정식 화면 하나.
 *
 * 왜 이 자리인가 (사용자 발화):
 *   "일단 KarmoLab Base긴 해야해. KarmoLab에서 도구도 쓰고 커뮤니티도 하는거지. 분리하라는 의미는 아니였어"
 *   "위젯이 아닐뿐인거야"
 *   "모양만 같은게 아니라 근본적으로 KarmoLab에 소속되면 좋겠는데"
 *
 * 그래서 앱 바깥의 딴 페이지가 아니라 **앱 안의 화면**으로 등록한다. 그 결과:
 * 머리띠·사이드바 목록에 도구들과 나란히 서고, 검색·즐겨찾기·최근 화면·토스트·계정·사용 기록을
 * 전부 그대로 물려받는다. 껍데기를 손으로 복제하지 않으니 본체가 바뀌면 여기도 같이 바뀐다.
 *
 * 「위젯이 아닐 뿐」은 이렇게 지킨다 — `layout: 'wide'` 로 넓게 쓰고 `noHero` 로 위젯 제목 카드를
 * 안 그린다. 탭도 하나뿐이라 탭 줄이 안 나온다. 즉 앱의 일원이되 화면은 커뮤니티 제 구조다.
 *
 * 뼈대는 요즘 커뮤니티(Discourse·Flarum·NodeBB)의 공통 구조:
 * 목록은 **마지막 움직임 순**(대화가 살아 있는 것이 위), 글 하나마다 주소, 그 안에 답글 스레드.
 *
 * 글 주소 = `/karmolab/?p=<글id>#community`. 앱이 한 페이지라 물음표로 글을 가리킨다.
 * 뒤로 가기로 목록↔글을 오간다.
 */
(function (): void {
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

    const STATUS_LABEL: Record<Post['status'], string> = {
        open: '받는 중',
        planned: '만들 예정',
        done: '만들었음',
        declined: '안 만듦',
    };
    const KIND_LABEL: Record<PostKind, string> = { talk: '이야기', request: '도구 요청' };

    Mdd.injectCSS('community', `
        .c-wrap { display: flex; flex-direction: column; }
        .c-head { margin-bottom: 18px; }
        .c-head h2 { margin: 0; font-size: 22px; color: var(--text-primary); }
        .c-head p { margin: 4px 0 0; font-size: var(--font-size-xs); color: var(--text-secondary); }

        .c-tabs { display: flex; gap: 6px; margin-bottom: 18px; }
        .c-tab { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--border);
                 font-size: var(--font-size-xs); color: var(--text-secondary); cursor: pointer; background: transparent; }
        .c-tab:hover { color: var(--text-primary); }
        .c-tab[data-on="1"] { border-color: var(--accent); color: var(--accent); }

        .c-write { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
        .c-write input, .c-write textarea {
            width: 100%; padding: 10px 12px; border-radius: var(--radius); border: 1px solid var(--border);
            background: var(--bg-secondary); color: var(--text-primary); font: inherit;
        }
        .c-write textarea { min-height: 92px; resize: vertical; }
        .c-write-foot { display: flex; justify-content: flex-end; }
        .c-signin { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: space-between;
                    padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-lg);
                    background: var(--bg-secondary); margin-bottom: 22px; }
        .c-signin p { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); }

        .c-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
        .c-row { display: flex; align-items: center; gap: 12px; padding: 13px 4px; border-bottom: 1px solid var(--border); }
        .c-votes { flex: 0 0 auto; min-width: 38px; text-align: center; padding: 4px 0;
                   border: 1px solid var(--border); border-radius: var(--radius);
                   font-size: var(--font-size-xs); color: var(--text-secondary); }
        .c-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
                      text-decoration: none; cursor: pointer; }
        .c-row-title { font-weight: 600; color: var(--text-primary); }
        .c-row-main:hover .c-row-title { color: var(--accent); }
        .c-row-sub { font-size: var(--font-size-xs); color: var(--text-tertiary);
                     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .c-row-meta { flex: 0 0 auto; display: flex; gap: 10px; align-items: center;
                      font-size: var(--font-size-xs); color: var(--text-tertiary); white-space: nowrap; }
        .c-empty-row { padding: 28px 4px; color: var(--text-secondary); font-size: var(--font-size-sm); }

        .c-crumb { margin-bottom: 14px; font-size: var(--font-size-xs); }
        .c-post { border: 1px solid var(--border); border-radius: var(--radius-lg);
                  background: var(--bg-secondary); padding: 20px; }
        .c-post-title { margin: 0; font-size: 21px; line-height: 1.4; color: var(--text-primary); }
        .c-post-meta { display: flex; gap: 12px; align-items: center; margin-top: 8px;
                       font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .c-post-body { margin-top: 16px; white-space: pre-wrap; word-break: break-word; color: var(--text-primary); }
        .c-vote { margin-top: 16px; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border);
                  background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
        .c-vote[data-voted="1"] { border-color: var(--accent); color: var(--accent); }
        .c-vote[disabled] { cursor: default; opacity: .6; }

        .c-section { margin: 28px 0 12px; font-size: var(--font-size-sm); color: var(--text-primary); }
        ul.c-replies { list-style: none; margin: 0 0 22px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .c-reply { border-left: 2px solid var(--border); background: var(--bg-tertiary);
                   border-radius: 0 var(--radius) var(--radius) 0; padding: 10px 14px; }
        .c-reply[data-owner="1"] { border-left-color: var(--accent); }
        .c-reply-head { font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .c-reply-body { margin-top: 4px; white-space: pre-wrap; word-break: break-word; color: var(--text-primary); }

        .c-tag { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px;
                 border: 1px solid var(--border); font-size: 11px; color: var(--text-secondary); vertical-align: middle; }
        .c-linkbtn { background: none; border: none; padding: 0; color: var(--text-tertiary); font: inherit;
                     font-size: var(--font-size-xs); text-decoration: underline; cursor: pointer; }
        .c-linkbtn:hover { color: var(--text-primary); }
        .c-empty { padding: 48px 0; text-align: center; color: var(--text-secondary); }
        .c-empty h3 { color: var(--text-primary); font-size: 18px; margin: 0 0 8px; }

        @media (max-width: 560px) {
            .c-row { flex-wrap: wrap; }
            .c-row-meta { width: 100%; }
        }
    `);

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

    /** 첫 줄만 뽑아 목록 미리보기로 쓴다. */
    function preview(text: string, max = 90): string {
        const line = text.replace(/\s+/g, ' ').trim();
        return line.length > max ? `${line.slice(0, max)}…` : line;
    }

    async function api(path: string, init: RequestInit = {}): Promise<unknown | null> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return null;
        try {
            const response = await fetch(`${base}${path}`, { ...init, credentials: 'include' });
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    /** 지금 어떤 갈래를 보고 있나. 주소가 정본이라 새로고침·뒤로 가기가 그대로 산다. */
    function currentKind(): PostKind {
        return new URLSearchParams(location.search).get('kind') === 'request' ? 'request' : 'talk';
    }
    function currentPostId(): string | null {
        return new URLSearchParams(location.search).get('p');
    }

    /** 앱은 한 페이지라 해시(`#community`)를 지키면서 물음표만 갈아 끼운다. */
    function go(params: Record<string, string | null>): void {
        const search = new URLSearchParams(location.search);
        for (const [key, value] of Object.entries(params)) {
            if (value === null) search.delete(key);
            else search.set(key, value);
        }
        const query = search.toString();
        history.pushState({}, '', `${location.pathname}${query ? `?${query}` : ''}#community`);
        void render();
    }

    let host: HTMLElement | null = null;

    function offline(): void {
        if (!host) return;
        // 서버가 죽은 것과 「아무 글도 없다」는 다르다. 섞어서 말하지 않는다.
        host.innerHTML = `<div class="c-empty"><h3>지금은 커뮤니티를 못 여네요</h3>
            <p>잠시 뒤에 다시 열어 주세요. 도구는 그대로 쓸 수 있습니다.</p></div>`;
    }

    function signInButtonHtml(text: string): string {
        return `<div class="c-signin"><p>${text}</p>
            <button type="button" class="btn btn-primary" data-signin>디스코드로 시작하기</button></div>`;
    }

    function wireSignIn(): void {
        host?.querySelector<HTMLButtonElement>('[data-signin]')?.addEventListener('click', () => {
            window.KarmoAccount?.signIn();
        });
    }

    /* ===== 목록 ===== */

    function renderList(data: ListResponse, kind: PostKind): void {
        if (!host) return;

        const tabs = (['talk', 'request'] as PostKind[])
            .map((k) => `<button type="button" class="c-tab" data-kind="${k}" data-on="${k === kind ? '1' : '0'}">${KIND_LABEL[k]}</button>`)
            .join('');

        const writer = data.signedIn
            ? `<form class="c-write" data-write>
                   ${kind === 'talk' ? `<input type="text" name="cTitle" data-title maxlength="${data.titleMaxLength}" placeholder="제목" aria-label="글 제목" required>` : ''}
                   <textarea name="cText" data-text maxlength="${data.maxLength}" aria-label="${kind === 'talk' ? '글 본문' : '도구 요청'}"
                             placeholder="${kind === 'talk' ? '무슨 이야기든' : '어떤 도구가 있었으면 하나요?'}" required></textarea>
                   <div class="c-write-foot"><button type="submit" class="btn btn-primary">올리기</button></div>
               </form>`
            : signInButtonHtml('로그인하면 글을 쓰고 답글을 달 수 있습니다.');

        const rows = data.posts.length
            ? data.posts
                  .map((p) => {
                      const heading = p.kind === 'talk' ? (p.title ?? '(제목 없음)') : preview(p.text);
                      return `<li class="c-row">
                          ${p.kind === 'request' ? `<span class="c-votes" title="표">${p.votes}</span>` : ''}
                          <a class="c-row-main" data-post="${escapeHtml(p.id)}" href="?p=${encodeURIComponent(p.id)}#community">
                              <span class="c-row-title">${escapeHtml(heading)}${
                                  p.kind === 'request' && p.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[p.status]}</span>` : ''
                              }</span>
                              ${p.kind === 'talk' ? `<span class="c-row-sub">${escapeHtml(preview(p.text, 70))}</span>` : ''}
                          </a>
                          <span class="c-row-meta">
                              <span>@${escapeHtml(p.authorHandle)}</span>
                              ${p.replies.length ? `<span>답글 ${p.replies.length}</span>` : ''}
                              <span>${relativeTime(p.bumpedAt)}</span>
                          </span>
                      </li>`;
                  })
                  .join('')
            : `<li class="c-empty-row">${kind === 'talk' ? '아직 아무 글도 없습니다. 첫 글을 남겨 주세요.' : '아직 올라온 요청이 없습니다.'}</li>`;

        host.innerHTML = `<div class="c-wrap">
            <div class="c-head"><h2>커뮤니티</h2><p>도구를 쓰는 사람들이 이야기하는 곳.</p></div>
            <div class="c-tabs">${tabs}</div>
            ${writer}
            <ul class="c-list">${rows}</ul>
        </div>`;

        wireSignIn();

        host.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) => {
            button.addEventListener('click', () => go({ kind: button.dataset.kind === 'request' ? 'request' : null, p: null }));
        });

        host.querySelectorAll<HTMLAnchorElement>('[data-post]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                go({ p: link.dataset.post ?? null });
            });
        });

        host.querySelector<HTMLFormElement>('[data-write]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            const title = form.querySelector<HTMLInputElement>('[data-title]')?.value ?? '';
            const text = form.querySelector<HTMLTextAreaElement>('[data-text]')?.value ?? '';
            const button = form.querySelector('button');
            if (button) button.disabled = true;
            const ok = await api('/kl/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, title, text }),
            });
            if (button) button.disabled = false;
            if (!ok) {
                // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
                Toolbox.showToast?.('못 올렸어요. 하루에 올릴 수 있는 개수를 넘었거나, 잠시 연결이 끊겼습니다.');
                return;
            }
            void render();
        });
    }

    /* ===== 글 하나 ===== */

    function renderDetail(data: DetailResponse): void {
        if (!host) return;
        const post = data.post;
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
            ? `<form class="c-write" data-reply>
                   <textarea name="cReply" data-reply-text maxlength="${data.replyMaxLength}" placeholder="답글 달기" aria-label="답글" required></textarea>
                   <div class="c-write-foot"><button type="submit" class="btn btn-primary">답글</button></div>
               </form>`
            : signInButtonHtml('로그인하면 답글을 달 수 있습니다.');

        host.innerHTML = `<div class="c-wrap">
            <div class="c-crumb"><button type="button" class="c-linkbtn" data-back>← ${KIND_LABEL[post.kind]}</button></div>
            <article class="c-post">
                <h2 class="c-post-title">${escapeHtml(post.title ?? preview(post.text, 60))}${
                    post.kind === 'request' && post.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[post.status]}</span>` : ''
                }</h2>
                <div class="c-post-meta">
                    <span>@${escapeHtml(post.authorHandle)}</span><span>${relativeTime(post.createdAt)}</span>
                    ${canDelete ? '<button type="button" class="c-linkbtn" data-delete>지우기</button>' : ''}
                </div>
                ${post.title ? `<div class="c-post-body">${escapeHtml(post.text)}</div>` : ''}
                ${
                    post.kind === 'request'
                        ? `<button type="button" class="c-vote" data-vote data-voted="${post.votedByMe ? '1' : '0'}" ${data.signedIn ? '' : 'disabled'}>
                               <strong>${post.votes}</strong> 표 ${post.votedByMe ? '(눌렀음)' : ''}
                           </button>`
                        : ''
                }
            </article>
            <h3 class="c-section">답글 ${post.replies.length}</h3>
            <ul class="c-replies">${replies}</ul>
            ${replyForm}
        </div>`;

        wireSignIn();

        host.querySelector('[data-back]')?.addEventListener('click', () => {
            go({ p: null, kind: post.kind === 'request' ? 'request' : null });
        });

        host.querySelector('[data-vote]')?.addEventListener('click', async () => {
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}/vote`, { method: 'POST' });
            if (!ok) {
                Toolbox.showToast?.('표를 못 넘겼어요.');
                return;
            }
            void render();
        });

        host.querySelector('[data-delete]')?.addEventListener('click', async () => {
            if (!confirm('이 글을 지웁니다. 계속할까요?')) return;
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
            if (!ok) {
                Toolbox.showToast?.('못 지웠어요.');
                return;
            }
            go({ p: null, kind: post.kind === 'request' ? 'request' : null });
        });

        host.querySelector<HTMLFormElement>('[data-reply]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            const input = form.querySelector<HTMLTextAreaElement>('[data-reply-text]');
            const text = (input?.value ?? '').trim();
            if (!text) return;
            const button = form.querySelector('button');
            if (button) button.disabled = true;
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (button) button.disabled = false;
            if (!ok) {
                Toolbox.showToast?.('답글을 못 달았어요.');
                return;
            }
            void render();
        });
    }

    async function render(): Promise<void> {
        if (!host) return;
        host.innerHTML = '<p class="c-empty-row">불러오는 중…</p>';

        const postId = currentPostId();
        if (postId) {
            const raw = await api(`/kl/posts/${encodeURIComponent(postId)}`);
            if (!raw) {
                // 「없는 글」과 「서버가 죽음」을 구별할 수 없으므로 둘 다 담아 말한다.
                host.innerHTML = `<div class="c-empty"><h3>그 글을 못 찾았어요</h3>
                    <p>지워졌거나, 잠시 연결이 끊겼습니다.</p></div>`;
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

    function build(container: HTMLElement): void {
        host = container;
        void render();
    }

    // 뒤로 가기로 목록↔글을 오갈 수 있어야 커뮤니티답다.
    // 이 화면이 열려 있을 때만 다시 그린다 (다른 도구를 보고 있을 때 끼어들지 않는다).
    window.addEventListener('popstate', () => {
        if (host?.isConnected) void render();
    });

    Toolbox.register({
        id: 'community',
        title: '커뮤니티',
        category: 'tool',
        desc: '이야기 · 도구 요청 — 도구를 쓰는 사람들이 모이는 자리',
        // 넓게 쓰고 위젯 제목 카드는 안 그린다 — 앱의 일원이되 화면은 커뮤니티 제 구조다.
        layout: 'wide',
        noHero: true,
        icon: '<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M8 9.5h8M8 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
        tabs: [{ id: 'community-main', label: '커뮤니티', build }],
    });
})();
