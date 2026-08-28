/**
 * 소개 — 한 장 (change.blog-surfaces-as-widgets).
 *
 * 그리는 쪽은 이 위젯 하나고, `/about/` 장은 셸이 이 위젯을 부팅한 자리다.
 * 원료 = `data/about.json` (배포 산출, `gen-post-pages.mjs` 가 `content/about.md` 를 렌더한 것).
 *
 * 겉모습은 글 장·커뮤니티 글과 **같은 집**을 쓴다 — `css/community.css` 의 `.c-post-body md`.
 * 여기서 본문 스타일을 새로 정하면 세 곳이 갈라진다 (change.board-unify ② 규율).
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
    const esc = (v: unknown): string =>
        String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* 커뮤니티 위젯과 같은 시트를 같은 방식으로 붙인다 — 눌렀을 때 받으므로 첫 화면 무게 0. */
    function ensureCommunityStylesheet(): void {
        const href = '/apps/karmolab/css/community.css';
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    let cache: string | null = null;

    async function loadAbout(): Promise<string | null> {
        if (cache !== null) return cache;
        try {
            const response = await fetch('/apps/karmolab/data/about.json');
            if (response.ok === false) return null;
            cache = ((await response.json()) as { html: string }).html;
            return cache;
        } catch {
            return null;
        }
    }

    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('about') ?? {}),
        id: 'about',
        tabs: [
            {
                id: 'app',
                label: t('widgets.about.title', undefined, '소개'),
                build: function (container: HTMLElement): void {
                    ensureCommunityStylesheet();
                    void loadNamespace('about').then(async () => {
                        const body = await loadAbout();
                        if (body === null) {
                            container.innerHTML = `<div class="c-empty">${esc(
                                t('about.failed', undefined, '소개를 못 받았습니다')
                            )}</div>`;
                            return;
                        }
                        /* 원료는 우리 저장소의 마크다운을 우리가 렌더한 것이다 — 바깥 입력이 아니다. */
                        container.innerHTML = `<div class="c-wrap"><article class="c-post">
    <div class="c-post-body md">${body}</div>
</article></div>`;
                    });
                }
            }
        ]
    });
})();
