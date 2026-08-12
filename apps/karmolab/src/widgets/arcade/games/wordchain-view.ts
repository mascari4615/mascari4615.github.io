/**
 * 끝말잇기 화면 (TASK-KL-242)
 *
 * **낱말 목록과 「이어지나」 규칙을 여기서 넣어 준다.** 규칙 파일은 여전히 말을 모른다 —
 * 한국어면 끝 글자, 영어·일본어면 그 말의 규칙이 된다. 목록은 말 묶음에서 온다.
 *
 * 남은 시간을 막대로 보여 준다. 이 놀이의 긴장은 「생각나기 전에 시간이 간다」에서 나온다.
 */
import { t, locale } from '../../../lib/i18n';
import type { GameView } from '../views';
import { useWordPack, type ChainState, type ChainAction } from './wordchain';

/** 말마다 「이어진다」의 뜻이 다르다. */
function linksFor(loc: string): (prev: string, next: string) => boolean {
  if (loc === 'ja') {
    /* 시리토리 — 마지막 글자로 시작. ん 으로 끝나면 진다(여기서는 그냥 못 잇는 것으로 둔다). */
    return (p, n) => !!p && !!n && p[p.length - 1] === n[0];
  }
  /* 한국어·영어 모두 「끝 글자로 시작」. 영어는 대소문자를 안 가린다. */
  return (p, n) =>
    !!p && !!n && p[p.length - 1].toLowerCase() === n[0].toLowerCase();
}

export const wordchainView: GameView<ChainState, ChainAction> = {
  id: 'wordchain',
  mount(el, act) {
    /* 말 묶음에서 낱말을 받아 규칙에 꽂는다. 없으면 규칙 파일의 한국어 기본이 쓰인다. */
    const raw = t('arcade.chain.words');
    const words = raw && raw !== 'arcade.chain.words' ? raw.split(',').map((w) => w.trim()).filter(Boolean) : [];
    if (words.length) useWordPack({ words, links: linksFor(locale()) });

    el.innerHTML =
      '<div class="ac-wc">' +
      '<div class="ac-wcchain" id="acWcChain"></div>' +
      '<div class="ac-bar"><div class="ac-fill" id="acWcFill"></div></div>' +
      '<div class="ac-wcrow">' +
      '<input type="text" id="acWcIn" autocomplete="off" aria-label="' + t('arcade.chain.aria') + '">' +
      '<button class="btn btn-primary" id="acWcGo"></button>' +
      '</div>' +
      '<div class="ac-wcwho" id="acWcWho"></div>' +
      '</div>';
    const chainEl = el.querySelector('#acWcChain') as HTMLElement;
    const fill = el.querySelector('#acWcFill') as HTMLElement;
    const input = el.querySelector('#acWcIn') as HTMLInputElement;
    const go = el.querySelector('#acWcGo') as HTMLButtonElement;
    const whoEl = el.querySelector('#acWcWho') as HTMLElement;

    const send = (): void => {
      const w = input.value.trim();
      if (!w) return;
      act({ word: w });
      input.value = '';
      input.focus();
    };
    go.onclick = send;
    input.onkeydown = (e): void => {
      if (e.key === 'Enter') send();
    };

    let drawn = 0;
    return (v, mySeat, now) => {
      const s = v.state;
      const myTurn = s.alive[mySeat] && s.turn === mySeat && !v.finished;

      if (s.chain.length !== drawn) {
        drawn = s.chain.length;
        chainEl.innerHTML = s.chain
          .slice(-8)
          .map((w, i, arr) => '<span' + (i === arr.length - 1 ? ' class="ac-wclast"' : '') + '>' + w + '</span>')
          .join('<b>→</b>');
        chainEl.scrollLeft = chainEl.scrollWidth;
      }

      const leftMs = Math.max(0, s.endsAt - now);
      fill.style.width = Math.min(100, (leftMs / 15000) * 100) + '%';

      go.textContent = t('arcade.chain.go');
      input.disabled = !myTurn;
      go.disabled = !myTurn;
      input.placeholder = myTurn
        ? t('arcade.chain.hint', { c: s.chain[s.chain.length - 1]?.slice(-1) ?? '' })
        : t('arcade.chain.waiting');

      whoEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead') + '">' +
          seat.name + '</span>')
        .join('');
    };
  }
};
