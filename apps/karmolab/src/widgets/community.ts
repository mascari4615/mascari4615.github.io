/**
 * 커뮤니티 (TASK-KL-098) — KarmoLab 의 정식 화면 하나.
 *
 * 왜 이 자리인가 (사용자 발화):
 *   "KarmoLab에서 도구도 쓰고 커뮤니티도 하는거지" / "위젯이 아닐뿐인거야"
 * 그래서 앱 바깥의 딴 페이지가 아니라 **앱 안의 화면**으로 등록한다 —
 * 머리띠·사이드바·검색·계정·토스트를 그대로 물려받는다. 껍데기를 복제하지 않는다.
 * 「위젯이 아닐 뿐」은 `layout: 'wide'` + `noHero` 로 지킨다 (위젯 제목 카드·탭 줄 없음).
 *
 * 왜 이 모양인가 (사용자 발화: "좀 커뮤니티 사이트 같은 커뮤니티를 원해. 지금은 그냥 뭐 댓글만
 * 다는 수준"). 요즘 커뮤니티(Discourse·Flarum·NodeBB)와 국내 게시판이 공통으로 갖는 것을 따랐다:
 *   ① 판(게시판)을 먼저 고른다 — 어디에 쓰는 글인지가 먼저 정해진다
 *   ② 목록 한 줄에 판단 재료가 다 있다 — 제목·글쓴이 얼굴·답글 수·조회·좋아요·마지막 움직임
 *   ③ 정렬을 고른다 (최신 / 인기)
 *   ④ 글마다 주소가 있고, 그 안에서 좋아요·답글·대댓글이 오간다
 *   ⑤ 주인은 고정·진행 상태를 만진다
 *
 * 글 주소 = `/karmolab/?p=<글id>#community`. 앱이 한 페이지라 물음표로 글을 가리킨다.
 * 뒤로 가기로 목록↔글을 오간다.
 */
import { renderMarkdown, plainPreview, escapeHtml as escapeMd } from './community-markdown';

(function (): void {
    interface Board {
        id: string;
        label: string;
        desc: string;
        count: number;
    }

    interface Reply {
        id: string;
        text: string;
        authorHandle: string;
        createdAt: string;
        byOwner: boolean;
        parentId: string | null;
        likes: number;
        likedByMe: boolean;
    }

    interface Post {
        id: string;
        board: string;
        title: string | null;
        text: string;
        authorHandle: string;
        createdAt: string;
        bumpedAt: string;
        votes: number;
        likes: number;
        views: number;
        replyCount: number;
        status: 'open' | 'planned' | 'done' | 'declined';
        pinned: boolean;
        replies: Reply[];
        votedByMe: boolean;
        likedByMe: boolean;
        mine: boolean;
    }

    interface ListResponse {
        board: string;
        sort: 'recent' | 'top';
        posts: Post[];
        signedIn: boolean;
        isAdmin: boolean;
        myHandle: string | null;
        canWrite: boolean;
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

    Mdd.injectCSS('community', `
        /* 커뮤니티는 **글을 읽는 곳**이다. 넓은 화면(wide)은 판이 없어서 첫 화면의 관측실 무늬가
           글 뒤로 그대로 비쳤다 — 예쁘긴 해도 글이 안 읽힌다. 그래서 제 바탕을 깐다.
           안쪽 카드(글·작성기)는 한 겹 더 밝은 색이라 층이 구분된다. */
        .c-wrap { display:flex; flex-direction:column; position:relative;
            max-width:860px; margin:0 auto; padding:22px 24px 30px;
            background:var(--bg-primary); border:1px solid var(--border); border-radius:var(--radius-lg); }
        @media (max-width: 620px) { .c-wrap { padding:16px 14px 22px; border-radius:0; border-left:0; border-right:0; } }
        .c-head { display:flex; align-items:baseline; gap:10px; margin-bottom:14px; }
        .c-head h2 { margin:0; font-size:22px; color:var(--text-primary); }
        .c-head span { font-size:var(--font-size-xs); color:var(--text-secondary); }

        /* 판 고르는 줄 — 커뮤니티는 「어디에 쓰는 글인지」가 먼저다. */
        .c-boards { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
        .c-board { display:inline-flex; align-items:center; gap:6px; padding:7px 13px; border-radius:999px;
            border:1px solid var(--border); background:transparent; cursor:pointer; font:inherit;
            font-size:var(--font-size-xs); color:var(--text-secondary); }
        .c-board:hover { color:var(--text-primary); }
        .c-board[data-on="1"] { border-color:var(--accent); color:var(--accent); background:var(--accent-dim); }
        .c-board-count { font-size:10px; opacity:.7; font-family:monospace; }

        .c-bar { display:flex; align-items:center; justify-content:space-between; gap:10px;
            margin-bottom:10px; flex-wrap:wrap; }
        .c-sorts { display:flex; gap:4px; }
        .c-sort { background:none; border:0; padding:4px 8px; border-radius:var(--radius); cursor:pointer;
            font:inherit; font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .c-sort[data-on="1"] { color:var(--text-primary); font-weight:700; }
        .c-newbtn { padding:7px 14px; border-radius:var(--radius); border:1px solid var(--accent);
            background:transparent; color:var(--accent); font:inherit; font-size:var(--font-size-xs);
            font-weight:600; cursor:pointer; }
        .c-newbtn:hover { background:var(--accent); color:var(--bg-primary); }

        .c-write { display:flex; flex-direction:column; gap:8px; margin-bottom:18px;
            border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px; background:var(--bg-secondary); }
        .c-write input, .c-write textarea { width:100%; padding:10px 12px; border-radius:var(--radius);
            border:1px solid var(--border); background:var(--bg-primary); color:var(--text-primary); font:inherit; }
        .c-write textarea { min-height:110px; resize:vertical; }
        .c-write-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .c-write-hint { font-size:11px; color:var(--text-tertiary); }
        /* 작성기 — 기호를 몰라도 단추로 다 되게. */
        .c-compose-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .c-fmts { display:flex; gap:4px; flex-wrap:wrap; }
        .c-fmt { padding:4px 9px; border-radius:var(--radius); border:1px solid var(--border);
            background:transparent; color:var(--text-secondary); font:inherit; font-size:11px; cursor:pointer; }
        .c-fmt:hover { color:var(--text-primary); border-color:var(--accent); }
        .c-modes { display:flex; gap:2px; }
        .c-mode { padding:4px 10px; border:0; background:none; border-radius:var(--radius);
            color:var(--text-tertiary); font:inherit; font-size:11px; cursor:pointer; }
        .c-mode[data-on="1"] { color:var(--text-primary); font-weight:700; background:var(--bg-tertiary); }
        .c-preview { min-height:110px; padding:10px 12px; border:1px dashed var(--border);
            border-radius:var(--radius); background:var(--bg-primary); }

        /* 서식 있는 글 — 본문·답글·미리보기가 같은 모양을 쓴다. */
        .md { white-space:normal; }
        .md p { margin:0 0 10px; }
        .md p:last-child { margin-bottom:0; }
        .md h3, .md h4, .md h5 { margin:16px 0 8px; color:var(--text-primary); }
        .md h3 { font-size:18px; } .md h4 { font-size:16px; } .md h5 { font-size:14px; }
        .md ul, .md ol { margin:0 0 10px; padding-left:22px; }
        .md li { margin:2px 0; }
        .md blockquote { margin:0 0 10px; padding:6px 12px; border-left:3px solid var(--accent);
            background:var(--bg-tertiary); color:var(--text-secondary); }
        .md code { padding:1px 5px; border-radius:4px; background:var(--bg-tertiary);
            font-family:var(--font-mono, monospace); font-size:.92em; }
        .md pre { margin:0 0 10px; padding:12px 14px; border-radius:var(--radius);
            background:var(--bg-tertiary); overflow-x:auto; }
        .md pre code { padding:0; background:none; }
        .md hr { border:0; border-top:1px solid var(--border); margin:14px 0; }
        .md a { color:var(--accent); }
        .c-signin { display:flex; align-items:center; gap:14px; flex-wrap:wrap; justify-content:space-between;
            padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); margin-bottom:18px; }
        .c-signin p { margin:0; color:var(--text-secondary); font-size:var(--font-size-sm); }

        /* 목록 — 한 줄에 판단 재료가 다 있어야 한다. */
        .c-list { list-style:none; margin:0; padding:0; border-top:1px solid var(--border); }
        .c-row { display:flex; align-items:center; gap:12px; padding:12px 4px; border-bottom:1px solid var(--border); }
        .c-row[data-pinned="1"] { background:var(--accent-dim); }
        .c-votes { flex:0 0 auto; min-width:42px; text-align:center; padding:5px 0; border-radius:var(--radius);
            border:1px solid var(--border); font-size:var(--font-size-xs); color:var(--text-secondary); }
        .c-votes[data-on="1"] { border-color:var(--accent); color:var(--accent); }
        .c-row-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px;
            background:none; border:0; padding:0; text-align:left; cursor:pointer; font:inherit; }
        .c-row-title { font-size:var(--font-size-sm); font-weight:600; color:var(--text-primary);
            display:flex; align-items:center; gap:6px; min-width:0; }
        .c-row-title span.t { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .c-row-main:hover .c-row-title { color:var(--accent); }
        .c-replies-badge { flex:0 0 auto; font-size:11px; color:var(--accent); font-weight:700; }
        .c-row-sub { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-tertiary); }
        .c-face { width:18px; height:18px; border-radius:50%; object-fit:cover; flex:0 0 auto; }
        .c-face-blank { width:18px; height:18px; border-radius:50%; background:var(--bg-tertiary); flex:0 0 auto; }
        .c-dot::before { content:'·'; margin-right:8px; }
        .c-empty-row { padding:32px 4px; color:var(--text-secondary); font-size:var(--font-size-sm); }

        /* 글 하나 */
        .c-crumb { margin-bottom:12px; }
        .c-post { border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); padding:20px; }
        .c-post-title { margin:0; font-size:21px; line-height:1.4; color:var(--text-primary); }
        .c-post-meta { display:flex; align-items:center; gap:8px; margin-top:10px;
            font-size:11px; color:var(--text-tertiary); flex-wrap:wrap; }
        .c-post-body { margin-top:16px; white-space:pre-wrap; word-break:break-word; color:var(--text-primary); }
        .c-actions { display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
        .c-act { padding:7px 14px; border-radius:999px; border:1px solid var(--border); background:transparent;
            color:var(--text-secondary); font:inherit; font-size:var(--font-size-xs); cursor:pointer; }
        .c-act[data-on="1"] { border-color:var(--accent); color:var(--accent); }
        .c-act[disabled] { cursor:default; opacity:.55; }

        .c-section { margin:26px 0 10px; font-size:var(--font-size-sm); color:var(--text-primary); }
        ul.c-replies { list-style:none; margin:0 0 18px; padding:0; display:flex; flex-direction:column; gap:8px; }
        .c-reply { border:1px solid var(--border); border-radius:var(--radius); padding:10px 14px;
            background:var(--bg-secondary); }
        .c-reply[data-child="1"] { margin-left:28px; background:var(--bg-tertiary); }
        .c-reply[data-owner="1"] { border-color:var(--accent); }
        .c-reply-head { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-tertiary); }
        .c-reply-body { margin-top:5px; white-space:pre-wrap; word-break:break-word;
            color:var(--text-primary); font-size:var(--font-size-sm); }
        .c-reply-foot { margin-top:6px; display:flex; gap:10px; }
        .c-linkbtn { background:none; border:none; padding:0; color:var(--text-tertiary); font:inherit;
            font-size:11px; text-decoration:underline; cursor:pointer; }
        .c-linkbtn:hover { color:var(--text-primary); }
        .c-linkbtn[data-on="1"] { color:var(--accent); }

        .c-tag { display:inline-block; padding:1px 8px; border-radius:999px; border:1px solid var(--border);
            font-size:10px; color:var(--text-secondary); vertical-align:middle; }
        .c-empty { padding:48px 0; text-align:center; color:var(--text-secondary); }
        .c-empty h3 { color:var(--text-primary); font-size:18px; margin:0 0 8px; }

        @media (max-width: 620px) {
            .c-row { flex-wrap:wrap; }
            .c-reply[data-child="1"] { margin-left:14px; }
        }
    `);

    const esc = escapeMd;

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

    const preview = plainPreview;

    /** 글쓴이 얼굴. 없으면 빈 동그라미 — 이름만 늘어선 목록은 사람이 안 보인다. */
    function face(handle: string): string {
        const base = window.KarmoAccount?.apiBase ?? '';
        if (!base) return '<span class="c-face-blank"></span>';
        return `<img class="c-face" src="${esc(base)}/kl/u/${encodeURIComponent(handle)}/avatar" alt=""
            onerror="this.outerHTML='<span class=&quot;c-face-blank&quot;></span>'">`;
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

    /* ===== 주소가 정본 — 새로고침·뒤로 가기가 그대로 산다 ===== */

    function param(name: string): string | null {
        return new URLSearchParams(location.search).get(name);
    }
    function currentBoard(): string {
        return param('board') || 'free';
    }
    function currentSort(): 'recent' | 'top' {
        return param('sort') === 'top' ? 'top' : 'recent';
    }

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
    let boards: Board[] = [];
    /** 글쓰기 칸을 펼쳐 두었나 — 다시 그려도 접히지 않게 밖에 둔다. */
    let writerOpen = false;

    function signInBlock(text: string): string {
        return `<div class="c-signin"><p>${text}</p>
            <button type="button" class="btn btn-primary" data-signin>디스코드로 시작하기</button></div>`;
    }

    function wireSignIn(): void {
        host?.querySelectorAll<HTMLButtonElement>('[data-signin]').forEach((b) =>
            b.addEventListener('click', () => window.KarmoAccount?.signIn()),
        );
    }

    /* ===== 목록 ===== */

    function renderBoards(active: string): string {
        return `<div class="c-boards">${boards
            .map(
                (b) => `<button type="button" class="c-board" data-board="${esc(b.id)}" data-on="${b.id === active ? '1' : '0'}"
                    title="${esc(b.desc)}">${esc(b.label)}<span class="c-board-count">${b.count}</span></button>`,
            )
            .join('')}</div>`;
    }

    /* ===== 글쓰기 =====
     *
     * 요즘 작성기가 공통으로 갖는 것을 따랐다 (레퍼런스: GitHub·Discourse 계열 편집기 조사):
     * 서식 단추 · 쓰기/미리보기 · 초안 자동 저장 · 단축키 · 남은 글자 수 · 칸이 글에 맞춰 늘어남.
     * 기억해야 쓸 수 있는 편집기는 안 쓰이므로, 기호를 몰라도 단추로 다 되게 했다.
     */

    /** 초안은 판마다 따로 둔다. 새로고침하거나 실수로 닫아도 쓰던 글이 남는다. */
    function draftKey(board: string): string {
        return `karmolab_community_draft_${board}`;
    }
    function loadDraft(board: string): { title: string; text: string } {
        try {
            const raw = localStorage.getItem(draftKey(board));
            if (!raw) return { title: '', text: '' };
            const parsed = JSON.parse(raw) as { title?: string; text?: string };
            return { title: parsed.title ?? '', text: parsed.text ?? '' };
        } catch {
            return { title: '', text: '' };
        }
    }
    function saveDraft(board: string, draft: { title: string; text: string }): void {
        try {
            if (!draft.title && !draft.text) localStorage.removeItem(draftKey(board));
            else localStorage.setItem(draftKey(board), JSON.stringify(draft));
        } catch {
            /* 저장 공간이 꽉 찼으면 넘긴다 — 글쓰기를 막을 이유는 없다 */
        }
    }

    /** 서식 단추 — [이름, 앞에 붙일 것, 뒤에 붙일 것, 도움말, 단축키] */
    const FORMAT_BUTTONS: Array<[string, string, string, string, string]> = [
        ['굵게', '**', '**', '굵게 (Ctrl+B)', 'b'],
        ['기울임', '*', '*', '기울임 (Ctrl+I)', 'i'],
        ['코드', '`', '`', '코드', ''],
        ['링크', '[', '](주소)', '링크 (Ctrl+K)', 'k'],
        ['인용', '> ', '', '인용', ''],
        ['목록', '- ', '', '목록', ''],
        ['제목', '## ', '', '제목', ''],
    ];

    function composerHtml(data: ListResponse, isRequest: boolean): string {
        const draft = loadDraft(data.board);
        const tools = FORMAT_BUTTONS.map(
            ([label, , , title]) =>
                `<button type="button" class="c-fmt" data-fmt="${esc(label)}" title="${esc(title)}">${esc(label)}</button>`,
        ).join('');

        return `<form class="c-write" data-write>
            ${isRequest ? '' : `<input type="text" name="cTitle" data-title maxlength="${data.titleMaxLength}" placeholder="제목" aria-label="글 제목" value="${esc(draft.title)}" required>`}
            <div class="c-compose-bar">
                <div class="c-fmts">${isRequest ? '' : tools}</div>
                <div class="c-modes">
                    <button type="button" class="c-mode" data-mode="write" data-on="1">쓰기</button>
                    <button type="button" class="c-mode" data-mode="preview" data-on="0">미리보기</button>
                </div>
            </div>
            <textarea name="cText" data-text maxlength="${data.maxLength}" aria-label="${isRequest ? '도구 요청' : '글 본문'}"
                placeholder="${isRequest ? '어떤 도구가 있었으면 하나요?' : '무슨 이야기든. **굵게** *기울임* `코드` > 인용 - 목록'}" required>${esc(draft.text)}</textarea>
            <div class="c-preview md" data-preview hidden></div>
            <div class="c-write-foot">
                <span class="c-write-hint"><span data-count>0</span>/${data.maxLength}${
                    data.myHandle ? ` · @${esc(data.myHandle)} 로 올라갑니다` : ''
                } · Ctrl+Enter 로 올리기</span>
                <span>
                    <button type="button" class="c-act" data-cancel>접기</button>
                    <button type="submit" class="btn btn-primary">올리기</button>
                </span>
            </div>
        </form>`;
    }

    /** 작성기 안의 손놀림 — 서식 단추·미리보기·초안·단축키·칸 높이. */
    function wireComposer(form: HTMLFormElement, board: string, submit: () => void): void {
        const title = form.querySelector<HTMLInputElement>('[data-title]');
        const text = form.querySelector<HTMLTextAreaElement>('[data-text]');
        const previewBox = form.querySelector<HTMLElement>('[data-preview]');
        const counter = form.querySelector<HTMLElement>('[data-count]');
        if (!text) return;

        /** 칸이 글에 맞춰 늘어난다 — 긴 글을 좁은 창으로 들여다보게 하지 않는다. */
        const grow = (): void => {
            text.style.height = 'auto';
            text.style.height = `${Math.min(text.scrollHeight + 2, 520)}px`;
        };
        const sync = (): void => {
            if (counter) counter.textContent = String(text.value.length);
            saveDraft(board, { title: title?.value ?? '', text: text.value });
            grow();
        };
        text.addEventListener('input', sync);
        title?.addEventListener('input', sync);
        sync();

        /** 고른 글자를 기호로 감싼다. 아무것도 안 골랐으면 기호만 넣고 사이에 커서를 둔다. */
        const wrap = (before: string, after: string): void => {
            const start = text.selectionStart ?? 0;
            const end = text.selectionEnd ?? 0;
            const picked = text.value.slice(start, end);
            const lineStart = before.endsWith(' ');
            const insert = lineStart ? `${before}${picked}` : `${before}${picked}${after}`;
            text.setRangeText(insert, start, end, 'end');
            if (!picked && !lineStart) text.setSelectionRange(start + before.length, start + before.length);
            text.focus();
            sync();
        };

        form.querySelectorAll<HTMLButtonElement>('[data-fmt]').forEach((button) => {
            const found = FORMAT_BUTTONS.find(([label]) => label === button.dataset.fmt);
            if (found) button.addEventListener('click', () => wrap(found[1], found[2]));
        });

        form.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const wantPreview = button.dataset.mode === 'preview';
                form.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
                    b.dataset.on = (b.dataset.mode === 'preview') === wantPreview ? '1' : '0';
                });
                if (previewBox) {
                    previewBox.innerHTML = text.value.trim()
                        ? renderMarkdown(text.value)
                        : '<p class="c-write-hint">아직 쓴 글이 없습니다.</p>';
                    previewBox.hidden = !wantPreview;
                }
                text.hidden = wantPreview;
                if (!wantPreview) text.focus();
            });
        });

        text.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                submit();
                return;
            }
            if (!(event.ctrlKey || event.metaKey)) return;
            const shortcut = FORMAT_BUTTONS.find(([, , , , key]) => key && key === event.key.toLowerCase());
            if (shortcut) {
                event.preventDefault();
                wrap(shortcut[1], shortcut[2]);
            }
        });
    }

    function renderList(data: ListResponse): void {
        if (!host) return;
        const isRequest = data.board === 'request';

        const sorts = isRequest
            ? '<span class="c-write-hint">표 많은 순</span>'
            : `<div class="c-sorts">
                   <button type="button" class="c-sort" data-sort="recent" data-on="${data.sort === 'recent' ? '1' : '0'}">최신</button>
                   <button type="button" class="c-sort" data-sort="top" data-on="${data.sort === 'top' ? '1' : '0'}">인기</button>
               </div>`;

        let writer = '';
        if (!data.signedIn) writer = signInBlock('로그인하면 글을 쓰고 답글을 달 수 있습니다.');
        else if (!data.canWrite) writer = '<p class="c-empty-row">이 판은 주인만 씁니다.</p>';
        else if (writerOpen) writer = composerHtml(data, isRequest);

        const rows = data.posts.length
            ? data.posts
                  .map((p) => {
                      const heading = isRequest ? preview(p.text) : (p.title ?? '(제목 없음)');
                      return `<li class="c-row" data-pinned="${p.pinned ? '1' : '0'}">
                          ${isRequest ? `<span class="c-votes" data-on="${p.votedByMe ? '1' : '0'}" title="표">${p.votes}</span>` : ''}
                          <button type="button" class="c-row-main" data-post="${esc(p.id)}">
                              <span class="c-row-title">
                                  ${p.pinned ? '<span class="c-tag">고정</span>' : ''}
                                  <span class="t">${esc(heading)}</span>
                                  ${p.replyCount ? `<span class="c-replies-badge">[${p.replyCount}]</span>` : ''}
                                  ${isRequest && p.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[p.status]}</span>` : ''}
                              </span>
                              <span class="c-row-sub">
                                  ${face(p.authorHandle)}<span>@${esc(p.authorHandle)}</span>
                                  <span class="c-dot">${relativeTime(p.bumpedAt)}</span>
                                  <span class="c-dot">조회 ${p.views}</span>
                                  ${p.likes ? `<span class="c-dot">좋아요 ${p.likes}</span>` : ''}
                              </span>
                          </button>
                      </li>`;
                  })
                  .join('')
            : `<li class="c-empty-row">${isRequest ? '아직 올라온 요청이 없습니다.' : '아직 이 판에 글이 없습니다. 첫 글을 남겨 주세요.'}</li>`;

        const board = boards.find((b) => b.id === data.board);
        host.innerHTML = `<div class="c-wrap">
            <div class="c-head"><h2>커뮤니티</h2><span>${esc(board?.desc ?? '도구를 쓰는 사람들이 모이는 자리')}</span></div>
            ${renderBoards(data.board)}
            <div class="c-bar">${sorts}${
                data.signedIn && data.canWrite && !writerOpen ? '<button type="button" class="c-newbtn" data-new>글쓰기</button>' : '<span></span>'
            }</div>
            ${writer}
            <ul class="c-list">${rows}</ul>
        </div>`;

        wireSignIn();

        host.querySelectorAll<HTMLButtonElement>('[data-board]').forEach((b) =>
            b.addEventListener('click', () => {
                writerOpen = false;
                go({ board: b.dataset.board === 'free' ? null : (b.dataset.board ?? null), sort: null, p: null });
            }),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
            b.addEventListener('click', () => go({ sort: b.dataset.sort === 'top' ? 'top' : null })),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-post]').forEach((b) =>
            b.addEventListener('click', () => go({ p: b.dataset.post ?? null })),
        );
        host.querySelector('[data-new]')?.addEventListener('click', () => {
            writerOpen = true;
            void render();
        });
        host.querySelector('[data-cancel]')?.addEventListener('click', () => {
            writerOpen = false;
            void render();
        });

        const writeForm = host.querySelector<HTMLFormElement>('[data-write]');
        if (writeForm) {
            const send = async (): Promise<void> => {
                const title = writeForm.querySelector<HTMLInputElement>('[data-title]')?.value ?? '';
                const text = writeForm.querySelector<HTMLTextAreaElement>('[data-text]')?.value ?? '';
                if (!text.trim()) {
                    Toolbox.showToast?.('내용을 적어 주세요.');
                    return;
                }
                const button = writeForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                if (button) button.disabled = true;
                const created = (await api('/kl/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ board: data.board, title, text }),
                })) as { id?: string } | null;
                if (button) button.disabled = false;
                if (!created?.id) {
                    // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
                    Toolbox.showToast?.('못 올렸어요. 하루에 올릴 수 있는 개수를 넘었거나, 잠시 연결이 끊겼습니다.');
                    return;
                }
                // 올라갔으니 초안은 지운다. 안 지우면 다음에 열 때 이미 올린 글이 또 들어 있다.
                saveDraft(data.board, { title: '', text: '' });
                writerOpen = false;
                // 방금 쓴 글로 바로 들어간다 — 올리고 목록만 보면 내 글이 어디 갔나 찾게 된다.
                go({ p: created.id });
            };
            writeForm.addEventListener('submit', (event) => {
                event.preventDefault();
                void send();
            });
            wireComposer(writeForm, data.board, () => void send());
        }
    }

    /* ===== 글 하나 ===== */

    function renderReply(reply: Reply, data: DetailResponse): string {
        const canDelete = data.isAdmin || (data.myHandle !== null && data.myHandle === reply.authorHandle);
        return `<li class="c-reply" data-child="${reply.parentId ? '1' : '0'}" data-owner="${reply.byOwner ? '1' : '0'}">
            <div class="c-reply-head">${face(reply.authorHandle)}<span>@${esc(reply.authorHandle)}</span>
                ${reply.byOwner ? '<span class="c-tag">주인</span>' : ''}<span class="c-dot">${relativeTime(reply.createdAt)}</span></div>
            <div class="c-reply-body md">${renderMarkdown(reply.text)}</div>
            <div class="c-reply-foot">
                <button type="button" class="c-linkbtn" data-reply-like="${esc(reply.id)}" data-on="${reply.likedByMe ? '1' : '0'}"
                    ${data.signedIn ? '' : 'disabled'}>좋아요${reply.likes ? ` ${reply.likes}` : ''}</button>
                ${data.signedIn && !reply.parentId ? `<button type="button" class="c-linkbtn" data-reply-to="${esc(reply.id)}">답글</button>` : ''}
                ${canDelete ? `<button type="button" class="c-linkbtn" data-reply-del="${esc(reply.id)}">지우기</button>` : ''}
            </div>
        </li>`;
    }

    /** 답글을 부모-자식 순으로 편다. 한 단만 접히므로 이 정렬이면 화면 순서가 곧 대화 순서다. */
    function orderReplies(replies: Reply[]): Reply[] {
        const tops = replies.filter((r) => !r.parentId);
        const out: Reply[] = [];
        for (const top of tops) {
            out.push(top);
            out.push(...replies.filter((r) => r.parentId === top.id));
        }
        // 부모가 지워졌는데 남은 것이 있으면 뒤에 붙인다 (안 보이는 글이 생기지 않게).
        for (const r of replies) if (!out.includes(r)) out.push(r);
        return out;
    }

    function renderDetail(data: DetailResponse): void {
        if (!host) return;
        const post = data.post;
        const isRequest = post.board === 'request';
        const canDelete = data.isAdmin || post.mine;
        const board = boards.find((b) => b.id === post.board);

        const replies = post.replies.length
            ? orderReplies(post.replies)
                  .map((r) => renderReply(r, data))
                  .join('')
            : '<li class="c-empty-row">아직 답글이 없습니다.</li>';

        const replyForm = data.signedIn
            ? `<form class="c-write" data-reply-form>
                   <textarea name="cReply" data-reply-text maxlength="${data.replyMaxLength}" placeholder="답글 달기" aria-label="답글" required></textarea>
                   <div class="c-write-foot"><span class="c-write-hint" data-reply-target></span>
                       <button type="submit" class="btn btn-primary">답글</button></div>
               </form>`
            : signInBlock('로그인하면 답글을 달 수 있습니다.');

        host.innerHTML = `<div class="c-wrap">
            <div class="c-crumb"><button type="button" class="c-linkbtn" data-back>← ${esc(board?.label ?? '목록')}</button></div>
            <article class="c-post">
                <h2 class="c-post-title">${esc(post.title ?? preview(post.text, 60))}
                    ${isRequest && post.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[post.status]}</span>` : ''}
                    ${post.pinned ? '<span class="c-tag">고정</span>' : ''}</h2>
                <div class="c-post-meta">${face(post.authorHandle)}<span>@${esc(post.authorHandle)}</span>
                    <span class="c-dot">${relativeTime(post.createdAt)}</span>
                    <span class="c-dot">조회 ${post.views}</span></div>
                ${post.title ? `<div class="c-post-body md">${renderMarkdown(post.text)}</div>` : `<div class="c-post-body md">${renderMarkdown(post.text)}</div>`}
                <div class="c-actions">
                    <button type="button" class="c-act" data-like data-on="${post.likedByMe ? '1' : '0'}" ${data.signedIn ? '' : 'disabled'}>
                        좋아요 ${post.likes}</button>
                    ${isRequest ? `<button type="button" class="c-act" data-vote data-on="${post.votedByMe ? '1' : '0'}" ${data.signedIn ? '' : 'disabled'}>표 ${post.votes}</button>` : ''}
                    ${canDelete ? '<button type="button" class="c-act" data-delete>지우기</button>' : ''}
                    ${data.isAdmin ? `<button type="button" class="c-act" data-pin>${post.pinned ? '고정 풀기' : '고정'}</button>` : ''}
                    ${data.isAdmin && isRequest ? '<button type="button" class="c-act" data-plan>만들 예정</button><button type="button" class="c-act" data-done>만들었음</button>' : ''}
                </div>
            </article>
            <h3 class="c-section">답글 ${post.replyCount}</h3>
            <ul class="c-replies">${replies}</ul>
            ${replyForm}
        </div>`;

        wireSignIn();

        const reload = (): void => {
            void render();
        };

        /**
         * 누르면 **그 자리에서 바로** 바뀐다. 서버 확인은 뒤에서 한다.
         *
         * 좋아요 같은 것은 눌렀는데 반응이 없으면 두 번 누르게 된다. 그래서 숫자와 눌림 표시를
         * 먼저 바꾸고 요청을 보낸다. 실패하면 되돌리고 그때만 알린다 — 잘 되는 흔한 경우에
         * 아무 소리도 안 나는 것이 맞다.
         */
        const optimisticToggle = async (button: HTMLElement, path: string, label: (n: number) => string): Promise<void> => {
            const wasOn = button.dataset.on === '1';
            const shown = Number(/\d+/.exec(button.textContent ?? '')?.[0] ?? '0');
            const next = wasOn ? shown - 1 : shown + 1;
            button.dataset.on = wasOn ? '0' : '1';
            button.textContent = label(next);

            const ok = await api(path, { method: 'POST' });
            if (ok) return;
            button.dataset.on = wasOn ? '1' : '0';
            button.textContent = label(shown);
            Toolbox.showToast?.('지금은 안 되네요. 잠시 뒤에 다시 눌러 주세요.');
        };

        const act = async (path: string, method = 'POST'): Promise<void> => {
            const ok = await api(path, { method });
            if (!ok) {
                Toolbox.showToast?.('지금은 안 되네요. 잠시 뒤에 다시 눌러 주세요.');
                return;
            }
            reload();
        };

        host.querySelector('[data-back]')?.addEventListener('click', () =>
            go({ p: null, board: post.board === 'free' ? null : post.board }),
        );
        const likeBtn = host.querySelector<HTMLElement>('[data-like]');
        likeBtn?.addEventListener('click', () =>
            void optimisticToggle(likeBtn, `/kl/posts/${encodeURIComponent(post.id)}/like`, (n) => `좋아요 ${n}`),
        );
        const voteBtn = host.querySelector<HTMLElement>('[data-vote]');
        voteBtn?.addEventListener('click', () =>
            void optimisticToggle(voteBtn, `/kl/posts/${encodeURIComponent(post.id)}/vote`, (n) => `표 ${n}`),
        );
        host.querySelector('[data-pin]')?.addEventListener('click', async () => {
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinned: !post.pinned }),
            });
            if (!ok) Toolbox.showToast?.('못 바꿨어요.');
            else reload();
        });
        const setStatus = async (status: string): Promise<void> => {
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!ok) Toolbox.showToast?.('못 바꿨어요.');
            else reload();
        };
        host.querySelector('[data-plan]')?.addEventListener('click', () => void setStatus('planned'));
        host.querySelector('[data-done]')?.addEventListener('click', () => void setStatus('done'));

        host.querySelector('[data-delete]')?.addEventListener('click', async () => {
            if (!confirm('이 글을 지웁니다. 계속할까요?')) return;
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
            if (!ok) {
                Toolbox.showToast?.('못 지웠어요.');
                return;
            }
            go({ p: null, board: post.board === 'free' ? null : post.board });
        });

        host.querySelectorAll<HTMLButtonElement>('[data-reply-like]').forEach((b) =>
            b.addEventListener('click', () =>
                void optimisticToggle(
                    b,
                    `/kl/posts/${encodeURIComponent(post.id)}/replies/${encodeURIComponent(b.dataset.replyLike ?? '')}/like`,
                    (n) => (n > 0 ? `좋아요 ${n}` : '좋아요'),
                ),
            ),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-reply-del]').forEach((b) =>
            b.addEventListener('click', async () => {
                if (!confirm('이 답글을 지웁니다. 계속할까요?')) return;
                await act(`/kl/posts/${encodeURIComponent(post.id)}/replies/${encodeURIComponent(b.dataset.replyDel ?? '')}`, 'DELETE');
            }),
        );

        // 「답글」을 누르면 아래 입력칸이 그 답글에 달리는 답글이 된다.
        let replyTo: string | null = null;
        const target = host.querySelector<HTMLElement>('[data-reply-target]');
        const textarea = host.querySelector<HTMLTextAreaElement>('[data-reply-text]');
        host.querySelectorAll<HTMLButtonElement>('[data-reply-to]').forEach((b) =>
            b.addEventListener('click', () => {
                replyTo = b.dataset.replyTo ?? null;
                if (target) target.textContent = '답글에 답글을 답니다 · 취소하려면 다시 누르세요';
                textarea?.focus();
            }),
        );

        // 답글도 Ctrl+Enter 로 보낸다 — 짧은 말을 쓰려고 마우스를 잡게 하지 않는다.
        textarea?.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                host?.querySelector<HTMLFormElement>('[data-reply-form]')?.requestSubmit();
            }
        });

        host.querySelector<HTMLFormElement>('[data-reply-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const text = (textarea?.value ?? '').trim();
            if (!text) return;
            const button = (event.currentTarget as HTMLFormElement).querySelector('button') as HTMLButtonElement | null;
            if (button) button.disabled = true;
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, parentId: replyTo }),
            });
            if (button) button.disabled = false;
            if (!ok) {
                Toolbox.showToast?.('답글을 못 달았어요.');
                return;
            }
            reload();
        });
    }

    /**
     * 화면을 다시 그린다.
     *
     * **지우고 시작하지 않는다.** 예전에는 누를 때마다 「불러오는 중」으로 비웠다가 다시 채워서
     * 화면이 번쩍였다 (사용자: "뭐 누를떄 마다 '불러오는 중' 하고 ui 깜빡이는거 마음에 안들어").
     * 이미 뭔가 그려져 있으면 그대로 두고, 새 내용이 준비됐을 때 한 번에 갈아 끼운다.
     * 「불러오는 중」은 **아무것도 없는 첫 순간에만** 나온다.
     */
    async function render(): Promise<void> {
        if (!host) return;
        if (host.childElementCount === 0) host.innerHTML = '<p class="c-empty-row">불러오는 중…</p>';

        if (boards.length === 0) {
            const raw = (await api('/kl/boards')) as { boards?: Board[] } | null;
            if (!raw?.boards) {
                // 서버가 죽은 것과 「아무 글도 없다」는 다르다. 섞어서 말하지 않는다.
                host.innerHTML = `<div class="c-empty"><h3>지금은 커뮤니티를 못 여네요</h3>
                    <p>잠시 뒤에 다시 열어 주세요. 도구는 그대로 쓸 수 있습니다.</p></div>`;
                return;
            }
            boards = raw.boards;
        }

        const postId = param('p');
        if (postId) {
            const raw = await api(`/kl/posts/${encodeURIComponent(postId)}`);
            if (!raw) {
                host.innerHTML = `<div class="c-empty"><h3>그 글을 못 찾았어요</h3>
                    <p>지워졌거나, 잠시 연결이 끊겼습니다.</p></div>`;
                return;
            }
            renderDetail(raw as DetailResponse);
            return;
        }

        // 목록과 판 숫자를 **같이** 받는다. 하나씩 기다리면 그만큼 화면이 늦게 바뀐다.
        const [raw, freshBoards] = await Promise.all([
            api(`/kl/posts?board=${encodeURIComponent(currentBoard())}&sort=${currentSort()}`),
            api('/kl/boards') as Promise<{ boards?: Board[] } | null>,
        ]);
        if (!raw) {
            host.innerHTML = `<div class="c-empty"><h3>지금은 커뮤니티를 못 여네요</h3>
                <p>잠시 뒤에 다시 열어 주세요.</p></div>`;
            return;
        }
        if (freshBoards?.boards) boards = freshBoards.boards;
        renderList(raw as ListResponse);
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
        desc: '자유 · 질문 · 자랑 · 도구 요청 — 도구를 쓰는 사람들이 모이는 자리',
        // 넓게 쓰고 위젯 제목 카드는 안 그린다 — 앱의 일원이되 화면은 커뮤니티 제 구조다.
        layout: 'wide',
        noHero: true,
        icon: '<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M8 9.5h8M8 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
        tabs: [{ id: 'community-main', label: '커뮤니티', build }],
    });
})();
