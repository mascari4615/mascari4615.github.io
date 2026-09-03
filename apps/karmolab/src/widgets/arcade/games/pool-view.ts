/**
 * 당구 화면 (TASK-KL-242)
 *
 * 위에서 내려다본다. 당구는 **각도를 재는 놀이**라 비스듬히 보면 각이 안 읽힌다.
 * 겨눔은 흰 공에서 뻗는 점선. 세기는 막대로 따로 받는다(끌기 하나로 둘 다 받으면 폰에서 어긋난다).
 */
import { t } from '../../../lib/i18n';
import { mountAimDrag, lateralOf } from '../aim-drag';
import type { GameView } from '../views';
import { fitCanvas, beginFit } from '../fit-canvas';
import { felt, orb, woodRail, SEAT_COLOR } from '../paint';
import { W, H, BALL_R, POCKETS, type PoolState, type PoolAction } from './pool';


export const poolView: GameView<PoolState, PoolAction> = {
  id: 'pool',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-pl">' +
      '<div class="ac-plscore" id="acPlScore"></div>' +
      '<canvas id="acPlCv"></canvas>' +
      '<div class="ac-clbar">' +
      '<span class="ac-aimhint" id="acPlHint"></span>' +
      '<button class="btn btn-primary" id="acPlGo"></button>' +
      '<details class="ac-fine"><summary id="acPlHintF"></summary>' +
      '<label><span id="acPlAimL"></span><input type="range" id="acPlAim" min="-180" max="180" value="0"></label>' +
      '<label><span id="acPlPowL"></span><input type="range" id="acPlPow" min="15" max="100" value="60"></label>' +
      '</details>' +
      '</div></div>';
    const cv = el.querySelector('#acPlCv') as HTMLCanvasElement;
    const scoreEl = el.querySelector('#acPlScore') as HTMLElement;
    const aim = el.querySelector('#acPlAim') as HTMLInputElement;
    const pow = el.querySelector('#acPlPow') as HTMLInputElement;
    const go = el.querySelector('#acPlGo') as HTMLButtonElement;
    go.onclick = () => act({ aim: (Number(aim.value) / 180) * Math.PI, power: Number(pow.value) / 100 });
    /* 끌기 하나로 방향과 세기. 놓으면 발사. 슬라이더는 세밀 조정으로 남김(자판 사용자와 검사) */
    let canAim = false;
    const hintEl = el.querySelector('#acPlHint') as HTMLElement;
    const fineEl = el.querySelector('#acPlHintF') as HTMLElement;
    mountAimDrag(cv, {
      mode: 'pull',
      enabled: () => canAim,
      onMove: (r) => {
        if (r.pow <= 0 && r.live) return;
        aim.value = String(Math.round((lateralOf(r) * 180) / Math.PI));
        pow.value = String(Math.round(15 + r.pow * 85));
      },
      onRelease: () => go.click()
    });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && !s.moving && s.turn === mySeat;
      canAim = myTurn;
      const hintText = myTurn ? t('arcade.aim.hint') : '';
      if (hintEl.textContent !== hintText) hintEl.textContent = hintText;
      if (!fineEl.textContent) fineEl.textContent = t('arcade.aim.fine');

      const c = cv.getContext('2d');
      if (!c) return;
      /* 캔버스가 칸을 다 덮고 상은 그 안에 맞춤. 남는 자리는 CSS 배경(나무) */
      beginFit(c, fitCanvas(cv, W, H));

      /* 천, 나무 쿠션. 공용 붓(`paint.ts`). 판마다 색을 따로 고르지 않는다. */
      felt(c, W, H);
      woodRail(c, W, H);

      for (const [px, py] of POCKETS) {
        /* 구멍은 **파인 것**이다. 안쪽이 새까맣고 가장자리에만 빛이 걸린다. */
        const hole = c.createRadialGradient(px, py - 1, 0.4, px, py, 5.4);
        hole.addColorStop(0, '#000000');
        hole.addColorStop(0.75, '#070a10');
        hole.addColorStop(1, '#2a1e10');
        c.beginPath();
        c.arc(px, py, 5.4, 0, Math.PI * 2);
        c.fillStyle = hole;
        c.fill();
      }

      const cue = s.balls.find((b) => b.cue && !b.in);
      if (myTurn && cue) {
        const a = (Number(aim.value) / 180) * Math.PI;
        const len = 18 + (Number(pow.value) / 100) * 46;
        c.strokeStyle = 'rgba(255,255,255,.75)';
        c.lineWidth = 0.7;
        c.setLineDash([2.5, 2.5]);
        c.beginPath();
        c.moveTo(cue.x, cue.y);
        c.lineTo(cue.x + Math.sin(a) * len, cue.y - Math.cos(a) * len);
        c.stroke();
        c.setLineDash([]);
      }

      for (const b of s.balls) {
        if (b.in) continue;
        /* 공 = 구슬(`orb`). 그림자, 빛, 하이라이트가 한 규칙이다. */
        orb(c, b.x, b.y, BALL_R, b.cue ? '#f4efe4' : '#f0b429', b.cue ? '#ffffff' : '#ffe680');
      }

      /* 넣은 수는 **판 밖**에 적는다. 캔버스 안에 글자를 그리면 판마다 제 글꼴, 제 크기가 되고
         (여기선 6px sans-serif 였다) 무대가 커져도 안 따라 커진다. 판 위는 공만 있는 자리다. */
      scoreEl.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-plc' + (i === mySeat ? ' ac-me' : '') + '" style="--c:' + SEAT_COLOR[i % 4] + '">' +
          seat.name + ' <b>' + (s.potted[i] ?? 0) + '</b></span>')
        .join('');

      el.querySelector('#acPlAimL')!.textContent = t('arcade.pool.aim');
      el.querySelector('#acPlPowL')!.textContent = t('arcade.pool.power');
      go.textContent = s.moving ? t('arcade.pool.rolling') : t('arcade.pool.hit');
      aim.disabled = !myTurn;
      pow.disabled = !myTurn;
      go.disabled = !myTurn;
    };
  }
};
