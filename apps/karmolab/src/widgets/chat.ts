/**
 * 실시간 익명 채팅창 (TASK-KL-149) — 사이트 어디에 있든 **옆에 늘 떠 있는 한 방**.
 *
 * 왜 위젯이 아닌가: 도구 하나로 만들면 그 도구를 연 사람만 방에 있다. 그러면 방은 늘 비어 있다.
 * 채팅은 「보러 가는 곳」이 아니라 「켜 둔 채로 딴짓하는 곳」이다 — 그래서 셸에 상주시킨다.
 * 광장이 「지금 N명」을 세기만 하던 자리에, 이제 그 N명이 서로 말을 건다.
 *
 * 왜 트위치식 한 줄인가 (`이름: 말`): 말풍선은 한 화면에 대여섯 줄밖에 못 담는다. 좁고 긴 창에
 * 대화가 흘러야 하므로 줄 밀도가 곧 쓸모다. 이름은 **각자 색으로** 칠해 누가 말하는지 색으로 먼저
 * 읽히게 하고, 같은 사람이 연달아 말하면 이름을 안 되풀이한다.
 *
 * 왜 왼쪽 아래인가: 마스코트가 오른쪽 아래에 산다(`mdd.ts`, z-index 900). 겹치면 둘 다 죽는다.
 *
 * 연결은 SSE 하나 (`/kl/chat/stream`). 끊기면 브라우저가 알아서 다시 붙고, 그래도 안 되면
 * 잠깐씩 되물어보는 길(`/kl/chat/recent`)로 내려간다. 서버가 아예 없으면 **채팅만 조용히 사라진다** —
 * 도구는 그대로 돈다.
 */
(function (): void {
    'use strict';

    interface Me {
        who: string;
        name: string;
        color: string;
    }
    interface Message {
        id: string;
        text: string;
        name: string;
        color: string;
        who: string;
        byOwner: boolean;
        at: string;
        /** 지킨 사람 수와 「내가 지켰나」 (TASK-KL-158/159). 누가 지켰는지는 안 내려온다. */
        kept?: number;
        keptByMe?: boolean;
        reportedByMe?: boolean;
        /** 어느 줄에 답하는가 — 그때 모습 그대로 베껴 온다 (TASK-KL-159). */
        replyTo?: { id: string; name: string; text: string } | null;
    }
    interface Hello {
        me: Me;
        messages: Message[];
        here: number;
        /** 오늘 이 방에서 목소리를 낸 사람 수 (TASK-KL-157). */
        todayVoices?: number;
        isAdmin: boolean;
        maxLength: number;
    }

    const OPEN_KEY = 'kl_chat_open';
    const SEEN_KEY = 'kl_chat_seen';
    const HINT_KEY = 'kl_chat_hint_seen';
    /** 되물어보는 길로 내려갔을 때의 간격. 실시간은 못 되지만 죽지는 않는다. */
    const POLL_MS = 5000;

    let me: Me | null = null;
    let isAdmin = false;
    let maxLength = 300;
    let here = 0;
    let todayVoices = 0;
    /** 지킨 줄만 보고 있나 (TASK-KL-159). 지킨 줄이 흐름에 섞이면 다시 못 찾는다. */
    let onlyKept = false;
    /** 지금 답하는 줄. 답을 달다 말면 취소할 수 있어야 한다. */
    let replyTo: Message | null = null;
    let unread = 0;
    let connected = false;
    const messages: Message[] = [];
    /** 마지막으로 그린 로그의 서명 — 같은 내용을 다시 그려 hover 를 깨뜨리지 않으려고 둔다. */
    let lastLogSignature = '';

    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * 서버 주소.
     *
     * 예전에는 계정 스크립트(`account.js`)가 창에 얹어 주는 값만 봤다. 그런데 **도구 화면
     * 129장은 그 스크립트를 안 싣는다**(무게 때문에 일부러 뺐다) — 그래서 채팅은 사람이 제일
     * 많이 있는 자리에서 조용히 자기 자신을 지우고 있었다. 채팅은 익명으로도 도는데 계정에
     * 매달려 있었던 것이다 (TASK-KL-161).
     *
     * 이제 계정이 있으면 그 값을 쓰고(검사가 주소를 갈아 끼울 수 있다), 없으면 제 주소를 쓴다.
     */
    const DEFAULT_API = 'https://yawnbot.mascari4615.com';

    function apiBase(): string {
        return (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || DEFAULT_API;
    }

    function escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pref(key: string, fallback: string): string {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch {
            return fallback;
        }
    }
    function setPref(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* 사파리 비공개 모드 등 — 기억을 못 할 뿐, 채팅은 돈다 */
        }
    }

    function timeLabel(iso: string): string {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // ── 껍데기 ────────────────────────────────────────────────────────────────

    Mdd.injectCSS(
        'kl-chat',
        `
        .klchat { position:fixed; left:16px; bottom:16px; z-index:940; display:flex; flex-direction:column; align-items:flex-start; gap:10px; font-family:var(--font-sans,'Inter',sans-serif); }
        .klchat-dock { display:inline-flex; align-items:center; gap:8px; padding:9px 14px; border:1px solid var(--border,rgba(255,255,255,0.1)); background:var(--glass-strong,rgba(8,16,30,0.85)); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); color:var(--text-primary,#e4eaf6); border-radius:var(--radius-md,8px); font-size:13px; font-weight:600; cursor:pointer; box-shadow:0 6px 20px var(--vignette,rgba(0,0,0,0.35)); transition:transform .12s ease, border-color .12s ease; }
        .klchat-dock:hover { transform:translateY(-1px); border-color:var(--border-hover,rgba(0,229,255,0.3)); }
        .klchat-dot { width:7px; height:7px; border-radius:50%; background:var(--text-tertiary,#6b7688); flex:none; }
        /* 맥박은 합성기가 그리는 것으로 그린다 (TASK-KL-128 25).
           예전에는 box-shadow 를 키프레임으로 늘렸다 — 그건 주 스레드가 매 프레임 다시
           계산한다. 손을 안 대도 스타일 재계산 초당 137회 중 24%가 이 점 하나였다(실측).
           같은 그림을 고리 하나의 transform+opacity 로 그리면 주 스레드는 0이다.
           (이 글은 템플릿 문자열 **안**이다 — 백틱을 쓰면 문자열이 끊긴다. 실제로 끊었다.) */
        .klchat-dot { position:relative; }
        .klchat-dot.on::after { content:''; position:absolute; inset:0; border-radius:50%;
          background:rgba(95,211,178,0.5); animation:klchat-pulse 2.4s infinite; will-change:transform,opacity; }
        .klchat-dot.on { background:#5fd3b2; }
        @keyframes klchat-pulse { 0%{transform:scale(1);opacity:.5;} 70%{transform:scale(3);opacity:0;} 100%{transform:scale(1);opacity:0;} }
        .klchat-badge { min-width:18px; height:18px; padding:0 5px; border-radius:9px; background:#ef8b8b; color:#1a1016; font-size:11px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
        .klchat-panel { width:min(340px,calc(100vw - 32px)); height:min(460px,calc(100vh - 120px)); display:none; flex-direction:column; border:1px solid var(--border,rgba(255,255,255,0.1)); background:var(--glass-strong,rgba(8,16,30,0.92)); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border-radius:var(--radius-md,8px); overflow:hidden; box-shadow:0 12px 40px var(--vignette,rgba(0,0,0,0.45)); }
        .klchat.open .klchat-panel { display:flex; }
        .klchat-head { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border,rgba(255,255,255,0.08)); font-size:12px; color:var(--text-secondary,#9aa7bd); }
        .klchat-head b { color:var(--text-primary,#e4eaf6); font-size:13px; }
        .klchat-head .klchat-spacer { flex:1; }
        .klchat-x { background:none; border:none; color:var(--text-tertiary,#6b7688); cursor:pointer; font-size:16px; line-height:1; padding:2px 4px; }
        .klchat-x:hover { color:var(--text-primary,#e4eaf6); }
        .klchat-log { flex:1; overflow-y:auto; overflow-x:hidden; padding:10px 12px; display:flex; flex-direction:column; gap:3px; font-size:13px; line-height:1.5; overscroll-behavior:contain; }
        .klchat-line { color:var(--text-primary,#e4eaf6); word-break:break-word; white-space:pre-wrap; position:relative; padding-right:34px; }
        .klchat-line.cont { padding-left:0; }
        .klchat-who { font-weight:700; }
        .klchat-owner { font-size:10px; font-weight:800; padding:0 4px; border-radius:3px; background:var(--accent,#00e5ff); color:#04121a; margin-right:4px; vertical-align:1px; }
        .klchat-time { color:var(--text-tertiary,#6b7688); font-size:10px; margin-left:6px; opacity:0; transition:opacity .12s; }
        .klchat-line:hover .klchat-time { opacity:1; }
        .klchat-act { position:absolute; right:0; top:0; display:none; gap:4px; }
        .klchat-line:hover .klchat-act { display:flex; }
        .klchat-act button { background:none; border:none; padding:0 2px; font-size:11px; color:var(--text-tertiary,#6b7688); cursor:pointer; }
        .klchat-act button:hover { color:#ef8b8b; }
        .klchat-act button[data-on="1"] { color:#e6c65c; }
        .klchat-kept { color:#e6c65c; font-size:10px; margin-left:4px; }
        .klchat-filter { background:none; border:none; cursor:pointer; font-size:12px; opacity:0.35; padding:0 2px; }
        .klchat-filter[data-on="1"] { opacity:1; }
        .klchat-quote { font-size:11px; color:var(--text-tertiary,#6b7688); border-left:2px solid var(--border,rgba(255,255,255,0.15)); padding-left:6px; margin:2px 0 1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .klchat-replying { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-tertiary,#6b7688); }
        .klchat-replying button { background:none; border:none; color:inherit; cursor:pointer; }
        .klchat-note { color:var(--text-tertiary,#6b7688); font-size:11px; line-height:1.6; padding:6px 0; border-bottom:1px dashed var(--border,rgba(255,255,255,0.08)); margin-bottom:4px; }
        .klchat-foot { border-top:1px solid var(--border,rgba(255,255,255,0.08)); padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
        .klchat-row { display:flex; gap:6px; align-items:flex-end; }
        .klchat-input { flex:1; resize:none; height:34px; max-height:96px; padding:8px 10px; border:1px solid var(--border,rgba(255,255,255,0.1)); background:var(--bg-tertiary,rgba(255,255,255,0.04)); color:var(--text-primary,#e4eaf6); border-radius:var(--radius-sm,6px); font-size:13px; font-family:inherit; line-height:1.35; }
        .klchat-input:focus { outline:none; border-color:var(--border-hover,rgba(0,229,255,0.35)); }
        .klchat-send { flex:none; padding:0 12px; height:34px; border:none; border-radius:var(--radius-sm,6px); background:var(--accent,#00e5ff); color:#04121a; font-weight:800; font-size:12px; cursor:pointer; }
        .klchat-send:disabled { opacity:0.4; cursor:default; }
        .klchat-status { font-size:11px; color:var(--text-tertiary,#6b7688); min-height:14px; }
        .klchat-status.warn { color:#ef8b8b; }
        .klchat-alone { border:none; color:var(--text-secondary,#9aa7bd); }
        @media (max-width:640px) {
            .klchat { left:12px; right:12px; bottom:12px; }
            /* 폰에서는 **화면에 실제로 보이는 높이**(dvh)로 잡는다. vh 는 주소창·키보드가
               올라와도 안 줄어서, 키보드가 뜨면 입력칸이 화면 밖으로 밀려난다.
               dvh 를 모르는 브라우저를 위해 vh 를 먼저 적어 둔다(뒤가 이긴다). */
            .klchat-panel { width:100%; height:min(70vh,460px); height:min(60dvh,460px); }
            /* 아이폰은 글자가 16px 보다 작은 칸을 누르면 **화면을 확대해 버린다.**
               그러면 창이 화면 밖으로 밀려나고, 되돌리려면 손으로 축소해야 한다. */
            .klchat-input { font-size:16px; }
        }
        `,
    );

    // 핫 교체(개발 중 저장)로 이 파일이 다시 돌면 앞의 껍데기가 남는다 — 먼저 걷어낸다.
    document.getElementById('klChat')?.remove();

    const root = document.createElement('div');
    root.id = 'klChat';
    root.className = 'klchat';
    /* 자리는 **여기서 못 박는다** (TASK-KL-128 F-4).
       이 껍데기의 스타일은 `Mdd.injectCSS` 를 지나는데, 마스코트는 화면을 다 그린 뒤에야
       온다 — 그동안 이 상자가 **흐름 안에 낀 채로** 서서 아래 것들을 통째로 밀었다.
       첫 화면 밀림 0.178 중 0.174 가 이것 하나였다(실측). 뜨는 자리만 인라인으로 박아 두면
       스타일이 늦게 와도 아무것도 안 밀린다. 나머지 생김새는 그대로 그 CSS 가 맡는다. */
    root.style.position = 'fixed';
    root.style.left = '16px';
    root.style.bottom = '16px';
    root.style.zIndex = '940';
    root.innerHTML = `
        <div class="klchat-panel" role="log" aria-label="실시간 익명 채팅">
            <div class="klchat-head">
                <span class="klchat-dot" id="klChatDot"></span>
                <b>지금 여기</b>
                <span id="klChatHere">·</span>
                <span class="klchat-spacer"></span>
                <button type="button" class="klchat-filter" id="klChatOnlyKept" title="지킨 줄만 보기">⭐</button>
                <span id="klChatMe" title="오늘의 내 이름표 — 자정에 바뀐다"></span>
                <button type="button" class="klchat-x" id="klChatClose" aria-label="닫기">✕</button>
            </div>
            <div class="klchat-log" id="klChatLog"></div>
            <div class="klchat-foot">
                <div class="klchat-replying" id="klChatReplying" hidden></div>
                <div class="klchat-row">
                    <textarea class="klchat-input" id="klChatInput" rows="1" placeholder="아무 말이나 — 하루 뒤 사라진다 (☆ 누르면 남음)" maxlength="300"></textarea>
                    <button type="button" class="klchat-send" id="klChatSend">보내기</button>
                </div>
                <div class="klchat-status" id="klChatStatus"></div>
            </div>
        </div>
        <button type="button" class="klchat-dock" id="klChatDock">
            <span class="klchat-dot" id="klChatDockDot"></span>
            <span>채팅</span>
            <span id="klChatDockCount" style="color:var(--text-tertiary,#6b7688);font-weight:600"></span>
            <span class="klchat-badge" id="klChatUnread" style="display:none">0</span>
        </button>
    `;
    document.body.appendChild(root);

    const el = {
        dock: root.querySelector('#klChatDock') as HTMLButtonElement,
        dockDot: root.querySelector('#klChatDockDot') as HTMLElement,
        dockCount: root.querySelector('#klChatDockCount') as HTMLElement,
        unread: root.querySelector('#klChatUnread') as HTMLElement,
        close: root.querySelector('#klChatClose') as HTMLButtonElement,
        dot: root.querySelector('#klChatDot') as HTMLElement,
        here: root.querySelector('#klChatHere') as HTMLElement,
        meLabel: root.querySelector('#klChatMe') as HTMLElement,
        log: root.querySelector('#klChatLog') as HTMLElement,
        input: root.querySelector('#klChatInput') as HTMLTextAreaElement,
        onlyKept: root.querySelector('#klChatOnlyKept') as HTMLButtonElement,
        replying: root.querySelector('#klChatReplying') as HTMLElement,
        send: root.querySelector('#klChatSend') as HTMLButtonElement,
        status: root.querySelector('#klChatStatus') as HTMLElement,
    };

    // ── 그리기 ────────────────────────────────────────────────────────────────

    function atBottom(): boolean {
        return el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 40;
    }

    function renderHeader(): void {
        el.here.textContent = here > 0 ? `${here}명` : '·';
        el.dockCount.textContent = here > 0 ? String(here) : '';
        el.dot.className = `klchat-dot${connected ? ' on' : ''}`;
        el.dockDot.className = `klchat-dot${connected ? ' on' : ''}`;
        if (me) {
            el.meLabel.innerHTML = `<span class="klchat-who" style="color:${me.color}">${escapeHtml(me.name)}</span>`;
        }
        el.onlyKept.dataset.on = onlyKept ? '1' : '0';
        el.unread.style.display = unread > 0 && !isOpen() ? '' : 'none';
        el.unread.textContent = unread > 99 ? '99+' : String(unread);
    }

    function lineHtml(m: Message, previous: Message | null): string {
        /* 같은 사람이 연달아 말하면 이름을 다시 안 적는다 — 좁은 창에서 이름이 되풀이되면
         * 화면 절반이 이름이 된다. 다만 5분이 벌어졌으면 다시 적는다(딴 대화로 읽히게). */
        const sameSpeaker =
            previous !== null &&
            previous.who === m.who &&
            Date.parse(m.at) - Date.parse(previous.at) < 5 * 60 * 1000;
        const owner = m.byOwner ? '<span class="klchat-owner">주인</span>' : '';
        // 지킨 줄은 목록에서도 표가 나야 한다 — 안 그러면 왜 안 사라지는지 아무도 모른다.
        const keptMark = (m.kept ?? 0) > 0 ? '<span class="klchat-kept">⭐</span>' : '';
        const head = sameSpeaker
            ? ''
            : `${owner}<span class="klchat-who" style="color:${m.color}">${escapeHtml(m.name)}</span><span style="color:var(--text-tertiary,#6b7688)">: </span>`;
        /* 「글로 옮기기」가 왜 여기 있나 (TASK-KL-157): 채팅에서 나온 좋은 말은 24시간 뒤 사라진다.
         * 남길 가치가 있다고 느낀 그 순간에 옮길 길이 없으면, 옮기자고 마음먹을 일도 없다. */
        const keptCount = m.kept ?? 0;
        const mineKept = m.keptByMe === true;
        /* ⭐ 지키기 — 누른 줄은 **하루가 지나도 안 사라진다**.
         * 「사라지기 전에 알려 주기」보다 이쪽이 근본이다: 알림은 그 순간 보고 있어야 하지만,
         * 지키기는 한 번 누르면 끝난다. 📌 는 커뮤니티로 옮기는 것이라 하는 일이 다르다. */
        const star = `<button data-act="star" data-id="${m.id}" data-on="${mineKept ? '1' : '0'}" title="${
            mineKept ? '지키는 중 — 안 사라진다' : '지키기 (하루 뒤에도 남는다)'
        }">${mineKept ? '⭐' : '☆'}${keptCount > 1 ? keptCount : ''}</button>`;
        const keep = `${star}<button data-act="keep" data-id="${m.id}" title="글로 옮기기">📌</button>`;
        // 답하기 — 여럿이 동시에 말하면 「누구한테 하는 말이지?」가 안 보인다.
        const answer = `<button data-act="answer" data-id="${m.id}" title="답하기">↩</button>`;
        /* 이미 신고한 줄은 눌린 채로 둔다. 안 그러면 눌렀는지 몰라 또 누르고,
           또 눌러도 아무 일이 안 일어나니 고장으로 읽힌다. */
        const report = m.reportedByMe
            ? '<button data-act="none" data-on="1" title="이미 신고했다" disabled>🚩</button>'
            : `<button data-act="report" data-id="${m.id}" title="신고">🚩</button>`;
        const actions = isAdmin
            ? `${answer}${keep}<button data-act="del" data-id="${m.id}" title="지우기">🗑</button><button data-act="mute" data-who="${m.who}" title="30분 재갈">🤫</button>`
            : `${answer}${keep}${report}`;
        // 답한 줄에는 **무엇에 답한 것인지**가 한 줄 위에 붙는다.
        const quoted = m.replyTo
            ? `<div class="klchat-quote">↩ <b>${escapeHtml(m.replyTo.name)}</b> ${escapeHtml(m.replyTo.text)}</div>`
            : '';
        return (
            `<div class="klchat-line${sameSpeaker ? ' cont' : ''}" data-id="${m.id}">` +
            quoted +
            head +
            escapeHtml(m.text) +
            keptMark +
            `<span class="klchat-time">${timeLabel(m.at)}</span>` +
            `<span class="klchat-act">${actions}</span>` +
            '</div>'
        );
    }

    /** 「지금 그려져 있는 것과 같은 내용인가」 판별용 한 줄. 서명이 같으면 다시 안 그린다. */
    function logSignature(): string {
        return (
            `${onlyKept ? 'k' : 'a'}|${here <= 1 ? 'alone' : 'with'}|` +
            messages.map((m) => `${m.id}:${m.kept ?? 0}:${m.keptByMe ? 1 : 0}:${m.reportedByMe ? 1 : 0}`).join(',')
        );
    }

    function renderLog(): void {
        lastLogSignature = logSignature();
        const stick = atBottom();
        const hint =
            pref(HINT_KEY, '') === '1'
                ? ''
                : '<div class="klchat-note">여긴 <b>하루짜리 이름표</b>로 말하는 자리 — 자정에 이름이 바뀌고 계정은 안 드러난다.<br>' +
                  '<b>여기 쓴 말은 하루 뒤 사라진다.</b> 남기고 싶으면 ☆ (여기 그대로 남김) 또는 📌 (커뮤니티 글로 옮김).</div>';
        const shown = onlyKept ? messages.filter((m) => (m.kept ?? 0) > 0) : messages;
        let html = onlyKept ? '' : hint;
        for (let i = 0; i < shown.length; i += 1) {
            html += lineHtml(shown[i], i > 0 ? shown[i - 1] : null);
        }
        if (onlyKept && shown.length === 0) {
            html += '<div class="klchat-note" style="border:none">아직 지킨 줄이 없다. 남기고 싶은 줄에 ☆ 를 눌러라.</div>';
        }
        if (!onlyKept && messages.length === 0) {
            html += '<div class="klchat-note" style="border:none">아직 아무도 말을 안 했다. 첫 줄을 남겨도 된다.</div>';
        }
        /* 혼자 있을 때 이 창은 **죽은 방으로 읽힌다** (TASK-KL-157).
         * 실시간 방은 이렇게 죽는다: 아무도 없을 때 남긴 말이 아무에게도 안 닿고 → 아무도 안
         * 남기고 → 영영 빈다. 그래서 남긴 말이 **나중에 닿는다**는 사실을 그 자리에서 말해 준다.
         * 지어낸 수는 안 쓴다 — 오늘 실제로 말한 사람 수만 적는다. */
        if (!onlyKept && here <= 1) {
            const others = todayVoices > 1 ? `오늘 여기서 ${todayVoices}명이 말했다. ` : '';
            html +=
                `<div class="klchat-note klchat-alone">지금은 혼자다. ${others}` +
                '남겨 두면 오늘 여기 있던 사람들에게 알림이 간다.</div>';
        }
        el.log.innerHTML = html;
        if (stick) el.log.scrollTop = el.log.scrollHeight;
    }

    /** 「지금 누구에게 답하는 중인가」를 입력칸 바로 위에 적는다. 안 적으면 실수로 딴 줄에 붙는다. */
    function renderReplying(): void {
        if (!replyTo) {
            el.replying.hidden = true;
            el.replying.innerHTML = '';
            return;
        }
        el.replying.hidden = false;
        el.replying.innerHTML =
            `↩ <b style="color:${replyTo.color}">${escapeHtml(replyTo.name)}</b> ` +
            `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(replyTo.text.slice(0, 40))}</span>` +
            '<button type="button" data-cancel-reply title="답하기 그만">✕</button>';
        el.replying.querySelector('[data-cancel-reply]')?.addEventListener('click', () => {
            replyTo = null;
            renderReplying();
        });
    }

    function isOpen(): boolean {
        return root.classList.contains('open');
    }

    function markSeen(): void {
        unread = 0;
        const last = messages[messages.length - 1];
        if (last) setPref(SEEN_KEY, last.id);
        renderHeader();
    }

    function setOpen(open: boolean): void {
        root.classList.toggle('open', open);
        setPref(OPEN_KEY, open ? '1' : '0');
        if (open) {
            markSeen();
            setPref(HINT_KEY, '1');
            el.log.scrollTop = el.log.scrollHeight;
            el.input.focus();
        }
        renderHeader();
    }

    function pushMessage(m: Message): void {
        if (messages.some((x) => x.id === m.id)) return;
        messages.push(m);
        if (messages.length > 200) messages.shift();
        if (!isOpen() && (!me || m.who !== me.who)) unread += 1;
        renderLog();
        renderHeader();
        if (isOpen()) markSeen();
    }

    // ── 연결 ──────────────────────────────────────────────────────────────────

    function applyHello(data: Hello): void {
        me = data.me;
        isAdmin = Boolean(data.isAdmin);
        maxLength = data.maxLength || maxLength;
        here = data.here || 0;
        todayVoices = data.todayVoices || 0;
        el.input.maxLength = maxLength;
        messages.length = 0;
        for (const m of data.messages || []) messages.push(m);
        /* 안 본 줄 세기 — 마지막으로 본 줄 **뒤**의 것만 센다.
         * 이게 없으면 새로 들어올 때마다 200개가 안 읽음으로 뜬다(그러면 배지가 의미를 잃는다). */
        const seen = pref(SEEN_KEY, '');
        const index = messages.findIndex((m) => m.id === seen);
        unread = isOpen() ? 0 : index >= 0 ? messages.length - index - 1 : Math.min(messages.length, 99);
        /* 되돌아갈 길(5초 폴링)은 **바뀐 게 없어도** 통째로 다시 받는다. 그때마다 다시 그리면
         * 5초마다 hover 가 풀려 날짜가 깜빡이고, 누르려던 버튼이 손 밑에서 사라진다.
         * 내용이 같으면 그리지 않는다 — 서명 한 줄로 판별한다. */
        if (logSignature() !== lastLogSignature) renderLog();
        renderHeader();
        if (isOpen()) markSeen();
    }

    function stopPolling(): void {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    /**
     * SSE 가 안 되는 자리를 위한 되돌아갈 길.
     * 실시간은 아니지만 **죽은 창보다는 낫다** — 5초마다 통째로 다시 받는다.
     */
    function startPolling(base: string): void {
        if (pollTimer) return;
        const tick = async (): Promise<void> => {
            try {
                const response = await fetch(`${base}/kl/chat/recent`, { credentials: 'include' });
                if (!response.ok) return;
                applyHello((await response.json()) as Hello);
            } catch {
                connected = false;
                renderHeader();
            }
        };
        void tick();
        pollTimer = setInterval(() => void tick(), POLL_MS);
    }

    function connect(): void {
        const base = apiBase();
        if (!base) return;
        if (typeof EventSource === 'undefined') {
            startPolling(base);
            return;
        }
        source = new EventSource(`${base}/kl/chat/stream`, { withCredentials: true });

        source.addEventListener('hello', (event) => {
            connected = true;
            stopPolling();
            el.status.textContent = '';
            el.status.classList.remove('warn');
            applyHello(JSON.parse((event as MessageEvent).data) as Hello);
        });
        source.addEventListener('msg', (event) => {
            pushMessage((JSON.parse((event as MessageEvent).data) as { message: Message }).message);
        });
        source.addEventListener('del', (event) => {
            const id = (JSON.parse((event as MessageEvent).data) as { id: string }).id;
            const index = messages.findIndex((m) => m.id === id);
            if (index >= 0) messages.splice(index, 1);
            renderLog();
        });
        source.addEventListener('keep', (event) => {
            const data = JSON.parse((event as MessageEvent).data) as { id: string; kept: number };
            const found = messages.find((m) => m.id === data.id);
            if (!found) return;
            /* 서버는 **몇 명이 지켰나**만 흘린다 — 누가 지켰는지를 뿌리면 익명이 샌다.
               내가 눌렀는지는 내 화면이 이미 안다. 여기서는 수만 맞춘다. */
            found.kept = data.kept;
            renderLog();
        });
        source.addEventListener('here', (event) => {
            /* 사람 수만 바뀐 것으로 **로그를 다시 그리면 안 된다** (사용자 신고 2026-08-08).
             * `el.log.innerHTML = …` 는 줄을 통째로 새로 만든다 — 그 순간 마우스가 얹혀 있던
             * 줄이 사라졌다 다시 생기므로 `:hover` 가 풀리고, hover 로만 뜨는 날짜가 깜빡인다.
             * 사람 수가 로그에 미치는 영향은 「지금은 혼자다」 안내 하나뿐이니, **그 경계를
             * 넘을 때만** 다시 그린다. */
            const was = here;
            here = (JSON.parse((event as MessageEvent).data) as { here: number }).here;
            renderHeader();
            if ((was <= 1) !== (here <= 1)) renderLog();
        });
        source.onerror = () => {
            /* EventSource 는 스스로 다시 붙는다 — 여기서 닫으면 그 기능을 우리가 꺼 버린다.
             * 다만 완전히 닫힌 상태(CLOSED)면 브라우저도 포기한 것이므로 그때만 되물어보기로 내려간다. */
            connected = false;
            renderHeader();
            el.status.textContent = '다시 붙는 중…';
            el.status.classList.add('warn');
            if (source && source.readyState === EventSource.CLOSED) startPolling(base);
        };
    }

    // ── 보내기 ────────────────────────────────────────────────────────────────

    const FAILURE_TEXT: Record<string, string> = {
        empty: '빈 줄은 안 보내진다.',
        too_long: `${maxLength}자까지만.`,
        too_fast: '조금만 천천히.',
        too_many: '잠깐 쉬었다 하자 — 너무 많이 보냈다.',
        muted: '지금은 말할 수 없는 상태다.',
        not_human: '사람만 말할 수 있는 자리다.',
    };

    async function send(): Promise<void> {
        const base = apiBase();
        const text = el.input.value.trim();
        if (!base || !text) return;
        el.send.disabled = true;
        try {
            const response = await fetch(`${base}/kl/chat`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, replyTo: replyTo?.id ?? null }),
            });
            if (response.ok) {
                el.input.value = '';
                replyTo = null;
                renderReplying();
                el.input.style.height = '34px';
                el.status.textContent = '';
                el.status.classList.remove('warn');
                /* 되물어보기로 도는 중이면 내 줄도 바로 안 보인다 — 그 자리만 즉시 당겨 온다.
                 * 흐르는 연결이 살아 있으면 서버가 알아서 밀어 주므로 아무것도 안 한다. */
                if (!connected) startPolling(base);
                return;
            }
            const body = (await response.json().catch(() => ({}))) as { error?: string; retryAfterMs?: number };
            const wait = body.retryAfterMs ? ` (${Math.ceil(body.retryAfterMs / 1000)}초)` : '';
            el.status.textContent = (FAILURE_TEXT[body.error ?? ''] ?? '보내지 못했다.') + wait;
            el.status.classList.add('warn');
        } catch {
            el.status.textContent = '서버에 못 닿았다.';
            el.status.classList.add('warn');
        } finally {
            el.send.disabled = false;
            el.input.focus();
        }
    }

    async function act(path: string, body: unknown, method = 'POST'): Promise<void> {
        const base = apiBase();
        if (!base) return;
        await fetch(`${base}${path}`, {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: method === 'DELETE' ? undefined : JSON.stringify(body),
        }).catch(() => null);
    }

    /**
     * 이 줄을 커뮤니티 글로 옮긴다 (TASK-KL-157).
     *
     * 여기서 글을 **대신 올리지 않는다.** 옮길지 말지·어떻게 다듬을지는 사람이 정할 일이고,
     * 한 번 누르면 글이 올라가 버리는 단추는 무섭다. 대신 인용을 초안에 넣고 작성기를 열어 준다.
     * 초안은 커뮤니티가 이미 쓰는 자리(`kl_draft:<판>`)에 넣는다 — 새 통로를 안 만든다.
     */
    function keep(id: string): void {
        const line = messages.find((m) => m.id === id);
        if (!line) return;
        const quoted = line.text
            .split('\n')
            .map((row) => `> ${row}`)
            .join('\n');
        try {
            // 커뮤니티가 이미 쓰는 초안 자리. 새 통로를 안 만든다 (`community.ts` 의 draftKey).
            localStorage.setItem(
                'karmolab_community_draft_free',
                JSON.stringify({ title: '', text: `${quoted}\n\n— 채팅에서 (${line.name})\n\n` }),
            );
            // 「글쓰기 칸을 펴 둔 채로 도착해라」 한 번만 쓰이는 표식.
            localStorage.setItem('karmolab_community_open_writer', '1');
        } catch {
            /* 기억을 못 해도 화면은 열어 준다 — 붙여 쓰면 된다 */
        }
        setOpen(false);
        // 자유 판으로 도착하게 주소를 먼저 맞춘다 — 커뮤니티는 주소에서 판을 읽는다.
        const search = new URLSearchParams(location.search);
        search.set('board', 'free');
        search.delete('p');
        history.replaceState({}, '', `${location.pathname}?${search.toString()}#community`);
        Toolbox.switchPage?.('community');
        Toolbox.showToast?.('채팅 줄을 옮겨 왔다 — 자유 판에 글쓰기를 열었다.', 'info');
    }

    // ── 배선 ──────────────────────────────────────────────────────────────────

    el.onlyKept.onclick = () => {
        onlyKept = !onlyKept;
        renderHeader();
        renderLog();
    };
    el.dock.onclick = () => setOpen(!isOpen());
    el.close.onclick = () => setOpen(false);
    el.send.onclick = () => void send();
    el.log.onscroll = () => {
        if (isOpen() && atBottom()) markSeen();
    };

    /* 폰에서 칸을 누르면 키보드가 올라오며 창을 덮는다 — 브라우저가 알아서 밀어 주지 않는다.
     * 키보드가 자리를 잡을 틈을 준 뒤 이 창을 보이는 자리로 끌어온다 (TASK-KL-157). */
    el.input.onfocus = () => {
        setTimeout(() => {
            root.scrollIntoView({ block: 'end', behavior: 'smooth' });
            el.log.scrollTop = el.log.scrollHeight;
        }, 250);
    };

    el.input.onkeydown = (event) => {
        // 엔터로 보내고, 시프트+엔터로 줄을 바꾼다 — 채팅에서는 이게 기본값이다.
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
        }
    };
    el.input.oninput = () => {
        el.input.style.height = '34px';
        el.input.style.height = `${Math.min(el.input.scrollHeight, 96)}px`;
        const left = maxLength - el.input.value.length;
        el.status.classList.remove('warn');
        el.status.textContent = left <= 40 ? `${left}자 남음` : '';
    };

    el.log.onclick = (event) => {
        const button = (event.target as HTMLElement).closest('button[data-act]') as HTMLElement | null;
        if (!button) return;
        const kind = button.dataset.act;
        if (kind === 'del') void act(`/kl/chat/${button.dataset.id}`, null, 'DELETE');
        if (kind === 'mute') void act('/kl/chat/mute', { who: button.dataset.who, minutes: 30 });
        if (kind === 'report') {
            const line = messages.find((m) => m.id === button.dataset.id);
            if (line) line.reportedByMe = true; // 누른 자리에서 바로 표가 나야 또 안 누른다.
            renderLog();
            void act('/kl/chat/report', { id: button.dataset.id });
            Toolbox.showToast?.('신고했다 — 주인에게 갔다.', 'info');
        }
        if (kind === 'keep') keep(button.dataset.id ?? '');
        if (kind === 'answer') {
            replyTo = messages.find((m) => m.id === button.dataset.id) ?? null;
            renderReplying();
            el.input.focus();
        }
        if (kind === 'star') {
            const id = button.dataset.id ?? '';
            const line = messages.find((m) => m.id === id);
            if (line) {
                // 누른 자리에서 바로 바뀐다 — 서버 확인은 뒤에서 (흐르는 연결이 수를 맞춰 준다).
                line.keptByMe = !line.keptByMe;
                line.kept = Math.max(0, (line.kept ?? 0) + (line.keptByMe ? 1 : -1));
                renderLog();
            }
            void act(`/kl/chat/${encodeURIComponent(id)}/keep`, {});
        }
    };

    if (pref(OPEN_KEY, '0') === '1') setOpen(true);
    renderHeader();

    /* 계정 스크립트가 늦게 올 수 있다 — 오면 그쪽 주소가 이긴다(검사가 갈아 끼우는 자리).
     * 하지만 **기다리지는 않는다.** 기다리면 계정 스크립트가 아예 없는 화면(도구 129장)에서
     * 채팅이 영영 안 뜬다. 제 주소로 먼저 붙고, 필요하면 그때 다시 붙는다. */
    connect();
})();
