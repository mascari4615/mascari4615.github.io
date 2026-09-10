import {t} from '../../lib/i18n';
export interface WorkRow {url?: string; slug?: string; title?: string; image?: string; platform?: string; roles?: string[]; description?: string; org?: string; period?: string; at?: string; date?: string}
export const safeUrl = (value?: string): string => {
    if (!value) return '';
    try {const url = new URL(value, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : '';} catch {return '';}
};
export function mountProjects(root: HTMLElement, all: WorkRow[], featured: string[] = [], limit = 3): void {
    const count = Number.isInteger(limit) && limit > 0 ? limit : 3;
    const preferred = featured.flatMap(id => all.find(w => (w.slug || w.url) === id) || []);
    const selected = [...new Set([...preferred, ...all])].slice(0, count);
    const host = root.querySelector<HTMLElement>('.ab-works')!;
    const more = root.querySelector<HTMLButtonElement>('.ab-more')!;
    let expanded = false;
    const render = (): void => {
        host.replaceChildren(); const rows = expanded ? all : selected;
        for (const w of rows) {
            const article = document.createElement('article'); article.className = 'ab-work';
            const a = document.createElement('a'); if (safeUrl(w.url)) a.href = safeUrl(w.url);
            const placeholder = (): HTMLSpanElement => {const span = document.createElement('span'); span.className = 'ab-placeholder'; span.textContent = t('about.noImage', undefined, '이미지 없음'); return span;};
            if (safeUrl(w.image)) {
                const image = document.createElement('img'); image.src = safeUrl(w.image); image.alt = w.title || ''; image.loading = 'lazy';
                image.addEventListener('error', () => image.replaceWith(placeholder()), {once: true}); a.append(image);
            } else a.append(placeholder());
            const title = document.createElement('h3'); title.textContent = w.title || t('about.untitled', undefined, '제목 없음'); a.append(title); article.append(a);
            for (const [className, text] of [
                ['', [w.platform, ...(Array.isArray(w.roles) ? w.roles : [])].filter(Boolean).join(' / ')],
                ['ab-description', w.description], ['', [w.org, w.period || w.at || w.date].filter(Boolean).join(' / ')]
            ]) {if (text) {const p = document.createElement('p'); p.className = className || ''; p.textContent = text; article.append(p);}}
            host.append(article);
        }
        if (!rows.length) {const p = document.createElement('p'); p.textContent = t('about.empty', undefined, '등록된 프로젝트가 없습니다.'); host.append(p);}
        more.hidden = all.length <= selected.length;
        more.textContent = expanded ? t('about.collapse', undefined, '접기 ↑') : t('about.expand', {count: all.length - selected.length}, '다른 프로젝트 {count}개 보기 ↗');
        more.setAttribute('aria-expanded', String(expanded)); root.querySelector('.ab-count')!.textContent = `${rows.length} / ${all.length}`;
    };
    more.addEventListener('click', () => {expanded = !expanded; render(); if (!expanded) more.scrollIntoView({block: 'nearest'});}); render();
}
