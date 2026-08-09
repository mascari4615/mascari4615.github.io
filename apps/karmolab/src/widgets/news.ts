import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'news',
    title: t('widgets.news.title', undefined, "뉴스"),
    category: 'play',
    desc: t('widgets-desc.news.desc', undefined, "가짜 뉴스 헤드라인을 생성합니다"),
    layout: 'form',
    icon: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 8h16 M8 4v4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 12h8 M8 16h6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('news.t02', undefined, "뉴스"),
        build: function (container: HTMLElement): void {
          void loadNamespace('news').then(function () {

          Mdd.linePreset('tool_run', { msg: t('news.t04') });
          container.innerHTML = `
                    <div style="height:350px; background:#111; border:4px solid #333; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; position:relative;">
                        <div style="background:var(--error); color:#fff; font-weight:bold; padding:10px; text-align:center; letter-spacing:2px; z-index:10; box-shadow:0 2px 10px rgba(0,0,0,0.5);">${esc(t('news.t01'))}</div>
                        <div id="newsMarquee" style="flex:1; position:relative; overflow:hidden; background:#0a0a0a; color:#ccc; font-family:serif;">
                            <div id="newsContent" style="position:absolute; width:100%; padding:20px; font-size:16px; line-height:1.8; text-align:justify;">
                            </div>
                        </div>
                    </div>
                `;
          const contentEl = container.querySelector('#newsContent') as HTMLElement | null;
          if (!contentEl) return;

          const content = contentEl;

          const article =
            t('news.article');

          content.innerHTML = (article + '<br><br>').repeat(20);

          let y = 0;
          let animId: number | undefined;
          function scroll(): void {
            y -= 0.5;
            if (y < -1000) y = 0;
            content.style.transform = `translateY(${y}px)`;
            animId = requestAnimationFrame(scroll);
          }
          const observer = new IntersectionObserver((e) => {
            if (e[0]?.isIntersecting) scroll();
            else if (animId !== undefined) cancelAnimationFrame(animId);
          });
          observer.observe(container);
                  });
        }
      }
    ]
  });
})();
