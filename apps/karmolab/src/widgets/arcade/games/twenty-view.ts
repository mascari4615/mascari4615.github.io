/**
 * 스무고개 화면 (TASK-KL-242, change.arcade-absorbs-play 단계 2)
 *
 * 사람 갈래: 낱말, 질문, 사실표를 번역 파일에서 꺼내 규칙에 꽂음. 규칙 파일은 무엇이 참인지 모름.
 * 답 쥔 사람에게는 **낱말을 크게**. 그 사람이 하는 일은 예/아니오 두 버튼뿐
 *
 * 컴퓨터 갈래: 표를 고르고(내 표, 남의 표) 하나를 마음에 정하면 봇이 묻는다. 질문은 규칙이 값으로 주고
 * 글자는 여기서 만든다. 찍으면 맞아요 아니에요로 판정
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { getPack } from '../../pack-store';
import { ensureLocal, localChoices, type PackChoice } from '../../../lib/pack-choices';
import { listShared, type SharedPackSummary } from '../../../lib/shared-packs';
import { loadPacks } from '../../pack-store';
import { takePick } from '../../pack-pick';
import { useTwentyPack, type TwentyState, type TwentyAction, type TwAsk, type TwField } from './twenty';

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 세대이(가)는 사람이 쓰는 말이 아니다. 받침을 보고 이/가를 고른다 */
function ga(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return word + (hangul && (last - 0xac00) % 28 !== 0 ? t('arcade.twenty.ga.after') : t('arcade.twenty.ga.open'));
}

/** 질문 값을 사람 말로 */
function askText(a: TwAsk, fields: TwField[]): string {
  const f = fields.find((x) => x.key === a.key);
  const label = f?.label ?? a.key;
  if (a.kind === 'gt') {
    const n = typeof a.v === 'number' && !Number.isInteger(a.v) ? a.v.toFixed(1) : String(a.v);
    return t('arcade.twenty.q.gt', { subject: ga(label), n, unit: f?.unit || '' });
  }
  if (a.kind === 'has') return t('arcade.twenty.q.has', { label, v: String(a.v) });
  return t('arcade.twenty.q.is', { subject: ga(label), v: String(a.v) });
}

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
      '<div class="ac-twpick" id="acTwPick" hidden>' +
      '<p class="ac-wcask">' + esc(t('arcade.twenty.pickPack')) + '</p>' +
      '<div class="ac-wcchips" id="acTwPacks"></div>' +
      '<p class="ac-wcmsg" id="acTwMsg"></p>' +
      '<button type="button" class="ac-wcstart" id="acTwStart" hidden>' + esc(t('arcade.twenty.start')) + '</button>' +
      '</div>' +
      '<div class="ac-twhead" id="acTwHead"></div>' +
      '<div class="ac-twlog" id="acTwLog"></div>' +
      '<div class="ac-twbar" id="acTwBar"></div>' +
      '</div>';
    const pickEl = el.querySelector('#acTwPick') as HTMLElement;
    const packsEl = el.querySelector('#acTwPacks') as HTMLElement;
    const msgEl = el.querySelector('#acTwMsg') as HTMLElement;
    const startBtn = el.querySelector('#acTwStart') as HTMLButtonElement;
    const head = el.querySelector('#acTwHead') as HTMLElement;
    const logEl = el.querySelector('#acTwLog') as HTMLElement;
    const bar = el.querySelector('#acTwBar') as HTMLElement;

    /* ── 표 고르기 (컴퓨터 갈래) ── */
    let chips: PackChoice[] = [];
    let picked: PackChoice | null = null;
    let loading = false;
    let shownPick = false;
    let barKey = '';

    function paintChips(): void {
      packsEl.innerHTML = '';
      for (const c of chips) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c.emoji + ' ' + c.title + (c.owner ? ', ' + c.owner : '');
        b.setAttribute('aria-pressed', String(picked === c));
        b.onclick = () => {
          picked = c;
          startBtn.hidden = false;
          paintChips();
        };
        packsEl.appendChild(b);
      }
      msgEl.textContent = chips.length ? '' : loading ? t('arcade.twenty.loading') : t('arcade.twenty.noPack');
    }

    function loadChips(): void {
      chips = localChoices('number');
      const handed = takePick();
      if (handed) picked = chips.find((c) => c.id === 'pack:' + handed) ?? null;
      if (picked) startBtn.hidden = false;
      loading = true;
      paintChips();
      /* 붙박이 표(서버가 `siteBoard` 로 표시)를 맨 앞에. 처음 온 사람도 바로 한 판. 남의 표는 뒤에,
         이미 이 브라우저에 이어받은 것은 뺀다(같은 표가 두 번 서지 않게) */
      void listShared({ needs: 'number', sort: 'popular', limit: 40 }).then((got) => {
        loading = false;
        if (!el.isConnected) return;
        if (got) {
          const already = new Set(loadPacks().map((p) => p.sharedId).filter(Boolean));
          const row = (r: SharedPackSummary, owner?: string): PackChoice => ({ id: 'shared:' + r.id, title: r.title, emoji: r.emoji, remote: true, owner });
          const builtin = got.packs.filter((r) => !!r.siteBoard && r.numberFields > 0 && !already.has(r.id)).map((r) => row(r));
          const others = got.packs.filter((r) => !r.siteBoard && r.numberFields > 0 && !already.has(r.id)).map((r) => row(r, r.ownerHandle));
          chips = builtin.concat(chips, others);
        }
        paintChips();
      });
    }

    startBtn.onclick = () => {
      if (!picked || loading) return;
      loading = true;
      startBtn.disabled = true;
      msgEl.textContent = t('arcade.twenty.loading');
      void ensureLocal(picked.id).then((id) => {
        loading = false;
        if (!el.isConnected) return;
        startBtn.disabled = false;
        msgEl.textContent = '';
        const pack = id ? getPack(id.slice(5)) : null;
        if (!pack) {
          msgEl.textContent = t('arcade.twenty.noPack');
          return;
        }
        act({ kind: 'load', title: pack.title, fields: pack.fields as TwField[], items: pack.items });
      });
    };

    const bindBar = (): void => {
      bar.querySelectorAll<HTMLButtonElement>('[data-say]').forEach((b) => {
        b.onclick = () => act({ kind: 'reply', say: b.dataset.say as 'yes' | 'no' | 'skip' });
      });
      bar.querySelectorAll<HTMLButtonElement>('[data-hit]').forEach((b) => {
        b.onclick = () => act({ kind: 'confirm', yes: b.dataset.hit === 'yes' });
      });
    };

    /** 같은 것을 매 프레임 다시 그리면 누르던 버튼이 사라진다. 바뀔 때만 */
    const setBar = (key: string, html: string): void => {
      if (barKey === key) return;
      barKey = key;
      bar.innerHTML = html;
      bindBar();
    };

    function renderPack(v: Parameters<ReturnType<typeof twentyView.mount>>[0], mySeat: number): void {
      const s = v.state;
      const keeper = s.keeper === mySeat;
      if (!s.pack) {
        pickEl.hidden = !keeper;
        if (keeper && !shownPick) {
          shownPick = true;
          loadChips();
        }
        head.innerHTML = keeper ? '' : '<small>' + esc(t('arcade.twenty.waitPack')) + '</small>';
        logEl.innerHTML = '';
        setBar('pick', '');
        return;
      }
      pickEl.hidden = true;
      const fields = s.pack.fields;
      const live = s.cands.filter((i) => s.refused.indexOf(i) < 0);
      head.innerHTML =
        '<small>' + esc(s.pack.title) + '. ' + esc(t('arcade.twenty.candidates', { n: String(live.length) })) + '</small>' +
        (keeper ? '<b>' + esc(t(s.asks.length ? 'arcade.twenty.keepGoing' : 'arcade.twenty.think')) + '</b>' : '');
      logEl.innerHTML = s.asks
        .map((x, i) =>
          '<div class="ac-twl">' + (i + 1) + '. ' + esc(askText(x.ask, fields)) + ' <b>' +
          esc(x.yes === null ? t('arcade.twenty.skip') : x.yes ? t('arcade.twenty.yes') : t('arcade.twenty.no')) + '</b></div>')
        .join('') +
        s.refused.map((i) => '<div class="ac-twl ac-no">' + esc(s.pack!.items[i]?.name ?? '') + ' ' + esc(t('arcade.twenty.missed')) + '</div>').join('');
      logEl.scrollTop = logEl.scrollHeight;
      if (v.finished) {
        const it = s.pack.items[s.won === s.keeper ? -1 : (s.guess >= 0 ? s.guess : s.answer)];
        setBar('over', '<small>' + esc(s.won === s.keeper ? t('arcade.twenty.gaveUp') : t('arcade.twenty.gotIt', { n: String(s.asks.length) })) + (it ? ' ' + esc(it.name) : '') + '</small>');
        return;
      }
      if (s.guess >= 0) {
        const it = s.pack.items[s.guess];
        if (!keeper) {
          setBar('g-wait', '<small>' + esc(t('arcade.twenty.waitAnswer')) + '</small>');
          return;
        }
        setBar(
          'g' + s.guess,
          '<p class="tool-status">' + esc(t('arcade.twenty.guessAsk')) + '</p>' +
          '<div class="ac-twface">' + (it?.img ? '<img src="' + esc(String(it.img)) + '" alt="">' : '') + '<b>' + esc(it?.name ?? '') + '</b></div>' +
          '<button class="btn btn-primary" data-hit="yes">' + esc(t('arcade.twenty.right')) + '</button> ' +
          '<button class="btn btn-ghost" data-hit="no">' + esc(t('arcade.twenty.wrong')) + '</button>'
        );
        return;
      }
      if (s.pendingAsk) {
        if (!keeper) {
          setBar('a-wait', '<small>' + esc(t('arcade.twenty.waitAnswer')) + '</small>');
          return;
        }
        setBar(
          'a' + s.asks.length,
          '<p class="tool-status">' + esc(t('arcade.twenty.nth', { n: String(s.asks.length + 1) })) + '. ' + esc(askText(s.pendingAsk, fields)) + '</p>' +
          '<button class="btn btn-primary" data-say="yes">' + esc(t('arcade.twenty.yes')) + '</button> ' +
          '<button class="btn btn-ghost" data-say="no">' + esc(t('arcade.twenty.no')) + '</button> ' +
          '<button class="btn btn-ghost" data-say="skip">' + esc(t('arcade.twenty.skip')) + '</button>'
        );
        return;
      }
      setBar('think', '<small>' + esc(t(keeper ? 'arcade.twenty.waitAsk' : 'arcade.twenty.waitAnswer')) + '</small>');
    }

    return (v, mySeat) => {
      const s = v.state;
      if (s.mode === 1) {
        renderPack(v, mySeat);
        return;
      }
      pickEl.hidden = true;
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
