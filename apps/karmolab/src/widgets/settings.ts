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
                    <h3>👥 같이 쓰기</h3>
                    <div class="settings-row">
                        <label for="setCopresence">남의 커서 보기</label>
                        <select id="setCopresence" class="settings-control">
                            <option value="on">켬</option>
                            <option value="off">끔</option>
                        </select>
                    </div>
                    <p style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin:0 0 8px;">
                        같은 화면을 열고 있는 사람들의 커서가 서로 보입니다. 끄면 내 커서도 안 보내고 남의 것도 안 그립니다.
                        좌표는 저장되지 않습니다 — 지나간 커서는 아무 데도 안 남습니다.
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

        const copresence = container.querySelector<HTMLSelectElement>('#setCopresence');
        if (copresence) {
            copresence.value = window.KarmoCopresence?.isOn() === false ? 'off' : 'on';
            copresence.addEventListener('change', () => {
                window.KarmoCopresence?.set(copresence.value === 'on');
                Toolbox.showToast?.(copresence.value === 'on' ? '같이 쓰기: 켬' : '같이 쓰기: 끔');
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


    /* ===== 마스코트 =====
     * 화면 위에 늘 떠 있는 물건이라 취향이 제일 크게 갈린다. 끄는 것부터 움직임
     * 하나하나까지 여기서 정한다 — 값은 `Mdd` 가 들고 있고 이 화면은 그 값을
     * 보여 주고 바꾸기만 한다(두 벌로 적지 않는다). */

    function buildMascot(container: HTMLElement): void {
        Mdd.linePreset('tool_run', { msg: '저를 어떻게 해 주실 건가요?' });
        renderMascot(container);
    }

    /* 마스코트 기본값의 사본.
     *
     * 원래는 첫 화면 HTML 안의 임시 스텁이 들고 있었는데, 그건 **부팅 때 받는
     * JS** 라 천장(39KB)을 넘겨 배포가 멈췄다. 이 값이 필요한 건 설정 화면
     * 하나뿐이고 이 파일은 열 때 받아 온다 — 여기가 제자리다. */
    const MASCOT_FALLBACK = {
        enabled: true, width: 300, framing: 'bust', showOnMobile: false, opacity: 0.85,
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
                    <h3>🧪 표시</h3>
                    <div class="settings-row">
                        <label for="mdEnabled">마스코트 보이기</label>
                        <select id="mdEnabled" class="settings-control">
                            <option value="1" ${sel(p.enabled)}>켜기</option>
                            <option value="0" ${sel(!p.enabled)}>끄기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdWidth">크기 <span id="mdWidthVal">${p.width}px</span></label>
                        <input type="range" id="mdWidth" class="settings-control"
                               min="${Mdd.WIDTH_MIN ?? 48}" max="${maxW}" step="2" value="${Math.min(p.width, maxW)}">
                    </div>
                    <div class="settings-row">
                        <label for="mdFraming">보이는 범위</label>
                        <select id="mdFraming" class="settings-control">
                            <option value="bust" ${sel(p.framing === 'bust')}>얼굴 (흉상)</option>
                            <option value="full" ${sel(p.framing === 'full')}>전신</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdMobile">폰에서도 보이기</label>
                        <select id="mdMobile" class="settings-control">
                            <option value="0" ${sel(!p.showOnMobile)}>숨기기 (기본)</option>
                            <option value="1" ${sel(p.showOnMobile)}>보이기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdHolo">홀로그램</label>
                        <select id="mdHolo" class="settings-control">
                            <option value="1" ${sel(p.hologram)}>켜기 (SF 통신)</option>
                            <option value="0" ${sel(!p.hologram)}>끄기 (그림 그대로)</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdOpacity">투명도 <span id="mdOpacityVal">${Math.round(p.opacity * 100)}%</span></label>
                        <input type="range" id="mdOpacity" class="settings-control" min="30" max="100" step="5" value="${Math.round(p.opacity * 100)}">
                    </div>
                    <div class="settings-row">
                        <label>자리 되돌리기</label>
                        <button type="button" class="btn-ghost" id="mdResetPos">↩️ 우하단으로</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>🌬 움직임</h3>
                    <div class="settings-row">
                        <label for="mdMotion">움직임 전체</label>
                        <select id="mdMotion" class="settings-control">
                            <option value="1" ${sel(p.motion)}>켜기</option>
                            <option value="0" ${sel(!p.motion)}>전부 끄기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBlink">눈 깜빡임</label>
                        <select id="mdBlink" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.blink)}>켜기</option>
                            <option value="0" ${sel(!p.blink)}>끄기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdGaze">커서 따라보기</label>
                        <select id="mdGaze" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.gaze)}>켜기</option>
                            <option value="0" ${sel(!p.gaze)}>끄기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBreathe">숨쉬기·흔들림</label>
                        <select id="mdBreathe" class="settings-control" ${p.motion ? '' : 'disabled'}>
                            <option value="1" ${sel(p.breathe)}>켜기</option>
                            <option value="0" ${sel(!p.breathe)}>끄기</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>💬 말</h3>
                    <div class="settings-row">
                        <label for="mdBubble">말풍선</label>
                        <select id="mdBubble" class="settings-control">
                            <option value="1" ${sel(p.bubble)}>켜기</option>
                            <option value="0" ${sel(!p.bubble)}>끄기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdBubbleMs">말풍선 표시 시간</label>
                        <select id="mdBubbleMs" class="settings-control">
                            <option value="2000" ${sel(p.bubbleMs === 2000)}>2초</option>
                            <option value="3000" ${sel(p.bubbleMs === 3000)}>3초 (기본)</option>
                            <option value="5000" ${sel(p.bubbleMs === 5000)}>5초</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdIdleMs">잠들기까지</label>
                        <select id="mdIdleMs" class="settings-control">
                            <option value="15000" ${sel(p.idleMs === 15000)}>15초</option>
                            <option value="30000" ${sel(p.idleMs === 30000)}>30초 (기본)</option>
                            <option value="120000" ${sel(p.idleMs === 120000)}>2분</option>
                            <option value="0" ${sel(p.idleMs === 0)}>안 잠들기</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="mdTap">누르면 반응하기</label>
                        <select id="mdTap" class="settings-control">
                            <option value="1" ${sel(p.tapReact)}>켜기</option>
                            <option value="0" ${sel(!p.tapReact)}>끄기</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>⚠️ 초기화</h3>
                    <div class="settings-row">
                        <label>설정만 기본값으로</label>
                        <button type="button" class="btn-ghost" id="mdResetPrefs">↩️ 되돌리기</button>
                    </div>
                    <div class="settings-row settings-danger">
                        <label>호감도·스토리 기록 지우기</label>
                        <button type="button" class="btn btn-danger" id="mdResetStory">🗑️ 초기화</button>
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
            Toolbox.showToast?.('마스코트를 우하단으로 되돌렸어요');
        });
        container.querySelector<HTMLButtonElement>('#mdResetPrefs')?.addEventListener('click', () => {
            Mdd.resetPrefs();
            renderMascot(container);
            Toolbox.showToast?.('마스코트 설정을 기본값으로 되돌렸어요');
        });
        container.querySelector<HTMLButtonElement>('#mdResetStory')?.addEventListener('click', () => {
            if (!confirm('호감도와 스토리 기록을 지웁니다. 계속할까요?')) return;
            ['mdd_affection', 'mdd_story_progress', 'mdd_story_log', 'mdd_guide_seen']
                .forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
            Toolbox.showToast?.('마스코트 기록 초기화 완료');
        });
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('settings'),
        tabs: [
            { id: 'settings-display', label: '표시 · API', build: buildDisplay },
            { id: 'settings-mascot', label: '마스코트', build: buildMascot },
            { id: 'settings-data', label: '이 브라우저에 저장된 것', build: buildData },
        ],
    });
})();
