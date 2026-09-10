import {t, loadNamespace} from '../../lib/i18n';
import {mountProjects, type WorkRow, safeUrl} from './projects';
import {renderRecords, renderProfiles, type Presentation} from './profile';
import {aboutStyles} from './styles';
interface AboutData {intro: string; sections: {title: string; html: string}[]}
Mdd.injectCSS('about', aboutStyles);
Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('about') ?? {}), id: 'about',
    tabs: [{id: 'app', label: t('widgets.about.title', undefined, '소개'),
        build(container: HTMLElement): void {
            const controller = new AbortController();
            Toolbox.onDispose(() => controller.abort());
            const json = async <T,>(name: string): Promise<T> => {
                const response = await fetch(`/apps/karmolab/data/${name}.json`, {signal: controller.signal});
                if (!response.ok) throw new Error(`${name}: ${response.status}`);
                return response.json() as Promise<T>;
            };
            void loadNamespace('about').then(async () => {
                try {
                    const [profile, data, config] = await Promise.all([
                        json<AboutData>('about'), json<{works: WorkRow[]}>('works'), json<Presentation>('about-presentation')
                    ]);
                    if (controller.signal.aborted) return;
                    const root = document.createElement('div'); root.className = 'ab';
                    root.innerHTML = `<div class="ab-scene" role="img"></div><div class="ab-page">
                        <nav class="ab-top"><span></span><a href="/">KarmoLab ↗</a></nav>
                        <header><div class="ab-identity"></div><nav class="ab-links" aria-label="${t('about.links', undefined, '개인 링크')}"></nav></header>
                        <div class="ab-dashboard"><div class="ab-main"><section class="ab-exhibit">
                        <div class="ab-exhibit-head"><h2>${t('about.projects', undefined, '프로젝트')}</h2><small class="ab-count"></small></div>
                        <div class="ab-works" id="about-projects"></div><button class="ab-more" aria-expanded="false" aria-controls="about-projects"></button></section>
                        <section class="ab-accounts"></section></div><aside class="ab-sidebar">
                        <section class="ab-record"><h2>${t('about.record', undefined, '작업 기록')}</h2><dl></dl></section>
                        <div class="ab-resume"></div></aside></div><footer class="ab-footer"></footer></div>`;
                    const query = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
                    query('.ab-top span').textContent = config.name;
                    query('.ab-scene').setAttribute('aria-label', config.artAlt || '');
                    if (safeUrl(config.art)) root.style.setProperty('--about-art', `url("${safeUrl(config.art)}")`);
                    query('.ab-identity').innerHTML = profile.intro || '';
                    const sections = Array.isArray(profile.sections) ? profile.sections : [];
                    const links = document.createElement('div'); links.innerHTML = sections.find(s => s.title === config.linksSection)?.html || '';
                    for (const link of links.querySelectorAll(':scope > p a')) query('.ab-links').append(link.cloneNode(true));
                    query('.ab-footer').textContent = links.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.slice(7) || '';
                    const works = Array.isArray(data.works) ? data.works : [];
                    const fields = [...new Set(works.map(w => w.platform).filter(Boolean))];
                    for (const [label, value] of [[t('about.projects', undefined, '프로젝트'), String(works.length)], [t('about.platforms', undefined, '플랫폼'), fields.join(' / ')]]) {
                        const dt = document.createElement('dt'); dt.textContent = label;
                        const dd = document.createElement('dd'); dd.textContent = value; query('.ab-record dl').append(dt, dd);
                    }
                    renderRecords(sections.filter(s => s.title !== config.linksSection), query('.ab-resume'), config.records);
                    renderProfiles(query('.ab-accounts'), config.profiles);
                    mountProjects(root, works, config.featured, config.featuredLimit);
                    root.dataset.ready = 'true'; container.replaceChildren(root);
                } catch {
                    if (!controller.signal.aborted) container.textContent = t('about.failed', undefined, '소개를 못 받았습니다');
                }
            });
        }
    }]
});
