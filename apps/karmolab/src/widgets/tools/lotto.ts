/**
 * 로또, 연금복권 번호 뽑기 (TASK-KL-088)
 *
 * 두 가지를 한 화면에서 뽑는다. 탭이 아니라 **모드 단추**다. 이 도구는 뽑기 묶음의
 * 한 탭으로 들어가 있어서(`draw.ts` → `Toolbox.mountTool`), 여기서 탭을 늘리면 묶음 쪽엔
 * 첫 탭만 그려진다. 그래서 모드는 화면 안에서 가른다.
 *   - 로또 6/45 : 1~45 중 6개 + 보너스. 제외수, 고정수, 홀짝 조건.
 *   - 연금복권720+ : 1~5조 + 6자리. 끝자리부터 맞은 개수가 등위다.
 *
 * 세 가지를 더 붙였다:
 *   ① **연출**. 공이 위에서 떨어져 눌렸다 펴진다(squash&stretch), 연금은 자릿수가 순서대로
 *      멎는다. 마지막 공과 보너스에만 파티클, 흔들림을 준다 (전부 화려하면 전부 평범해진다).
 *      `prefers-reduced-motion` 이면 연출은 통째로 빠지고 **번호는 그대로 나온다** . 
 *      연출은 결과를 만들지 않는다(Swink 의 polish 원칙). 눌러서 건너뛰기도 된다.
 *   ② **당첨 확률**. 조합수에서 직접 센 값(`shared/lotto-odds.ts`). 뽑은 판 수만큼 환산해
 *      5게임이면 1/1,629,012까지 보여 준다.
 *   ③ **최신 회차 자동 채점**. 동행복권이 CORS 를 열어 둬서 프록시 없이 바로 받는다
 *      (`shared/dhlottery.ts`). 못 받아도 뽑기는 그대로 된다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { blip, soundOn, setSoundOn } from '../../lib/blip';
import { ODDS_645, ODDS_PENSION, anyWin, atLeastOnce, asOneIn, type Odds } from './shared/lotto-odds';
import {
  latest645,
  latestPension,
  score645,
  scorePension,
  type Draw645,
  type DrawPension,
  type Score
} from './shared/dhlottery';

(function (): void {

  type Mode = '645' | 'pension';

  /** 동행복권 실제 공 색. 이 다섯 구간이 진짜처럼 보이게 하는 거의 전부다. */
  const BALL_COLOR = (n: number): string => {
    if (n <= 10) return '#fbc400';
    if (n <= 20) return '#69c8f2';
    if (n <= 30) return '#ff7272';
    if (n <= 40) return '#aaa';
    return '#b0d840';
  };

  /** 연출 예산. 판을 20 개 뽑아도 이 안에서 끝난다. 반복해 쓰는 도구라 연출이 곧 대기시간이다. */
  const REVEAL_BUDGET = 2000;

  /* ── 뽑기 ─────────────────────────────────────────── */

  function draw(exclude: Set<number>, include: number[]): number[] {
    const pool: number[] = [];
    for (let i = 1; i <= 45; i++) if (!exclude.has(i) && include.indexOf(i) < 0) pool.push(i);
    const picked = [...include];
    while (picked.length < 6 && pool.length) {
      picked.push(pool.splice(rnd(pool.length), 1)[0]);
    }
    return picked.sort((a, b) => a - b);
  }

  /**
   * 치우침 없는 난수. `Math.random() * n` 은 큰 범위에서 미세하게 기운다 . 
   * 500 만 분의 1 을 말하는 도구가 그 편은 안 드는 게 맞다. 못 쓰면 조용히 예전 방식으로 돈다.
   */
  function rnd(n: number): number {
    const c = window.crypto;
    if (c && c.getRandomValues) {
      const limit = Math.floor(0xffffffff / n) * n;
      const buf = new Uint32Array(1);
      for (let i = 0; i < 8; i++) {
        c.getRandomValues(buf);
        if (buf[0] < limit) return buf[0] % n;
      }
    }
    return Math.floor(Math.random() * n);
  }

  function parseNums(raw: string): number[] {
    return (raw.match(/\d+/g) || [])
      .map((s) => parseInt(s, 10))
      .filter((n) => n >= 1 && n <= 45)
      .filter((n, i, arr) => arr.indexOf(n) === i);
  }

  Toolbox.register({
    id: 'lotto',
    title: t('widgets.lotto.title', undefined, "로또 번호 생성"),
    desc: t('widgets-desc.lotto.desc', undefined, "로또 6/45 와 연금복권720+ 번호를 뽑고, 최신 회차와 자동으로 대조합니다"),
    layout: 'form',
    icon: '<circle cx="8" cy="9" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="15" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      {
        id: 'app',
        label: t('lotto.tab', undefined, "로또"),
        build: function (container: HTMLElement): void {
          void loadNamespace('lotto').then(function () {

          Mdd.linePreset('tool_run', { msg: t('lotto.mdd') });

          const oddsRows = (table: Odds[]): string =>
            table
              .map(
                (o) => `<tr>
                  <th scope="row">${esc(t('lotto.rank.' + o.key))}</th>
                  <td>${esc(t('lotto.cond.' + o.cond))}</td>
                  <td class="lt-odds-p">${esc(asOneIn(o.p))}</td>
                  <td class="lt-odds-prize">${esc(t('lotto.prize.' + o.prize))}</td>
                </tr>`
              )
              .join('');

          container.innerHTML = `
            <div class="lt-modes" role="group" aria-label="${esc(t('lotto.label.mode'))}">
              <button type="button" class="lt-mode is-on" data-mode="645" aria-pressed="true">
                <span class="lt-mode-name">${esc(t('lotto.mode.645'))}</span>
                <span class="lt-mode-sub">${esc(t('lotto.mode.645sub'))}</span>
              </button>
              <button type="button" class="lt-mode" data-mode="pension" aria-pressed="false">
                <span class="lt-mode-name">${esc(t('lotto.mode.pension'))}</span>
                <span class="lt-mode-sub">${esc(t('lotto.mode.pensionSub'))}</span>
              </button>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('lotto.label.count'))} <span id="ltCountVal" class="range-value">${esc(t('lotto.value.games'))}</span></div>
                  <input type="range" id="ltCount" aria-label="${esc(t('lotto.label.count'))}" min="1" max="20" value="5">
                </div>
                <div data-when="645">
                  <div class="tool-sublabel">${esc(t('lotto.label.bonus'))}</div>
                  <label class="lt-check-line">
                    <input type="checkbox" id="ltBonus" checked> ${esc(t('lotto.opt.bonusOn'))}
                  </label>
                </div>
                <div data-when="pension" hidden>
                  <div class="tool-sublabel">${esc(t('lotto.label.band'))}</div>
                  <select id="ltBand" aria-label="${esc(t('lotto.label.band'))}">
                    <option value="0">${esc(t('lotto.opt.bandAny'))}</option>
                    <option value="1">1${esc(t('lotto.unit.band'))}</option>
                    <option value="2">2${esc(t('lotto.unit.band'))}</option>
                    <option value="3">3${esc(t('lotto.unit.band'))}</option>
                    <option value="4">4${esc(t('lotto.unit.band'))}</option>
                    <option value="5">5${esc(t('lotto.unit.band'))}</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="field-group" data-when="645">
              <label class="field-label">${esc(t('lotto.label.rules'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('lotto.label.include'))}</div>
                  <input type="text" id="ltInclude" placeholder="${esc(t('lotto.ph.include'))}">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('lotto.label.exclude'))}</div>
                  <input type="text" id="ltExclude" placeholder="${esc(t('lotto.ph.exclude'))}">
                </div>
              </div>
              <div>
                <div class="tool-sublabel">${esc(t('lotto.label.parity'))}</div>
                <select id="ltParity" aria-label="${esc(t('lotto.label.parity'))}">
                  <option value="any">${esc(t('lotto.opt.any'))}</option>
                  <option value="balanced">${esc(t('lotto.opt.balanced'))}</option>
                  <option value="odd">${esc(t('lotto.opt.odd'))}</option>
                  <option value="even">${esc(t('lotto.opt.even'))}</option>
                </select>
              </div>
            </div>

            <div class="tool-actions tight lt-actions">
              <button class="btn btn-primary lt-go" id="ltDraw">${esc(t('lotto.btn.draw'))}</button>
              <button class="btn btn-ghost" id="ltCopy">${esc(t('lotto.btn.copy'))}</button>
              <button class="btn btn-ghost btn-sm" id="ltSound" aria-pressed="true">${esc(t('lotto.btn.sound'))}</button>
              <button class="btn btn-ghost btn-sm" id="ltMotion" aria-pressed="true">${esc(t('lotto.btn.motion'))}</button>
            </div>

            <div id="ltResult" class="lt-result"></div>
            <div class="tool-status" id="ltStatus">${esc(t('lotto.status.idle'))}</div>

            <div class="lt-panel" id="ltCheck" hidden></div>

            <details class="lt-odds" id="ltOdds">
              <summary>${esc(t('lotto.odds.title'))} <span class="lt-odds-lead" id="ltOddsLead"></span></summary>
              <table class="lt-odds-table" data-when="645">
                <thead><tr>
                  <th scope="col">${esc(t('lotto.odds.col.rank'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.cond'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.prob'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.prize'))}</th>
                </tr></thead>
                <tbody>${oddsRows(ODDS_645)}</tbody>
              </table>
              <table class="lt-odds-table" data-when="pension" hidden>
                <thead><tr>
                  <th scope="col">${esc(t('lotto.odds.col.rank'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.cond'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.prob'))}</th>
                  <th scope="col">${esc(t('lotto.odds.col.prize'))}</th>
                </tr></thead>
                <tbody>${oddsRows(ODDS_PENSION)}</tbody>
              </table>
              <p class="lt-odds-note" id="ltOddsNote"></p>
            </details>

            <div class="lt-links">
              <a class="btn btn-ghost btn-sm" href="https://www.dhlottery.co.kr/" target="_blank" rel="noopener noreferrer">${esc(t('lotto.link.buy'))}</a>
              <a class="btn btn-ghost btn-sm" id="ltLinkResult" href="https://www.dhlottery.co.kr/lt645/result" target="_blank" rel="noopener noreferrer">${esc(t('lotto.link.result'))}</a>
              <a class="btn btn-ghost btn-sm" id="ltLinkIntro" href="https://www.dhlottery.co.kr/lt645/intro" target="_blank" rel="noopener noreferrer">${esc(t('lotto.link.rules'))}</a>
              <a class="btn btn-ghost btn-sm" href="https://www.dhlottery.co.kr/prchsplcsrch/home" target="_blank" rel="noopener noreferrer">${esc(t('lotto.link.store'))}</a>
            </div>
            <p class="lt-links-note">${esc(t('lotto.link.note'))}</p>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const countInput = $<HTMLInputElement>('#ltCount');
          const countVal = $<HTMLElement>('#ltCountVal');
          const result = $<HTMLElement>('#ltResult');
          const status = $<HTMLElement>('#ltStatus');
          const checkBox = $<HTMLElement>('#ltCheck');
          /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). 표시가 없으면 화면낭독기가 아무 말도 안 한다. */
          markLive(status);

          let mode: Mode = (Toolbox.getPref?.('lotto.mode', '645') as Mode) || '645';
          const systemCalm = matchMedia('(prefers-reduced-motion: reduce)').matches;
          let motionOn = !systemCalm && Toolbox.getPref?.('lotto.motion', 'on') !== 'off';

          /* 뽑을 때마다 소리 시각표를 새로 깐다. 남은 것은 반드시 거둔다(도구를 닫아도). */
          const timers = new Set<number>();
          const clearTimers = (): void => {
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
          };
          const later = (fn: () => void, ms: number): void => {
            const id = window.setTimeout(() => {
              timers.delete(id);
              fn();
            }, ms);
            timers.add(id);
          };
          Toolbox.onDispose?.(clearTimers);

          /* ── 모드 갈아 끼우기 ── */

          function applyMode(): void {
            container.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => {
              el.hidden = el.dataset.when !== mode;
            });
            container.querySelectorAll<HTMLButtonElement>('.lt-mode').forEach((b) => {
              const on = b.dataset.mode === mode;
              b.classList.toggle('is-on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            const p = mode === 'pension';
            $<HTMLAnchorElement>('#ltLinkResult').href = p
              ? 'https://www.dhlottery.co.kr/pt720/result'
              : 'https://www.dhlottery.co.kr/lt645/result';
            $<HTMLAnchorElement>('#ltLinkIntro').href = p
              ? 'https://www.dhlottery.co.kr/pt720/intro'
              : 'https://www.dhlottery.co.kr/lt645/intro';
            countInput.max = p ? '10' : '20';
            if (parseInt(countInput.value, 10) > parseInt(countInput.max, 10)) countInput.value = countInput.max;
            showCount();
            Toolbox.setPref?.('lotto.mode', mode);
          }

          function showCount(): void {
            countVal.textContent = countInput.value + t('lotto.unit.games');
            paintOdds();
          }

          /* ── 확률 ── */

          function paintOdds(): void {
            const table = mode === 'pension' ? ODDS_PENSION : ODDS_645;
            const n = parseInt(countInput.value, 10) || 1;
            const top = table[0].p;
            $<HTMLElement>('#ltOddsLead').textContent = t('lotto.odds.lead', {
              n: String(n),
              first: asOneIn(atLeastOnce(top, n)),
              any: asOneIn(atLeastOnce(anyWin(table), n))
            });
            $<HTMLElement>('#ltOddsNote').textContent = t(
              mode === 'pension' ? 'lotto.odds.note.pension' : 'lotto.odds.note.645'
            );
          }

          /* ── 연출 ── */

          /** 눌러서 건너뛰기. 돌고 있는 것을 전부 끝으로 보낸다 (Web Animations, 라이브러리 0). */
          function skipReveal(): void {
            clearTimers();
            result.querySelectorAll<HTMLElement>('*').forEach((el) => {
              el.getAnimations?.().forEach((a) => a.finish());
            });
            result.classList.remove('is-revealing');
          }
          result.addEventListener('click', () => {
            if (result.classList.contains('is-revealing')) skipReveal();
          });

          /** 확정 순간의 스파크. 20 개 이하면 컴포지터가 공짜로 그린다. */
          function burst(host: HTMLElement): void {
            if (!motionOn) return;
            const b = document.createElement('span');
            b.className = 'lt-burst';
            b.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 10; i++) {
              const s = document.createElement('i');
              s.style.setProperty('--i', String(i));
              b.appendChild(s);
            }
            host.appendChild(b);
            later(() => b.remove(), 900);
          }

          /* ── 화면 그리기 ── */

          interface Game {
            nums?: number[];
            bonus?: number;
            band?: number;
            digits?: string;
          }
          let games: Game[] = [];

          function ballHtml(n: number, cls: string, delay: number): string {
            return `<span class="lt-ball ${cls}" style="--lt-bg:${BALL_COLOR(n)};--d:${delay}">${n}</span>`;
          }

          function reelHtml(d: string, col: number, delay: number): string {
            /* 0~9 를 네 바퀴 돌린 뒤 목표 숫자에서 멎는다. 자릿수마다 조금씩 늦게 멎게 해
               왼쪽부터 차례로 확정되는 것이 읽힌다 (연금복권 화면의 그 느낌). */
            const cells = [];
            for (let r = 0; r < 5; r++) for (let i = 0; i <= 9; i++) cells.push(`<b>${i}</b>`);
            const stop = 40 + parseInt(d, 10);
            return `<span class="lt-reel" style="--n:${stop};--d:${delay};--dur:${700 + col * 90}"><span class="lt-strip">${cells.join('')}</span></span>`;
          }

          function paintGames(): void {
            const total = games.reduce((s, g) => s + (g.nums ? g.nums.length + (g.bonus ? 1 : 0) : 6), 0);
            const step = motionOn ? Math.min(70, Math.max(18, REVEAL_BUDGET / Math.max(total, 1))) : 0;
            let seq = 0;
            const beeps: number[] = [];

            const rows = games.map((g, gi) => {
              const label = `<span class="lt-index">${esc(t('lotto.value.game', { n: gi + 1 }))}</span>`;
              if (mode === 'pension') {
                const bandDelay = Math.round(seq++ * step);
                beeps.push(bandDelay);
                const reels = (g.digits || '').split('').map((d, i) => {
                  const delay = Math.round(seq++ * step);
                  return reelHtml(d, i, delay);
                });
                return `<div class="lt-row"><span class="lt-band" style="--d:${bandDelay}">${g.band}${esc(t('lotto.unit.band'))}</span>${label}<div class="lt-balls lt-digits">${reels.join('')}</div></div>`;
              }
              const balls = (g.nums || []).map((n) => {
                const delay = Math.round(seq++ * step);
                beeps.push(delay);
                return ballHtml(n, '', delay);
              });
              let bonusHtml = '';
              if (g.bonus && g.bonus > 0) {
                const delay = Math.round(seq++ * step);
                beeps.push(delay);
                bonusHtml = `<span class="lt-plus" style="--d:${delay}">+</span>` + ballHtml(g.bonus, 'lt-ball-bonus', delay);
              }
              return `<div class="lt-row">${label}<div class="lt-balls">${balls.join('')}${bonusHtml}</div></div>`;
            });

            result.innerHTML = rows.join('');
            if (!motionOn) {
              /* 연출을 껐어도 릴은 제 숫자를 들어야 한다. 연출은 결과를 만들지 않는다. */
              result.classList.add('is-run');
              return;
            }

            result.classList.add('is-revealing');
            /* 릴은 지금 값에서 목표로 미끄러져야 한다. 처음부터 목표를 들고 있으면
               움직일 곳이 없다. 한 프레임 뒤에 켠다. */
            requestAnimationFrame(() => requestAnimationFrame(() => result.classList.add('is-run')));

            /* 소리는 최대 열두 방울. 그 이상은 소리가 아니라 소음이다. */
            const pick = beeps.length <= 12 ? beeps : beeps.filter((_, i) => i % Math.ceil(beeps.length / 12) === 0);
            pick.forEach((ms) => later(() => blip('tap'), ms));

            const last = beeps.length ? beeps[beeps.length - 1] : 0;
            later(() => {
              const lastBall = result.querySelector<HTMLElement>('.lt-row:last-child .lt-balls');
              if (lastBall) burst(lastBall);
              blip('good');
              result.classList.remove('is-revealing');
            }, last + 260);
          }

          /* ── 조건 ── */

          function parityOk(nums: number[]): boolean {
            const odd = nums.filter((n) => n % 2 === 1).length;
            switch ($<HTMLSelectElement>('#ltParity').value) {
              case 'balanced':
                return odd >= 2 && odd <= 4;
              case 'odd':
                return odd >= 4;
              case 'even':
                return odd <= 2;
              default:
                return true;
            }
          }

          /* ── 실행 ── */

          function run(): void {
            clearTimers();
            result.classList.remove('is-run');
            const count = parseInt(countInput.value, 10);
            let relaxed = false;
            games = [];

            if (mode === 'pension') {
              const fixed = parseInt($<HTMLSelectElement>('#ltBand').value, 10);
              for (let g = 0; g < count; g++) {
                let digits = '';
                for (let i = 0; i < 6; i++) digits += String(rnd(10));
                games.push({ band: fixed > 0 ? fixed : rnd(5) + 1, digits });
              }
            } else {
              const include = parseNums($<HTMLInputElement>('#ltInclude').value).slice(0, 5);
              const excludeArr = parseNums($<HTMLInputElement>('#ltExclude').value).filter((n) => include.indexOf(n) < 0);
              const exclude = new Set(excludeArr);
              if (45 - exclude.size < 6) {
                status.textContent = t('lotto.err.tooManyExcluded');
                status.className = 'tool-status error';
                return;
              }
              const wantBonus = $<HTMLInputElement>('#ltBonus').checked;
              for (let g = 0; g < count; g++) {
                let nums: number[] = [];
                let tries = 0;
                do {
                  nums = draw(exclude, include);
                  tries++;
                } while (!parityOk(nums) && tries < 400);
                if (tries >= 400) relaxed = true;

                let bonus = -1;
                if (wantBonus) {
                  const rest: number[] = [];
                  for (let i = 1; i <= 45; i++) if (nums.indexOf(i) < 0 && !exclude.has(i)) rest.push(i);
                  bonus = rest[rnd(rest.length)];
                }
                games.push({ nums, bonus: bonus > 0 ? bonus : undefined });
              }
            }

            paintGames();
            status.textContent = relaxed ? t('lotto.warn.parity') : t('lotto.say.done', { n: count });
            status.className = 'tool-status' + (relaxed ? '' : ' ok');
            Toolbox.incrementProgress?.('lotto_draws', count);
            Toolbox.trackUse?.('draw');
            void checkAgainstLatest();
          }

          /* ── 최신 회차 대조 ── */

          let last645: Draw645 | null = null;
          let lastPension: DrawPension | null = null;
          let netDead = false;

          /** 등위를 좋은 순서로 바꾼다. 1등이 가장 크다. 꽝 = 0. */
          const winScore = (s: Score): number => (s.bonus && mode === 'pension' ? 7 : s.rank > 0 ? 9 - s.rank : 0);


          function rankName(s: Score): string {
            if (s.bonus && mode === 'pension') return t('lotto.rank.b');
            return s.rank > 0 ? t('lotto.rank.' + s.rank) : t('lotto.score.none');
          }

          async function checkAgainstLatest(): Promise<void> {
            if (netDead || !games.length) return;
            try {
              if (mode === 'pension') {
                lastPension ||= await latestPension();
              } else {
                last645 ||= await latest645();
              }
            } catch {
              /* 인터넷이 없거나 저쪽이 바뀌었다. 뽑기는 그대로 되니 조용히 접는다. */
              netDead = true;
              checkBox.hidden = true;
              return;
            }

            const scores: Score[] = games.map((g) =>
              mode === 'pension'
                ? scorePension(g.band || 0, g.digits || '', lastPension as DrawPension)
                : score645(g.nums || [], g.bonus || -1, last645 as Draw645)
            );
            const best = scores.reduce((a, b) => (winScore(b) > winScore(a) ? b : a));

            const head =
              mode === 'pension'
                ? t('lotto.check.headPension', {
                    round: String((lastPension as DrawPension).round),
                    date: (lastPension as DrawPension).date,
                    band: String((lastPension as DrawPension).bnd),
                    digits: (lastPension as DrawPension).digits
                  })
                : t('lotto.check.head645', {
                    round: String((last645 as Draw645).round),
                    date: (last645 as Draw645).date,
                    nums: (last645 as Draw645).nums.join(' '),
                    bonus: String((last645 as Draw645).bonus)
                  });

            const lines = scores
              .map((s, i) => {
                const hit = winScore(s) > 0;
                return `<li class="${hit ? 'is-hit' : ''}"><span>${esc(t('lotto.value.game', { n: i + 1 }))}</span> <b>${esc(rankName(s))}</b> <span class="lt-check-hit">${esc(
                  mode === 'pension'
                    ? t('lotto.score.tail', { n: String(s.hit) })
                    : t('lotto.score.match', { n: String(s.hit) })
                )}</span></li>`;
              })
              .join('');

            checkBox.hidden = false;
            checkBox.innerHTML = `
              <div class="lt-panel-head">${esc(head)}</div>
              <ul class="lt-check-list">${lines}</ul>
              <p class="lt-panel-note">${esc(t('lotto.check.note'))}</p>
            `;
            if (winScore(best) > 0) {
              checkBox.classList.add('is-win');
              later(() => {
                blip('win');
                burst(checkBox);
              }, 120);
            } else {
              checkBox.classList.remove('is-win');
            }
          }

          /* ── 손잡이 ── */

          countInput.addEventListener('input', showCount);
          container.querySelectorAll<HTMLButtonElement>('.lt-mode').forEach((b) => {
            b.onclick = () => {
              if (b.dataset.mode === mode) return;
              mode = b.dataset.mode as Mode;
              checkBox.hidden = true;
              applyMode();
              blip('tap');
              run();
            };
          });

          const soundBtn = $<HTMLButtonElement>('#ltSound');
          const motionBtn = $<HTMLButtonElement>('#ltMotion');
          const paintToggles = (): void => {
            soundBtn.textContent = soundOn() ? t('lotto.btn.sound') : t('lotto.btn.soundOff');
            soundBtn.setAttribute('aria-pressed', soundOn() ? 'true' : 'false');
            motionBtn.textContent = motionOn ? t('lotto.btn.motion') : t('lotto.btn.motionOff');
            motionBtn.setAttribute('aria-pressed', motionOn ? 'true' : 'false');
          };
          soundBtn.onclick = () => {
            setSoundOn(!soundOn());
            paintToggles();
            if (soundOn()) blip('tap');
          };
          motionBtn.onclick = () => {
            motionOn = !motionOn;
            Toolbox.setPref?.('lotto.motion', motionOn ? 'on' : 'off');
            paintToggles();
            paintGames();
          };

          $<HTMLButtonElement>('#ltDraw').onclick = () => {
            blip('start');
            run();
          };
          $<HTMLButtonElement>('#ltCopy').onclick = async () => {
            const text = games
              .map((g, i) => {
                const head = t('lotto.value.game', { n: i + 1 }) + ': ';
                if (mode === 'pension') return head + g.band + t('lotto.unit.band') + ' ' + g.digits;
                return head + (g.nums || []).join(', ') + (g.bonus ? ' + ' + g.bonus : '');
              })
              .join('\n');
            if (!text) return;
            await Toolbox.copyText?.(text, { message: t('lotto.copy.done') });
          };

          applyMode();
          paintToggles();
          run();
                  });
        }
      }
    ]
  });
})();
