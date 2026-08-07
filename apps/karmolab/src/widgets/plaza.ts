/**
 * 광장 (TASK-KL-098 Cycle 2~3) — 남의 흔적이 보이는 자리.
 *
 * 왜 있나: 도구는 혼자 쓰는 것이라 아무리 사람이 와도 사이트는 늘 비어 보였다.
 * 여기에 실제로 일어난 일만 모은다 — 어느 도구가 쓰였는지, 사람들이 무슨 이야기를 하는지,
 * 뭘 만들어 달라 했는지.
 *
 * 이야기(게시판)와 도구 요청은 **같은 글판**이다. 종류만 다르다 —
 * 이야기는 답글이 주인공이라 마지막 움직임 순으로 서고, 요청은 표가 주인공이라 표 순으로 선다.
 *
 * 지어낸 수는 한 개도 없다. 아직 아무 일도 안 일어난 칸은 0 을 띄우지 않고 자리 자체를
 * 안 만든다 — 0 이 늘어선 화면은 「비어 있다」가 아니라 「죽어 있다」로 읽힌다.
 *
 * 서버(노트북)에 못 닿으면 광장만 조용히 닫힌다. 도구는 그대로 돈다.
 */
(function (): void {
    type PostKind = 'talk' | 'request';

    interface ToolStat {
        toolId: string;
        total: number;
        recent: number;
    }
    interface Pulse {
        toolsUsed: number;
        opensTotal: number;
        opensToday: number;
    }
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
    interface Board {
        kind: PostKind;
        posts: Post[];
        signedIn: boolean;
        isAdmin: boolean;
        myHandle: string | null;
        maxLength: number;
        titleMaxLength: number;
        replyMaxLength: number;
    }

    const STATUS_LABEL: Record<Post['status'], string> = {
        open: '받는 중',
        planned: '만들 예정',
        done: '만들었음',
        declined: '안 만듦',
    };

    Mdd.injectCSS('plaza', `
        .plaza-wrap { display:flex; flex-direction:column; gap:22px; }
        .plaza-pulse { display:flex; gap:12px; flex-wrap:wrap; }
        .plaza-pulse-item { flex:1 1 140px; padding:14px 16px; border:1px solid var(--border); border-radius:10px;
            background:var(--bg-secondary); }
        .plaza-pulse-item strong { display:block; font-size:24px; font-family:monospace; color:var(--accent); }
        .plaza-pulse-item span { font-size:var(--font-size-xs); color:var(--text-secondary); }
        .plaza-section h3 { margin:0 0 10px; font-size:var(--font-size-sm); }
        .plaza-tools { display:flex; flex-direction:column; gap:6px; }
        .plaza-tool { display:flex; align-items:center; gap:10px; }
        .plaza-tool-name { flex:0 0 40%; font-size:var(--font-size-xs); color:var(--text-primary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .plaza-tool-bar { flex:1; height:8px; border-radius:4px; background:var(--bg-tertiary); overflow:hidden; }
        .plaza-tool-bar i { display:block; height:100%; background:var(--accent); }
        .plaza-tool-count { flex:0 0 72px; text-align:right; font-family:monospace; font-size:var(--font-size-xs);
            color:var(--text-secondary); }

        .plaza-post { border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:10px;
            display:flex; gap:12px; align-items:flex-start; }
        .plaza-vote { flex:0 0 auto; min-width:52px; padding:6px 0; border-radius:8px; cursor:pointer;
            border:1px solid var(--border); background:transparent; color:var(--text-secondary);
            font-size:var(--font-size-xs); line-height:1.2; text-align:center; }
        .plaza-vote strong { display:block; font-size:var(--font-size-sm); }
        .plaza-vote[data-voted="1"] { border-color:var(--accent); color:var(--accent); }
        .plaza-vote[disabled] { cursor:default; opacity:.65; }
        .plaza-post-body { min-width:0; flex:1; }
        .plaza-post-title { font-size:var(--font-size-sm); font-weight:600; color:var(--text-primary); word-break:break-word; }
        .plaza-post-text { margin-top:4px; font-size:var(--font-size-sm); color:var(--text-primary);
            white-space:pre-wrap; word-break:break-word; }
        .plaza-post-meta { margin-top:6px; font-size:var(--font-size-xs); color:var(--text-tertiary);
            display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .plaza-linkbtn { background:none; border:none; padding:0; cursor:pointer; color:var(--text-tertiary);
            font-size:var(--font-size-xs); text-decoration:underline; }
        .plaza-linkbtn:hover { color:var(--text-secondary); }
        .plaza-replies { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
        .plaza-reply { padding:8px 10px; border-left:2px solid var(--border); background:var(--bg-secondary);
            font-size:var(--font-size-xs); color:var(--text-secondary); white-space:pre-wrap; word-break:break-word; }
        .plaza-reply[data-owner="1"] { border-left-color:var(--accent); }
        .plaza-reply-meta { margin-top:3px; color:var(--text-tertiary); font-size:10px; }
        .plaza-reply-form { display:flex; gap:6px; margin-top:8px; }
        .plaza-reply-form input { flex:1; min-width:0; }
        .plaza-tag { display:inline-block; margin-left:6px; padding:1px 7px; border-radius:20px;
            border:1px solid var(--border); font-size:10px; color:var(--text-secondary); }
        .plaza-form { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
        .plaza-form-row { display:flex; gap:8px; }
        .plaza-form-row input, .plaza-form textarea { flex:1; min-width:0; }
        .plaza-form textarea { min-height:80px; resize:vertical; }
        .plaza-note { font-size:var(--font-size-xs); color:var(--text-secondary); }
    `);

    function escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 도구 id → 사람이 읽는 이름. 모르면 id 그대로 (지어내지 않는다). */
    function toolTitle(toolId: string): string {
        const meta = (window.KARMOLAB_LAZY_META ?? []).find((m) => m.id === toolId);
        return meta?.title ?? toolId;
    }

    function relativeTime(iso: string): string {
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return '';
        const minutes = Math.floor((Date.now() - then) / 60000);
        if (minutes < 1) return '방금';
        if (minutes < 60) return `${minutes}분 전`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;
        return `${Math.floor(hours / 24)}일 전`;
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

    function offline(container: HTMLElement): void {
        // 서버가 죽은 것과 「아무 일도 없다」는 다르다. 섞어서 말하지 않는다.
        container.innerHTML =
            '<div class="plaza-wrap"><p class="plaza-note">지금은 광장을 못 여네요. 잠시 뒤에 다시 열어 주세요. (도구는 그대로 쓸 수 있습니다.)</p></div>';
    }

    /* ===== 광장 첫 화면 — 사이트 맥박 + 요즘 열린 도구 ===== */

    function renderPulse(pulse: Pulse): string {
        if (pulse.opensTotal === 0) return '';
        const items = [
            { value: pulse.opensToday, label: '오늘 열린 도구' },
            { value: pulse.opensTotal, label: '지금까지 열린 도구' },
            { value: pulse.toolsUsed, label: '실제로 쓰인 도구 종류' },
        ].filter((item) => item.value > 0);
        return `<div class="plaza-pulse">${items
            .map((i) => `<div class="plaza-pulse-item"><strong>${i.value.toLocaleString()}</strong><span>${i.label}</span></div>`)
            .join('')}</div>`;
    }

    function renderTools(tools: ToolStat[]): string {
        const top = tools.filter((t) => t.recent > 0).slice(0, 8);
        if (top.length === 0) return '';
        const max = top[0].recent;
        return `
            <section class="plaza-section">
                <h3>요즘 많이 열린 도구 <span class="plaza-tag">최근 7일</span></h3>
                <div class="plaza-tools">
                    ${top
                        .map(
                            (t) => `
                        <div class="plaza-tool">
                            <a class="plaza-tool-name" href="/karmolab/t/${encodeURIComponent(t.toolId)}/">${escapeHtml(toolTitle(t.toolId))}</a>
                            <div class="plaza-tool-bar"><i style="width:${Math.round((t.recent / max) * 100)}%"></i></div>
                            <div class="plaza-tool-count">${t.recent.toLocaleString()}회</div>
                        </div>`,
                        )
                        .join('')}
                </div>
            </section>`;
    }

    async function buildOverview(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="plaza-wrap"><p class="plaza-note">불러오는 중…</p></div>';
        const raw = await api('/kl/tools/stats');
        if (!raw) {
            offline(container);
            return;
        }
        const stats = raw as { tools: ToolStat[]; pulse: Pulse };
        const inner = `${renderPulse(stats.pulse)}${renderTools(stats.tools)}`;
        container.innerHTML = `<div class="plaza-wrap">${
            inner ||
            '<p class="plaza-note">아직 아무 도구도 안 열렸습니다. 도구를 하나 열고 오면 여기가 차기 시작합니다.</p>'
        }</div>`;
    }

    /* ===== 글판 — 이야기 / 도구 요청 ===== */

    function renderPost(post: Post, board: Board): string {
        const canDelete = board.isAdmin || (board.myHandle !== null && board.myHandle === post.authorHandle);
        const voteButton =
            post.kind === 'request'
                ? `<button type="button" class="plaza-vote" data-vote="${escapeHtml(post.id)}" data-voted="${post.votedByMe ? '1' : '0'}"
                          ${board.signedIn ? '' : 'disabled'} aria-label="이 요청에 표 주기"><strong>${post.votes}</strong>표</button>`
                : '';

        const replies = post.replies.length
            ? `<div class="plaza-replies">${post.replies
                  .map(
                      (r) => `<div class="plaza-reply" data-owner="${r.byOwner ? '1' : '0'}">${escapeHtml(r.text)}
                          <div class="plaza-reply-meta">@${escapeHtml(r.authorHandle)}${r.byOwner ? ' · 주인' : ''} · ${relativeTime(r.createdAt)}</div>
                      </div>`,
                  )
                  .join('')}</div>`
            : '';

        const replyForm = board.signedIn
            ? `<div class="plaza-reply-form">
                   <input type="text" name="plazaReply_${escapeHtml(post.id)}" maxlength="${board.replyMaxLength}"
                          data-reply-input="${escapeHtml(post.id)}" placeholder="답글 달기" aria-label="답글 달기">
                   <button type="button" class="btn" data-reply="${escapeHtml(post.id)}">답글</button>
               </div>`
            : '';

        return `
            <div class="plaza-post">
                ${voteButton}
                <div class="plaza-post-body">
                    ${post.title ? `<div class="plaza-post-title">${escapeHtml(post.title)}</div>` : ''}
                    <div class="plaza-post-text">${escapeHtml(post.text)}${
                        post.kind === 'request' && post.status !== 'open'
                            ? `<span class="plaza-tag">${STATUS_LABEL[post.status]}</span>`
                            : ''
                    }</div>
                    <div class="plaza-post-meta">
                        <span>@${escapeHtml(post.authorHandle)} · ${relativeTime(post.createdAt)}</span>
                        ${post.replies.length ? `<span>답글 ${post.replies.length}</span>` : ''}
                        ${canDelete ? `<button type="button" class="plaza-linkbtn" data-delete="${escapeHtml(post.id)}">지우기</button>` : ''}
                    </div>
                    ${replies}
                    ${replyForm}
                </div>
            </div>`;
    }

    function renderForm(board: Board): string {
        if (!board.signedIn) {
            return '<p class="plaza-note">로그인하면 글을 쓰고 답글을 달 수 있습니다. (오른쪽 위 「시작하기」)</p>';
        }
        if (board.kind === 'request') {
            return `<div class="plaza-form"><div class="plaza-form-row">
                <input type="text" id="plazaText" name="plazaText" maxlength="${board.maxLength}"
                       placeholder="어떤 도구가 있었으면 하나요?" aria-label="도구 요청 한 줄">
                <button type="button" class="btn btn-primary" id="plazaSubmit">올리기</button>
            </div></div>`;
        }
        return `<div class="plaza-form">
            <input type="text" id="plazaTitle" name="plazaTitle" maxlength="${board.titleMaxLength}"
                   placeholder="제목" aria-label="글 제목">
            <textarea id="plazaText" name="plazaText" maxlength="${board.maxLength}"
                      placeholder="무슨 이야기든" aria-label="글 본문"></textarea>
            <div class="plaza-form-row" style="justify-content:flex-end">
                <button type="button" class="btn btn-primary" id="plazaSubmit">올리기</button>
            </div>
        </div>`;
    }

    function makeBoard(kind: PostKind) {
        return async function build(container: HTMLElement): Promise<void> {
            container.innerHTML = '<div class="plaza-wrap"><p class="plaza-note">불러오는 중…</p></div>';
            const raw = await api(`/kl/posts?kind=${kind}`);
            if (!raw) {
                offline(container);
                return;
            }
            const board = raw as Board;

            const list = board.posts.length
                ? board.posts.map((p) => renderPost(p, board)).join('')
                : `<p class="plaza-note">${
                      kind === 'talk' ? '아직 아무 글도 없습니다. 첫 글을 남겨 주세요.' : '아직 올라온 요청이 없습니다. 첫 번째가 되어 주세요.'
                  }</p>`;

            container.innerHTML = `<div class="plaza-wrap"><section class="plaza-section">${renderForm(board)}${list}</section></div>`;

            const reload = (): void => {
                void build(container);
            };

            container.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((button) => {
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    const ok = await api(`/kl/posts/${encodeURIComponent(button.dataset.vote ?? '')}/vote`, { method: 'POST' });
                    if (!ok) {
                        button.disabled = false;
                        Toolbox.showToast?.('표를 못 넘겼어요. 잠시 뒤에 다시 눌러 주세요.');
                        return;
                    }
                    reload();
                });
            });

            container.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((button) => {
                button.addEventListener('click', async () => {
                    if (!confirm('이 글을 지웁니다. 계속할까요?')) return;
                    const ok = await api(`/kl/posts/${encodeURIComponent(button.dataset.delete ?? '')}`, { method: 'DELETE' });
                    if (!ok) {
                        Toolbox.showToast?.('못 지웠어요.');
                        return;
                    }
                    reload();
                });
            });

            container.querySelectorAll<HTMLButtonElement>('[data-reply]').forEach((button) => {
                const postId = button.dataset.reply ?? '';
                const input = container.querySelector<HTMLInputElement>(`[data-reply-input="${CSS.escape(postId)}"]`);
                const send = async (): Promise<void> => {
                    const text = (input?.value ?? '').trim();
                    if (!text) return;
                    button.disabled = true;
                    const ok = await api(`/kl/posts/${encodeURIComponent(postId)}/replies`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text }),
                    });
                    button.disabled = false;
                    if (!ok) {
                        Toolbox.showToast?.('답글을 못 달았어요.');
                        return;
                    }
                    reload();
                };
                button.addEventListener('click', () => void send());
                input?.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') void send();
                });
            });

            const submit = container.querySelector<HTMLButtonElement>('#plazaSubmit');
            const title = container.querySelector<HTMLInputElement>('#plazaTitle');
            const text = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('#plazaText');
            submit?.addEventListener('click', async () => {
                const body = (text?.value ?? '').trim();
                if (!body) {
                    Toolbox.showToast?.('내용을 적어 주세요.');
                    return;
                }
                if (kind === 'talk' && !(title?.value ?? '').trim()) {
                    Toolbox.showToast?.('제목을 적어 주세요.');
                    return;
                }
                submit.disabled = true;
                const ok = await api('/kl/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind, title: title?.value ?? null, text: body }),
                });
                submit.disabled = false;
                if (!ok) {
                    // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
                    Toolbox.showToast?.('못 올렸어요. 하루에 올릴 수 있는 개수를 넘었거나, 잠시 연결이 끊겼습니다.');
                    return;
                }
                reload();
            });
        };
    }

    Toolbox.register({
        id: 'plaza',
        title: '광장',
        category: 'tool',
        desc: '지금 어떤 도구가 쓰이는지, 사람들이 무슨 이야기를 하는지 — 실제로 일어난 일만',
        layout: 'form',
        icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 12h17M12 3.2c2.4 2.6 2.4 14 0 17.6M12 3.2c-2.4 2.6-2.4 14 0 17.6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
        tabs: [
            { id: 'plaza-main', label: '지금', build: buildOverview },
            { id: 'plaza-talk', label: '이야기', build: makeBoard('talk') },
            { id: 'plaza-request', label: '도구 요청', build: makeBoard('request') },
        ],
    });
})();
