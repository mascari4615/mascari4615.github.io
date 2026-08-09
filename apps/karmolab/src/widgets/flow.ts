/**
 * 도구 흐름 (TASK-KL-181) — 내 방식대로 이어 붙이고 저장한다.
 *
 * 도구가 160개인데 서로 못 만난다. 「이어서」(KL-133)가 한 쌍을 통하게 했지만 그건 그 자리에서
 * 한 번이다 — 같은 일을 매주 하는 사람은 매주 같은 순서를 손으로 다시 밟는다.
 *
 * 흐름은 **순서를 적어 둔 종이 한 장**이다. 파일도 결과도 서버에 안 올라간다. 실행은 이 화면이
 * 단계를 차례로 열어 주고, 앞 단계 결과는 지금 있는 「이어서」 배선으로 다음 단계에 넘어간다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    type Step = { toolId: string; note?: string; skipWhen?: 'no-result' | 'small' };
    type Flow = {
        id: string;
        title: string;
        ownerHandle: string | null;
        steps: Step[];
        runs: number;
        forkedFrom: string | null;
        /** 결과가 나오면 스스로 다음 단계로 (TASK-KL-191 축1) */
        auto?: boolean;
    };

    /** 실행 중인 흐름 — 화면을 옮겨 다녀야 하므로 이 창에 적어 둔다(탭을 닫으면 끝난다). */
    const RUN_KEY = 'karmolab_flow_run';

    Mdd.injectCSS('flow-page', `
        .flow-wrap { display:flex; flex-direction:column; gap:20px; }
        .flow-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); }
        .flow-list { display:flex; flex-direction:column; gap:10px; }
        .flow-card { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 16px;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .flow-card h4 { margin:0; font-size:var(--font-size-sm); color:var(--text-primary); flex:1 1 160px; }
        .flow-steps { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:2 1 240px; }
        .flow-step { padding:4px 10px; border-radius:999px; border:1px solid var(--border);
            background:var(--bg-tertiary); font-size:var(--font-size-xs); color:var(--text-primary); }
        .flow-arrow { color:var(--text-tertiary); font-size:11px; }
        .flow-meta { font-size:11px; color:var(--text-tertiary); white-space:nowrap; }
        .flow-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .flow-btn { padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:var(--font-size-xs);
            border:1px solid var(--border); background:transparent; color:var(--text-secondary); }
        .flow-btn:hover { border-color:var(--accent); color:var(--text-primary); }
        .flow-btn-go { background:var(--accent); border-color:var(--accent); color:var(--bg-primary); font-weight:600; }
        .flow-make { display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .flow-make input, .flow-make select { padding:8px 10px; border-radius:8px; border:1px solid var(--border);
            background:var(--bg-tertiary); color:var(--text-primary); font:inherit; font-size:var(--font-size-xs); }
        .flow-make-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .flow-make-row > input { flex:1 1 180px; }
        .flow-draft { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:30px; }
        .flow-draft .flow-step { cursor:pointer; }
        .flow-draft .flow-step:hover { border-color:#dc2626; }
        .flow-empty { font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .flow-skip { margin-left:5px; font-size:10px; color:var(--accent); font-weight:600; }
        /* 실행 띠 — 도구 화면 위에 얇게 뜬다. 도구를 가리면 흐름이 방해가 된다. */
        .flow-bar { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:65;
            display:flex; align-items:center; gap:12px; padding:10px 16px; border-radius:999px;
            border:1px solid var(--border); background:var(--bg-secondary); box-shadow:0 8px 24px rgba(0,0,0,.35); }
        .flow-bar-title { font-size:var(--font-size-xs); color:var(--text-primary); }
        .flow-bar-count { font-size:11px; color:var(--text-tertiary); }
        /* 결과가 나온 단추는 빛난다 — 언제 눌러야 하는지를 사람이 판단하지 않아도 되게. */
        .flow-btn.flow-ready { animation:flow-pulse 1.2s ease-in-out infinite; }
        @keyframes flow-pulse {
            0%, 100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
            50% { box-shadow:0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); }
        }
        @media (prefers-reduced-motion: reduce) { .flow-btn.flow-ready { animation:none; outline:2px solid var(--accent); } }
        /* 스스로 넘어가는 중 — 남은 초가 보이고, 그 자리에서 멈출 수 있다 (TASK-KL-191 축1) */
        .flow-bar-auto { font-size:11px; color:var(--accent); font-weight:600; }
        .flow-auto-toggle { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--text-tertiary); cursor:pointer; }
        .flow-auto-toggle input { accent-color:var(--accent); }
        .flow-auto-tag { margin-left:6px; font-size:10px; color:var(--accent); font-weight:600; }
    `);

    const api = (): string | null => window.KarmoAccount?.apiBase ?? null;

    function toolTitle(id: string): string {
        const meta = (window.KARMOLAB_LAZY_META_BY_ID ?? {})[id] as { title?: string } | undefined;
        return meta?.title || id;
    }

    function escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── 실행 ─────────────────────────────────────────────────────────
     *
     * 화면을 옮기며 도는 일이라 「지금 몇 번째인가」를 창에 적어 둔다. 탭을 닫으면 사라지는 게
     * 맞다 — 어제 시작한 흐름이 오늘 갑자기 이어지면 그건 자동화가 아니라 유령이다.
     */
    type RunState = { id: string; title: string; steps: Step[]; at: number; started: number; auto?: boolean };

    function readRun(): RunState | null {
        try {
            const raw = sessionStorage.getItem(RUN_KEY);
            return raw ? (JSON.parse(raw) as RunState) : null;
        } catch {
            return null;
        }
    }

    function writeRun(state: RunState | null): void {
        try {
            if (state) sessionStorage.setItem(RUN_KEY, JSON.stringify(state));
            else sessionStorage.removeItem(RUN_KEY);
        } catch {
            /* 저장이 막혀도 이번 단계는 돈다 */
        }
        paintBar();
    }

    function startRun(flow: Flow): void {
        writeRun({ id: flow.id, title: flow.title, steps: flow.steps, at: 0, started: Date.now(), auto: flow.auto === true });
        const base = api();
        if (base) {
            void fetch(`${base}/kl/flows/${encodeURIComponent(flow.id)}/run`, { method: 'POST', credentials: 'include' }).catch(() => {});
        }
        goStep(0);
    }

    /**
     * 이 단계를 건너뛸까 (TASK-KL-183 B).
     * 근거는 **직전에 실제로 나온 결과**뿐이다 — 없는 것을 추측해 건너뛰지 않는다.
     */
    function shouldSkip(step: Step): boolean {
        if (!step.skipWhen) return false;
        if (step.skipWhen === 'no-result') return !lastResult;
        if (step.skipWhen === 'small') return !!lastResult && lastResult.size > 0 && lastResult.size < 1024 * 1024;
        return false;
    }

    /* ── 스스로 이어감 (TASK-KL-191 축1) ─────────────────────────────
     *
     * 「자동화」라고 적어 두고 사람이 단계마다 **다음**을 눌러야 했다. 그런데 그 시점에
     * 결과는 이미 나와 있고(`karmolab-result`), 다음 도구는 이미 그 결과를 집어 갈 줄 안다
     * (`onHandoff`). 남은 것은 클릭 하나 — 그게 자동화와 반자동을 갈랐다.
     *
     * 서버가 대신 도는 것은 여전히 불가능하다(도구가 전부 브라우저 안에서 돈다). 자동은
     * **이 창 안에서** 일어난다. 그리고 **셀 수 있게** 한다: 결과를 확인할 틈은 사람의
     * 것이고, 못 멈추는 자동은 자동이 아니라 덫이다.
     */
    const AUTO_GRACE_MS = 4000;
    let autoTimer: ReturnType<typeof setInterval> | null = null;

    function cancelAuto(): void {
        if (!autoTimer) return;
        clearInterval(autoTimer);
        autoTimer = null;
    }

    /** 결과가 나왔고 자동이 켜져 있으면 — 초를 세고 넘어간다. 세는 동안 아무 때나 멈춘다. */
    function armAuto(run: RunState): void {
        cancelAuto();
        const bar = document.querySelector('.flow-bar');
        const goBtn = bar?.querySelector<HTMLElement>('[data-flow-next], [data-flow-done]');
        if (!bar || !goBtn) return;
        let left = Math.round(AUTO_GRACE_MS / 1000);
        const mark = document.createElement('span');
        mark.className = 'flow-bar-auto';
        bar.insertBefore(mark, goBtn);
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'flow-btn';
        stop.textContent = t('flow.t19');
        stop.addEventListener('click', () => {
            cancelAuto();
            mark.remove();
            stop.remove();
            Toolbox.showToast?.(t('flow.t20'));
        });
        bar.insertBefore(stop, goBtn);
        const tick = (): void => {
            mark.textContent = t('flow.autoNext', { n: left });
            if (left <= 0) {
                cancelAuto();
                const now = readRun();
                if (!now) return;
                if (now.steps[now.at + 1]) goStep(now.at + 1);
                else finishRun(now);
                return;
            }
            left -= 1;
        };
        tick();
        autoTimer = setInterval(tick, 1000);
    }

    function finishRun(run: RunState): void {
        noteTrail(run, true);
        writeRun(null);
        Toolbox.showToast?.(t('flow.t21'));
    }

    function goStep(index: number): void {
        cancelAuto();
        const run = readRun();
        if (!run) return;
        // 건너뛸 단계는 지나친다. 다 건너뛰면 흐름이 끝난 것이다.
        let at = index;
        while (run.steps[at] && shouldSkip(run.steps[at])) at += 1;
        if (!run.steps[at]) {
            noteTrail({ ...run, at: Math.max(0, at - 1) }, true);
            writeRun(null);
            Toolbox.showToast?.(t('flow.t22'));
            return;
        }
        if (at !== index) Toolbox.showToast?.(t('flow.skipped', { n: index + 1 }));
        writeRun({ ...run, at });
        Toolbox.switchPage?.(run.steps[at].toolId);
    }

    /** 실행 띠 — 어디쯤 왔고 다음이 무엇인지. 도구 화면을 가리지 않게 아래에 얇게 뜬다. */
    function paintBar(): void {
        document.querySelector('.flow-bar')?.remove();
        const run = readRun();
        if (!run) return;
        const step = run.steps[run.at];
        const next = run.steps[run.at + 1];
        const bar = document.createElement('div');
        bar.className = 'flow-bar';
        bar.innerHTML =
            `<span class="flow-bar-title">${escapeHtml(run.title)}</span>` +
            `<span class="flow-bar-count">${run.at + 1} / ${run.steps.length} · ${t('flow.nowAt', { tool: escapeHtml(toolTitle(step.toolId)) })}` +
            `${run.auto ? t('flow.t23') : ''}</span>` +
            (next
                ? `<button type="button" class="flow-btn flow-btn-go" data-flow-next>${t('flow.next', { tool: escapeHtml(toolTitle(next.toolId)) })} →</button>`
                : t('flow.t24')) +
            t('flow.t25');
        document.body.appendChild(bar);
        bar.querySelector('[data-flow-next]')?.addEventListener('click', () => goStep(run.at + 1));
        bar.querySelector('[data-flow-done]')?.addEventListener('click', () => finishRun(run));
        bar.querySelector('[data-flow-stop]')?.addEventListener('click', () => {
            /* 그만둔 것도 자국이다 — 오히려 **어디서 막히는지**는 여기서만 드러난다. */
            cancelAuto();
            noteTrail(run, false);
            writeRun(null);
        });
    }

    /**
     * 한 판의 자국 (TASK-KL-182 F5) — 몇 번째까지 갔나 · 얼마나 걸렸나.
     * 파일도 결과도 안 보낸다. 이 두 값만이 「어느 단계가 막히나」를 말한다.
     */
    function noteTrail(run: RunState, finished: boolean): void {
        const base = api();
        if (!base) return;
        void fetch(`${base}/kl/flows/${encodeURIComponent(run.id)}/trail`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reached: run.at + 1,
                finished,
                seconds: run.started ? Math.round((Date.now() - run.started) / 1000) : null,
            }),
        }).catch(() => {
            /* 자국 한 줄 못 남긴 것과 흐름이 안 된 것은 다른 무게다 */
        });
    }

    /* ── 화면 ─────────────────────────────────────────────────────── */

    async function loadFlows(): Promise<{ flows: Flow[]; mine: Flow[] } | null> {
        const base = api();
        if (!base) return null;
        try {
            const res = await fetch(`${base}/kl/flows`, { credentials: 'include' });
            if (!res.ok) return null;
            return (await res.json()) as { flows: Flow[]; mine: Flow[] };
        } catch {
            return null;
        }
    }

    function stepsHtml(steps: Step[]): string {
        return steps
            .map((step) => `<span class="flow-step">${escapeHtml(toolTitle(step.toolId))}</span>`)
            .join('<span class="flow-arrow">→</span>');
    }

    function cardHtml(flow: Flow, mine: boolean): string {
        return `
            <div class="flow-card" data-flow="${escapeHtml(flow.id)}">
                <h4>${escapeHtml(flow.title)}</h4>
                <div class="flow-steps">${stepsHtml(flow.steps)}</div>
                <span class="flow-meta" data-summary-for="${escapeHtml(flow.id)}">${flow.runs}번 돌았음${flow.ownerHandle ? ` · @${escapeHtml(flow.ownerHandle)}` : ''}${flow.auto ? t('flow.t26') : ''}</span>
                <div class="flow-actions">
                    <button type="button" class="flow-btn flow-btn-go" data-run="${escapeHtml(flow.id)}">${esc(t('flow.t04'))}</button>
                    ${mine
                        ? /* 단계가 하나뿐이면 이어갈 다음이 없다 — 켤 수 없는 것을 켜는 자리로 두지 않는다 */
                          `${flow.steps.length > 1
                              ? `<label class="flow-auto-toggle" title="${esc(t('flow.t01'))}">
                                     <input type="checkbox" data-auto="${escapeHtml(flow.id)}"${flow.auto ? ' checked' : ''}> ${esc(t('flow.t05'))}
                                 </label>`
                              : ''}
                           <button type="button" class="flow-btn" data-del="${escapeHtml(flow.id)}">${esc(t('flow.t06'))}</button>`
                        : `<button type="button" class="flow-btn" data-fork="${escapeHtml(flow.id)}">${esc(t('flow.t07'))}</button>`}
                </div>
            </div>`;
    }

    async function build(container: HTMLElement): Promise<void> {
        container.innerHTML = t('flow.t27');
        const data = await loadFlows();
        if (!container.isConnected) return;
        if (!data) {
            container.innerHTML =
                t('flow.t28');
            return;
        }

        const signedIn = !!window.KarmoAccount?.state.account;
        const others = data.flows.filter((flow) => !data.mine.some((m) => m.id === flow.id));

        container.innerHTML = `
            <div class="flow-wrap">
                <p class="flow-lead">${esc(t('flow.t08'))} <b>${esc(t('flow.t09'))}</b>${esc(t('flow.t10'))} <b>${esc(t('flow.t11'))}</b>${esc(t('flow.t12'))}</p>

                <div class="user-section">
                    <h3>${esc(t('flow.t13'))}</h3>
                    ${signedIn
                        ? `<div class="flow-make">
                               <div class="flow-make-row">
                                   <input type="text" data-title placeholder="${esc(t('flow.t02'))}" maxlength="40">
                                   <select data-pick></select>
                                   <select data-skip title="${esc(t('flow.t03'))}">
                                       <option value="">${esc(t('flow.t14'))}</option>
                                       <option value="no-result">${esc(t('flow.opt.noresult'))}</option>
                                       <option value="small">${esc(t('flow.opt.small'))}</option>
                                   </select>
                                   <button type="button" class="flow-btn" data-add>${esc(t('flow.t15'))}</button>
                               </div>
                               <div class="flow-draft" data-draft><span class="flow-empty">${esc(t('flow.t16'))}</span></div>
                               <div class="flow-make-row">
                                   <button type="button" class="flow-btn flow-btn-go" data-save>${esc(t('flow.t17'))}</button>
                                   <span class="flow-empty">${esc(t('flow.t18'))}</span>
                               </div>
                           </div>`
                        : t('flow.t29')}
                </div>

                <div class="user-section">
                    <h3>🧰 내 흐름 (${data.mine.length})</h3>
                    <div class="flow-list">${data.mine.map((flow) => cardHtml(flow, true)).join('') || t('flow.t30')}</div>
                </div>

                <div class="user-section">
                    <h3>🌍 남들이 만든 것 (${others.length})</h3>
                    <div class="flow-list">${others.map((flow) => cardHtml(flow, false)).join('') || t('flow.t30')}</div>
                </div>
            </div>`;

        wireCards(container);
        void paintSummaries(container);
        if (signedIn) wireMaker(container);
        paintBar();
    }

    /**
     * 어디서 막히나 (TASK-KL-182 F5) — 자국이 있는 흐름에만 한 줄 붙는다.
     * 자국이 없으면 아무 말도 안 한다. 「0% 완주」 같은 수는 아직 아무것도 안 말해 준다.
     */
    async function paintSummaries(container: HTMLElement): Promise<void> {
        const base = api();
        if (!base) return;
        const slots = [...container.querySelectorAll<HTMLElement>('[data-summary-for]')];
        await Promise.all(
            slots.map(async (slot) => {
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(slot.dataset.summaryFor ?? '')}/summary`);
                    if (!res.ok) return;
                    const summary = ((await res.json()) as {
                        summary?: { runs: number; finished: number; stuckStep: number | null; medianSeconds: number | null };
                    }).summary;
                    if (!summary) return;
                    const parts = [t('flow.finished', { done: summary.finished, runs: summary.runs })];
                    if (summary.medianSeconds !== null) parts.push(t('flow.median', { n: summary.medianSeconds }));
                    if (summary.stuckStep !== null && summary.finished < summary.runs) {
                        parts.push(t('flow.stuck', { n: summary.stuckStep }));
                    }
                    slot.textContent = `${slot.textContent} · ${parts.join(' · ')}`;
                } catch {
                    /* 요약을 못 받아도 카드는 그대로다 */
                }
            }),
        );
    }

    function wireCards(container: HTMLElement): void {
        const all = [...container.querySelectorAll<HTMLElement>('.flow-card')];
        const flowOf = (id: string): Flow | null => {
            const card = all.find((node) => node.dataset.flow === id);
            if (!card) return null;
            const steps = [...card.querySelectorAll('.flow-steps .flow-step')].map((node) => node.textContent ?? '');
            // 화면 글자가 아니라 서버에서 받은 값을 써야 하지만, 시작에 필요한 것은 순서뿐이라
            // 카드에 담아 둔 id 를 그대로 쓴다.
            return {
                id,
                title: card.querySelector('h4')?.textContent ?? t('flow.t31'),
                ownerHandle: null,
                steps: (card.dataset.steps ?? '').split(',').filter(Boolean).map((toolId) => ({ toolId })),
                runs: 0,
                forkedFrom: null,
            } as Flow & { _labels?: string[] };
        };
        container.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                const id = button.dataset.run ?? '';
                if (!base) return;
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(id)}`);
                    if (!res.ok) throw new Error(String(res.status));
                    const flow = ((await res.json()) as { flow: Flow }).flow;
                    startRun(flow);
                } catch {
                    Toolbox.showToast?.(t('flow.t32'));
                }
            });
        });
        /* 스스로 이어감 켜기·끄기 (TASK-KL-191 축1) — 서버는 이 선택만 지킨다(돌리지는 않는다). */
        container.querySelectorAll<HTMLInputElement>('[data-auto]').forEach((box) => {
            box.addEventListener('change', async () => {
                const base = api();
                if (!base) return;
                const want = box.checked;
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(box.dataset.auto ?? '')}/auto`, {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ on: want }),
                    });
                    if (!res.ok) throw new Error(String(res.status));
                    const saved = (await res.json()) as { auto?: boolean };
                    // 화면은 **서버가 답한 값**을 따른다 — 눌린 대로 두면 저장 안 된 것이 켜져 보인다.
                    box.checked = saved.auto === true;
                    Toolbox.showToast?.(box.checked ? t('flow.t33') : t('flow.t34'));
                } catch {
                    box.checked = !want;
                    Toolbox.showToast?.(t('flow.t35'));
                }
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-fork]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                if (!base) return;
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(button.dataset.fork ?? '')}/fork`, {
                        method: 'POST',
                        credentials: 'include',
                    });
                    Toolbox.showToast?.(res.ok ? t('flow.t36') : t('flow.t37'));
                    if (res.ok) void build(button.closest('.tab-panel') ?? document.createElement('div'));
                } catch {
                    Toolbox.showToast?.(t('flow.t37'));
                }
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!confirm(t('flow.t38'))) return;
                const base = api();
                if (!base) return;
                await fetch(`${base}/kl/flows/${encodeURIComponent(button.dataset.del ?? '')}`, {
                    method: 'DELETE',
                    credentials: 'include',
                }).catch(() => {});
                void build(button.closest('.tab-panel') ?? document.createElement('div'));
            });
        });
        void flowOf;
    }

    function wireMaker(container: HTMLElement): void {
        const pick = container.querySelector<HTMLSelectElement>('[data-pick]');
        const draftSlot = container.querySelector<HTMLElement>('[data-draft]');
        const titleInput = container.querySelector<HTMLInputElement>('[data-title]');
        if (!pick || !draftSlot || !titleInput) return;

        /* 고를 수 있는 것은 여전히 **도구 전부**다 — 형식을 안 밝힌 도구를 빼면 흐름을 못 만든다.
         * 다만 앞 단계가 정해지면 **이어지는 것을 위로 올린다** (TASK-KL-183 A):
         * 앞 도구가 내놓는 형식을 받을 수 있다고 밝힌(`accepts`) 도구가 먼저 온다.
         * 거르지 않고 **줄만 세운다** — 고르는 자유는 그대로 두고 눈만 덜 피곤하게. */
        const metas = (window.KARMOLAB_LAZY_META ?? []) as Array<{
            id: string;
            title?: string;
            hidden?: boolean;
            accepts?: string[];
            produces?: string[];
        }>;
        const byId = new Map(metas.map((meta) => [meta.id, meta]));

        /* 묶음은 **자식이 하는 일을 대신 말한다** (TASK-KL-183 A).
         *
         * 형식 선언(`accepts`·`produces`)은 실제로 일하는 도구에 붙어 있는데, 그 도구들 상당수가
         * 묶음 탭 안으로 들어가며 목록에서 숨겨졌다(`hidden`). 그러면 화면에 보이는 대표는
         * 아무 형식도 안 밝힌 것이 되어 「이어지는 도구」가 영영 안 뜬다.
         * 그래서 자식 것을 합쳐서 본다 — 두 벌로 적지 않고 **파생**한다. */
        /* 선언은 셸이 읽는다 (TASK-KL-191) — 여기서 `meta.accepts` 를 직접 뒤지면 형식을 재는
         * 자가 두 개가 된다(셸의 「이어서」 줄과 이 화면의 ↳ 가 서로 다른 답을 냈었다).
         * 묶음이 자식을 대신 말하는 것만 이 화면의 몫이다 — 셸은 낱개 도구를 다룬다. */
        const declared = (id: string, key: 'accepts' | 'produces'): string[] =>
            (key === 'accepts' ? Toolbox.declaredAccepts?.(id) : Toolbox.declaredProduces?.(id)) ?? [];

        const kindsOf = (id: string, key: 'accepts' | 'produces'): string[] => {
            const children = metas
                .filter((meta) => (meta as { bundle?: string }).bundle === id)
                .flatMap((meta) => declared(meta.id, key));
            return [...new Set([...declared(id, key), ...children])];
        };

        const canFollow = (candidate: (typeof metas)[number], prevId: string | null): boolean => {
            if (!prevId) return false;
            const outs = kindsOf(prevId, 'produces');
            const ins = kindsOf(candidate.id, 'accepts');
            if (!outs.length || !ins.length) return false;
            return outs.some((out) => ins.some((accept) => Toolbox.kindMatches?.(accept, out) ?? false));
        };

        const paintPicker = (): void => {
            const prevId = draft.length ? draft[draft.length - 1].toolId : null;
            const rows = metas
                .filter((meta) => !meta.hidden)
                .map((meta) => ({ meta, follows: canFollow(meta, prevId) }))
                .sort((a, b) => {
                    if (a.follows !== b.follows) return a.follows ? -1 : 1;
                    return (a.meta.title ?? a.meta.id).localeCompare(b.meta.title ?? b.meta.id);
                });
            pick.innerHTML = rows
                .map(
                    ({ meta, follows }) =>
                        `<option value="${escapeHtml(meta.id)}">${follows ? '↳ ' : ''}${escapeHtml(meta.title ?? meta.id)}</option>`,
                )
                .join('');
        };

        let draft: Step[] = [];
        const paintDraft = (): void => {
            paintPicker();
            draftSlot.innerHTML = draft.length
                ? draft
                      .map(
                          (step, index) =>
                              `<span class="flow-step" data-drop="${index}">${escapeHtml(toolTitle(step.toolId))}` +
                              `${step.skipWhen ? `<b class="flow-skip">${step.skipWhen === 'small' ? t('flow.t39') : t('flow.t40')}</b>` : ''} ✕</span>`,
                      )
                      .join('<span class="flow-arrow">→</span>')
                : t('flow.t41');
            draftSlot.querySelectorAll<HTMLElement>('[data-drop]').forEach((node) => {
                node.addEventListener('click', () => {
                    draft = draft.filter((_, index) => index !== Number(node.dataset.drop));
                    paintDraft();
                });
            });
        };

        // 첫 그림 — 고를 목록과 빈 초안을 한 번 그려 둔다.
        paintDraft();

        container.querySelector('[data-add]')?.addEventListener('click', () => {
            if (draft.length >= 8) {
                Toolbox.showToast?.(t('flow.t42'));
                return;
            }
            const skip = container.querySelector<HTMLSelectElement>('[data-skip]')?.value;
            draft.push(skip === 'no-result' || skip === 'small' ? { toolId: pick.value, skipWhen: skip } : { toolId: pick.value });
            paintDraft();
        });

        container.querySelector('[data-save]')?.addEventListener('click', async () => {
            const base = api();
            if (!base) return;
            if (!titleInput.value.trim() || draft.length === 0) {
                Toolbox.showToast?.(t('flow.t43'));
                return;
            }
            try {
                const res = await fetch(`${base}/kl/flows`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: titleInput.value, steps: draft }),
                });
                if (!res.ok) throw new Error(String(res.status));
                Toolbox.showToast?.(t('flow.t44'));
                void loadNamespace('flow').then(() => build(container));
            } catch {
                Toolbox.showToast?.(t('flow.t45'));
            }
        });
    }

    /* 결과가 나오면 띠가 **먼저 안다** (TASK-KL-183 A).
     *
     * 지금까지는 사람이 「다음」을 눌러야 했고, 언제 눌러야 하는지는 스스로 판단해야 했다.
     * 도구가 결과를 내놓는 순간 그 단추가 빛나면, 흐름이 화면을 따라오는 것이 아니라
     * **화면이 흐름을 따라간다**. 자동으로 넘기지는 않는다 — 결과를 확인할 틈은 사람의 것이다. */
    /** 이번 단계에서 무엇이 나왔나 — 건너뛰기 판정의 유일한 근거(TASK-KL-183 B). */
    let lastResult: { type: string; size: number } | null = null;

    window.addEventListener('karmolab-result', (event) => {
        const detail = (event as CustomEvent).detail as { type?: string; size?: number } | undefined;
        lastResult = { type: detail?.type ?? '', size: Number(detail?.size) || 0 };
        const bar = document.querySelector('.flow-bar');
        const next = bar?.querySelector<HTMLElement>('[data-flow-next], [data-flow-done]');
        if (!next) return;
        next.classList.add('flow-ready');
        const run = readRun();
        const step = run?.steps[run.at];
        if (step && bar) {
            const count = bar.querySelector('.flow-bar-count');
            if (count && !count.textContent?.includes(t('flow.t46'))) count.textContent += t('flow.t47');
        }
        /* 자동이 켜져 있으면 여기서부터는 손이 필요 없다 — 초를 세고 스스로 넘어간다. */
        if (run?.auto) armAuto(run);
    });

    /* 알림을 누르면 **그 흐름이 바로 시작한다** (TASK-KL-191 축1).
     *
     * 예약 알림이 목록으로 보내던 시절엔, 알림을 누른 사람이 목록에서 다시 찾아 다시 눌러야
     * 했다 — 「때가 됐다」를 알려 주고 정작 시작은 사람에게 미룬 셈이다. 주소에 흐름 이름이
     * 실려 오면 그 자리에서 시작한다. 스스로 이어가기가 켜져 있으면 그 한 번이 끝까지 간다.
     *
     * 주소는 시작한 뒤 지운다 — 안 지우면 새로고침마다 같은 흐름이 다시 시작한다.
     */
    async function startFromLink(): Promise<void> {
        const wanted = new URLSearchParams(location.search).get('flow');
        if (!wanted) return;
        const url = new URL(location.href);
        url.searchParams.delete('flow');
        history.replaceState(null, '', url.toString());
        const base = api();
        if (!base) return;
        try {
            const res = await fetch(`${base}/kl/flows/${encodeURIComponent(wanted)}`);
            if (!res.ok) throw new Error(String(res.status));
            const flow = ((await res.json()) as { flow: Flow }).flow;
            if (!flow?.steps?.length) return;
            startRun(flow);
        } catch {
            Toolbox.showToast?.(t('flow.t48'));
        }
    }
    void startFromLink();

    // 도구 화면으로 옮겨 다녀도 띠는 따라온다.
    window.addEventListener('hashchange', paintBar);
    if (document.readyState === 'complete') paintBar();
    else window.addEventListener('load', paintBar);

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('flow'),
        tabs: [
            {
                id: 'flow-main',
                label: t('flow.t31', undefined, "흐름"),
                build: (container: HTMLElement) => {
                    /* 로그인 상태는 처음엔 **아직 모름**이다 (계정 확인이 늦게 온다).
                     * 한 번만 그리면 로그인한 사람에게도 「만들려면 로그인」이 남는다 —
                     * 상태가 정해질 때 다시 그린다. */
                    let drawnFor: string | null | undefined;
                    const account = window.KarmoAccount;
                    if (!account) {
                        void loadNamespace('flow').then(() => build(container));
                        return;
                    }
                    const off = account.subscribe((state) => {
                        if (state.loading) return;
                        const key = state.account?.handle ?? null;
                        if (drawnFor === key) return;
                        drawnFor = key;
                        void loadNamespace('flow').then(() => build(container));
                    });
                    Toolbox.onDispose?.(off);
                },
            },
        ],
    });
})();
