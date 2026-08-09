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
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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


    function num(value: unknown): string {
        return Number(value || 0).toLocaleString('ko-KR');
    }

    /** 언제였나 — 「2026-08-08 00:12」 보다 「3시간 전」이 사람에게 먼저 읽힌다. */
    function ago(iso: string | null): string {
        if (!iso) return t('status.t18');
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return t('status.t19');
        const minutes = Math.floor((Date.now() - then) / 60000);
        if (minutes < 1) return t('status.t20');
        if (minutes < 60) return t('status.ago.min', { n: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('status.ago.hour', { n: hours });
        return t('status.ago.day', { n: Math.floor(hours / 24) });
    }

    function dayLabel(day: string): string {
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
        if (!parts) return day;
        return t('status.monthDay', { m: Number(parts[2]), d: Number(parts[3]) });
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
        .st-feed { color:var(--accent); text-decoration:none; }
        .st-feed:hover { text-decoration:underline; }
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
                    <strong>${esc(t('status.t01'))}</strong><br>
                    ${esc(t('status.t02'))} <b>${esc(t('status.t03'))}</b>${esc(t('status.t04'))}
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
                    <div class="st-card-name">${esc(t('status.t05'))}</div>
                    <div class="st-card-value st-live"><span class="st-dot" data-up="1"></span>${esc(t('status.t06'))}</div>
                    <div class="st-card-note">${esc(t('status.t07'))}</div>
                </div>
                <div class="st-card">
                    <div class="st-card-name">${esc(t('status.t08'))}</div>
                    <div class="st-card-value st-live"><span class="st-dot" data-up="${health.login === 'discord' ? '1' : '0'}"></span>${health.login === 'discord' ? t('status.t21') : t('status.t22')}</div>
                    <div class="st-card-note">${esc(t('status.t09'))}</div>
                </div>
                <div class="st-card">
                    <div class="st-card-name">${esc(t('status.t10'))}</div>
                    <div class="st-card-value">${esc(ago(backup.lastAt))}</div>
                    <div class="st-card-note">보관 중인 사본 ${num(backup.count)}벌</div>
                </div>
                ${
                    // 서버가 아직 방문을 안 세는 판본이면 이 칸을 아예 안 만든다 —
                    // 「오늘 방문 0」은 사실이 아니라 「못 물어봤다」이고, 둘은 다르다.
                    health.visits
                        ? `<div class="st-card">
                               <div class="st-card-name">${esc(t('status.t11'))}</div>
                               <div class="st-card-value">${num(visits.today)}</div>
                               <div class="st-card-note"><button type="button" class="st-link" id="stToPlaza">${esc(t('status.btn.stToPlaza'))}</button></div>
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
            slot.innerHTML = t('status.t23');
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
                <p class="st-lead">${esc(t('status.t12'))}</p>
                <div id="stLive"></div>
                <div>
                    <div class="st-sec-head">
                        <h3 class="st-sec-title">${esc(t('status.t13'))}</h3>
                        <span class="st-sec-note">${esc(t('status.t14'))}
                            <a class="st-feed" href="/karmolab/changes.xml">${esc(t('status.t15'))}</a></span>
                    </div>
                    <div id="stChanges"></div>
                </div>
                <p class="st-note">
                    ${esc(t('status.t16'))}<br>
                    ${esc(t('status.t17'))}
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
        tabs: [
            {
                id: 'status-main',
                label: t('status.tab.main', undefined, '상태'),
                /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    void loadNamespace('status').then(function () {
                        build(container);
                    });
                },
            },
        ],
    });
})();
