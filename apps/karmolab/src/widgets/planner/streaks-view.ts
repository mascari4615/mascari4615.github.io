/**
 * 연속일·레벨 — 오늘 눌렀나 (TASK-KL-321)
 *
 * 옛 React 판에는 같은 내용이 두 벌 있었다(`HeroPanel` 과 `StreaksPanel` — 레벨 카드와
 * 연속일 카드가 서로 조금씩 다르게 그려졌다). 옮기면서 한 벌로 합친다.
 *
 * 셈은 여기 없다 — 전부 `lib/gamification.ts` 다. 여기는 그린다.
 */
import { t } from '../../lib/i18n';
import {
    DEFAULT_TRACKS,
    getLevelRange,
    getLevelProgress,
    loadUserData,
    localDateString,
    recordStreakActivity
} from '../../lib/gamification';

const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 레벨 이름표 — 숫자만 있으면 무슨 뜻인지 모른다 */
function levelTitleKey(level: number): string {
    if (level < 5) return 'planner.t60';
    if (level < 10) return 'planner.t61';
    if (level < 20) return 'planner.t62';
    if (level < 35) return 'planner.t63';
    if (level < 50) return 'planner.t64';
    return 'planner.t65';
}

export function buildStreaksView(container: HTMLElement): void {
    function render(): void {
        const data = loadUserData();
        const today = localDateString();
        const totalExp = data.totalExp || 0;
        const level = data.level || 0;
        const { min, max } = getLevelRange(level);
        const pct = Math.min(getLevelProgress(totalExp) * 100, 100).toFixed(1);

        container.innerHTML = `
            <div class="pl-streaks">
                <div class="pl-level">
                    <div class="pl-level-badge">${level}</div>
                    <div class="pl-level-info">
                        <div class="pl-level-title">${esc(t(levelTitleKey(level)))}</div>
                        <div class="pl-level-exp">${esc(t('planner.t66', { exp: totalExp.toLocaleString(), into: totalExp - min, need: max - min }))}</div>
                        <div class="pl-level-bar"><div class="pl-level-fill" style="width:${pct}%"></div></div>
                    </div>
                </div>
                <div class="pl-track-row">
                    ${DEFAULT_TRACKS.map((track) => {
                        const s = data.streaks[track.id];
                        const doneToday = s?.lastActivityDate === today;
                        return `<div class="pl-track${doneToday ? ' pl-track--done' : ''}">
                            <div class="pl-track-info">
                                <div class="pl-track-label">${esc(t(track.labelKey))}</div>
                                <div class="pl-track-stat">${esc(t('planner.t67', { current: s?.current ?? 0, longest: s?.longest ?? 0 }))}</div>
                            </div>
                            <button type="button" class="btn ${doneToday ? 'btn-ghost' : 'btn-accent'} pl-track-btn"
                                    data-track="${esc(track.id)}"${doneToday ? ' disabled' : ''}>
                                ${esc(doneToday ? t('planner.t68') : t('planner.t69'))}
                            </button>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-track]');
        if (!btn?.dataset.track) return;
        const result = recordStreakActivity(btn.dataset.track);
        if (!result.changed) return;
        for (const id of result.unlocked) {
            Toolbox?.showToast?.(t('planner.t70', { title: t(`planner.ach.${id}`) }), 'success');
        }
        if (result.leveledUp) {
            Toolbox?.showToast?.(t('planner.t71', { level: result.newLevel }), 'success');
        }
        render();
    });

    render();
}
