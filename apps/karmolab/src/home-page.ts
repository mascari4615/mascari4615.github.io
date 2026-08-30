/**
 * 첫 화면 본문. **첫 화면에서만** 싣는다 (TASK-KL-128 ①-c 3차)
 *
 * 왜 따로 나왔나: 이 203줄은 도구 화면 129장에서 **한 번도 안 불린다**(`init()` 이
 * `staticBody` 면 건너뛴다). 그런데 셸에 박혀 있어서 코드는 매번 같이 왔다.
 * 게다가 여기 적힌 `landing-...` 이름들 때문에 **도구 화면 전용 스타일도 못 깎았다** . 
 * 이 화면에 나올 수 있는 이름을 셀 때 이 코드가 같이 세였기 때문이다.
 *
 * 바깥에서 부르는 것: `window.KarmoHomePage.build()` → 첫 화면 한 장(DOM)을 돌려준다.
 * `index.html` 만 이 파일을 부른다. 정적 페이지 생성기(`shell-page.mjs`)가 그 줄을 뺀다.
 *
 * 셸에서 쓰는 것은 `Toolbox.switchPage` / `Toolbox.mountHomeDecor` 둘뿐이다(전역).
 * 여기 새 코드를 넣을 때 셸 내부를 더 부르지 마라. 부르는 순간 도로 셸에 묶인다.
 */
// @ts-nocheck 셸에서 그대로 옮겨 온 코드 (TASK-KL-128 ①-c)
import { t } from './lib/i18n.js';
import { toolIndexPath } from './lib/site-base';
(function () {
    const switchPage = (id, opts) => Toolbox.switchPage(id, opts);
    const mountHomeDecor = () => Toolbox.mountHomeDecor();
    /* 셸 안의 도구 목록은 여기서 안 보인다. 창구로 받는다.
       분리할 때 이 한 줄을 놓쳐 첫 화면이 tools is not defined로 죽었다(관문 검사가 잡음). */
    const tools = () => Toolbox.getTools();
    const toolCountsOnce = () => Toolbox.toolCountsOnce();
    const whenApiBase = (ms) => Toolbox.whenApiBase(ms);

    function buildLanding() {
        const landing = document.createElement('div');
        landing.className = 'landing-page';
        landing.id = 'page-home';
        /* 장식은 **첫 화면 것이 아니라 이 앱의 것**이다 (TASK-KL-101).
           첫 화면 안에 넣어 두면 도구로 가는 순간 통째로 사라진다. 도구를 여닫을 때마다
           세계가 바뀌는 셈이다. 껍데기(body) 에 한 장 붙여 두면 어느 화면에서나 그대로
           떠 있고, 화면 사이를 오가도 도형이 이어진다. 위치는 어차피 화면 기준이다. */
        mountHomeDecor();

        /* 이름을 두 번 쓰지 않는다 (사용자 요청. 두 줄 넘어간 것들을 한 줄로).
         * 예전엔 작은 KarmoLab 위에 큰 KarmoLab이 또 있었다. 같은 말이 두 줄이었다. */
        const hero = document.createElement('div');
        hero.className = 'landing-hero';
        /* 제목 위 한 줄 라벨. 필드 스킨에서만 표시 (CSS). 날짜와 도구 수는 사람별 값 아님, 미리 그려도 무방 */
        const toolCount = Array.isArray(window.KARMOLAB_LAZY_META) ? window.KARMOLAB_LAZY_META.length : 0;
        hero.innerHTML = `
            <p class="landing-label" aria-hidden="true">// ${new Date().toISOString().slice(0, 10)} / TOOLS ${toolCount}</p>
            <h1 class="landing-title">KarmoLab</h1>
            <p class="landing-tagline">${t('site.tagline', undefined, '삶을 섞고 술을 바꿀 시간')}</p>
        `;
        landing.appendChild(hero);
        greet(hero);

        /* TASK-KL-099. 첫 화면의 본체는 찾는 입력이다. 도구가 160개인데 예전에는 이 자리에
         * 카드 3장과 상단 메뉴에서 카테고리를 열고 도구를 선택하세요만 있었다. 찾는 일을
         * 사람에게 떠넘기는 화면이었다.
         * 찾는 칸이 **주인공 자리**에 온다 (사용자 요청. 구글같이 검색창이 메인).
         * 제목 바로 밑이 그 자리다. 갈 곳 카드는 그 아래 한 줄로 깔린다. */
        const palette = document.createElement('div');
        palette.className = 'landing-palette';
        landing.appendChild(palette);
        if (typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.mountInline(palette);
        }

        /* 갈 곳 카드는 찾는 칸 **아래** 한 줄로 (사용자 요청).
         * 카드마다 제목+설명 두 줄이던 것을 아이콘+이름 한 줄로 줄였다. 다섯 장이 한 줄에
         * 들어가야 검색창이 주인공이라는 화면 구성이 유지된다. 설명은 각 화면이 스스로 한다. */
        const cta = document.createElement('div');
        cta.className = 'landing-cta';
        cta.innerHTML = `
            <div class="landing-cta-grid">
                <button type="button" class="landing-cta-card" data-goto="favorites">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
                    <span class="landing-cta-card-title">${t('site.cta.favorites', undefined, '즐겨찾기')}</span>
                </button>
                <a class="landing-cta-card" href="${toolIndexPath()}">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>
                    <span class="landing-cta-card-title">${t('site.cta.tools', undefined, '도구 목록')}</span>
                </a>
                <button type="button" class="landing-cta-card" data-goto="community">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H9l-4 3.5V16H4z"/><path d="M8 10h8M8 13h5"/></svg></span>
                    <span class="landing-cta-card-title">${t('site.cta.community', undefined, '커뮤니티')}</span>
                </button>
                <button type="button" class="landing-cta-card" data-goto="arcade">
                    <span class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3"/><path d="M16 12h.01M18 14.5h.01"/></svg></span>
                    <span class="landing-cta-card-title">${t('site.cta.arcade', undefined, '오락실')}</span>
                </button>
            </div>
        `;
        landing.appendChild(cta);

        /* TASK-KL-098. 사람이 있다를 말이 아니라 **숫자**로 보여 주는 자리.
         * 값은 전부 실측이고 지어낸 수는 한 개도 없다. 서버에 못 닿거나 아직 0이면 이 자리는
         * 통째로 안 그려진다. 문장이 아니라 Today / Total 두 칸이다 (사용자 요청). 문장으로
         * 쓰면 폭에 따라 두 줄이 되고, 세 가지 수를 한 줄에 우겨 넣게 된다. */
        const pulse = document.createElement('div');
        pulse.className = 'landing-pulse';
        pulse.id = 'homePulse';
        landing.appendChild(pulse);
        fillHomePulse(pulse);

        /* 아직 안 써 본 것 은 뺐다 (사용자 지시 2026-08-08).
         * 첫 화면에서 너 이거 안 써 봤지라고 미는 자리였다. 발견을 돕는다기보다 재촉으로
         * 읽힌다. 도구를 찾는 길은 이미 둘(도구 전체, 검색) 있다. 서버의 `/kl/suggest` 도
         * 이 자리 때문에 첫 화면마다 두드리고 있었으므로 그 요청도 같이 없어진다. */

        /* AI 와 함께 만든 것이다. 첫 화면에서 한 번 말한다 (TASK-KL-352).
         * 숨길 일이 아니고, 쓰는 사람이 알고 고를 수 있어야 하는 것이다. 한 줄이면 된다 . 
         * 무엇이 어디로 가는지는 도구마다 배지가 따로 말한다. 광고가 아니므로 가장 아래, 가장 작게. */
        const madeWith = document.createElement('p');
        madeWith.className = 'landing-madewith';
        madeWith.innerHTML =
            `${escapeHtml(t('site.madewith', undefined, 'AI 와 함께 만듭니다.'))} ` +
            `<a href="https://github.com/Mascari4615/Mascari4615.github.io" rel="noopener">${escapeHtml(t('site.madewith.src', undefined, '소스 보기'))}</a>`;
        landing.appendChild(madeWith);

        return landing;
    }

    /**
     * 도구별 열린 횟수. 한 화면에서 **한 번만** 받아 온다.
     * 도구를 옮길 때마다 새로 물으면, 그 요청 자체가 도구를 열었다를 세는 서버를 계속 두드린다.
     */
    /**
     * 도구 이름 밑에 지금까지 N번 열렸어요 (사용자 요청. "그냥 재밌잖아 그런거").
     *
     * 한 번도 안 열린 도구에는 아무것도 안 쓴다. 0번 열렸어요는 재미가 아니라 낙인이다.
     */
    /** 계정 스크립트를 기다린다. 도구 화면은 그것보다 먼저 그려진다. 안 오면 그냥 포기한다. */
    /**
     * 어서 와요, ○○. 이름은 **계정 닉네임**이다 (사용자 요청 2026-08-19).
     *
     * 전에는 첫 화면 꾸미기에서 따로 적어 넣는 값이었다. 이름을 두 곳에 두면 반드시 갈라진다 . 
     * 머리 위 계정 메뉴는 욘인데 첫 화면은 ㅋㅋ인 식이다. 이름의 정본은 계정 하나다.
     *
     * 로그인 안 했으면 이 줄은 **아예 없다**. 어서 와요,  같은 반쪽 문장보다 없는 편이 낫다.
     * 로그인, 로그아웃을 그 자리에서 하면 계정 조각이 다시 불러 주므로 그때 붙고 떨어진다.
     */
    async function greet(hero) {
        /* 계정 조각은 첫 화면을 지은 **뒤에** 온다. 그냥 읽으면 늘 없다(방문 수와 같은 함정). */
        if (!(await whenApiBase())) return;
        const account = typeof window !== 'undefined' && window.KarmoAccount;
        if (!account || !account.subscribe) return;
        account.subscribe((state) => {
            const name = (state && state.account && state.account.displayName) || '';
            let hi = hero.querySelector('.landing-hi');
            if (!name) {
                if (hi) hi.remove();
                return;
            }
            if (!hi) {
                hi = document.createElement('p');
                hi.className = 'landing-hi';
                hero.appendChild(hi);
            }
            hi.textContent = t('site.greeting', { name }, `어서 와요, ${name}`);
        });
    }

    /** 화면에 그대로 쓰는 글자 다듬기. 도구 이름은 우리 것이지만 규칙은 한 곳에 둔다. */
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 도구 id 로 사람이 읽는 이름 찾기. 등록된 것 우선, 없으면 지연 메타. 둘 다 없으면 null. */
    function toolTitleFor(id) {
        const registered = tools().find((t) => t.id === id);
        if (registered && registered.title) return registered.title;
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        return (meta[id] && meta[id].title) || null;
    }

    /**
     * 첫 화면의 방문 수. 블로그와 같은 **Today / Total** 두 칸 (TASK-KL-136, 사용자 요청).
     *
     * 문장으로 쓰던 것을 칸으로 바꿨다: 지금까지 N번 다녀갔어요, 오늘 M번, 도구는 K번
     * 열렸고요(L개가 실제로 쓰였어요)는 폭이 좁아지는 순간 두 줄이 되고, 무엇이 무엇인지도
     * 읽어야 안다. 도구 열림 수는 광장(`전부 보기 →`)에 그대로 있다. 첫 화면에 세 종류의
     * 수를 늘어놓지 않는다.
     *
     * 이번 주에 많이 쓴 도구는 **찾는 칸 안쪽**으로 옮겼다 (사용자 요청). 통계를 받아 오는
     * 곳은 여기 하나뿐이므로, 여기서 받아 팔레트에 건네준다.
     *
     * 왜 실측만 쓰나: 이 자리에 한 번이라도 지어낸 수를 넣으면 옆의 진짜 수까지 못 믿을 것이
     * 된다. 그래서 서버에 못 닿거나 아직 한 번도 안 열렸으면 **아무것도 안 그린다** . 
     * 0번 열림이 떠 있는 화면은 북적이는 게 아니라 죽은 화면으로 읽힌다.
     */
    async function fillHomePulse(slot) {
        /* **계정 조각을 기다린다** (2026-08-19. 켜도 방문 수가 안 보임).
         *
         * 여기서 `window.KarmoAccount` 를 그냥 읽고 없으면 돌아섰다. 그런데 이 함수는 첫 화면을
         * **짓는 도중**에 불리고, `account.js` 는 그 뒤에 온다. 그래서 서버가 멀쩡해도 이 칸은
         * 늘 비었다. 도구 화면의 열림 수(`fillToolCount`)는 이미 `whenApiBase()` 를 기다리고
         * 있었는데, 이 자리만 그 줄을 안 썼다(창구는 진작 뚫려 있었다). */
        if (!(await whenApiBase())) return;
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        if (!base) return;
        /* **물어보는 동안 자리를 잡아 둔다**. 대답이 오면 이 칸이 한 줄(23px) 생기면서 아래가
           통째로 내려간다(실사이트 밀림 0.042). 못 받으면 도로 놓아 `:empty` 가 이겨 자리가 없어진다. */
        slot.dataset.reserving = '1';
        const unreserve = () => { delete slot.dataset.reserving; };
        let data;
        try {
            const response = await fetch(base + '/kl/tools/stats');
            if (!response.ok) { unreserve(); return; }
            data = await response.json();
        } catch (_) {
            unreserve();
            return;
        }
        const pulse = (data && data.pulse) || {};
        const visits = (data && data.visits) || {};

        /* 이번 주에 많이 쓴 도구는 찾는 칸 안으로 (TASK-KL-136). 첫 화면이 안 붙어 있어도
         * (도구 상세에서 이 함수가 돌 때) 팔레트는 있을 수 있으므로 화면 확인보다 먼저 넘긴다.
         * 이름을 못 찾는 도구는 뺀다. 화면에 id 가 그대로 뜨면 내부 사정이 새어 나온 것처럼 보인다. */
        const top = (data.tools || [])
            .filter((t) => t.recent > 0 && toolTitleFor(t.toolId))
            .slice(0, 6)
            .map((t) => t.toolId);
        if (top.length && typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.setPopular(top);
        }

        if (!slot.isConnected) { unreserve(); return; }
        if (!pulse.opensTotal && !visits.total) { unreserve(); return; }
        const n = (value) => Number(value || 0).toLocaleString('ko-KR');

        /* 블로그의 Today / Total 두 칸 (사용자 요청). 방문 수만 낸다 . 
         * 명이라고 쓰면 안 된다: 이 수는 방문 횟수지 사람 수가 아니다. 사람 수는 하루
         * 단위로만 셀 수 있고(오늘 열쇠만 들고 있으므로), 그 값은 광장에 있다. */
        if (!visits.total) { unreserve(); return; }
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
