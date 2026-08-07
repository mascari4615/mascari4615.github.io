/**
 * 환경 설정 (TASK-KL-139) — 「내 정보」에서 떼어 낸 화면.
 *
 * 왜 떼었나: 테마·API 키·저장소는 **이 브라우저의 설정**이고, 도전과제·계정은 **나**다.
 * 한 위젯 안에 있으면 로그인한 사람의 신원 옆에 코드 하이라이트 고르는 칸이 붙는다 —
 * 어느 쪽도 자기 자리처럼 보이지 않는다. 이 화면은 로그인과 무관하고, 서버가 죽어도 멀쩡하다.
 */
(function (): void {
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
        Mdd.linePreset('tool_run', { msg: '설정 바꿀 거야?' });
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
                    <h3>🎨 표시</h3>
                    <div class="settings-row">
                        <label for="setNavLayout">네비게이션</label>
                        <select id="setNavLayout" class="settings-control">
                            <option value="header" ${navLayout === 'header' ? 'selected' : ''}>상단 메뉴</option>
                            <option value="sidebar" ${navLayout === 'sidebar' ? 'selected' : ''}>사이드바</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="setTheme">테마</label>
                        <select id="setTheme" class="settings-control">
                            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>다크</option>
                            <option value="light" ${theme === 'light' ? 'selected' : ''}>라이트</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="setPrism">코드 하이라이트</label>
                        <select id="setPrism" class="settings-control">
                            ${prismThemes.map((t) => `<option value="${t.id}" ${t.id === prismTheme ? 'selected' : ''}>${t.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="settings-row settings-row-stack">
                        <label>배경 테마</label>
                        <!-- 이름만 늘어놓으면 무엇을 고르는지 알 수 없다. 견본은 진짜 배경과
                             **같은 스타일 규칙**을 물려받아 그려진다 — 테마를 손보면 견본도 같이
                             바뀐다 (값을 두 벌 적지 않는다). -->
                        <div class="settings-bg-picker" id="setBgTheme" role="group" aria-label="배경 테마">
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
                    <h3>🔑 API</h3>
                    ${apiUI.html}
                </div>
            </div>`;

        container.querySelector<HTMLSelectElement>('#setNavLayout')?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            Toolbox.setNavLayout?.(target.value);
            const label = target.value === 'sidebar' ? '사이드바' : '상단 메뉴';
            Toolbox.showToast?.('네비게이션: ' + label);
        });

        container.querySelector<HTMLSelectElement>('#setTheme')?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            Toolbox.setTheme?.(target.value);
            Toolbox.showToast?.('테마: ' + (target.value === 'dark' ? '다크' : '라이트'));
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
            Toolbox.showToast?.('배경: ' + (bgThemes.find((t) => t.id === id)?.label || id));
        });

        const previewCode = container.querySelector<HTMLElement>('.settings-code-preview code[class*="language-"]');
        if (previewCode && typeof Prism !== 'undefined') Prism.highlightElement(previewCode);

        if (typeof Gemini !== 'undefined') {
            Gemini.buildApiKeyUI('set').init(container);
        }
    }

    /* ===== 이 브라우저에 저장된 것 ===== */

    /** 키별 용도 설명 (Toolbox 관련) */
    const STORAGE_DESC: Record<string, string> = {
        'toolbox_theme': '테마 (라이트/다크)',
        'toolbox_nav_layout': '네비게이션 레이아웃 (상단/사이드바)',
        'toolbox_sidebar_groups': '사이드바 그룹 접힘 상태',
        'toolbox_prism_theme': '코드 하이라이트 테마',
        'toolbox_last_page': '마지막 접속 페이지',
        'toolbox_widget_prefs': '위젯별 설정 (모델, 프리셋 등)',
        'toolbox_usage_stats': 'AI 사용량 통계 (채팅/이미지)',
        'toolbox_user_data': '유저 데이터 (도전과제, 뱃지, 진행도)',
        'toolbox_gemini_api_key': 'Gemini API 키 (구버전)',
        'toolbox_gemini_api_keys_v2': 'Gemini API 키 목록 (AI Studio)',
        'toolbox_vertex_api_key': 'Vertex AI (Google Cloud) API 키',
        'toolbox_memos': '메모 위젯',
        'toolbox_tierlists': '티어리스트',
        'toolbox_imagegen_custom_presets': '이미지 생성 커스텀 프리셋',
        'toolbox_ig_prompt_history': '이미지 생성 프롬프트 기록',
        'toolbox_chatbot_sessions_index': '챗봇 세션 인덱스',
        'karmolab_chatbot_characters_v1': '챗봇 캐릭터 카드 목록 (JSON 배열; karmochat_character_v1 내보내기와 별개로 localStorage에 저장)',
        'mdd_affection': '마스코트 호감도',
        'mdd_story_progress': '마스코트 스토리 진행',
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
        Mdd.linePreset('tool_run', { msg: '저장소 상태 보여줄게요~' });
        renderData(container);
    }

    function renderData(container: HTMLElement): void {
        const ls = getStorageStats(localStorage);
        const ss = getStorageStats(sessionStorage);
        const totalBytes = ls.totalBytes + ss.totalBytes;

        function getDesc(key: string): string {
            if (STORAGE_DESC[key]) return STORAGE_DESC[key] ?? '';
            if (key.startsWith('toolbox_chatbot_session')) return '챗봇 대화 내용';
            if (key.startsWith('toolbox_')) return 'KarmoLab';
            if (key.startsWith('mdd_')) return '마스코트';
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
                        <div class="storage-card-label">총 저장 용량</div>
                    </div>
                    <div class="storage-card">
                        <div class="storage-card-value">${formatBytes(ls.totalBytes)}</div>
                        <div class="storage-card-label">localStorage (영구)</div>
                    </div>
                    <div class="storage-card">
                        <div class="storage-card-value">${formatBytes(ss.totalBytes)}</div>
                        <div class="storage-card-label">sessionStorage (탭 종료 시 삭제)</div>
                    </div>
                </div>
                <p style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-bottom:16px;">
                    브라우저별 localStorage 한도는 보통 5~10MB입니다. UTF-16 기준으로 키+값 길이×2 바이트로 계산합니다.
                </p>
                <div class="settings-section">
                    <h3>localStorage (${ls.items.length}개)</h3>
                    <div style="overflow-x:auto;">
                        <table class="storage-table">
                            <thead><tr><th>키</th><th>용도</th><th>크기</th></tr></thead>
                            <tbody>${rowsOf(ls.items) || '<tr><td colspan="3" style="color:var(--text-tertiary);">비어 있음</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>sessionStorage (${ss.items.length}개)</h3>
                    <div style="overflow-x:auto;">
                        <table class="storage-table">
                            <thead><tr><th>키</th><th>용도</th><th>크기</th></tr></thead>
                            <tbody>${rowsOf(ss.items) || '<tr><td colspan="3" style="color:var(--text-tertiary);">비어 있음</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>⚠️ 위험 구역</h3>
                    <div class="settings-row settings-danger">
                        <label>유저 데이터 초기화</label>
                        <button type="button" class="btn btn-danger" id="setResetUser">🗑️ 초기화</button>
                    </div>
                    <div class="settings-row settings-danger">
                        <label>사용량 기록 초기화</label>
                        <button type="button" class="btn btn-danger" id="setResetUsage">🗑️ 초기화</button>
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end;">
                    <button type="button" class="btn-ghost" id="storageRefresh">🔄 새로고침</button>
                </div>
            </div>`;

        container.querySelector<HTMLButtonElement>('#storageRefresh')?.addEventListener('click', () => renderData(container));

        container.querySelector<HTMLButtonElement>('#setResetUser')?.addEventListener('click', () => {
            if (!confirm('모든 도전과제, 뱃지, 진행도를 초기화합니다. 계속할까요?')) return;
            localStorage.removeItem('toolbox_user_data');
            Toolbox.showToast?.('유저 데이터 초기화 완료');
            renderData(container);
        });

        container.querySelector<HTMLButtonElement>('#setResetUsage')?.addEventListener('click', () => {
            if (!confirm('모든 사용량 기록을 삭제합니다. 계속할까요?')) return;
            localStorage.removeItem('toolbox_usage_stats');
            Toolbox.showToast?.('사용량 기록 초기화 완료');
            renderData(container);
        });
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('settings'),
        tabs: [
            { id: 'settings-display', label: '표시 · API', build: buildDisplay },
            { id: 'settings-data', label: '이 브라우저에 저장된 것', build: buildData },
        ],
    });
})();
