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
    }
    interface Hello {
        me: Me;
        messages: Message[];
        here: number;
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
    let unread = 0;
    let connected = false;
    const messages: Message[] = [];

    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function apiBase(): string | null {
        return (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || null;
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
        .klchat-dot.on { background:#5fd3b2; box-shadow:0 0 0 0 rgba(95,211,178,0.6); animation:klchat-pulse 2.4s infinite; }
        @keyframes klchat-pulse { 0%{box-shadow:0 0 0 0 rgba(95,211,178,0.5);} 70%{box-shadow:0 0 0 7px rgba(95,211,178,0);} 100%{box-shadow:0 0 0 0 rgba(95,211,178,0);} }
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
        .klchat-note { color:var(--text-tertiary,#6b7688); font-size:11px; line-height:1.6; padding:6px 0; border-bottom:1px dashed var(--border,rgba(255,255,255,0.08)); margin-bottom:4px; }
        .klchat-foot { border-top:1px solid var(--border,rgba(255,255,255,0.08)); padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
        .klchat-row { display:flex; gap:6px; align-items:flex-end; }
        .klchat-input { flex:1; resize:none; height:34px; max-height:96px; padding:8px 10px; border:1px solid var(--border,rgba(255,255,255,0.1)); background:var(--bg-tertiary,rgba(255,255,255,0.04)); color:var(--text-primary,#e4eaf6); border-radius:var(--radius-sm,6px); font-size:13px; font-family:inherit; line-height:1.35; }
        .klchat-input:focus { outline:none; border-color:var(--border-hover,rgba(0,229,255,0.35)); }
        .klchat-send { flex:none; padding:0 12px; height:34px; border:none; border-radius:var(--radius-sm,6px); background:var(--accent,#00e5ff); color:#04121a; font-weight:800; font-size:12px; cursor:pointer; }
        .klchat-send:disabled { opacity:0.4; cursor:default; }
        .klchat-status { font-size:11px; color:var(--text-tertiary,#6b7688); min-height:14px; }
        .klchat-status.warn { color:#ef8b8b; }
        @media (max-width:640px) {
            .klchat { left:12px; right:12px; bottom:12px; }
            .klchat-panel { width:100%; height:min(70vh,460px); }
        }
        `,
    );

    // 핫 교체(개발 중 저장)로 이 파일이 다시 돌면 앞의 껍데기가 남는다 — 먼저 걷어낸다.
    document.getElementById('klChat')?.remove();

    const root = document.createElement('div');
    root.id = 'klChat';
    root.className = 'klchat';
    root.innerHTML = `
        <div class="klchat-panel" role="log" aria-label="실시간 익명 채팅">
            <div class="klchat-head">
                <span class="klchat-dot" id="klChatDot"></span>
                <b>지금 여기</b>
                <span id="klChatHere">·</span>
                <span class="klchat-spacer"></span>
                <span id="klChatMe" title="오늘의 내 이름표 — 자정에 바뀐다"></span>
                <button type="button" class="klchat-x" id="klChatClose" aria-label="닫기">✕</button>
            </div>
            <div class="klchat-log" id="klChatLog"></div>
            <div class="klchat-foot">
                <div class="klchat-row">
                    <textarea class="klchat-input" id="klChatInput" rows="1" placeholder="아무 말이나 — 이름은 오늘까지만" maxlength="300"></textarea>
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
        const head = sameSpeaker
            ? ''
            : `${owner}<span class="klchat-who" style="color:${m.color}">${escapeHtml(m.name)}</span><span style="color:var(--text-tertiary,#6b7688)">: </span>`;
        const actions = isAdmin
            ? `<button data-act="del" data-id="${m.id}" title="지우기">🗑</button><button data-act="mute" data-who="${m.who}" title="30분 재갈">🤫</button>`
            : `<button data-act="report" data-id="${m.id}" title="신고">🚩</button>`;
        return (
            `<div class="klchat-line${sameSpeaker ? ' cont' : ''}" data-id="${m.id}">` +
            head +
            escapeHtml(m.text) +
            `<span class="klchat-time">${timeLabel(m.at)}</span>` +
            `<span class="klchat-act">${actions}</span>` +
            '</div>'
        );
    }

    function renderLog(): void {
        const stick = atBottom();
        const hint =
            pref(HINT_KEY, '') === '1'
                ? ''
                : '<div class="klchat-note">여긴 <b>하루짜리 이름표</b>로 말하는 자리. 자정에 이름이 바뀌고, 하루 지난 줄은 사라진다. 계정은 안 드러난다.</div>';
        let html = hint;
        for (let i = 0; i < messages.length; i += 1) {
            html += lineHtml(messages[i], i > 0 ? messages[i - 1] : null);
        }
        if (messages.length === 0) {
            html += '<div class="klchat-note" style="border:none">아직 아무도 말을 안 했다. 첫 줄을 남겨도 된다.</div>';
        }
        el.log.innerHTML = html;
        if (stick) el.log.scrollTop = el.log.scrollHeight;
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
        el.input.maxLength = maxLength;
        messages.length = 0;
        for (const m of data.messages || []) messages.push(m);
        /* 안 본 줄 세기 — 마지막으로 본 줄 **뒤**의 것만 센다.
         * 이게 없으면 새로 들어올 때마다 200개가 안 읽음으로 뜬다(그러면 배지가 의미를 잃는다). */
        const seen = pref(SEEN_KEY, '');
        const index = messages.findIndex((m) => m.id === seen);
        unread = isOpen() ? 0 : index >= 0 ? messages.length - index - 1 : Math.min(messages.length, 99);
        renderLog();
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
        source.addEventListener('here', (event) => {
            here = (JSON.parse((event as MessageEvent).data) as { here: number }).here;
            renderHeader();
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
                body: JSON.stringify({ text }),
            });
            if (response.ok) {
                el.input.value = '';
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

    // ── 배선 ──────────────────────────────────────────────────────────────────

    el.dock.onclick = () => setOpen(!isOpen());
    el.close.onclick = () => setOpen(false);
    el.send.onclick = () => void send();
    el.log.onscroll = () => {
        if (isOpen() && atBottom()) markSeen();
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
            void act('/kl/chat/report', { id: button.dataset.id });
            Toolbox.showToast?.('신고했다 — 주인에게 갔다.', 'info');
        }
    };

    if (pref(OPEN_KEY, '0') === '1') setOpen(true);
    renderHeader();

    /* 계정 스크립트가 아직 안 왔을 수 있다 (둘 다 defer 라 순서는 보장되지만, 실패로 늦을 수 있다).
     * 주소를 얻을 때까지 잠깐 기다렸다 붙는다 — 못 얻으면 채팅만 조용히 안 뜬다. */
    (function waitForApi(tries = 0): void {
        if (apiBase()) {
            connect();
            return;
        }
        if (tries > 20) {
            root.remove();
            return;
        }
        setTimeout(() => waitForApi(tries + 1), 250);
    })();
})();
