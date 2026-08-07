/**
 * 상태 · 변경 기록 (TASK-KL-098).
 *
 * 왜 있나: 「전문적인 사이트」와 「누가 취미로 만든 것」을 가르는 건 색이 아니라 **책임의 표시**다.
 * 지금 잘 돌고 있는지, 무엇이 언제 바뀌었는지, 안 되는 게 있으면 어디에 말하는지 — 이 셋을
 * 밝히는 곳은 관리되는 서비스로 읽히고, 안 밝히는 곳은 언제 조용히 죽어도 모르는 곳으로 읽힌다.
 *
 * 두 자리 다 **실측**이다. 상태는 지금 서버에 직접 물어보고, 변경 기록은 배포할 때 진짜 커밋에서
 * 뽑는다(`scripts/gen-changelog.mjs`). 손으로 적는 「모든 시스템 정상」 배지는 안 만든다 —
 * 그건 서버가 죽어도 초록으로 남아서, 있는 편이 없는 편보다 나쁘다.
 *
 * 서버에 못 닿는 것 자체가 답이다. 그때는 자리를 숨기지 않고 **못 닿았다고 적는다** —
 * 여기는 「지금 어떤가」를 보러 오는 자리라, 여기서까지 조용하면 볼 곳이 없다.
 */
(function (): void {
    interface Health {
        ok?: boolean;
        login?: string;
        backup?: { lastAt: string | null; count: number };
        pulse?: { toolsUsed: number; opensTotal: number; opensToday: number };
        visits?: { total: number; today: number };
    }

    interface ChangeEntry {
        sha: string;
        date: string;
        label: string;
        tone: string;
        text: string;
    }

    const API_BASE = 'https://yawnbot.mascari4615.com';

    /** 여기서 오래 기다리면 「상태 보는 화면」 자체가 멈춘 것처럼 보인다. */
    const TIMEOUT_MS = 6000;

    function esc(value: unknown): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function num(value: unknown): string {
        return Number(value || 0).toLocaleString('ko-KR');
    }

    /** 언제였나 — 「2026-08-08 00:12」 보다 「3시간 전」이 사람에게 먼저 읽힌다. */
    function ago(iso: string | null): string {
        if (!iso) return '없음';
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return '알 수 없음';
        const minutes = Math.floor((Date.now() - then) / 60000);
        if (minutes < 1) return '방금';
        if (minutes < 60) return `${minutes}분 전`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;
        return `${Math.floor(hours / 24)}일 전`;
    }

    function dayLabel(day: string): string {
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
        if (!parts) return day;
        return `${Number(parts[2])}월 ${Number(parts[3])}일`;
    }

    Mdd.injectCSS('status-page', `
        .st-wrap { display:flex; flex-direction:column; gap:22px; }
        .st-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); }
        .st-cards { display:flex; flex-wrap:wrap; gap:12px; }
        .st-card { flex:1 1 160px; min-width:150px; padding:14px 16px;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .st-card-name { font-size:11px; color:var(--text-tertiary); margin-bottom:6px; }
        .st-card-value { font-size:19px; font-weight:700; color:var(--text-primary);
            font-variant-numeric:tabular-nums; }
        .st-card-note { font-size:11px; color:var(--text-tertiary); margin-top:4px; }
        .st-live { display:inline-flex; align-items:center; gap:7px; }
        .st-dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; background:var(--text-tertiary); }
        .st-dot[data-up="1"] { background:#4ade80; box-shadow:0 0 0 3px rgba(74,222,128,.18); }
        .st-dot[data-up="0"] { background:#f87171; box-shadow:0 0 0 3px rgba(248,113,113,.18); }
        .st-link { background:none; border:0; padding:0; font:inherit; font-size:11px;
            color:var(--accent); cursor:pointer; }
        .st-sec-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px;
            margin-bottom:10px; }
        .st-sec-title { margin:0; font-size:var(--font-size-md); font-weight:700; color:var(--text-primary); }
        .st-sec-note { font-size:11px; color:var(--text-tertiary); }
        .st-day { border-top:1px solid var(--border); padding:12px 0 2px; }
        .st-day:first-child { border-top:0; padding-top:0; }
        .st-day-name { font-size:11px; font-weight:700; color:var(--text-tertiary); margin-bottom:6px; }
        .st-row { display:flex; align-items:flex-start; gap:9px; padding:4px 0; }
        .st-tag { flex:0 0 auto; padding:1px 8px; border-radius:999px; font-size:10px; font-weight:700;
            border:1px solid var(--border); color:var(--text-tertiary); }
        /* 이 세 색은 어두운 판을 보고 고른 파스텔이었는데 테마와 상관없이 늘 쓰였다.
           흰 바탕에서는 대비가 1.4~1.9 밖에 안 돼 「새로 생김」·「고침」·「빨라짐」이
           사실상 안 읽혔다(기준 2.2). 밝은 쪽을 기본으로 두고, 어두운 판에서만 원래
           파스텔로 돌린다 — 두 테마가 각자 자기 바탕에 맞는 색을 갖는다. */
        .st-tag[data-tone="new"] { color:#0369a1; border-color:rgba(3,105,161,.35); }
        .st-tag[data-tone="fix"] { color:#b91c1c; border-color:rgba(185,28,28,.35); }
        .st-tag[data-tone="perf"] { color:#a16207; border-color:rgba(161,98,7,.35); }
        html[data-theme="dark"] .st-tag[data-tone="new"] { color:#7dd3fc; border-color:rgba(125,211,252,.4); }
        html[data-theme="dark"] .st-tag[data-tone="fix"] { color:#fca5a5; border-color:rgba(252,165,165,.4); }
        html[data-theme="dark"] .st-tag[data-tone="perf"] { color:#fcd34d; border-color:rgba(252,211,77,.4); }
        .st-text { font-size:var(--font-size-sm); color:var(--text-secondary); line-height:1.55; }
        .st-note { margin:0; font-size:11px; color:var(--text-tertiary); line-height:1.6; }
        .st-fail { padding:14px 16px; border:1px dashed var(--border); border-radius:var(--radius-lg);
            font-size:var(--font-size-sm); color:var(--text-secondary); }
    `);

    async function ask(path: string): Promise<Response | null> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            return await fetch(path, { signal: controller.signal });
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    function renderLive(slot: Element | null, health: Health | null): void {
        if (!slot) return;
        if (!health) {
            slot.innerHTML = `
                <div class="st-fail">
                    <strong>지금 기록 서버에 못 닿았습니다.</strong><br>
                    도구는 전부 브라우저 안에서 돌기 때문에 <b>평소처럼 쓸 수 있습니다</b>.
                    계정·커뮤니티·기록 저장만 잠시 쉽니다. 서버는 집 노트북 한 대라 가끔 이럴 수 있습니다.
                </div>`;
            return;
        }
        const backup = health.backup || { lastAt: null, count: 0 };
        const visits = health.visits || { total: 0, today: 0 };
        // 방문·도구 숫자의 **정본은 광장**이다. 여기에는 오늘치 한 줄만 두고 그리로 보낸다 —
        // 같은 수를 두 곳에서 따로 그리면 언제든 한쪽이 낡는다.
        slot.innerHTML = `
            <div class="st-cards">
                <div class="st-card">
                    <div class="st-card-name">기록 서버</div>
                    <div class="st-card-value st-live"><span class="st-dot" data-up="1"></span>돌고 있음</div>
                    <div class="st-card-note">계정 · 커뮤니티 · 기록 저장</div>
                </div>
                <div class="st-card">
                    <div class="st-card-name">로그인</div>
                    <div class="st-card-value st-live"><span class="st-dot" data-up="${health.login === 'discord' ? '1' : '0'}"></span>${health.login === 'discord' ? '됨' : '쉬는 중'}</div>
                    <div class="st-card-note">디스코드로 시작하기</div>
                </div>
                <div class="st-card">
                    <div class="st-card-name">마지막 백업</div>
                    <div class="st-card-value">${esc(ago(backup.lastAt))}</div>
                    <div class="st-card-note">보관 중인 사본 ${num(backup.count)}벌</div>
                </div>
                ${
                    // 서버가 아직 방문을 안 세는 판본이면 이 칸을 아예 안 만든다 —
                    // 「오늘 방문 0」은 사실이 아니라 「못 물어봤다」이고, 둘은 다르다.
                    health.visits
                        ? `<div class="st-card">
                               <div class="st-card-name">오늘 방문</div>
                               <div class="st-card-value">${num(visits.today)}</div>
                               <div class="st-card-note"><button type="button" class="st-link" id="stToPlaza">전체 통계는 광장에서 →</button></div>
                           </div>`
                        : ''
                }
            </div>`;
        const toPlaza = slot.querySelector('#stToPlaza');
        if (toPlaza) (toPlaza as HTMLButtonElement).onclick = () => Toolbox.switchPage?.('plaza');
    }

    function renderChanges(slot: Element | null, entries: ChangeEntry[] | null): void {
        if (!slot) return;
        if (!entries || entries.length === 0) {
            slot.innerHTML = '<div class="st-fail">변경 기록을 아직 못 불러왔습니다.</div>';
            return;
        }
        // 날짜별로 묶는다 — 같은 날 고친 것 여섯 개가 날짜 여섯 줄로 뜨면 읽히지 않는다.
        const days: { day: string; rows: ChangeEntry[] }[] = [];
        for (const entry of entries) {
            const last = days[days.length - 1];
            if (last && last.day === entry.date) last.rows.push(entry);
            else days.push({ day: entry.date, rows: [entry] });
        }
        slot.innerHTML = days
            .map(
                (group) => `
                <div class="st-day">
                    <div class="st-day-name">${esc(dayLabel(group.day))}</div>
                    ${group.rows
                        .map(
                            (row) => `<div class="st-row">
                                <span class="st-tag" data-tone="${esc(row.tone)}">${esc(row.label)}</span>
                                <span class="st-text">${esc(row.text)}</span>
                            </div>`,
                        )
                        .join('')}
                </div>`,
            )
            .join('');
    }

    async function build(container: HTMLElement): Promise<void> {
        container.innerHTML = `
            <div class="st-wrap">
                <p class="st-lead">지금 잘 돌고 있는지와, 최근에 무엇이 바뀌었는지입니다.
                    아래 숫자는 전부 실제로 일어난 일이고 손으로 적은 값은 하나도 없습니다.</p>
                <div id="stLive"></div>
                <div>
                    <div class="st-sec-head">
                        <h3 class="st-sec-title">변경 기록</h3>
                        <span class="st-sec-note">새 기능 · 고침 · 빨라짐만</span>
                    </div>
                    <div id="stChanges"></div>
                </div>
                <p class="st-note">
                    도구 자체는 전부 브라우저 안에서 돕니다 — 서버가 쉬어도 도구는 그대로 쓸 수 있고,
                    입력한 내용이 서버로 올라가지 않습니다. 서버가 맡는 것은 계정 · 커뮤니티 ·
                    기기 사이 기록 옮기기뿐입니다.<br>
                    안 되는 것을 찾으면 커뮤니티에 남겨 주세요. 여기 적힌 변경은 전부 그렇게 시작했습니다.
                </p>
            </div>`;

        const liveSlot = container.querySelector('#stLive');
        const changeSlot = container.querySelector('#stChanges');

        const [healthResponse, changeResponse] = await Promise.all([
            ask(`${API_BASE}/kl/health`),
            ask('/apps/karmolab/data/changelog.json'),
        ]);
        if (!container.isConnected) return;

        let health: Health | null = null;
        if (healthResponse && healthResponse.ok) {
            try {
                health = (await healthResponse.json()) as Health;
            } catch {
                health = null;
            }
        }
        renderLive(liveSlot, health);

        let entries: ChangeEntry[] | null = null;
        if (changeResponse && changeResponse.ok) {
            try {
                entries = ((await changeResponse.json()) as { entries?: ChangeEntry[] }).entries ?? null;
            } catch {
                entries = null;
            }
        }
        renderChanges(changeSlot, entries);
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('status'),
        tabs: [{ id: 'status-main', label: '상태', build }],
    });
})();
