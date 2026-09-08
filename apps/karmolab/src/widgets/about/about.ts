/** 소개 A안. 왼쪽 프로필 고정, 오른쪽 작업물의 진열과 연표 선택 */
import { t, loadNamespace } from '../../lib/i18n';
import { mountWorks } from './works-view';

interface AboutData {
    intro: string;
    sections: { title: string; html: string }[];
}

Mdd.injectCSS('about', `
    .main-content:has(.ab) > .tool-seo { display:none; }
    .ab { display:grid; grid-template-columns:300px minmax(0,1fr); gap:var(--space-xl); align-items:start; }
    .ab-profile { position:sticky; top:calc(var(--header-h) + var(--space-lg)); min-width:0;
        max-height:calc(100dvh - var(--header-h) - var(--space-2xl)); overflow-y:auto; scrollbar-width:thin;
        padding-right:var(--space-sm); font-size:var(--font-size-2xs); line-height:1.6; color:var(--text-secondary); }
    .ab-profile h1 { font-size:var(--font-size-display-sm); line-height:1.3; color:var(--text-primary); margin:0 0 var(--space-sm); }
    .ab-profile h2 { font:600 var(--font-size-3xs) var(--font-mono); color:var(--text-tertiary);
        margin:var(--space-lg) 0 var(--space-sm); }
    .ab-profile p { margin:0 0 var(--space-sm); }
    .ab-profile img { width:64px; height:64px; object-fit:contain; }
    .ab-profile a { color:var(--accent-ink); text-decoration:none; overflow-wrap:anywhere; }
    .ab-profile a:hover { text-decoration:underline; }
    .ab-profile ul { margin:0; padding:0; list-style:none; }
    .ab-profile li + li { margin-top:var(--space-sm); }
    .ab-profile strong { color:var(--text-primary); font-weight:600; }
    .ab-profile details { margin-top:var(--space-md); }
    .ab-profile summary { cursor:pointer; color:var(--text-secondary); }
    .ab-links p { display:flex; flex-wrap:wrap; gap:var(--space-xs) var(--space-md); }
    .ab-works { min-width:0; }
    .ab-works > h2 { font-size:var(--font-size-sm); margin:0 0 var(--space-md); }
    .ab .wk-now { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .ab #wkBody { display:flex; flex-direction:column; gap:var(--space-lg); }
    .ab .wk-wall { grid-template-columns:repeat(auto-fill,minmax(118px,1fr)); }
    .ab .wk-tile .cap { opacity:1; }
    .ab .wk-tile:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .ab .wk-tile:focus-visible img { filter:none; }
    .ab .wk-now a { min-width:0; }
    .ab .wk-now b { font-size:var(--font-size-xs); overflow-wrap:anywhere; }
    .ab .wk-now em { top:var(--space-xs); left:var(--space-xs); }
    .ab .wk-now .veil { padding:var(--space-lg) var(--space-sm) var(--space-sm); }
    .ab .wk-bar { row-gap:var(--space-sm); }
    .ab .wk-filters { display:flex; gap:var(--space-xs); flex-wrap:wrap; width:100%; }
    .ab .wk-map-scroll { overflow-x:auto; }
    .ab .wk-map { min-width:640px; }
    .ab .wk-dot { width:24px; height:24px; margin-left:0; padding:0; background:transparent; border:0; }
    .ab .wk-dot::after { content:''; display:block; width:10px; height:10px; margin:auto;
        border:2px solid currentColor; border-radius:var(--radius-pill); }
    .ab .wk-bar2 { background:var(--bg-secondary); text-align:left; }
    .ab .wk-pick a { color:var(--accent-ink); }
    .ab .wk-pick { min-width:0; }
    .ab .wk-pick .txt { min-width:0; overflow-wrap:anywhere; }
    .ab .wk-tail ul { grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); }
    @media(max-width:1100px) {
        .ab { grid-template-columns:250px minmax(0,1fr); gap:var(--space-lg); }
        .ab .wk-now { grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); }
    }
    @media(min-width:851px) { .ab-resume > summary { display:none; } }
    @media(max-width:850px) {
        .ab { grid-template-columns:minmax(0,1fr); }
        .ab-profile { position:static; max-height:none; overflow:visible; padding:0; }
        .ab-profile > p:first-child { float:right; margin:0; }
        .ab-profile img { width:48px; height:48px; }
        .ab .wk-year { grid-template-columns:minmax(0,1fr); gap:var(--space-sm); }
        .ab .wk-pick { grid-template-columns:90px minmax(0,1fr); }
    }
`);

Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('about') ?? {}),
    id: 'about',
    tabs: [{
        id: 'app', label: t('widgets.about.title', undefined, '소개'),
        build(container: HTMLElement): void {
            const breakpoint = matchMedia('(min-width:851px)');
            let resume: HTMLDetailsElement | null = null;
            const adapt = (): void => { if (resume) resume.open = breakpoint.matches; };
            breakpoint.addEventListener('change', adapt);
            Toolbox.onDispose(() => breakpoint.removeEventListener('change', adapt));
            void loadNamespace('about').then(async () => {
                try {
                    const response = await fetch('/apps/karmolab/data/about.json');
                    if (!response.ok) throw new Error('about');
                    const data = await response.json() as AboutData;
                    const layout = document.createElement('div');
                    layout.className = 'ab';
                    const profile = document.createElement('aside');
                    profile.className = 'ab-profile';
                    profile.innerHTML = data.intro;
                    resume = document.createElement('details');
                    resume.className = 'ab-resume';
                    resume.open = breakpoint.matches;
                    const summary = document.createElement('summary');
                    summary.textContent = t('about.details', undefined, '경력, 학력, 활동 보기');
                    resume.appendChild(summary);
                    for (const [index, section] of data.sections.entries()) {
                        const block = document.createElement('section');
                        block.className = index === 0 ? 'ab-links' : 'ab-section';
                        const heading = document.createElement('h2');
                        heading.textContent = section.title;
                        block.appendChild(heading);
                        block.insertAdjacentHTML('beforeend', section.html);
                        (index === 0 ? profile : resume).appendChild(block);
                    }
                    profile.appendChild(resume);
                    const works = document.createElement('section');
                    works.className = 'ab-works';
                    const heading = document.createElement('h2');
                    heading.textContent = t('about.works', undefined, '만든 것');
                    works.appendChild(heading);
                    const host = document.createElement('div');
                    works.appendChild(host);
                    layout.append(profile, works);
                    container.replaceChildren(layout);
                    mountWorks(host);
                } catch {
                    container.textContent = t('about.failed', undefined, '소개를 못 받았습니다');
                }
            });
        }
    }]
});
