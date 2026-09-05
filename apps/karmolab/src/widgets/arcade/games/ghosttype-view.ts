/**
 * 유령 타자 대결 화면 (change.arcade-absorbs-play 단계 3)
 *
 * 글 고르기(처음부터 있는 글 다섯, 내 글) 뒤 그대로 치기. 앞에서부터 맞게 친 글자만 거리로 침.
 * 자리마다 줄 하나에 달리는 표시. 어제의 나 자리는 껍데기가 앉히고 최고 기록의 수를 다시 두므로
 * 여기서는 그저 한 자리로 그림
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cpmOf, MAX_TEXT, MIN_TEXT, type GtState, type GtAction } from './ghosttype';

const PRESET_COUNT = 5;

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ghosttypeView: GameView<GtState, GtAction> = {
  id: 'ghosttype',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-gt">' +
      '<div class="ac-wcpick" id="acGtPick">' +
      '<p class="ac-wcask">' + esc(t('arcade.ghosttype.pick')) + '</p>' +
      '<div class="ac-gtlist" id="acGtPresets"></div>' +
      '<label class="ac-wcask" for="acGtOwn">' + esc(t('arcade.ghosttype.own', { max: String(MAX_TEXT) })) + '</label>' +
      '<textarea id="acGtOwn" class="ac-gtown" rows="2" maxlength="' + MAX_TEXT + '" placeholder="' + esc(t('arcade.ghosttype.ownPh')) + '"></textarea>' +
      '<p class="ac-wcmsg" id="acGtMsg" aria-live="polite"></p>' +
      '<button type="button" class="ac-wcstart" id="acGtStart">' + esc(t('arcade.ghosttype.start')) + '</button>' +
      '</div>' +
      '<div class="ac-gtplay" id="acGtPlay" hidden>' +
      '<div class="ac-gtlanes" id="acGtLanes"></div>' +
      '<div class="ac-gttext" id="acGtText"></div>' +
      '<textarea id="acGtIn" class="ac-gtin" rows="3" spellcheck="false" autocomplete="off" aria-label="' + esc(t('arcade.ghosttype.inputAria')) + '" placeholder="' + esc(t('arcade.ghosttype.inputPh')) + '"></textarea>' +
      '<p class="ac-wcmsg" id="acGtLine"></p>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;
    const input = $<HTMLTextAreaElement>('acGtIn');
    let chosen = '';
    let shown = '';
    let sent = 0;

    const presets = Array.from({ length: PRESET_COUNT }, (_, i) => t('arcade.ghosttype.preset.' + i)).filter((x) => x && x.indexOf('arcade.ghosttype.preset') < 0);
    const list = $('acGtPresets');
    presets.forEach((text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ac-gtpreset';
      b.textContent = text;
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => {
        chosen = text;
        $<HTMLTextAreaElement>('acGtOwn').value = '';
        list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      };
      list.appendChild(b);
    });
    if (presets.length) {
      chosen = presets[0];
      (list.firstElementChild as HTMLElement | null)?.setAttribute('aria-pressed', 'true');
    }
    $('acGtStart').onclick = () => {
      const own = $<HTMLTextAreaElement>('acGtOwn').value.replace(/\s+/g, ' ').trim();
      const text = own || chosen;
      if (text.length < MIN_TEXT) {
        $('acGtMsg').textContent = t('arcade.ghosttype.tooShort');
        return;
      }
      act({ kind: 'load', text });
    };

    /** 앞에서부터 연속으로 맞은 글자 수. 여기까지가 달려온 거리 */
    const correctPrefix = (target: string): number => {
      const typed = input.value;
      let n = 0;
      while (n < typed.length && n < target.length && typed[n] === target[n]) n++;
      return n;
    };
    const paintText = (target: string): void => {
      const typed = input.value;
      let html = '';
      for (let i = 0; i < target.length; i++) {
        const ch = esc(target[i]);
        if (i < typed.length) html += '<span class="' + (typed[i] === target[i] ? 'ac-gtok' : 'ac-gtbad') + '">' + ch + '</span>';
        else if (i === typed.length) html += '<span class="ac-gtcur">' + ch + '</span>';
        else html += ch;
      }
      $('acGtText').innerHTML = html;
    };
    input.addEventListener('input', () => {
      if (!shown) return;
      paintText(shown);
      const n = correctPrefix(shown);
      if (n > sent) {
        sent = n;
        act({ kind: 'type', n });
      }
    });

    return (v, mySeat, now) => {
      const s = v.state;
      if (!s.text) {
        $('acGtPick').hidden = mySeat > 0;
        $('acGtPlay').hidden = true;
        if (mySeat > 0) $('acGtMsg').textContent = t('arcade.ghosttype.waitHost');
        return;
      }
      $('acGtPick').hidden = true;
      $('acGtPlay').hidden = false;
      if (shown !== s.text) {
        shown = s.text;
        sent = 0;
        input.value = '';
        input.disabled = false;
        paintText(shown);
        if (mySeat >= 0) input.focus();
      }
      const seat = mySeat < 0 ? 0 : mySeat;
      const elapsed = Math.max(0, now - s.startedAt);
      $('acGtLanes').innerHTML = v.seats
        .map((sq, i) => {
          const p = s.progress[i] ?? 0;
          const ratio = s.text.length ? p / s.text.length : 0;
          const ms = (s.doneAt[i] >= 0 ? s.doneAt[i] : now) - s.startedAt;
          const cpm = cpmOf(s.text, p, ms);
          return (
            '<div class="ac-gtlane' + (i === seat ? ' ac-me' : '') + '"><span class="ac-gtname">' + esc(sq.name) + '</span>' +
            '<span class="ac-gtrail"><span class="ac-gtrunner" style="left:calc(' + (ratio * 100).toFixed(1) + '% - ' + (ratio * 22).toFixed(0) + 'px)">' + (i === seat ? '🏃' : '👻') + '</span></span>' +
            '<span class="ac-gtstat">' + esc(t('arcade.ghosttype.cpm', { n: String(cpm) })) + (s.doneAt[i] >= 0 ? ' ' + esc(t('arcade.ghosttype.sec', { sec: ((s.doneAt[i] - s.startedAt) / 1000).toFixed(1) })) : '') + '</span></div>'
          );
        })
        .join('');
      const mineDone = s.doneAt[seat] >= 0;
      if (mineDone && !input.disabled) input.disabled = true;
      $('acGtLine').textContent = mineDone
        ? t('arcade.ghosttype.done', { cpm: String(cpmOf(s.text, s.text.length, s.doneAt[seat] - s.startedAt)), sec: ((s.doneAt[seat] - s.startedAt) / 1000).toFixed(1), keys: String(s.strokes) })
        : v.finished
          ? t('arcade.ghosttype.timeUp')
          : t('arcade.ghosttype.left', { sec: String(Math.max(0, Math.ceil((s.endsAt - now) / 1000))), elapsed: (elapsed / 1000).toFixed(0) });
    };
  }
};
