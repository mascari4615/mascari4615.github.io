/**
 * 환경 설정 (TASK-KL-139) — 「내 정보」에서 떼어 낸 화면.
 *
 * 왜 떼었나: 테마·API 키·저장소는 **이 브라우저의 설정**이고, 도전과제·계정은 **나**다.
 * 한 위젯 안에 있으면 로그인한 사람의 신원 옆에 코드 하이라이트 고르는 칸이 붙는다 —
 * 어느 쪽도 자기 자리처럼 보이지 않는다. 이 화면은 로그인과 무관하고, 서버가 죽어도 멀쩡하다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    type StorageItemStat = { key: string; bytes: number; valLen: number };

    Mdd.injectCSS('settings-page', `
        .settings-layout { display:flex; flex-direction:column; gap:24px; }
        .settings-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 16px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:8px; }
        .settings-row label { font-size:var(--font-size-sm); font-weight:500; color:var(--text-primary); white-space:nowrap; flex-shrink:0; }
        .settings-row .settings-control { min-width:140px; }
        /* 견본처럼 폭이 필요한 것은 한 줄에 나란히 두지 않고 아래로 편다 */
        .settings-row-stack { display:block; }
        .settings-row-stack label { display:block; margin-bottom:10px; }
        .settings-section { margin-bottom:24px; }
        .settings-section h3 { font-size:14px; color:var(--text-secondary); margin-bottom:12px; }
        .settings-danger { border-color:var(--error-subtle); background:var(--error-subtle); }
        .settings-danger .btn-ghost { color:var(--error); }
        .settings-code-preview { margin-top:12px; font-size:var(--font-size-xs); }
        .settings-code-preview pre { margin:0; border-radius:var(--radius-md); overflow-x:auto; }
        .settings-code-preview pre code { padding:12px 14px; line-height:1.5; display:block; font-size:var(--font-size-xs); }
        .storage-summary { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
        .storage-card { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 20px; min-width:140px; }
        .storage-card-value { font-size:22px; font-weight:700; color:var(--accent); font-family:monospace; }
        .storage-card-label { font-size:var(--font-size-xs); color:var(--text-secondary); margin-top:4px; }
        .storage-table { width:100%; border-collapse:collapse; font-size:var(--font-size-xs); }
        .storage-table th, .storage-table td { padding:8px 12px; text-align:left; border-bottom:1px solid var(--border); }
        .storage-table th { background:var(--bg-secondary); color:var(--text-secondary); font-weight:600; }
        .storage-table td:last-child, .storage-table th:last-child { text-align:right; font-family:monospace; }
        .storage-table .storage-key { font-family:monospace; font-size:var(--font-size-xs); color:var(--text-primary); word-break:break-all; }
        .storage-table .storage-desc { font-size:var(--font-size-xs); color:var(--text-tertiary); max-width:200px; }
    `);

    function escapeHtml(s: string | null | undefined): string {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ===== 표시 · API ===== */

    function buildDisplay(container: HTMLElement): void {
        Mdd.linePreset('tool_run', { msg: t('settings.t21') });
        void renderDisplay(container);
    }

    async function renderDisplay(container: HTMLElement): Promise<void> {
        // KL-054: gemini/prism = eager 제거 → 설정 진입 시 로드.
        try {
            await Toolbox.ensureScript?.('root/gemini');
            await Toolbox.ensureScript?.('vendor/prism.min');
        } catch (_) {
            /* typeof 가드가 부재 시 안전 폴백 */
        }

        const theme = Toolbox.getTheme?.() ?? 'dark';
        const prismTheme = Toolbox.getPrismTheme?.() ?? '';
        const prismThemes = Toolbox.getPrismThemes?.() ?? [];
        const bgTheme = Toolbox.getBgTheme?.() ?? '';
        const bgThemes = Toolbox.getBgThemes?.() ?? [];
        const navLayout = Toolbox.getNavLayout?.() ?? 'header';
        const apiUI = typeof Gemini !== 'undefined' ? Gemini.buildApiKeyUI('set') : { html: '' };

        container.innerHTML = `
            <div class="settings-layout">
                <div class="settings-section">
                    <h3>${esc(t('settings.t01'))}</h3>
                    <div class="settings-row">
                        <label for="setNavLayout">${esc(t('settings.label.setNavLayout'))}</label>
                        <select id="setNavLayout" class="settings-control">
                            <option value="header" ${navLayout === 'header' ? 'selected' : ''}>${esc(t('settings.opt.header'))}</option>
                            <option value="sidebar" ${navLayout === 'sidebar' ? 'selected' : ''}>${esc(t('settings.opt.sidebar'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="setTheme">${esc(t('settings.label.setTheme'))}</label>
                        <select id="setTheme" class="settings-control">
                            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>${esc(t('settings.opt.dark'))}</option>
                            <option value="light" ${theme === 'light' ? 'selected' : ''}>${esc(t('settings.opt.light'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="setPrism">${esc(t('settings.label.setPrism'))}</label>
                        <select id="setPrism" class="settings-control">
                            ${prismThemes.map((t) => `<option value="${t.id}" ${t.id === prismTheme ? 'selected' : ''}>${t.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="settings-row settings-row-stack">
                        <label>${esc(t('settings.aria.setBgTheme'))}</label>
                        <!-- 이름만 늘어놓으면 무엇을 고르는지 알 수 없다. 견본은 진짜 배경과
                             **같은 스타일 규칙**을 물려받아 그려진다 — 테마를 손보면 견본도 같이
                             바뀐다 (값을 두 벌 적지 않는다). -->
                        <div class="settings-bg-picker" id="setBgTheme" role="group" aria-label="${esc(t('settings.aria.setBgTheme'))}">
                            ${bgThemes.map((t) => `
                                <button type="button" class="bg-swatch" data-bg="${t.id}"
                                        aria-pressed="${t.id === bgTheme}" title="${t.label}">
                                    <span class="bg-swatch-name">${t.label}</span>
                                </button>`).join('')}
                        </div>
                    </div>
                    <div class="settings-code-preview">
                        <pre class="language-javascript"><code class="language-javascript">function hello() {
  const name = "World";
  return \`Hello, \${name}!\`;
}</code></pre>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>${esc(t('settings.t02'))}</h3>
                    <div class="settings-row">
                        <label for="setCopresence">${esc(t('settings.label.setCopresence'))}</label>
                        <select id="setCopresence" class="settings-control">
                            <option value="on">${esc(t('settings.opt.on'))}</option>
                            <option value="off">${esc(t('settings.opt.off'))}</option>
                        </select>
                    </div>
                    <p style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin:0 0 8px;">
                        ${esc(t('settings.t03'))}
                    </p>
                </div>
                <div class="settings-section">
                    <h3>🔑 API</h3>
                    ${apiUI.html}
                </div>
            </div>`;

        container.querySelector<HTMLSelectElement>('#setNavLayout')?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            Toolbox.setNavLayout?.(target.value);
            const label = target.value === 'sidebar' ? t('settings.opt.sidebar') : t('settings.opt.header');
            Toolbox.showToast?.(t('settings.t22') + label);
        });

        container.querySelector<HTMLSelectElement>('#setTheme')?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            Toolbox.setTheme?.(target.value);
            Toolbox.showToast?.(t('settings.t23') + (target.value === 'dark' ? t('settings.opt.dark') : t('settings.opt.light')));
        });

        container.querySelector<HTMLSelectElement>('#setPrism')?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            Toolbox.setPrismTheme?.(target.value);
        });

        const bgPicker = container.querySelector<HTMLElement>('#setBgTheme');
        bgPicker?.addEventListener('click', (e: Event) => {
            const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.bg-swatch');
            if (!btn) return;
            const id = btn.dataset.bg || '';
            Toolbox.setBgTheme?.(id);
            bgPicker.querySelectorAll<HTMLElement>('.bg-swatch').forEach((el) => {
                el.setAttribute('aria-pressed', String(el === btn));
            });
            Toolbox.showToast?.(t('settings.t24') + (bgThemes.find((t) => t.id === id)?.label || id));
        });

        const copresence = container.querySelector<HTMLSelectElement>('#setCopresence');
        if (copresence) {
            copresence.value = window.KarmoCopresence?.isOn() === false ? 'off' : 'on';
            copresence.addEventListener('change', () => {
                window.KarmoCopresence?.set(copresence.value === 'on');
                Toolbox.showToast?.(copresence.value === 'on' ? t('settings.t25') : t('settings.t26'));
            });
        }

        const previewCode = container.querySelector<HTMLElement>('.settings-code-preview code[class*="language-"]');
        if (previewCode && typeof Prism !== 'undefined') Prism.highlightElement(previewCode);

        if (typeof Gemini !== 'undefined') {
            Gemini.buildApiKeyUI('set').init(container);
        }
    }

    /* ===== 이 브라우저에 저장된 것 ===== */

    /** 키별 용도 설명 (Toolbox 관련) */
    const STORAGE_DESC: Record<string, string> = {
        'toolbox_theme': t('settings.t27'),
        'toolbox_nav_layout': t('settings.t28'),
        'toolbox_sidebar_groups': t('settings.t29'),
        'toolbox_prism_theme': t('settings.t30'),
        'toolbox_last_page': t('settings.t31'),
        'toolbox_widget_prefs': t('settings.t32'),
        'toolbox_usage_stats': t('settings.t33'),
        'toolbox_user_data': t('settings.t34'),
        'toolbox_gemini_api_key': t('settings.t35'),
        'toolbox_gemini_api_keys_v2': t('settings.t36'),
        'toolbox_vertex_api_key': t('settings.t37'),
        'toolbox_memos': t('settings.t38'),
        'toolbox_tierlists': t('settings.t39'),
        'toolbox_imagegen_custom_presets': t('settings.t40'),
        'toolbox_ig_prompt_history': t('settings.t41'),
        'toolbox_chatbot_sessions_index': t('settings.t42'),
        'karmolab_chatbot_characters_v1': t('settings.t43'),
        'mdd_affection': t('settings.t44'),
        'mdd_story_progress': t('settings.t45'),
    };

    function getStorageStats(storage: Storage): { totalBytes: number; items: StorageItemStat[] } {
        let totalBytes = 0;
        const items: StorageItemStat[] = [];
        try {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key == null) continue;
                const val = storage.getItem(key) ?? '';
                const bytes = (key.length + val.length) * 2;
                totalBytes += bytes;
                items.push({ key, bytes, valLen: val.length });
            }
        } catch (_) {}
        items.sort((a, b) => b.bytes - a.bytes);
        return { totalBytes, items };
    }

    function formatBytes(bytes: number): string {
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return bytes + ' B';
    }

    function buildData(container: HTMLElement): void {
        Mdd.linePreset('tool_run', { msg: t('settings.t46') });
        renderData(container);
    }

    function renderData(container: HTMLElement): void {
        const ls = getStorageStats(localStorage);
        const ss = getStorageStats(sessionStorage);
        const totalBytes = ls.totalBytes + ss.totalBytes;

        function getDesc(key: string): string {
            if (STORAGE_DESC[key]) return STORAGE_DESC[key] ?? '';
            if (key.startsWith('toolbox_chatbot_session')) return t('settings.t47');
            if (key.startsWith('toolbox_')) return 'KarmoLab';
            if (key.startsWith('mdd_')) return t('settings.t48');
            return '';
        }
        const rowsOf = (items: StorageItemStat[]): string => items.map(({ key, bytes }) =>
            `<tr><td class="storage-key">${escapeHtml(key)}</td><td class="storage-desc">${escapeHtml(getDesc(key))}</td><td>${formatBytes(bytes)}</td></tr>`,
        ).join('');

        container.innerHTML = `
            <div class="settings-layout">
                <div class="storage-summary">
                    <div class="storage-card">
                        <div class="storage-card-value">${formatBytes(totalBytes)}</div>
                        <div class="storage-card-label">${esc(t('settings.t04'))}</div>
                    </div>
                    <div class="storage-card">
                        <div class="storage-card-value">${formatBytes(ls.totalBytes)}</div>
                        <div class="storage-card-label">${esc(t('settings.t05'))}</div>
                    </div>
                    <div class="storage-card">
                        <div class="storage-card-value">${formatBytes(ss.totalBytes)}</div>
                        <div class="storage-card-label">${esc(t('settings.t06'))}</div>
                    </div>
                </div>
                <p style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-bottom:16px;">
                    ${esc(t('settings.t07'))}
                </p>
                <div class="settings-section">
                    <h3>localStorage (${ls.items.length}개)</h3>
                    <div style="overflow-x:auto;">
                        <table class="storage-table">
                            <thead><tr><th>${esc(t('settings.t08'))}</th><th>${esc(t('settings.t09'))}</th><th>${esc(t('settings.t10'))}</th></tr></thead>
                            <tbody>${rowsOf(ls.items) || t('settings.t49')}</tbody>
                        </table>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>sessionStorage (${ss.items.length}개)</h3>
                    <div style="overflow-x:auto;">
                        <table class="storage-table">
                            <thead><tr><th>${esc(t('settings.t08'))}</th><th>${esc(t('settings.t09'))}</th><th>${esc(t('settings.t10'))}</th></tr></thead>
                            <tbody>${rowsOf(ss.items) || t('settings.t49')}</tbody>
                        </table>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>${esc(t('settings.t11'))}</h3>
                    <div class="settings-row settings-danger">
                        <label>${esc(t('settings.t12'))}</label>
                        <button type="button" class="btn btn-danger" id="setResetUser">${esc(t('settings.btn.setResetUser'))}</button>
                    </div>
                    <div class="settings-row settings-danger">
                        <label>${esc(t('settings.t13'))}</label>
                        <button type="button" class="btn btn-danger" id="setResetUsage">${esc(t('settings.btn.setResetUser'))}</button>
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end;">
                    <button type="button" class="btn-ghost" id="storageRefresh">${esc(t('settings.btn.storageRefresh'))}</button>
                </div>
            </div>`;

        container.querySelector<HTMLButtonElement>('#storageRefresh')?.addEventListener('click', () => renderData(container));

        container.querySelector<HTMLButtonElement>('#setResetUser')?.addEventListener('click', () => {
            if (!confirm(t('settings.t50'))) return;
            localStorage.removeItem('toolbox_user_data');
            Toolbox.showToast?.(t('settings.t51'));
            renderData(container);
        });

        container.querySelector<HTMLButtonElement>('#setResetUsage')?.addEventListener('click', () => {
            if (!confirm(t('settings.t52'))) return;
            localStorage.removeItem('toolbox_usage_stats');
            Toolbox.showToast?.(t('settings.t53'));
            renderData(container);
        });
    }


    /* ===== 마스코트 =====
     * 화면 위에 늘 떠 있는 물건이라 취향이 제일 크게 갈린다. 끄는 것부터 움직임
     * 하나하나까지 여기서 정한다 — 값은 `Mdd` 가 들고 있고 이 화면은 그 값을
     * 보여 주고 바꾸기만 한다(두 벌로 적지 않는다). */

    function buildMascot(container: HTMLElement): void {
        Mdd.linePreset('tool_run', { msg: t('settings.t54') });
        renderMascot(container);
    }

    /* 마스코트 기본값의 사본.
     *
     * 원래는 첫 화면 HTML 안의 임시 스텁이 들고 있었는데, 그건 **부팅 때 받는
     * JS** 라 천장(39KB)을 넘겨 배포가 멈췄다. 이 값이 필요한 건 설정 화면
     * 하나뿐이고 이 파일은 열 때 받아 온다 — 여기가 제자리다. */
    const MASCOT_FALLBACK = {
        enabled: false, width: 300, framing: 'bust', showOnMobile: false, opacity: 0.85,
        blink: true, gaze: true, breathe: true, motion: true, hologram: true,
        bubble: true, bubbleMs: 3000, idleMs: 30000, tapReact: true,
    };

    function renderMascot(container: HTMLElement): void {
        // 마스코트가 아직 안 왔으면 임시 스텁이라 값을 못 준다 — 기본값으로 그린다
        const p = { ...MASCOT_FALLBACK, ...(Mdd.getPrefs ? Mdd.getPrefs() : {}) } as ReturnType<typeof Mdd.getPrefs>;
        const sel = (v: boolean): string => (v ? 'selected' : '');
        const maxW = Mdd.widthMax ? Mdd.widthMax() : 640;

        container.innerHTML = `
            <div class="settings-layout">
                <div class="settings-section">
                    <h3>${esc(t('settings.t14'))}</h3>
                    <div class="settings-row">
                        <label for="mdEnabled">${esc(t('settings.label.mdEnabled'))}</label>
                        <select id="mdEnabled" class="settings-control">
                            <option value="1" ${sel(p.enabled)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.enabled)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdWidth">${esc(t('settings.t10'))} <span id="mdWidthVal">${p.width}px</span></label>
                        <input type="range" id="mdWidth" class="settings-control"
                               min="${Mdd.WIDTH_MIN ?? 48}" max="${maxW}" step="2" value="${Math.min(p.width, maxW)}">
                    </div>
                    <div class="settings-row">
                        <label for="mdFraming">${esc(t('settings.label.mdFraming'))}</label>
                        <select id="mdFraming" class="settings-control">
                            <option value="bust" ${sel(p.framing === 'bust')}>${esc(t('settings.opt.bust'))}</option>
                            <option value="full" ${sel(p.framing === 'full')}>${esc(t('settings.opt.full'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdMobile">${esc(t('settings.label.mdMobile'))}</label>
                        <select id="mdMobile" class="settings-control">
                            <option value="0" ${sel(!p.showOnMobile)}>${esc(t('settings.opt.02'))}</option>
                            <option value="1" ${sel(p.showOnMobile)}>${esc(t('settings.opt.12'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdHolo">${esc(t('settings.label.mdHolo'))}</label>
                        <select id="mdHolo" class="settings-control">
                            <option value="1" ${sel(p.hologram)}>${esc(t('settings.opt.13'))}</option>
                            <option value="0" ${sel(!p.hologram)}>${esc(t('settings.opt.03'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdOpacity">${esc(t('settings.label.mdOpacity'))} <span id="mdOpacityVal">${Math.round(p.opacity * 100)}%</span></label>
                        <input type="range" id="mdOpacity" class="settings-control" min="30" max="100" step="5" value="${Math.round(p.opacity * 100)}">
                    </div>
                    <div class="settings-row">
                        <label>${esc(t('settings.t15'))}</label>
                        <button type="button" class="btn-ghost" id="mdResetPos">${esc(t('settings.btn.mdResetPos'))}</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>${esc(t('settings.t16'))}</h3>
                    <div class="settings-row">
                        <label for="mdMotion">${esc(t('settings.label.mdMotion'))}</label>
                        <select id="mdMotion" class="settings-control">
                            <option value="1" ${sel(p.motion)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.motion)}>${esc(t('settings.opt.04'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBlink">${esc(t('settings.label.mdBlink'))}</label>
                        <select id="mdBlink" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.blink)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.blink)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdGaze">${esc(t('settings.label.mdGaze'))}</label>
                        <select id="mdGaze" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.gaze)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.gaze)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBreathe">${esc(t('settings.label.mdBreathe'))}</label>
                        <select id="mdBreathe" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.breathe)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.breathe)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>${esc(t('settings.t17'))}</h3>
                    <div class="settings-row">
                        <label for="mdBubble">${esc(t('settings.label.mdBubble'))}</label>
                        <select id="mdBubble" class="settings-control">
                            <option value="1" ${sel(p.bubble)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.bubble)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBubbleMs">${esc(t('settings.label.mdBubbleMs'))}</label>
                        <select id="mdBubbleMs" class="settings-control">
                            <option value="2000" ${sel(p.bubbleMs === 2000)}>${esc(t('settings.opt.2000'))}</option>
                            <option value="3000" ${sel(p.bubbleMs === 3000)}>${esc(t('settings.opt.3000'))}</option>
                            <option value="5000" ${sel(p.bubbleMs === 5000)}>${esc(t('settings.opt.5000'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdIdleMs">${esc(t('settings.label.mdIdleMs'))}</label>
                        <select id="mdIdleMs" class="settings-control">
                            <option value="15000" ${sel(p.idleMs === 15000)}>${esc(t('settings.opt.15000'))}</option>
                            <option value="30000" ${sel(p.idleMs === 30000)}>${esc(t('settings.opt.30000'))}</option>
                            <option value="120000" ${sel(p.idleMs === 120000)}>${esc(t('settings.opt.120000'))}</option>
                            <option value="0" ${sel(p.idleMs === 0)}>${esc(t('settings.opt.05'))}</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdTap">${esc(t('settings.label.mdTap'))}</label>
                        <select id="mdTap" class="settings-control">
                            <option value="1" ${sel(p.tapReact)}>${esc(t('settings.opt.1'))}</option>
                            <option value="0" ${sel(!p.tapReact)}>${esc(t('settings.opt.0'))}</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>${esc(t('settings.t18'))}</h3>
                    <div class="settings-row">
                        <label>${esc(t('settings.t19'))}</label>
                        <button type="button" class="btn-ghost" id="mdResetPrefs">${esc(t('settings.btn.mdResetPrefs'))}</button>
                    </div>
                    <div class="settings-row settings-danger">
                        <label>${esc(t('settings.t20'))}</label>
                        <button type="button" class="btn btn-danger" id="mdResetStory">${esc(t('settings.btn.setResetUser'))}</button>
                    </div>
                </div>
            </div>`;

        const bindBool = (id: string, key: string): void => {
            container.querySelector<HTMLSelectElement>('#' + id)?.addEventListener('change', (e) => {
                const t = e.target as HTMLSelectElement;
                Mdd.setPrefs({ [key]: t.value === '1' } as never);
                // 「전부 끄기」는 아래 세 칸을 잠그므로 화면을 다시 그린다
                if (key === 'motion') renderMascot(container);
            });
        };
        bindBool('mdEnabled', 'enabled');
        bindBool('mdMobile', 'showOnMobile');
        bindBool('mdHolo', 'hologram');
        bindBool('mdMotion', 'motion');
        bindBool('mdBlink', 'blink');
        bindBool('mdGaze', 'gaze');
        bindBool('mdBreathe', 'breathe');
        bindBool('mdBubble', 'bubble');
        bindBool('mdTap', 'tapReact');

        const widthRange = container.querySelector<HTMLInputElement>('#mdWidth');
        const widthVal = container.querySelector<HTMLElement>('#mdWidthVal');
        widthRange?.addEventListener('input', () => {
            const w = parseInt(widthRange.value, 10);
            if (widthVal) widthVal.textContent = w + 'px';
            Mdd.setPrefs({ width: w });
        });
        container.querySelector<HTMLSelectElement>('#mdFraming')?.addEventListener('change', (e) => {
            Mdd.setPrefs({ framing: (e.target as HTMLSelectElement).value as never });
        });
        container.querySelector<HTMLSelectElement>('#mdBubbleMs')?.addEventListener('change', (e) => {
            Mdd.setPrefs({ bubbleMs: parseInt((e.target as HTMLSelectElement).value, 10) });
        });
        container.querySelector<HTMLSelectElement>('#mdIdleMs')?.addEventListener('change', (e) => {
            Mdd.setPrefs({ idleMs: parseInt((e.target as HTMLSelectElement).value, 10) });
        });

        const range = container.querySelector<HTMLInputElement>('#mdOpacity');
        const rangeVal = container.querySelector<HTMLElement>('#mdOpacityVal');
        range?.addEventListener('input', () => {
            const pct = parseInt(range.value, 10);
            if (rangeVal) rangeVal.textContent = pct + '%';
            Mdd.setPrefs({ opacity: pct / 100 });
        });

        container.querySelector<HTMLButtonElement>('#mdResetPos')?.addEventListener('click', () => {
            Mdd.resetPosition();
            Toolbox.showToast?.(t('settings.t55'));
        });
        container.querySelector<HTMLButtonElement>('#mdResetPrefs')?.addEventListener('click', () => {
            Mdd.resetPrefs();
            renderMascot(container);
            Toolbox.showToast?.(t('settings.t56'));
        });
        container.querySelector<HTMLButtonElement>('#mdResetStory')?.addEventListener('click', () => {
            if (!confirm(t('settings.t57'))) return;
            ['mdd_affection', 'mdd_story_progress', 'mdd_story_log', 'mdd_guide_seen']
                .forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
            Toolbox.showToast?.(t('settings.t58'));
        });
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('settings'),
        tabs: [
            /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 그 안에서 만들어진다.
             * 탭 이름만은 **등록하는 순간** 쓰이므로 기본값을 함께 준다 (S9-b). */
            {
                id: 'settings-display',
                label: t('settings.tab.display', undefined, '표시 · API'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('settings').then(function () {
                        buildDisplay(container);
                    });
                },
            },
            {
                id: 'settings-mascot',
                label: t('settings.tab.mascot', undefined, '마스코트'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('settings').then(function () {
                        buildMascot(container);
                    });
                },
            },
            {
                id: 'settings-data',
                label: t('settings.tab.data', undefined, '이 브라우저에 저장된 것'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('settings').then(function () {
                        buildData(container);
                    });
                },
            },
        ],
    });
})();
