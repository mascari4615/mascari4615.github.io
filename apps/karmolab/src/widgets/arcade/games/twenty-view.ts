/**
 * 스무고개 화면 (TASK-KL-242)
 *
 * 낱말·질문·사실표를 말 묶음에서 꺼내 규칙에 꽂는다 — 규칙 파일은 무엇이 참인지 모른다.
 *
 * 답 쥔 사람에게는 **낱말을 크게** 보여 준다. 그 사람이 하는 일은 예/아니오 두 단추뿐이고,
 * 낱말이 눈에 안 들어오면 매번 위로 올려다봐야 한다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { useTwentyPack, type TwentyState, type TwentyAction } from './twenty';

export const twentyView: GameView<TwentyState, TwentyAction> = {
  id: 'twenty',
  mount(el, act) {
    const split = (key: string): string[] => {
      const raw = t(key);
      return raw && raw !== key ? raw.split('|').map((x) => x.trim()).filter(Boolean) : [];
    };
    const words = split('arcade.twenty.words');
    const questions = split('arcade.twenty.questions');
    const facts = split('arcade.twenty.facts');
    if (words.length && questions.length) useTwentyPack(words.length, questions.length, facts);

    el.innerHTML =
      '<div class="ac-tw">' +
      '<div class="ac-twhead" id="acTwHead"></div>' +
      '<div class="ac-twlog" id="acTwLog"></div>' +
      '<div class="ac-twbar" id="acTwBar"></div>' +
      '</div>';
    const head = el.querySelector('#acTwHead') as HTMLElement;
    const logEl = el.querySelector('#acTwLog') as HTMLElement;
    const bar = el.querySelector('#acTwBar') as HTMLElement;

    return (v, mySeat) => {
      const s = v.state;
      const keeper = s.keeper === mySeat;

      head.innerHTML = keeper
        ? '<small>' + t('arcade.twenty.youKeep') + '</small><b>' + (words[s.answer] ?? '?') + '</b>'
        : '<small>' + t('arcade.twenty.asking', { n: String(20 - s.log.length) }) + '</small>';

      logEl.innerHTML = s.log
        .map((l) =>
          l.q < 0
            ? '<div class="ac-twl ac-no">' + t('arcade.twenty.missed') + '</div>'
            : '<div class="ac-twl">' + (questions[l.q] ?? '?') +
              ' <b>' + (l.yes ? t('arcade.twenty.yes') : t('arcade.twenty.no')) + '</b></div>')
        .join('');
      logEl.scrollTop = logEl.scrollHeight;

      if (v.finished) {
        bar.innerHTML = '<small>' + (words[s.answer] ?? '') + '</small>';
        return;
      }

      if (s.pending >= 0) {
        if (!keeper) {
          bar.innerHTML = '<small>' + t('arcade.twenty.waitAnswer') + '</small>';
          return;
        }
        bar.innerHTML =
          '<p class="tool-status">' + (questions[s.pending] ?? '?') + '</p>' +
          '<button class="btn btn-primary" id="acTwY">' + t('arcade.twenty.yes') + '</button>' +
          '<button class="btn btn-ghost" id="acTwN">' + t('arcade.twenty.no') + '</button>';
        (bar.querySelector('#acTwY') as HTMLButtonElement).onclick = () => act({ kind: 'answer', yes: true });
        (bar.querySelector('#acTwN') as HTMLButtonElement).onclick = () => act({ kind: 'answer', yes: false });
        return;
      }

      if (keeper) {
        bar.innerHTML = '<small>' + t('arcade.twenty.waitAsk') + '</small>';
        return;
      }

      const asked = new Set(s.log.map((l) => l.q));
      bar.innerHTML =
        '<div class="ac-twqs">' +
        questions
          .map((q, i) =>
            asked.has(i) ? '' : '<button class="ac-twq" data-q="' + i + '">' + q + '</button>')
          .join('') +
        '</div>' +
        '<div class="ac-twqs">' +
        words.map((w, i) => '<button class="ac-twg" data-w="' + i + '">' + w + '</button>').join('') +
        '</div>';

      bar.querySelectorAll<HTMLButtonElement>('.ac-twq').forEach((b) => {
        b.onclick = () => act({ kind: 'ask', q: Number(b.dataset.q) });
      });
      bar.querySelectorAll<HTMLButtonElement>('.ac-twg').forEach((b) => {
        b.onclick = () => act({ kind: 'guess', pick: Number(b.dataset.w) });
      });
    };
  }
};
