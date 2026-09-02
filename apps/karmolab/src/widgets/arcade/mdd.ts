/**
 * MDD. 판에 앉는 저택 사람의 얼굴, 말풍선, 컷인 (2026-09-02 감사 B2, `arcade.ts` 에서 분리)
 *
 * 켬 여부는 브라우저에 남음(`karmolab.arcade.mdd`). 기본 켬 (사용자 결정 2026-09-02).
 * 판의 상태는 안 들고 있음. 지금 보이는 판(`view`)과 내 자리(`mySeat`)를 물어서 그림.
 * 카드 정본은 `memo/characters/<slug>/card.md`, 문구는 `cast.ts`
 */
import { castByName, faceSvg, lineOf, type Mood } from './cast';
import type { MatchView } from './kernel';
import { blip } from '../../lib/blip';

export type Cue = Parameters<typeof lineOf>[1];

export interface MddDeps {
  container: HTMLElement;
  /** 지금 보이는 판. 주인이면 커널, 손님이면 받은 그림 */
  view: () => MatchView<unknown> | null;
  mySeat: () => number;
}

export interface Mdd {
  on: () => boolean;
  /** 버튼 눌림 표시, 꺼졌으면 말풍선과 컷인 걷기 */
  paint: () => void;
  sayAs: (seat: number, text: string, ms?: number) => void;
  /** 봇 자리의 사람이 그 상황의 말. 사람이 아니거나 확률에 안 걸리면 조용 */
  castSay: (seat: number, key: Cue, chance?: number) => void;
  cutIn: (seat: number, key: Cue) => void;
  faceOf: (v: MatchView<unknown>, i: number) => string;
  bubbleOf: (i: number) => string;
  clearBubbles: () => void;
  /** 컷인 타이머 끊고 걷기. 나가기와 위젯 내리기 */
  stop: () => void;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function mountMdd(d: MddDeps): Mdd {
  const $ = <T extends HTMLElement>(sel: string): T => d.container.querySelector<T>(sel) as T;
  /** 자리마다 지금 떠 있는 말. 자리 카드가 다시 그려질 때 얹음 */
  const bubbles = new Map<number, { text: string; until: number }>();
  let cutTimer = 0;

  const on = (): boolean => {
    try {
      return localStorage.getItem('karmolab.arcade.mdd') !== 'off';
    } catch {
      return true;
    }
  };

  const paint = (): void => {
    const b = d.container.querySelector<HTMLButtonElement>('#acMdd');
    if (b) b.setAttribute('aria-pressed', on() ? 'true' : 'false');
    const em = d.container.querySelector<HTMLButtonElement>('#acEmote');
    if (em && !on()) em.style.display = 'none';
    if (!on()) {
      bubbles.clear();
      $<HTMLElement>('#acEmotes').hidden = true;
      $<HTMLElement>('#acCutin').hidden = true;
    }
  };

  const sayAs = (seat: number, text: string, ms = 2600): void => {
    if (!text) return;
    bubbles.set(seat, { text, until: performance.now() + ms });
  };

  const castSay = (seat: number, key: Cue, chance = 1): void => {
    const v = d.view();
    const c = v && on() ? castByName(v.seats[seat]?.name ?? '') : null;
    if (!c || Math.random() > chance) return;
    sayAs(seat, lineOf(c, key, v?.seats[d.mySeat()]?.name ?? ''));
  };

  /** 컷인. 그 자리의 사람이 큰 얼굴로 한 줄. 1.7초 뒤 퇴장 */
  const cutIn = (seat: number, key: Cue): void => {
    const v = d.view();
    const c = v && on() ? castByName(v.seats[seat]?.name ?? '') : null;
    if (!c || !v) return;
    const text = lineOf(c, key, v.seats[d.mySeat()]?.name ?? '');
    if (!text) return;
    const mood: Mood = key === 'win' ? 'glad' : key === 'lose' ? 'sad' : key === 'four' ? 'tease' : key === 'danger' ? 'think' : 'calm';
    const el = $<HTMLElement>('#acCutin');
    el.innerHTML = '<span class="ac-cutface">' + faceSvg(c, mood) + '</span><div><b>' + esc(c.name) + '</b><p>' + esc(text) + '</p></div>';
    el.hidden = false;
    /* 컷인에 소리 한 번. 끝의 이김과 짐은 결과 화면이 이미 울리므로 빼고, 리치와 위기만 */
    if (key === 'four' || key === 'danger') blip('start');
    el.classList.remove('ac-on');
    if (cutTimer) window.clearTimeout(cutTimer);
    window.requestAnimationFrame(() => el.classList.add('ac-on'));
    cutTimer = window.setTimeout(() => {
      el.classList.remove('ac-on');
      cutTimer = window.setTimeout(() => { el.hidden = true; cutTimer = 0; }, 350);
    }, 1700);
  };

  const faceOf = (v: MatchView<unknown>, i: number): string => {
    const seat = v.seats[i];
    /* 플레이어는 캐릭터가 아님. 얼굴은 저택 사람만. MDD 가 꺼져 있으면 아무도 */
    const c = i === d.mySeat() || !on() ? null : castByName(seat?.name ?? '');
    if (!c) return '';
    const turn = (v.state as { turn?: number } | null)?.turn;
    let mood: Mood = 'calm';
    if (v.finished) {
      const top = Math.max(...v.seats.map((x) => x.score));
      mood = seat.score === top ? 'glad' : 'sad';
    } else if (turn === i) mood = 'think';
    return '<span class="ac-face">' + faceSvg(c, mood) + '</span>';
  };

  const bubbleOf = (i: number): string => {
    const b = bubbles.get(i);
    if (!b) return '';
    if (performance.now() > b.until) {
      bubbles.delete(i);
      return '';
    }
    return '<span class="ac-bubble">' + esc(b.text) + '</span>';
  };

  const stop = (): void => {
    if (cutTimer) {
      window.clearTimeout(cutTimer);
      cutTimer = 0;
    }
    const cut = d.container.querySelector<HTMLElement>('#acCutin');
    if (cut) {
      cut.classList.remove('ac-on');
      cut.hidden = true;
    }
  };

  return { on, paint, sayAs, castSay, cutIn, faceOf, bubbleOf, clearBubbles: () => bubbles.clear(), stop };
}
