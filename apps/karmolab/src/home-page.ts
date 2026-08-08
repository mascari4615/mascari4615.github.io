/**
 * 첫 화면 본문 — **첫 화면에서만** 싣는다 (TASK-KL-128 ①-c 3차)
 *
 * 왜 따로 나왔나: 이 203줄은 도구 화면 129장에서 **한 번도 안 불린다**(`init()` 이
 * `staticBody` 면 건너뛴다). 그런데 셸에 박혀 있어서 코드는 매번 같이 왔다.
 * 게다가 여기 적힌 `landing-…` 이름들 때문에 **도구 화면 전용 스타일도 못 깎았다** —
 * 「이 화면에 나올 수 있는 이름」을 셀 때 이 코드가 같이 세였기 때문이다.
 *
 * 바깥에서 부르는 것: `window.KarmoHomePage.build()` → 첫 화면 한 장(DOM)을 돌려준다.
 * `index.html` 만 이 파일을 부른다. 정적 페이지 생성기(`shell-page.mjs`)가 그 줄을 뺀다.
 *
 * 셸에서 쓰는 것은 `Toolbox.switchPage` / `Toolbox.mountHomeDecor` 둘뿐이다(전역).
 * 여기 새 코드를 넣을 때 셸 내부를 더 부르지 마라 — 부르는 순간 도로 셸에 묶인다.
 */
// @ts-nocheck — 셸에서 그대로 옮겨 온 코드 (TASK-KL-128 ①-c)
(function () {
    const switchPage = (id, opts) => Toolbox.switchPage(id, opts);
    const mountHomeDecor = () => Toolbox.mountHomeDecor();
    /* 셸 안의 도구 목록은 여기서 안 보인다 — 창구로 받는다.
       분리할 때 이 한 줄을 놓쳐 첫 화면이 「tools is not defined」로 죽었다(관문 검사가 잡음). */
    const tools = () => Toolbox.getTools();
    const toolCountsOnce = () => Toolbox.toolCountsOnce();
    const whenApiBase = (ms) => Toolbox.whenApiBase(ms);

    function buildLanding() {
        const landing = document.createElement('div');
        landing.className = 'landing-page';
        landing.id = 'page-home';
        /* 장식은 **첫 화면 것이 아니라 이 앱의 것**이다 (TASK-KL-101).
           첫 화면 안에 넣어 두면 도구로 가는 순간 통째로 사라진다 — 도구를 여닫을 때마다
           세계가 바뀌는 셈이다. 껍데기(body) 에 한 장 붙여 두면 어느 화면에서나 그대로
           떠 있고, 화면 사이를 오가도 도형이 이어진다. 위치는 어차피 화면 기준이다. */
        mountHomeDecor();

        /* 이름을 두 번 쓰지 않는다 (사용자 요청 — 「두 줄 넘어간 것들을 한 줄로」).
         * 예전엔 작은 「KarmoLab」 위에 큰 「KarmoLab」이 또 있었다 — 같은 말이 두 줄이었다. */
        const hero = document.createElement('div');
        hero.className = 'landing-hero';
        hero.innerHTML = `
            <h1 class="landing-title">KarmoLab</h1>
            <p class="landing-tagline">삶을 섞고 술을 바꿀 시간</p>
        `;
        landing.appendChild(hero);

        /* TASK-KL-099 — 첫 화면의 본체는 찾는 입력이다. 도구가 160개인데 예전에는 이 자리에
         * 카드 3장과 「상단 메뉴에서 카테고리를 열고 도구를 선택하세요」만 있었다 — 찾는 일을
         * 사람에게 떠넘기는 화면이었다.
         * 찾는 칸이 **주인공 자리**에 온다 (사용자 요청 — 「구글같이 검색창이 메인」).
         * 제목 바로 밑이 그 자리다. 갈 곳 카드는 그 아래 한 줄로 깔린다. */
        const palette = document.createElement('div');
        palette.className = 'landing-palette';
        landing.appendChild(palette);
        if (typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.mountInline(palette);
        }

        /* 갈 곳 카드는 찾는 칸 **아래** 한 줄로 (사용자 요청).
         * 카드마다 제목+설명 두 줄이던 것을 아이콘+이름 한 줄로 줄였다 — 다섯 장이 한 줄에
         * 들어가야 「검색창이 주인공」이라는 화면 구성이 유지된다. 설명은 각 화면이 스스로 한다. */
        const cta = document.createElement('div');
        cta.className = 'landing-cta';
        cta.innerHTML = `
            <div class="landing-cta-grid">
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('favorites')">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
                    <span class="landing-cta-card-title">즐겨찾기</span>
                </button>
                <a class="landing-cta-card" href="/karmolab/t/">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>
                    <span class="landing-cta-card-title">도구 목록</span>
                </a>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('community')">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H9l-4 3.5V16H4z"/><path d="M8 10h8M8 13h5"/></svg></span>
                    <span class="landing-cta-card-title">커뮤니티</span>
                </button>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('play')">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3"/><path d="M16 12h.01M18 14.5h.01"/></svg></span>
                    <span class="landing-cta-card-title">놀이터</span>
                </button>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('docs')">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
                    <span class="landing-cta-card-title">문서</span>
                </button>
            </div>
        `;
        landing.appendChild(cta);

        /* TASK-KL-098 — 「사람이 있다」를 말이 아니라 **숫자**로 보여 주는 자리.
         * 값은 전부 실측이고 지어낸 수는 한 개도 없다. 서버에 못 닿거나 아직 0이면 이 자리는
         * 통째로 안 그려진다. 문장이 아니라 Today / Total 두 칸이다 (사용자 요청) — 문장으로
         * 쓰면 폭에 따라 두 줄이 되고, 세 가지 수를 한 줄에 우겨 넣게 된다. */
        const pulse = document.createElement('div');
        pulse.className = 'landing-pulse';
        pulse.id = 'homePulse';
        landing.appendChild(pulse);
        fillHomePulse(pulse);

        /* 아직 안 써 본 것 (TASK-KL-183 E) — 발견.
         *
         * 도구가 160개인데 사람들이 여는 건 늘 같은 열몇 개다. 이미 두 벌의 실측이 있다:
         * 남들이 많이 여는 것과 내가 열어 본 것. 둘을 맞대면 「남들은 쓰는데 나는 아직」이
         * 그냥 나온다 — 지어낼 필요가 없다. 다 써 본 사람에게는 이 자리가 통째로 없다. */
        const suggest = document.createElement('div');
        suggest.className = 'landing-suggest';
        suggest.id = 'homeSuggest';
        landing.appendChild(suggest);
        fillSuggest(suggest);

        return landing;
    }

    /**
     * 도구별 열린 횟수 — 한 화면에서 **한 번만** 받아 온다.
     * 도구를 옮길 때마다 새로 물으면, 그 요청 자체가 「도구를 열었다」를 세는 서버를 계속 두드린다.
     */
    /**
     * 도구 이름 밑에 「지금까지 N번 열렸어요」 (사용자 요청 — "그냥 재밌잖아 그런거").
     *
     * 한 번도 안 열린 도구에는 아무것도 안 쓴다. 「0번 열렸어요」는 재미가 아니라 낙인이다.
     */
    /** 계정 스크립트를 기다린다 — 도구 화면은 그것보다 먼저 그려진다. 안 오면 그냥 포기한다. */
    /**
     * 「아직 안 써 본 것」 채우기 (TASK-KL-183 E).
     *
     * 로그인 안 했으면 「내가 써 본 것」을 모른다 — 그때는 개인화가 아니라 **그냥 인기**이고,
     * 화면 문구도 그렇게 바뀐다(없는 개인화를 있는 척하지 않는다).
     */
    /** 화면에 그대로 쓰는 글자 다듬기 — 도구 이름은 우리 것이지만 규칙은 한 곳에 둔다. */
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fillSuggest(host) {
        const base = window.KarmoAccount && window.KarmoAccount.apiBase;
        if (!base) return;
        fetch(base + '/kl/suggest', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => {
                if (!body || !host.isConnected) return;
                const rows = (body.tools || [])
                    .map((row) => ({ id: row.toolId, title: toolTitleFor(row.toolId) }))
                    .filter((row) => row.title)
                    .slice(0, 5);
                if (!rows.length) return; // 다 써 봤거나 셀 것이 없으면 아무 말도 안 한다
                host.innerHTML =
                    '<span class="landing-suggest-label">' +
                    (body.personal ? '아직 안 써 본 것' : '요즘 많이 여는 것') +
                    '</span>' +
                    rows
                        .map(
                            (row) =>
                                '<button type="button" class="landing-suggest-item" data-go="' +
                                escapeHtml(row.id) + '">' + escapeHtml(row.title) + '</button>',
                        )
                        .join('');
                host.querySelectorAll('[data-go]').forEach((btn) => {
                    btn.onclick = () => switchPage(btn.dataset.go);
                });
            })
            .catch(() => {
                /* 못 받아 오면 이 줄은 없는 것이다 — 첫 화면은 그대로 뜬다 */
            });
    }

    /** 도구 id 로 사람이 읽는 이름 찾기. 등록된 것 우선, 없으면 지연 메타. 둘 다 없으면 null. */
    function toolTitleFor(id) {
        const registered = tools().find((t) => t.id === id);
        if (registered && registered.title) return registered.title;
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        return (meta[id] && meta[id].title) || null;
    }

    /**
     * 첫 화면의 방문 수 — 블로그와 같은 **Today / Total** 두 칸 (TASK-KL-136, 사용자 요청).
     *
     * 문장으로 쓰던 것을 칸으로 바꿨다: 「지금까지 N번 다녀갔어요 · 오늘 M번 · 도구는 K번
     * 열렸고요(L개가 실제로 쓰였어요)」는 폭이 좁아지는 순간 두 줄이 되고, 무엇이 무엇인지도
     * 읽어야 안다. 도구 열림 수는 광장(`전부 보기 →`)에 그대로 있다 — 첫 화면에 세 종류의
     * 수를 늘어놓지 않는다.
     *
     * 「이번 주에 많이 쓴 도구」는 **찾는 칸 안쪽**으로 옮겼다 (사용자 요청). 통계를 받아 오는
     * 곳은 여기 하나뿐이므로, 여기서 받아 팔레트에 건네준다.
     *
     * 왜 실측만 쓰나: 이 자리에 한 번이라도 지어낸 수를 넣으면 옆의 진짜 수까지 못 믿을 것이
     * 된다. 그래서 서버에 못 닿거나 아직 한 번도 안 열렸으면 **아무것도 안 그린다** —
     * 「0번 열림」이 떠 있는 화면은 북적이는 게 아니라 죽은 화면으로 읽힌다.
     */
    async function fillHomePulse(slot) {
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        if (!base) return;
        let data;
        try {
            const response = await fetch(base + '/kl/tools/stats');
            if (!response.ok) return;
            data = await response.json();
        } catch (_) {
            return;
        }
        const pulse = (data && data.pulse) || {};
        const visits = (data && data.visits) || {};

        /* 이번 주에 많이 쓴 도구는 찾는 칸 안으로 (TASK-KL-136). 첫 화면이 안 붙어 있어도
         * (도구 상세에서 이 함수가 돌 때) 팔레트는 있을 수 있으므로 화면 확인보다 먼저 넘긴다.
         * 이름을 못 찾는 도구는 뺀다 — 화면에 id 가 그대로 뜨면 내부 사정이 새어 나온 것처럼 보인다. */
        const top = (data.tools || [])
            .filter((t) => t.recent > 0 && toolTitleFor(t.toolId))
            .slice(0, 6)
            .map((t) => t.toolId);
        if (top.length && typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.setPopular(top);
        }

        if (!slot.isConnected) return;
        if (!pulse.opensTotal && !visits.total) return;
        const n = (value) => Number(value || 0).toLocaleString('ko-KR');

        /* 블로그의 Today / Total 두 칸 (사용자 요청). 방문 수만 낸다 —
         * 「명」이라고 쓰면 안 된다: 이 수는 방문 횟수지 사람 수가 아니다. 사람 수는 하루
         * 단위로만 셀 수 있고(오늘 열쇠만 들고 있으므로), 그 값은 광장에 있다. */
        if (!visits.total) return;
        slot.innerHTML = '<p class="landing-pulse-line">'
            + '<span class="landing-pulse-stat"><span class="landing-pulse-k">Today</span>'
            + '<b>' + n(visits.today) + '</b></span>'
            + '<span class="landing-pulse-stat"><span class="landing-pulse-k">Total</span>'
            + '<b>' + n(visits.total) + '</b></span>'
            + '<button type="button" class="landing-pulse-all" data-open-plaza>전부 보기 →</button></p>';

        const all = slot.querySelector('[data-open-plaza]');
        if (all) all.onclick = () => switchPage('plaza');
    }

    /* ===== Navigation ===== */

    window.KarmoHomePage = { build: buildLanding };
})();
