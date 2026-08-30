/**
 * 한붓그리기 화면 (TASK-KL-242)
 *
 * 붓 끝에 **닿는 선만** 진하게 보여 준다. 왜 이 선이 안 그어지지로 막히는 자리라,
 * 규칙을 적어 두는 대신 눈에 보이게 한다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { W, H, type StrokeState, type StrokeAction } from './onestroke';

export const onestrokeView: GameView<StrokeState, StrokeAction> = {
  id: 'onestroke',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-os">' +
      /* 투명 단추를 얹을 자리. 그림은 그대로 두고 **누를 것**만 따로 놓는다 . 
         껍데기의 키 규약(화살표로 단추 훑기 → 엔터)이 단추만 보기 때문이다. */
      '<div class="ac-oswrap">' +
      '<svg id="acOsSvg" viewBox="-0.6 -0.6 ' + (W - 1 + 1.2) + ' ' + (H - 1 + 1.2) + '"></svg>' +
      '<div class="ac-oskeys" id="acOsKeys"></div>' +
      '</div>' +
      '<div class="ac-osbar" id="acOsBar"></div>' +
      '<button class="btn btn-ghost" id="acOsReset"></button>' +
      '</div>';
    const svg = el.querySelector('#acOsSvg') as SVGSVGElement;
    const bar = el.querySelector('#acOsBar') as HTMLElement;
    const keys = el.querySelector('#acOsKeys') as HTMLElement;
    const reset = el.querySelector('#acOsReset') as HTMLButtonElement;
    /* 처음부터 다시 = 지금까지 그린 것을 버리는 것. 커널에는 그런 수가 없으므로
       닿는 선이 없으면 막힌 것임을 알려 주기만 한다(새 판은 한 판 더로). */
    reset.style.display = 'none';

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.drawn[mySeat] ?? [];
      const here = s.at[mySeat] ?? -1;

      const parts: string[] = [];
      s.edges.forEach((e, i) => {
        const [ax, ay] = [e.a % W, Math.floor(e.a / W)];
        const [bx, by] = [e.b % W, Math.floor(e.b / W)];
        const done = mine.includes(i);
        const near = !done && (here < 0 || e.a === here || e.b === here);
        parts.push(
          '<line x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by +
          '" data-i="' + i + '" class="ac-osl' + (done ? ' ac-done' : near ? ' ac-near' : '') + '"/>'
        );
      });
      const pts = new Set(s.edges.flatMap((e) => [e.a, e.b]));
      for (const p of pts) {
        parts.push(
          '<circle cx="' + (p % W) + '" cy="' + Math.floor(p / W) + '" r="' +
          (p === here ? 0.16 : 0.09) + '" class="ac-osp' + (p === here ? ' ac-at' : '') + '"/>'
        );
      }
      svg.innerHTML = parts.join('');

      svg.querySelectorAll<SVGLineElement>('.ac-osl').forEach((ln) => {
        ln.onclick = () => act({ edge: Number(ln.dataset.i) });
      });

      /* **지금 그을 수 있는 선**만 투명 단추로 얹는다(그림은 안 바뀐다).
         전부 얹으면 화살표로 훑을 것이 수십 개가 되어 키로는 오히려 못 논다.
         자리는 viewBox 로 그대로 환산한다. `-0.6` 에서 시작해 폭이 `W-1+1.2` 다. */
      const box = { x: -0.6, w: W - 1 + 1.2, y: -0.6, h: H - 1 + 1.2 };
      keys.innerHTML = s.edges
        .map((e, i) => {
          const open = !mine.includes(i) && (here < 0 || e.a === here || e.b === here);
          if (!open) return '';
          const mx = ((e.a % W) + (e.b % W)) / 2;
          const my = (Math.floor(e.a / W) + Math.floor(e.b / W)) / 2;
          const left = ((mx - box.x) / box.w) * 100;
          const top = ((my - box.y) / box.h) * 100;
          return '<button class="ac-oskey" data-i="' + i + '" style="left:' + left.toFixed(2) +
            '%;top:' + top.toFixed(2) + '%" aria-label="' + t('arcade.stroke.line') + ' ' + (i + 1) + '"></button>';
        })
        .join('');
      keys.querySelectorAll<HTMLButtonElement>('.ac-oskey').forEach((b) => {
        b.onclick = () => act({ edge: Number(b.dataset.i) });
      });

      bar.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.drawn[i]?.length ?? 0) + '/' + s.edges.length + '</b></span>')
        .join('') +
        (here >= 0 && !s.edges.some((e, i) => !mine.includes(i) && (e.a === here || e.b === here))
          ? '<span class="ac-dts">' + t('arcade.stroke.stuck') + '</span>'
          : '');
    };
  }
};
