/**
 * 높은 쪽 고르기 화면 (change.arcade-absorbs-play 단계 3)
 *
 * 표를 고르고(붙박이, 내 표, 남의 표) 첫 수로 규칙에 실음. 그 뒤는 두 장 중 하나 고르기.
 * 고른 뒤 상대 값을 0 부터 세어 올림. 넘을까 말까를 눈으로 보는 것이 이 놀이의 재미.
 * 내 최고 연승은 표마다 이 브라우저에 남김 (옛 놀이의 열쇠 그대로)
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { getPack, loadPacks, type Pack } from '../../pack-store';
import { ensureLocal, localChoices, type PackChoice } from '../../../lib/pack-choices';
import { listShared, type SharedPackSummary } from '../../../lib/shared-packs';
import { takePick } from '../../pack-pick';
import type { HiState, HiAction, HiItem, HiField } from './higher';

const BEST_KEY = 'karmolab_higher_best';
const REVEAL_MS = 1000;

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bestOf(id: string, put?: number): number {
  let all: Record<string, number> = {};
  try {
    all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  } catch {
    all = {};
  }
  if (put !== undefined && put > (all[id] || 0)) {
    all[id] = put;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {
      /* 저장 못 해도 놀이는 그대로 */
    }
  }
  return all[id] || 0;
}

/** 사람이 만든 표를 이 놀이의 모양으로. 겨룰 수 있는 칸은 숫자 칸뿐 */
function boardOf(p: Pack): { fields: HiField[]; items: HiItem[] } | null {
  const nums = p.fields.filter((f) => f.kind === 'number' && p.items.filter((it) => typeof it[f.key] === 'number').length >= 2);
  if (!nums.length) return null;
  return {
    fields: nums.map((f) => ({ key: f.key, label: f.label, unit: f.unit })),
    items: p.items.map((it) => {
      const v: Record<string, number> = {};
      for (const f of nums) if (typeof it[f.key] === 'number') v[f.key] = it[f.key] as number;
      return { n: it.name, i: String(it.img || ''), v };
    })
  };
}

export const higherView: GameView<HiState, HiAction> = {
  id: 'higher',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wc ac-hi">' +
      '<div class="ac-wcpick" id="acHiPick">' +
      '<p class="ac-wcask">' + esc(t('arcade.higher.pick')) + '</p>' +
      '<div class="ac-wcchips" id="acHiPacks" role="group"></div>' +
      '<p class="ac-wcmsg" id="acHiMsg" aria-live="polite"></p>' +
      '<button type="button" class="ac-wcstart" id="acHiStart" hidden>' + esc(t('arcade.higher.start')) + '</button>' +
      '</div>' +
      '<div class="ac-wcplay" id="acHiPlay" hidden>' +
      '<p class="ac-wcask" id="acHiAsk"></p>' +
      '<div class="ac-wcpair">' +
      '<button type="button" class="ac-wcside" id="acHiA"></button>' +
      '<button type="button" class="ac-wcside" id="acHiB"></button>' +
      '</div>' +
      '<p class="ac-wcmsg" id="acHiLine"></p>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let chips: PackChoice[] = [];
    let picked: PackChoice | null = null;
    let loading = false;
    let packKey = '';
    /* 고른 뒤 값을 보여 주는 동안. 그 사이는 다음 판을 안 그림 */
    let revealUntil = 0;
    let revealAt = -1;
    let drawnAt = -1;
    let counting: { el: HTMLElement; target: number; unit: string; t0: number } | null = null;

    function paintChips(): void {
      const box = $('acHiPacks');
      box.innerHTML = '';
      for (const c of chips) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c.emoji + ' ' + c.title + (c.owner ? ', ' + c.owner : '');
        b.setAttribute('aria-pressed', String(picked === c));
        b.onclick = () => {
          picked = c;
          $('acHiStart').hidden = false;
          paintChips();
        };
        box.appendChild(b);
      }
      $('acHiMsg').textContent = chips.length ? '' : loading ? t('arcade.higher.loading') : t('arcade.higher.noPack');
    }

    function loadChips(): void {
      chips = localChoices('number');
      const handed = takePick();
      if (handed) picked = chips.find((c) => c.id === 'pack:' + handed) ?? null;
      if (picked) $('acHiStart').hidden = false;
      loading = true;
      paintChips();
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

    $('acHiStart').onclick = () => {
      if (!picked || loading) return;
      loading = true;
      $<HTMLButtonElement>('acHiStart').disabled = true;
      $('acHiMsg').textContent = t('arcade.higher.loading');
      void ensureLocal(picked.id).then((id) => {
        loading = false;
        if (!el.isConnected) return;
        $<HTMLButtonElement>('acHiStart').disabled = false;
        $('acHiMsg').textContent = '';
        const pack = id ? getPack(id.slice(5)) : null;
        const board = pack ? boardOf(pack) : null;
        if (!pack || !board) {
          $('acHiMsg').textContent = t('arcade.higher.noPack');
          return;
        }
        packKey = pack.sharedId || pack.title;
        act({ kind: 'load', title: pack.title, fields: board.fields, items: board.items });
      });
    };

    const fmt = (v: number, unit: string): string => String(v) + (unit ? ' ' + unit : '');
    const face = (it: HiItem, value: string): string =>
      (it.i ? '<img src="' + esc(it.i) + '" alt="" loading="lazy">' : '') + '<b>' + esc(it.n) + '</b><small class="ac-hiv">' + esc(value) + '</small>';

    $('acHiA').onclick = () => act({ kind: 'pick', side: 0 });
    $('acHiB').onclick = () => act({ kind: 'pick', side: 1 });
    const keys = (e: KeyboardEvent): void => {
      if (!el.isConnected) {
        removeEventListener('keydown', keys);
        return;
      }
      if ($('acHiPlay').hidden) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        act({ kind: 'pick', side: 0 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        act({ kind: 'pick', side: 1 });
      }
    };
    addEventListener('keydown', keys);

    loadChips();

    return (v, mySeat, now) => {
      const s = v.state;
      const seat = mySeat < 0 ? 0 : mySeat;
      if (!s.pack) {
        $('acHiPick').hidden = false;
        $('acHiPlay').hidden = true;
        if (mySeat > 0) $('acHiMsg').textContent = t('arcade.higher.waitHost');
        return;
      }
      $('acHiPick').hidden = true;
      $('acHiPlay').hidden = false;
      const lane = s.lanes[seat];
      if (!lane) return;
      const fields = s.pack.fields;
      const unitOf = (key: string): string => fields.find((f) => f.key === key)?.unit || '';
      const labelOf = (key: string): string => fields.find((f) => f.key === key)?.label || key;
      const a = $('acHiA');
      const b = $('acHiB');

      /* 방금 고른 판. 값을 세어 올리고 이긴 쪽을 칠함 */
      if (lane.last && revealAt !== lane.at) {
        revealAt = lane.at;
        revealUntil = now + REVEAL_MS;
        const { pair, side, win } = lane.last;
        const ia = s.pack.items[pair.a];
        const ib = s.pack.items[pair.b];
        const unit = unitOf(pair.f);
        a.innerHTML = face(ia, fmt(ia.v[pair.f], unit));
        b.innerHTML = face(ib, '0');
        counting = { el: b.querySelector('.ac-hiv') as HTMLElement, target: ib.v[pair.f], unit, t0: now };
        a.className = 'ac-wcside' + (side === 0 ? (win ? ' ac-hiwin' : ' ac-hilose') : !win ? ' ac-hiwin' : '');
        b.className = 'ac-wcside' + (side === 1 ? (win ? ' ac-hiwin' : ' ac-hilose') : !win ? ' ac-hiwin' : '');
        (a as HTMLButtonElement).disabled = true;
        (b as HTMLButtonElement).disabled = true;
        $('acHiLine').textContent = win ? t('arcade.higher.right') : lane.streak ? t('arcade.higher.lost', { n: String(lane.streak) }) : t('arcade.higher.lostFirst');
        bestOf(packKey, lane.streak);
        drawnAt = -1;
      }
      if (counting) {
        const k = calm ? 1 : Math.min(1, (now - counting.t0) / 700);
        const eased = 1 - Math.pow(1 - k, 3);
        const dec = String(counting.target).indexOf('.') >= 0 ? String(counting.target).split('.')[1].length : 0;
        counting.el.textContent = fmt(Number((counting.target * eased).toFixed(dec)), counting.unit);
        if (k >= 1) counting = null;
      }
      if (now < revealUntil) return;
      if (lane.out || lane.at >= s.pairs.length) {
        $('acHiAsk').textContent = t('arcade.higher.streak', { n: String(lane.streak), best: String(bestOf(packKey)) });
        return;
      }
      if (drawnAt === lane.at) return;
      drawnAt = lane.at;
      const pair = s.pairs[lane.at];
      const ia = s.pack.items[pair.a];
      const ib = s.pack.items[pair.b];
      $('acHiAsk').innerHTML = '<b>' + esc(labelOf(pair.f)) + '</b>. ' + esc(t('arcade.higher.ask'));
      a.innerHTML = face(ia, fmt(ia.v[pair.f], unitOf(pair.f)));
      b.innerHTML = face(ib, '?');
      a.className = 'ac-wcside';
      b.className = 'ac-wcside';
      (a as HTMLButtonElement).disabled = false;
      (b as HTMLButtonElement).disabled = false;
      $('acHiLine').textContent = t('arcade.higher.streak', { n: String(lane.streak), best: String(bestOf(packKey)) });
    };
  }
};
