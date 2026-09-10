import {t} from '../../lib/i18n';
import {safeUrl} from './projects';
interface RecordVisual {image?: string; symbol?: string; color?: string; background?: string}
interface Account {title: string; url: string; handle?: string; icon?: string; image?: string; accent?: string}
export interface Presentation {name: string; art: string; artAlt?: string; linksSection: string; featured: string[]; featuredLimit: number; records: Record<string, RecordVisual>; profiles: Account[]}
const node = (tag: string, cls: string, text?: string): HTMLElement => {const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n;};
export function renderRecords(sections: {title: string; html: string}[], host: HTMLElement, visuals: Record<string, RecordVisual> = {}): void {
    for (const section of sections) {
        const block = node('section', 'ab-component'); block.append(node('h2', '', section.title));
        const source = node('div', 'ab-extra'); source.innerHTML = section.html || ''; const list = source.querySelector(':scope > ul');
        if (list) {
            const rows = node('div', 'ab-record-rows');
            for (const item of [...list.children]) {
                const marker = item.querySelector('[data-record]'); const visual = visuals[marker?.getAttribute('data-record') || ''] || {}; marker?.remove();
                const row = node('div', 'ab-profile-record'); const icon = node('span', 'ab-record-icon'); icon.setAttribute('aria-hidden', 'true');
                icon.style.color = visual.color || '#b8c8c0'; icon.style.background = visual.background || '#304039';
                const fallback = (): void => {icon.textContent = (item.textContent || '').trim().slice(0, 1);};
                if (safeUrl(visual.image)) {
                    const image = document.createElement('img'); image.src = safeUrl(visual.image); image.alt = ''; image.addEventListener('error', fallback, {once: true}); icon.append(image);
                } else if (safeUrl(visual.symbol)) {
                    const symbol = node('span', 'ab-record-symbol'); symbol.style.maskImage = `url("${safeUrl(visual.symbol)}")`; icon.append(symbol);
                } else fallback();
                const text = node('div', 'ab-record-text'); text.innerHTML = item.innerHTML; row.append(icon, text); rows.append(row);
            }
            block.append(rows); list.remove();
        }
        block.append(source); host.append(block);
    }
}
export function renderProfiles(host: HTMLElement, profiles: Account[] = []): void {
    const rows = profiles.filter(item => safeUrl(item.url)); if (!rows.length) {host.hidden = true; return;}
    host.append(node('h2', '', t('about.profiles', undefined, '프로필'))); const grid = node('div', 'ab-profile-grid');
    for (const item of rows) {
        const a = document.createElement('a'); a.className = 'ab-account-card'; a.href = safeUrl(item.url); a.style.setProperty('--account-accent', item.accent || '#adbbb4');
        const top = node('div', 'ab-account-service');
        if (safeUrl(item.icon)) {const icon = node('span', 'ab-account-icon'); icon.style.maskImage = `url("${safeUrl(item.icon)}")`; icon.setAttribute('aria-hidden', 'true'); top.append(icon);}
        top.append(node('span', '', item.title));
        if (safeUrl(item.image)) {const image = document.createElement('img'); image.className = 'ab-account-art'; image.src = safeUrl(item.image); image.alt = ''; image.addEventListener('error', () => image.remove(), {once: true}); a.append(image);}
        const bottom = node('div', 'ab-account-name', item.handle || t('about.viewProfile', undefined, '프로필 보기'));
        const arrow = node('span', 'ab-account-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); bottom.append(arrow); a.append(top, bottom); grid.append(a);
    }
    host.append(grid);
}
