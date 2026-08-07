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
        /** 마지막 글 제목·시각 — 갤러리가 살아 있는지 보여 주는 값. */
        lastTitle: string | null;
        lastAt: string | null;
        builtin: boolean;
        createdByHandle: string | null;
        voteStyle: boolean;
        ownerOnly: boolean;
        titled: boolean;
        canDelete: boolean;
        tags: string[];
    }

    interface BoardsResponse {
        boards: Board[];
        signedIn: boolean;
        labelMaxLength: number;
        descMaxLength: number;
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
        tag: string | null;
        replies: Reply[];
        votedByMe: boolean;
        likedByMe: boolean;
        mine: boolean;
    }

    interface ListResponse {
        board: string;
        gallery: Board;
        tag: string | null;
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
        /* 커뮤니티는 **글을 읽는 곳**이다. 넓은 화면에는 판이 없어 관측실 무늬가 글 뒤로 그대로
           비쳤다 — 예쁘지만 안 읽힌다. 그렇다고 불투명한 상자를 얹으면 이 사이트 같지가 않다.
           그래서 유리처럼 깐다: 무늬는 흐릿하게 남고 글은 또렷하다. */
        .c-wrap { display:flex; flex-direction:column; position:relative;
            max-width:940px; margin:0 auto; padding:20px 22px 26px;
            background:color-mix(in srgb, var(--bg-primary) 62%, transparent);
            backdrop-filter:blur(14px) saturate(1.15); -webkit-backdrop-filter:blur(14px) saturate(1.15);
            border:1px solid var(--border); border-radius:var(--radius-lg); }
        /* 유리를 못 그리는 브라우저에서는 그냥 불투명하게 — 안 읽히는 것보다 낫다. */
        @supports not (backdrop-filter: blur(1px)) { .c-wrap { background:var(--bg-primary); } }
        @media (max-width: 620px) { .c-wrap { padding:14px 12px 20px; border-radius:0; border-left:0; border-right:0; } }

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

        /* 커뮤니티 홈 — 아카의 「베스트 라이브」 자리를 본떴다. 갤러리 목록만 있으면 「지금 뭐가
           오가나」가 안 보이고, 사람은 빈 곳으로 읽는다. 반응이 모인 글과 새 글을 먼저 보여 준다. */
        .c-feeds { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:14px; margin-bottom:22px; }
        .c-feed h3 { margin:0 0 8px; font-size:var(--font-size-xs); color:var(--text-secondary); font-weight:700; }
        .c-feed-rows { border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); overflow:hidden; }
        .c-feed-row { display:flex; align-items:center; gap:7px; width:100%; padding:8px 12px;
            background:none; border:0; border-top:1px solid var(--border); cursor:pointer; font:inherit;
            text-align:left; font-size:var(--font-size-xs); }
        .c-feed-row:first-child { border-top:0; }
        .c-feed-row:hover { background:var(--bg-tertiary); }
        .c-feed-gal { flex:0 0 auto; padding:1px 7px; border-radius:999px; background:var(--accent-dim);
            color:var(--accent); font-size:10px; }
        .c-feed-tag { flex:0 0 auto; font-size:10px; color:var(--text-tertiary); }
        .c-feed-title { flex:1; min-width:0; color:var(--text-primary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .c-feed-row:hover .c-feed-title { color:var(--accent); }
        .c-feed-meta { flex:0 0 auto; font-size:10px; color:var(--text-tertiary); }
        .c-feed-empty { margin:0; padding:18px 12px; font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .c-gal-title { margin:0; font-size:var(--font-size-xs); color:var(--text-secondary); font-weight:700; }

        /* 말머리 — 갤러리 안에서 글을 한 번 더 가른다 (디시·아카의 말머리). */
        .c-tags { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px; }
        .c-tagchip { padding:4px 10px; border-radius:var(--radius); border:1px solid var(--border);
            background:transparent; color:var(--text-tertiary); font:inherit; font-size:11px; cursor:pointer; }
        .c-tagchip:hover { color:var(--text-primary); }
        .c-tagchip[data-on="1"] { border-color:var(--accent); color:var(--accent); }
        .c-headword { flex:0 0 auto; color:var(--text-tertiary); font-size:11px; }
        .c-write select { padding:8px 10px; border-radius:var(--radius); border:1px solid var(--border);
            background:var(--bg-primary); color:var(--text-primary); font:inherit; }

        /* 갤러리 목록 — 어느 갤러리가 살아 있나. 글 수만으로는 모른다, 마지막 글이 있어야 안다. */
        .c-galleries { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px; }
        .c-gal { display:flex; flex-direction:column; gap:4px; padding:14px 16px; text-align:left;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary);
            cursor:pointer; font:inherit; }
        .c-gal:hover { border-color:var(--accent); }
        .c-gal-name { display:flex; align-items:baseline; gap:8px; }
        .c-gal-name b { font-size:var(--font-size-sm); color:var(--text-primary); }
        .c-gal-name em { font-style:normal; font-family:monospace; font-size:11px; color:var(--text-tertiary); }
        .c-gal-desc { font-size:11px; color:var(--text-tertiary); }
        .c-gal-last { margin-top:6px; padding-top:6px; border-top:1px solid var(--border);
            font-size:11px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .c-gal-quiet { color:var(--text-tertiary); }
        .c-gal-wrap { position:relative; }
        .c-gal-wrap .c-gal { width:100%; }
        .c-gal-del { position:absolute; top:8px; right:8px; width:20px; height:20px; line-height:1;
            border:1px solid var(--border); border-radius:50%; background:var(--bg-primary);
            color:var(--text-tertiary); cursor:pointer; font-size:12px; }
        .c-gal-del:hover { color:var(--accent); border-color:var(--accent); }

        /* 갤러리 안 — 여기가 어딘지가 제일 크게 보여야 한다. */
        .c-gal-head { margin-bottom:14px; }
        .c-gal-head h2 { margin:6px 0 2px; font-size:24px; color:var(--text-primary); }
        .c-gal-head p { margin:0; font-size:var(--font-size-xs); color:var(--text-secondary); }

        /* 목록 — 국내 게시판(디시·아카) 골격: 번호·제목·글쓴이·날짜·조회·추천이 한 줄에 선다.
           조밀해야 한 화면에 많이 들어오고, 그래야 「사람이 오가는 곳」으로 읽힌다. */
        .c-table { width:100%; border-collapse:collapse; font-size:var(--font-size-xs); }
        .c-table thead th { padding:7px 6px; border-top:2px solid var(--text-tertiary);
            border-bottom:1px solid var(--border); color:var(--text-tertiary); font-weight:600;
            font-size:11px; text-align:center; white-space:nowrap; }
        .c-table thead th.c-th-title { text-align:left; padding-left:10px; }
        .c-table tbody td { padding:6px; border-bottom:1px solid var(--border);
            color:var(--text-secondary); text-align:center; white-space:nowrap; }
        .c-table tbody tr:hover td { background:var(--bg-secondary); }
        .c-table tr[data-pinned="1"] td { background:var(--accent-dim); }
        .c-num { width:52px; font-family:monospace; font-size:11px; color:var(--text-tertiary); }
        .c-td-title { text-align:left !important; width:auto; padding-left:10px !important; max-width:0; }
        .c-title-btn { background:none; border:0; padding:0; font:inherit; cursor:pointer;
            color:var(--text-primary); display:flex; align-items:center; gap:6px; width:100%; min-width:0; }
        .c-title-btn:hover .t { color:var(--accent); text-decoration:underline; }
        .c-title-btn .t { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .c-cmt { flex:0 0 auto; color:var(--accent); font-weight:700; font-size:11px; }
        .c-who { width:130px; }
        .c-who span { display:inline-flex; align-items:center; gap:5px; max-width:100%; }
        .c-who b { font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .c-when { width:66px; font-size:11px; color:var(--text-tertiary); }
        .c-cnt { width:52px; font-family:monospace; font-size:11px; }
        .c-cnt[data-hot="1"] { color:var(--accent); font-weight:700; }
        .c-face { width:16px; height:16px; border-radius:50%; object-fit:cover; flex:0 0 auto; }
        .c-face-blank { width:16px; height:16px; border-radius:50%; background:var(--bg-tertiary); flex:0 0 auto; display:inline-block; }
        .c-empty-row { padding:32px 4px; color:var(--text-secondary); font-size:var(--font-size-sm); text-align:center; }

        /* 아래 줄 — 검색과 페이지. */
        .c-foot { display:flex; align-items:center; justify-content:space-between; gap:10px;
            margin-top:14px; flex-wrap:wrap; }
        .c-pages { display:flex; gap:2px; }
        .c-page { min-width:26px; padding:4px 7px; border:1px solid var(--border); border-radius:var(--radius);
            background:transparent; color:var(--text-secondary); font:inherit; font-size:11px; cursor:pointer; }
        .c-page[data-on="1"] { border-color:var(--accent); color:var(--accent); font-weight:700; }
        .c-page[disabled] { opacity:.4; cursor:default; }
        .c-search { display:flex; gap:6px; }
        .c-search input { padding:5px 10px; border-radius:var(--radius); border:1px solid var(--border);
            background:var(--bg-secondary); color:var(--text-primary); font:inherit; font-size:11px; width:150px; }

        @media (max-width: 620px) {
            .c-num, .c-when, .c-cnt { display:none; }
            .c-who { width:96px; }
        }

        /* 글 하나 */
        .c-crumb { margin-bottom:12px; }
        .c-post { border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); padding:20px; }
        .c-post-title { margin:0; font-size:21px; line-height:1.4; color:var(--text-primary); }
        .c-dot::before { content:'·'; margin-right:8px; }
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
        .c-empty p { margin:4px 0; }
        .c-err-actions { margin:18px 0 10px; }
        .c-err-detail { margin-top:10px; font-size:11px; color:var(--text-tertiary); }
        .c-err-detail summary { cursor:pointer; }
        .c-err-detail code { display:block; margin:8px auto 6px; padding:8px 10px; max-width:520px;
            background:var(--bg-tertiary); border-radius:var(--radius); word-break:break-all; text-align:left; }

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

    /**
     * 마지막으로 실패한 부름.
     *
     * 「안 돼요」만 보여 주면 사용자도 나도 못 고친다 (레퍼런스: 오류 메시지는 *무엇이·왜·이제
     * 무엇을* 을 줘야 한다). 그래서 실패할 때마다 그 자리에서 무슨 일이 있었는지 붙잡아 두고,
     * 화면이 그것을 사람 말로 풀어서 보여 준다. 기술 정보는 접어 두되 **버리지는 않는다** —
     * 요청 번호 하나면 서버 로그에서 그 요청을 바로 집을 수 있다.
     */
    interface Failure {
        kind: 'offline' | 'unreachable' | 'server' | 'auth' | 'notfound' | 'ratelimit' | 'bad';
        status: number;
        code: string;
        requestId: string;
        path: string;
        at: string;
    }
    let lastFailure: Failure | null = null;

    function classify(status: number): Failure['kind'] {
        if (status === 0) return navigator.onLine === false ? 'offline' : 'unreachable';
        if (status === 401 || status === 403) return 'auth';
        if (status === 404) return 'notfound';
        if (status === 429) return 'ratelimit';
        if (status >= 500) return 'server';
        return 'bad';
    }

    async function api(path: string, init: RequestInit = {}): Promise<unknown | null> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) {
            lastFailure = { kind: 'unreachable', status: 0, code: 'no_api_base', requestId: '-', path, at: new Date().toISOString() };
            return null;
        }
        try {
            const response = await fetch(`${base}${path}`, { ...init, credentials: 'include' });
            if (!response.ok) {
                let code = `http_${response.status}`;
                try {
                    const body = (await response.clone().json()) as { error?: string };
                    if (body.error) code = body.error;
                } catch {
                    /* 몸통이 JSON 이 아니면 상태 코드만 쓴다 */
                }
                lastFailure = {
                    kind: classify(response.status),
                    status: response.status,
                    code,
                    requestId: response.headers.get('X-KL-Request-Id') ?? '-',
                    path,
                    at: new Date().toISOString(),
                };
                return null;
            }
            lastFailure = null;
            return await response.json();
        } catch {
            // 여기까지 오면 답 자체를 못 받았다 — 서버가 죽었거나, 터널이 끊겼거나, 내가 오프라인.
            lastFailure = {
                kind: navigator.onLine === false ? 'offline' : 'unreachable',
                status: 0,
                code: 'fetch_failed',
                requestId: '-',
                path,
                at: new Date().toISOString(),
            };
            return null;
        }
    }

    /** 무엇이 · 왜 · 이제 무엇을. 종류마다 다르게 말한다 — 「안 돼요」 하나로 뭉치지 않는다. */
    const FAILURE_TEXT: Record<Failure['kind'], { title: string; why: string; todo: string }> = {
        offline: {
            title: '인터넷이 끊겨 있어요',
            why: '이 컴퓨터가 지금 네트워크에 연결돼 있지 않습니다.',
            todo: '연결을 확인한 뒤 다시 시도해 주세요.',
        },
        unreachable: {
            title: '커뮤니티 서버에 못 닿았어요',
            why: '커뮤니티는 집에 있는 작은 서버가 돌립니다. 그 서버가 꺼져 있거나 재시작 중일 수 있어요.',
            todo: '잠시 뒤에 다시 시도해 주세요. 도구는 서버 없이도 그대로 씁니다.',
        },
        server: {
            title: '서버가 이 요청을 처리하다 넘어졌어요',
            why: '서버 쪽 문제입니다. 잘못 누른 것이 아닙니다.',
            todo: '다시 시도해 보고, 계속 그러면 아래 요청 번호를 알려 주세요.',
        },
        auth: {
            title: '이 일을 할 권한이 없어요',
            why: '로그인이 풀렸거나, 주인만 할 수 있는 일입니다.',
            todo: '오른쪽 위에서 다시 로그인한 뒤 시도해 주세요.',
        },
        notfound: {
            title: '그건 여기 없어요',
            why: '지워졌거나 주소가 바뀐 것 같습니다.',
            todo: '갤러리 목록에서 다시 찾아 주세요.',
        },
        ratelimit: {
            title: '오늘 올릴 수 있는 만큼 다 썼어요',
            why: '도배를 막으려고 하루에 올릴 수 있는 개수를 정해 뒀습니다.',
            todo: '내일 다시 올리거나, 이미 올린 글에 이어서 써 주세요.',
        },
        bad: {
            title: '요청이 받아들여지지 않았어요',
            why: '보낸 내용이 서버가 받는 모양과 맞지 않습니다.',
            todo: '내용을 조금 고쳐서 다시 시도해 주세요.',
        },
    };

    /** 오류 화면 — 다시 시도 단추가 있고, 기술 정보는 접어 두되 버리지 않는다. */
    function failureHtml(fallbackTitle: string): string {
        const failure = lastFailure ?? {
            kind: 'unreachable' as const,
            status: 0,
            code: 'unknown',
            requestId: '-',
            path: '-',
            at: new Date().toISOString(),
        };
        const text = FAILURE_TEXT[failure.kind];
        const stamp = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            dateStyle: 'short',
            timeStyle: 'medium',
        }).format(new Date(failure.at));
        const detail = `${failure.code} · HTTP ${failure.status || '연결 실패'} · 요청 ${failure.requestId} · ${failure.path} · ${stamp} (KST)`;

        return `<div class="c-empty">
            <h3>${esc(text.title || fallbackTitle)}</h3>
            <p>${esc(text.why)}</p>
            <p>${esc(text.todo)}</p>
            <div class="c-err-actions">
                <button type="button" class="c-newbtn" data-retry>다시 시도</button>
            </div>
            <details class="c-err-detail">
                <summary>자세히 (알려 주실 때 이 줄을 복사해 주세요)</summary>
                <code data-errline>${esc(detail)}</code>
                <button type="button" class="c-linkbtn" data-copy-err>복사</button>
            </details>
        </div>`;
    }

    /** 오류 화면의 단추 배선. 그린 직후에 부른다. */
    function wireFailure(): void {
        host?.querySelector('[data-retry]')?.addEventListener('click', () => void render());
        host?.querySelector('[data-copy-err]')?.addEventListener('click', () => {
            const line = host?.querySelector('[data-errline]')?.textContent ?? '';
            void navigator.clipboard?.writeText(line).then(
                () => Toolbox.showToast?.('복사했어요'),
                () => Toolbox.showToast?.('복사가 안 되네요 — 글자를 직접 긁어 주세요'),
            );
        });
    }

    /** 커뮤니티를 못 여는 화면. 서버가 죽은 것과 「아무 글도 없다」는 다르다 — 섞어서 말하지 않는다. */
    function offline(): void {
        if (!host) return;
        host.innerHTML = `<div class="c-wrap">${failureHtml('지금은 커뮤니티를 못 여네요')}</div>`;
        wireFailure();
    }

    /** 짧은 알림에도 까닭을 한 마디 붙인다 — 「안 돼요」만으로는 다시 눌러야 할지도 모른다. */
    function toastFor(prefix: string): string {
        if (!lastFailure) return `${prefix}. 잠시 뒤에 다시 시도해 주세요.`;
        const text = FAILURE_TEXT[lastFailure.kind];
        return `${prefix} — ${text.todo} (${lastFailure.code}·${lastFailure.requestId})`;
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

    /**
     * 갤러리 목록 — 커뮤니티의 첫 화면.
     *
     * 디시·아카가 그렇듯 **갤러리를 고르고 들어가는 것**이 커뮤니티의 첫 동작이다.
     * 글 목록부터 들이밀면 「어디에 뭐가 있는지」를 영영 모른다.
     */
    /** 갤러리 만들기 칸을 펼쳐 두었나. */
    let galleryFormOpen = false;
    let boardsMeta: { signedIn: boolean; labelMaxLength: number; descMaxLength: number } = {
        signedIn: false,
        labelMaxLength: 20,
        descMaxLength: 60,
    };

    let bestFeed: Post[] = [];
    let recentFeed: Post[] = [];

    function renderGalleryHome(): void {
        if (!host) return;
        const cards = boards
            .map(
                (b) => `<div class="c-gal-wrap">
                    <button type="button" class="c-gal" data-gal="${esc(b.id)}">
                        <span class="c-gal-name"><b>${esc(b.label)}</b><em>${b.count}</em>${
                            b.builtin ? '' : '<span class="c-tag">사용자</span>'
                        }</span>
                        <span class="c-gal-desc">${esc(b.desc || (b.createdByHandle ? `@${b.createdByHandle} 가 만듦` : ''))}</span>
                        <span class="c-gal-last ${b.lastTitle ? '' : 'c-gal-quiet'}">${
                            b.lastTitle ? `${esc(plainPreview(b.lastTitle, 28))} · ${relativeTime(b.lastAt ?? '')}` : '아직 글이 없습니다'
                        }</span>
                    </button>
                    ${b.canDelete ? `<button type="button" class="c-gal-del" data-gal-del="${esc(b.id)}" title="빈 갤러리 지우기">×</button>` : ''}
                </div>`,
            )
            .join('');

        const maker = !boardsMeta.signedIn
            ? signInBlock('로그인하면 갤러리를 만들 수 있습니다.')
            : galleryFormOpen
              ? `<form class="c-write" data-gal-form>
                     <input type="text" name="galLabel" data-gal-label maxlength="${boardsMeta.labelMaxLength}"
                         placeholder="갤러리 이름 (예: 도구 이야기)" aria-label="갤러리 이름" required>
                     <input type="text" name="galDesc" data-gal-desc maxlength="${boardsMeta.descMaxLength}"
                         placeholder="한 줄 설명 (없어도 됩니다)" aria-label="갤러리 설명">
                     <input type="text" name="galId" data-gal-id maxlength="21"
                         placeholder="주소 (영소문자·숫자·붙임표. 비우면 이름에서 만듭니다)" aria-label="갤러리 주소">
                     <div class="c-write-foot">
                         <span class="c-write-hint">만들면 누구나 글을 쓸 수 있습니다 · 빈 갤러리는 다시 지울 수 있어요</span>
                         <span>
                             <button type="button" class="c-act" data-gal-cancel>접기</button>
                             <button type="submit" class="btn btn-primary">만들기</button>
                         </span>
                     </div>
                 </form>`
              : '';

        const feedRows = (posts: Post[], empty: string): string =>
            posts.length
                ? posts
                      .map((p) => {
                          const gal = boards.find((b) => b.id === p.board);
                          const heading = p.title ?? plainPreview(p.text, 44);
                          return `<button type="button" class="c-feed-row" data-feed-post="${esc(p.id)}" data-feed-board="${esc(p.board)}">
                              <span class="c-feed-gal">${esc(gal?.label ?? p.board)}</span>
                              ${p.tag ? `<span class="c-feed-tag">${esc(p.tag)}</span>` : ''}
                              <span class="c-feed-title">${esc(heading)}</span>
                              ${p.replyCount ? `<span class="c-cmt">[${p.replyCount}]</span>` : ''}
                              <span class="c-feed-meta">${p.likes ? `♥ ${p.likes} · ` : ''}${relativeTime(p.bumpedAt)}</span>
                          </button>`;
                      })
                      .join('')
                : `<p class="c-feed-empty">${esc(empty)}</p>`;

        host.innerHTML = `<div class="c-wrap">
            <div class="c-head"><h2>커뮤니티</h2><span>도구를 쓰는 사람들이 모이는 자리</span></div>
            <div class="c-feeds">
                <section class="c-feed">
                    <h3>베스트</h3>
                    <div class="c-feed-rows">${feedRows(bestFeed, '아직 반응이 모인 글이 없습니다.')}</div>
                </section>
                <section class="c-feed">
                    <h3>새 글</h3>
                    <div class="c-feed-rows">${feedRows(recentFeed, '아직 글이 없습니다.')}</div>
                </section>
            </div>
            <div class="c-bar"><h3 class="c-gal-title">갤러리 ${boards.length}</h3>${
                boardsMeta.signedIn && !galleryFormOpen ? '<button type="button" class="c-newbtn" data-gal-new>갤러리 만들기</button>' : '<span></span>'
            }</div>
            ${maker}
            <div class="c-galleries">${cards}</div>
        </div>`;

        wireSignIn();

        host.querySelectorAll<HTMLButtonElement>('[data-gal]').forEach((b) =>
            b.addEventListener('click', () => go({ board: b.dataset.gal ?? null, p: null, page: null, q: null, tag: null })),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-feed-post]').forEach((b) =>
            b.addEventListener('click', () =>
                go({ board: b.dataset.feedBoard ?? null, p: b.dataset.feedPost ?? null, page: null, q: null }),
            ),
        );
        host.querySelector('[data-gal-new]')?.addEventListener('click', () => {
            galleryFormOpen = true;
            void render();
        });
        host.querySelector('[data-gal-cancel]')?.addEventListener('click', () => {
            galleryFormOpen = false;
            void render();
        });

        host.querySelectorAll<HTMLButtonElement>('[data-gal-del]').forEach((b) =>
            b.addEventListener('click', async () => {
                if (!confirm('이 갤러리를 지웁니다. 계속할까요?')) return;
                const ok = await api(`/kl/boards/${encodeURIComponent(b.dataset.galDel ?? '')}`, { method: 'DELETE' });
                if (!ok) {
                    Toolbox.showToast?.(toastFor('갤러리를 못 지웠어요'));
                    return;
                }
                boards = [];
                void render();
            }),
        );

        host.querySelector<HTMLFormElement>('[data-gal-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            const label = form.querySelector<HTMLInputElement>('[data-gal-label]')?.value.trim() ?? '';
            const desc = form.querySelector<HTMLInputElement>('[data-gal-desc]')?.value.trim() ?? '';
            const id = form.querySelector<HTMLInputElement>('[data-gal-id]')?.value.trim() ?? '';
            if (!label) return;
            const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            if (button) button.disabled = true;
            const created = (await api('/kl/boards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, desc, id }),
            })) as { id?: string } | null;
            if (button) button.disabled = false;
            if (!created?.id) {
                // 한글 이름이면 주소를 못 만든다 — 그 경우를 콕 집어 말해 준다.
                const why = lastFailure?.code === 'bad_id' ? '주소를 직접 적어 주세요 (영소문자·숫자·붙임표)' : null;
                Toolbox.showToast?.(why ?? toastFor('갤러리를 못 만들었어요'));
                return;
            }
            galleryFormOpen = false;
            boards = [];
            // 만들었으면 바로 그 갤러리로 — 만들고 목록만 보면 어디 생겼나 찾게 된다.
            go({ board: created.id, p: null, page: null, q: null, tag: null });
        });
    }

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
            ${
                data.gallery.tags.length
                    ? `<select name="cTag" data-tagpick aria-label="말머리">
                           <option value="">말머리 없음</option>
                           ${data.gallery.tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                       </select>`
                    : ''
            }
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

        // 검색·페이지는 주소에 남는다 — 뒤로 가기로 보던 자리에 돌아온다.
        const query = (param('q') ?? '').trim().toLowerCase();
        const filtered = query
            ? data.posts.filter((p) =>
                  `${p.title ?? ''} ${p.text} ${p.authorHandle}`.toLowerCase().includes(query),
              )
            : data.posts;

        const PER_PAGE = 30;
        const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
        const page = Math.min(Math.max(1, Number(param('page') ?? '1') || 1), pageCount);
        const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

        /** 오늘 글은 시각, 지난 글은 날짜 — 국내 게시판이 다 이렇게 한다 (한눈에 오늘 것이 보인다). */
        const stamp = (iso: string): string => {
            const at = new Date(iso);
            if (Number.isNaN(at.getTime())) return '';
            const kst = new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).formatToParts(at);
            const get = (type: string): string => kst.find((x) => x.type === type)?.value ?? '';
            const todayParts = new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(new Date());
            const sameDay =
                get('month') === (todayParts.find((x) => x.type === 'month')?.value ?? '') &&
                get('day') === (todayParts.find((x) => x.type === 'day')?.value ?? '');
            return sameDay ? `${get('hour')}:${get('minute')}` : `${get('month')}.${get('day')}`;
        };

        const body = shown.length
            ? shown
                  .map((p, index) => {
                      const heading = isRequest ? preview(p.text, 60) : (p.title ?? '(제목 없음)');
                      const number = p.pinned ? '공지' : String(filtered.length - ((page - 1) * PER_PAGE + index));
                      const hot = p.likes >= 3 || p.replyCount >= 5;
                      return `<tr data-pinned="${p.pinned ? '1' : '0'}">
                          <td class="c-num">${number}</td>
                          <td class="c-td-title">
                              <button type="button" class="c-title-btn" data-post="${esc(p.id)}">
                                  ${isRequest && p.status !== 'open' ? `<span class="c-tag">${STATUS_LABEL[p.status]}</span>` : ''}
                                  ${p.tag ? `<span class="c-headword">[${esc(p.tag)}]</span>` : ''}
                                  <span class="t">${esc(heading)}</span>
                                  ${p.replyCount ? `<span class="c-cmt">[${p.replyCount}]</span>` : ''}
                              </button>
                          </td>
                          <td class="c-who"><span>${face(p.authorHandle)}<b>${esc(p.authorHandle)}</b></span></td>
                          <td class="c-when">${stamp(p.bumpedAt)}</td>
                          <td class="c-cnt">${p.views}</td>
                          <td class="c-cnt" data-hot="${hot ? '1' : '0'}">${isRequest ? p.votes : p.likes}</td>
                      </tr>`;
                  })
                  .join('')
            : `<tr><td class="c-empty-row" colspan="6">${
                  query ? '찾는 글이 없습니다.' : isRequest ? '아직 올라온 요청이 없습니다.' : '아직 이 판에 글이 없습니다. 첫 글을 남겨 주세요.'
              }</td></tr>`;

        const pages: string[] = [];
        if (pageCount > 1) {
            const from = Math.max(1, page - 2);
            const to = Math.min(pageCount, from + 4);
            pages.push(`<button type="button" class="c-page" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>`);
            for (let n = from; n <= to; n += 1) {
                pages.push(`<button type="button" class="c-page" data-page="${n}" data-on="${n === page ? '1' : '0'}">${n}</button>`);
            }
            pages.push(`<button type="button" class="c-page" data-page="${page + 1}" ${page === pageCount ? 'disabled' : ''}>›</button>`);
        }

        // 어느 갤러리에 들어와 있는지가 제일 크게 보여야 한다 — 안 그러면 여기가 어딘지 모른다.
        const gallery = data.gallery;
        host.innerHTML = `<div class="c-wrap">
            <div class="c-gal-head">
                <button type="button" class="c-linkbtn" data-board-home>← 갤러리 목록</button>
                <h2>${esc(gallery.label)}</h2>
                <p>${esc(gallery.desc)}${
                    gallery.createdByHandle ? ` · @${esc(gallery.createdByHandle)} 가 만든 갤러리` : ''
                } · 글 ${gallery.count ?? data.posts.length}</p>
            </div>
            ${renderBoards(data.board)}
            ${
                data.gallery.tags.length
                    ? `<div class="c-tags">
                        <button type="button" class="c-tagchip" data-tag="" data-on="${data.tag ? '0' : '1'}">전체</button>
                        ${data.gallery.tags
                            .map(
                                (t) =>
                                    `<button type="button" class="c-tagchip" data-tag="${esc(t)}" data-on="${data.tag === t ? '1' : '0'}">${esc(t)}</button>`,
                            )
                            .join('')}
                       </div>`
                    : ''
            }
            <div class="c-bar">${sorts}${
                data.signedIn && data.canWrite && !writerOpen ? '<button type="button" class="c-newbtn" data-new>글쓰기</button>' : '<span></span>'
            }</div>
            ${writer}
            <table class="c-table">
                <thead><tr>
                    <th class="c-num">번호</th>
                    <th class="c-th-title">제목</th>
                    <th class="c-who">글쓴이</th>
                    <th class="c-when">날짜</th>
                    <th class="c-cnt">조회</th>
                    <th class="c-cnt">${isRequest ? '표' : '추천'}</th>
                </tr></thead>
                <tbody>${body}</tbody>
            </table>
            <div class="c-foot">
                <form class="c-search" data-search>
                    <input type="text" name="cSearch" data-q placeholder="제목·글쓴이" aria-label="글 찾기" value="${esc(param('q') ?? '')}">
                    <button type="submit" class="c-page">찾기</button>
                </form>
                <div class="c-pages">${pages.join('')}</div>
            </div>
        </div>`;

        wireSignIn();

        host.querySelector('[data-board-home]')?.addEventListener('click', () =>
            go({ board: null, p: null, page: null, q: null }),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-board]').forEach((b) =>
            b.addEventListener('click', () => {
                writerOpen = false;
                go({ board: b.dataset.board === 'free' ? null : (b.dataset.board ?? null), sort: null, p: null, page: null, q: null, tag: null });
            }),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
            b.addEventListener('click', () => go({ sort: b.dataset.sort === 'top' ? 'top' : null, page: null })),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-post]').forEach((b) =>
            b.addEventListener('click', () => go({ p: b.dataset.post ?? null })),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((b) =>
            b.addEventListener('click', () => go({ tag: b.dataset.tag || null, page: null })),
        );
        host.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((b) =>
            b.addEventListener('click', () => go({ page: b.dataset.page === '1' ? null : (b.dataset.page ?? null) })),
        );
        host.querySelector<HTMLFormElement>('[data-search]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('[data-q]')?.value.trim() ?? '';
            go({ q: value || null, page: null });
        });
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
                    body: JSON.stringify({
                        board: data.board,
                        title,
                        text,
                        tag: writeForm.querySelector<HTMLSelectElement>('[data-tagpick]')?.value || null,
                    }),
                })) as { id?: string } | null;
                if (button) button.disabled = false;
                if (!created?.id) {
                    // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
                    Toolbox.showToast?.(toastFor('못 올렸어요'));
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
                <h2 class="c-post-title">${post.tag ? `<span class="c-headword">[${esc(post.tag)}]</span> ` : ''}${esc(post.title ?? preview(post.text, 60))}
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
            Toolbox.showToast?.(toastFor('지금은 안 되네요'));
        };

        const act = async (path: string, method = 'POST'): Promise<void> => {
            const ok = await api(path, { method });
            if (!ok) {
                Toolbox.showToast?.(toastFor('지금은 안 되네요'));
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
            if (!ok) Toolbox.showToast?.(toastFor('못 바꿨어요'));
            else reload();
        });
        const setStatus = async (status: string): Promise<void> => {
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!ok) Toolbox.showToast?.(toastFor('못 바꿨어요'));
            else reload();
        };
        host.querySelector('[data-plan]')?.addEventListener('click', () => void setStatus('planned'));
        host.querySelector('[data-done]')?.addEventListener('click', () => void setStatus('done'));

        host.querySelector('[data-delete]')?.addEventListener('click', async () => {
            if (!confirm('이 글을 지웁니다. 계속할까요?')) return;
            const ok = await api(`/kl/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
            if (!ok) {
                Toolbox.showToast?.(toastFor('못 지웠어요'));
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
                Toolbox.showToast?.(toastFor('답글을 못 달았어요'));
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
            const raw = (await api('/kl/boards')) as BoardsResponse | null;
            if (!raw?.boards) {
                offline();
                return;
            }
            boards = raw.boards;
            boardsMeta = { signedIn: raw.signedIn, labelMaxLength: raw.labelMaxLength, descMaxLength: raw.descMaxLength };
        }

        const postId = param('p');
        if (postId) {
            const raw = await api(`/kl/posts/${encodeURIComponent(postId)}`);
            if (!raw) {
                host.innerHTML = `<div class="c-wrap">${failureHtml('그 글을 못 찾았어요')}</div>`;
                wireFailure();
                return;
            }
            renderDetail(raw as DetailResponse);
            return;
        }

        // 갤러리를 안 골랐으면 갤러리 목록부터. 이게 커뮤니티의 첫 화면이다.
        if (!param('board')) {
            const [freshHome, best, recent] = await Promise.all([
                api('/kl/boards') as Promise<BoardsResponse | null>,
                api('/kl/recent?kind=best&limit=6') as Promise<{ posts?: Post[] } | null>,
                api('/kl/recent?limit=6') as Promise<{ posts?: Post[] } | null>,
            ]);
            bestFeed = best?.posts ?? [];
            recentFeed = recent?.posts ?? [];
            if (freshHome?.boards) {
                boards = freshHome.boards;
                boardsMeta = {
                    signedIn: freshHome.signedIn,
                    labelMaxLength: freshHome.labelMaxLength,
                    descMaxLength: freshHome.descMaxLength,
                };
            }
            renderGalleryHome();
            return;
        }

        // 목록과 갤러리 숫자를 **같이** 받는다. 하나씩 기다리면 그만큼 화면이 늦게 바뀐다.
        const [raw, freshBoards] = await Promise.all([
            api(
                `/kl/posts?board=${encodeURIComponent(currentBoard())}&sort=${currentSort()}` +
                    (param('tag') ? `&tag=${encodeURIComponent(param('tag') ?? '')}` : ''),
            ),
            api('/kl/boards') as Promise<BoardsResponse | null>,
        ]);
        if (!raw) {
            offline();
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
