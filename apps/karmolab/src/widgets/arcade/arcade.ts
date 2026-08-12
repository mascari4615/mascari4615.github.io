/**
 * 오락실 — 실험실 안의 놀이터 (TASK-KL-242)
 *
 * 사용자: "미니게임을 엄청엄청" · "멀티가 일단 되어야 하고, 싱글도" · "시뮬레이션 컨셉"
 *
 * 이 파일이 하는 일은 넷뿐이다:
 *  ① 어떤 게임을 할지 고르게 하고
 *  ② 커널에 시계를 밀어 주고
 *  ③ 상태가 바뀌면 그 게임의 화면에게 그리라고 시키고
 *  ④ 여럿이면 주인이 판을 흘려보낸다
 *
 * **게임을 하나도 모른다.** 명부(`index.ts`·`view-registry.ts`) 둘만 읽는다 — 51개가 되어도
 * 이 파일은 안 커진다.
 *
 * 세 갈래가 아니라 한 갈래다:
 *  - **혼자** = 그물망 없는 방. 빈 자리는 봇.
 *  - **주인** = 같은 커널 + 사람이 들어오면 그 자리를 봇에서 사람으로 바꾼 채 다시 시작.
 *  - **손님** = 커널이 없다. 주인이 보낸 판을 그대로 그리고, 손은 주인에게 보낸다.
 *
 * 커널을 각자 돌리지 않는 이유: 봇의 주사위도 제한시간의 끝도 창마다 달라져 승부가 안 갈린다
 * (번개 대결에서 겪었다). 판정은 한 곳에서만.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { GAMES, gameById } from './index';
import { Match, type MatchView, type SeatSpec } from './kernel';
import { seedFrom } from './rng';
import { iconOf } from './meta';
import { viewById } from './view-registry';
import type { Render } from './views';
import { connect, type Net, type Peer, type Json } from './net';

declare const Toolbox: {
  register: (w: unknown) => void;
  onDispose?: (fn: () => void) => void;
  trackUse?: (s: string) => void;
  copyText?: (s: string, o?: { message?: string }) => Promise<void>;
};
declare const Mdd: { linePreset?: (k: string, o?: { msg?: string }) => void } | undefined;

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function storedName(): string {
    try {
      return (localStorage.getItem('karmolab.arcade.name') || '').trim();
    } catch {
      return '';
    }
  }

  Toolbox.register({
    id: 'arcade',
    title: t('widgets.arcade.title', undefined, '오락실'),
    category: 'lab',
    desc: t(
      'widgets-desc.arcade.desc',
      undefined,
      '여러 미니게임을 혼자서도 여럿이서도 합니다. 사람이 모자란 자리는 봇이 앉습니다'
    ),
    layout: 'wide',
    noHero: true,
    icon: '<rect x="3" y="7" width="18" height="12" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 11v4M6 13h4M15 12.5h.01M17.5 15h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('arcade.tab', undefined, '오락실'),
        build: (container: HTMLElement): void => {
          void loadNamespace('arcade').then(() => draw(container));
        }
      }
    ]
  });

  function injectStyles(): void {
    if (document.getElementById('ac-style')) return;
    const el = document.createElement('style');
    el.id = 'ac-style';
    el.textContent = [
      '.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:var(--space-lg) 0}',
      '.ac-card{text-align:left;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:6px;color:inherit}',
      '.ac-card b{font-size:var(--font-size-md)}',
      '.ac-emoji{font-size:22px;line-height:1}',
      '.ac-card small{color:var(--text-secondary);font-size:var(--font-size-xs)}',
      '.ac-card .ac-go{display:flex;gap:6px;margin-top:4px}',
      '.ac-card .ac-go button{flex:1;padding:6px 4px;font-size:var(--font-size-xs);border-radius:8px;border:1px solid var(--border);background:none;color:inherit;cursor:pointer}',
      '.ac-card .ac-go button:hover{border-color:var(--accent)}',
      '.ac-stage{text-align:center;padding:var(--space-lg) 0}',
      '.ac-order{font-size:clamp(22px,5vw,34px);font-weight:700;min-height:1.4em}',
      '.ac-choices{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:420px;margin:var(--space-lg) auto 0}',
      '.ac-choice{padding:16px 8px;font-size:var(--font-size-lg);font-weight:700;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:inherit;cursor:pointer}',
      '.ac-choice:disabled{cursor:default;opacity:.75}',
      '.ac-choice.ac-right{border-color:#22c55e;box-shadow:inset 0 0 0 1px #22c55e}',
      '.ac-choice.ac-wrong{border-color:#ef4444;opacity:.5}',
      '.ac-bar{height:5px;border-radius:3px;background:var(--border);margin:var(--space-lg) auto 0;max-width:420px;overflow:hidden}',
      '.ac-fill{height:100%;background:var(--accent);width:100%}',
      '.ac-board{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;max-width:min(92vw,440px);margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-board.ac-waiting{opacity:.7}',
      '.ac-cell{aspect-ratio:1;border:1px solid var(--border);background:var(--surface);color:inherit;border-radius:4px;font-size:min(4vw,20px);line-height:1;padding:0;cursor:pointer}',
      '.ac-cell:disabled{cursor:default}',
      '.ac-cell.ac-last{border-color:var(--accent)}',
      '.ac-seats{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-seat{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid var(--border);font-size:var(--font-size-xs)}',
      '.ac-seat.ac-me{border-color:var(--accent)}',
      '.ac-seat b{font-size:var(--font-size-md)}',
      '.ac-four{position:relative;max-width:min(94vw,460px);margin:var(--space-lg) auto}',
      '.ac-four .ac-col{position:absolute;top:0;bottom:0;width:calc(100%/var(--w));border:0;background:none;cursor:pointer;z-index:2;border-radius:8px}',
      '.ac-four .ac-col:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 12%,transparent)}',
      '.ac-four .ac-col:disabled{cursor:default}',
      '.ac-four .ac-col:nth-child(1){left:0}.ac-four .ac-col:nth-child(2){left:calc(100%/var(--w)*1)}.ac-four .ac-col:nth-child(3){left:calc(100%/var(--w)*2)}.ac-four .ac-col:nth-child(4){left:calc(100%/var(--w)*3)}.ac-four .ac-col:nth-child(5){left:calc(100%/var(--w)*4)}.ac-four .ac-col:nth-child(6){left:calc(100%/var(--w)*5)}.ac-four .ac-col:nth-child(7){left:calc(100%/var(--w)*6)}',
      '.ac-fgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:4px}',
      '.ac-disc{aspect-ratio:1;border-radius:50%;background:var(--surface);border:1px solid var(--border)}',
      '.ac-disc.ac-p1{background:#ef4444;border-color:#ef4444}',
      '.ac-disc.ac-p2{background:#eab308;border-color:#eab308}',
      '.ac-disc.ac-last{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-four.ac-waiting{opacity:.75}',
      '.ac-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-width:min(90vw,360px);margin:var(--space-lg) auto}',
      '.ac-mem.ac-waiting{opacity:.75}',
      '.ac-card2{aspect-ratio:3/4;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font-size:min(7vw,26px);cursor:pointer}',
      '.ac-card2:disabled{cursor:default}',
      '.ac-card2.ac-open{border-color:var(--accent)}',
      '.ac-card2.ac-gone{opacity:.35}',
      '.ac-hb{max-width:340px;margin:var(--space-lg) auto}',
      '.ac-hblist{list-style:none;padding:0;margin:0 0 10px;max-height:230px;overflow:auto;display:flex;flex-direction:column;gap:4px}',
      '.ac-hblist li{display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-variant-numeric:tabular-nums}',
      '.ac-hblist b{letter-spacing:.2em;font-size:var(--font-size-md)}',
      '.ac-hblist span{color:var(--text-secondary);font-size:var(--font-size-xs)}',
      '.ac-hbrow{display:flex;gap:6px}',
      '.ac-hbrow input{flex:1;min-width:0;letter-spacing:.3em;text-align:center;font-size:var(--font-size-lg)}',
      '.ac-rv{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;max-width:min(92vw,420px);margin:var(--space-lg) auto;aspect-ratio:1;background:var(--border);padding:2px;border-radius:6px}',
      '.ac-rv.ac-waiting{opacity:.8}',
      '.ac-rvcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 8%,var(--surface));padding:0;display:grid;place-items:center;cursor:default}',
      '.ac-rvcell i{width:74%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-rvcell.ac-p1 i{background:#111827;box-shadow:inset 0 0 0 1px #374151}',
      '.ac-rvcell.ac-p2 i{background:#f9fafb;box-shadow:inset 0 0 0 1px #d1d5db}',
      '.ac-rvcell.ac-can{cursor:pointer}',
      '.ac-rvcell.ac-can i{width:26%;background:var(--accent);opacity:.55}',
      '.ac-rvcell.ac-last{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-dots{display:grid;gap:0;margin:var(--space-lg) auto;max-width:min(88vw,360px);grid-template-columns:repeat(calc(var(--c)*2+1),auto);justify-content:center}',
      '.ac-dots{grid-auto-rows:auto}',
      '.ac-dot{width:9px;height:9px;border-radius:50%;background:var(--text-secondary);align-self:center;justify-self:center}',
      '.ac-h{width:56px;height:14px;border:0;background:none;padding:0;cursor:pointer;align-self:center;position:relative}',
      '.ac-v{width:14px;height:56px;border:0;background:none;padding:0;cursor:pointer;justify-self:center;position:relative}',
      '.ac-h::after{content:"";position:absolute;left:2px;right:2px;top:6px;height:2px;background:var(--border);border-radius:2px}',
      '.ac-v::after{content:"";position:absolute;top:2px;bottom:2px;left:6px;width:2px;background:var(--border);border-radius:2px}',
      '.ac-h.ac-on::after,.ac-v.ac-on::after{background:var(--text-primary)}',
      '.ac-h.ac-last::after,.ac-v.ac-last::after{background:var(--accent)}',
      '.ac-h:disabled,.ac-v:disabled{cursor:default}',
      '.ac-box{align-self:stretch;justify-self:stretch;margin:1px;border-radius:3px}',
      '.ac-box.ac-p1{background:color-mix(in srgb,#ef4444 40%,transparent)}',
      '.ac-box.ac-p2{background:color-mix(in srgb,#3b82f6 40%,transparent)}',
      '.ac-box.ac-p3{background:color-mix(in srgb,#22c55e 40%,transparent)}',
      '.ac-box.ac-p4{background:color-mix(in srgb,#eab308 40%,transparent)}',
      '.ac-dots.ac-waiting{opacity:.8}',
      '.ac-sp{max-width:420px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-spfoe{color:var(--text-secondary);font-size:var(--font-size-sm);letter-spacing:2px;min-height:1.4em}',
      '.ac-spcenter{display:flex;gap:14px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-spc{width:64px;height:88px;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:inherit;font-size:26px;font-weight:700;cursor:default}',
      '.ac-spc.ac-can{border-color:var(--accent);cursor:pointer}',
      '.ac-sphand{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-spcard{width:52px;height:72px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);font-size:20px;font-weight:700;cursor:default;opacity:.5}',
      '.ac-spcard.ac-can{opacity:1;color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-spcard.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-sl{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;max-width:min(86vw,320px);margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-slt{aspect-ratio:1;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);font-size:min(6vw,22px);font-weight:700;padding:0;cursor:default}',
      '.ac-slt.ac-hole{border-color:transparent;background:none}',
      '.ac-slt.ac-home{color:var(--text-primary)}',
      '.ac-slt.ac-can{cursor:pointer;border-color:var(--accent);color:inherit}',
      '.ac-ut{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:min(92vw,400px);margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-ut.ac-waiting{opacity:.8}',
      '.ac-utsmall{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;padding:3px;border:1px solid var(--border);border-radius:6px}',
      '.ac-utsmall.ac-open{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}',
      '.ac-utcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 6%,var(--surface));color:inherit;font-size:min(2.6vw,13px);line-height:1;padding:0;border-radius:2px;cursor:pointer}',
      '.ac-utcell:disabled{cursor:default}',
      '.ac-utcell.ac-last{outline:1px solid var(--accent)}',
      '.ac-utown{position:absolute;inset:0;display:grid;place-items:center;font-size:min(9vw,44px);pointer-events:none}',
      '.ac-utsmall.ac-took .ac-utcell{opacity:.25}',
      '.ac-yc{max-width:420px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-ycdice{display:flex;gap:8px;justify-content:center}',
      '.ac-ycd{width:52px;height:52px;font-size:34px;line-height:1;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:inherit;padding:0;cursor:pointer}',
      '.ac-ycd.ac-keep{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface))}',
      '.ac-ycd:disabled{cursor:default;opacity:.7}',
      '.ac-ycbar{display:flex;gap:10px;align-items:center;justify-content:center;margin:var(--space-lg) 0;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-ycsheet{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}',
      '.ac-yccat{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font-size:var(--font-size-xs);cursor:pointer}',
      '.ac-yccat b{font-variant-numeric:tabular-nums;font-size:var(--font-size-md)}',
      '.ac-yccat.ac-zero{opacity:.5}',
      '.ac-yccat.ac-done{background:color-mix(in srgb,var(--accent) 10%,var(--surface));border-color:var(--accent);cursor:default}',
      '.ac-yccat:disabled{cursor:default}',
      '.ac-yctotal{grid-column:1/-1;margin-top:6px;font-weight:700}',
      '.ac-ck{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;max-width:min(92vw,420px);margin:var(--space-lg) auto;aspect-ratio:1;border:1px solid var(--border);border-radius:6px;overflow:hidden}',
      '.ac-ck.ac-waiting{opacity:.8}',
      '.ac-ckc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--surface));display:grid;place-items:center;cursor:default}',
      '.ac-ckc.ac-dark{background:color-mix(in srgb,var(--accent) 16%,var(--surface))}',
      '.ac-ckc i{width:72%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-ckc.ac-p1 i{background:#e5e7eb;box-shadow:inset 0 0 0 2px #9ca3af}',
      '.ac-ckc.ac-p2 i{background:#7f1d1d;box-shadow:inset 0 0 0 2px #b91c1c}',
      '.ac-ckc.ac-king i{box-shadow:inset 0 0 0 3px var(--accent)}',
      '.ac-ckc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-ckc.ac-can{cursor:pointer}',
      '.ac-ckc.ac-can i{width:28%;background:var(--accent);opacity:.6}',
      '.ac-ckc.ac-last{outline:1px dashed var(--accent);outline-offset:-3px}',
      '.ac-ckc:not(:disabled){cursor:pointer}',
      '.ac-bj{max-width:380px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-bjrow{margin:var(--space-lg) 0}',
      '.ac-bjrow small{display:block;color:var(--text-secondary);font-size:var(--font-size-xs);margin-bottom:6px}',
      '.ac-bjrow>div{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-bjc{width:44px;height:62px;border-radius:8px;border:1px solid var(--border);background:var(--surface);display:grid;place-items:center;font-size:20px;font-weight:700}',
      '.ac-bjc.ac-back{background:color-mix(in srgb,var(--accent) 22%,var(--surface));color:var(--text-secondary)}',
      '.ac-bjbar{display:flex;gap:8px;justify-content:center}',
      '.ac-code{font-size:clamp(28px,8vw,48px);font-weight:800;letter-spacing:.18em;text-align:center;margin:var(--space-lg) 0}',
      '.ac-share{display:flex;gap:6px;margin:var(--space-lg) 0}',
      '.ac-share input{flex:1;min-width:0}'
    ].join('\n');
    document.head.appendChild(el);
  }

  /** 방 이름 — 짧고, 헷갈리는 글자(0/O, 1/I)는 뺀다. */
  function roomCode(): string {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function draw(container: HTMLElement): void {
    injectStyles();
    if (typeof Mdd !== 'undefined') Mdd?.linePreset?.('tool_run', { msg: t('arcade.mdd') });

    container.innerHTML =
      '<div id="acLobby">' +
      '<p class="tool-status">' + esc(t('arcade.lobby.hint')) + '</p>' +
      '<div class="ac-grid" id="acGames"></div>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-xs);color:var(--text-secondary)">' +
      esc(t('arcade.label.name')) +
      '<input type="text" id="acName" maxlength="12" placeholder="' + esc(t('arcade.name.default')) +
      '" style="width:120px" aria-label="' + esc(t('arcade.aria.name')) + '"></label>' +
      '</div>' +
      '<div id="acWait" style="display:none">' +
      '<div class="ac-code" id="acCode"></div>' +
      '<div class="ac-share"><input type="text" id="acUrl" readonly aria-label="' + esc(t('arcade.aria.url')) +
      '"><button class="btn btn-primary" id="acCopy">' + esc(t('arcade.btn.copy')) + '</button></div>' +
      '<div class="ac-seats" id="acWaitSeats"></div>' +
      '<div class="tool-status" id="acWaitStatus"></div>' +
      '<div style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      '<button class="btn btn-primary" id="acStart">' + esc(t('arcade.btn.start')) + '</button>' +
      '<button class="btn btn-ghost" id="acWaitQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      '</div></div>' +
      '<div id="acPlay" style="display:none">' +
      '<div class="ac-seats" id="acSeats"></div>' +
      '<div id="acView"></div>' +
      '<div class="tool-status" id="acStatus"></div>' +
      '<div style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      '<button class="btn btn-ghost" id="acQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      '<button class="btn btn-primary" id="acAgain" style="display:none">' + esc(t('arcade.btn.again')) + '</button>' +
      '</div></div>';

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const lobby = $<HTMLElement>('#acLobby');
    const wait = $<HTMLElement>('#acWait');
    const play = $<HTMLElement>('#acPlay');
    const seatsEl = $<HTMLElement>('#acSeats');
    const viewEl = $<HTMLElement>('#acView');
    const statusEl = $<HTMLElement>('#acStatus');
    const againBtn = $<HTMLButtonElement>('#acAgain');
    const startBtn = $<HTMLButtonElement>('#acStart');
    const nameInput = $<HTMLInputElement>('#acName');
    nameInput.value = storedName();

    const say = (m: string, kind = ''): void => {
      statusEl.textContent = m;
      statusEl.className = 'tool-status' + (kind ? ' ' + kind : '');
    };
    const myName = (): string => nameInput.value.trim() || t('arcade.name.default');
    const show = (which: 'lobby' | 'wait' | 'play'): void => {
      lobby.style.display = which === 'lobby' ? '' : 'none';
      wait.style.display = which === 'wait' ? '' : 'none';
      play.style.display = which === 'play' ? '' : 'none';
    };

    /* ── 로비 ────────────────────────────────────────────────────── */
    $<HTMLElement>('#acGames').innerHTML = GAMES.map((g) => {
      const [min, max] = g.seats;
      return (
        '<div class="ac-card"><span class="ac-emoji">' + iconOf(g.id) + '</span>' +
        '<b>' + esc(t('arcade.game.' + g.id + '.name')) + '</b>' +
        '<small>' + esc(t('arcade.game.' + g.id + '.desc')) + '</small>' +
        '<small>' + esc(t('arcade.seats', { min: String(min), max: String(max) })) + '</small>' +
        '<span class="ac-go">' +
        '<button data-solo="' + g.id + '">' + esc(t('arcade.btn.solo')) + '</button>' +
        '<button data-host="' + g.id + '">' + esc(t('arcade.btn.together')) + '</button>' +
        '</span></div>'
      );
    }).join('');

    const remember = (): void => {
      try {
        localStorage.setItem('karmolab.arcade.name', nameInput.value.trim());
      } catch {
        /* 못 적어도 그만 */
      }
    };
    container.querySelectorAll<HTMLButtonElement>('[data-solo]').forEach((b) => {
      b.onclick = (): void => {
        remember();
        startSolo(String(b.dataset.solo));
      };
    });
    container.querySelectorAll<HTMLButtonElement>('[data-host]').forEach((b) => {
      b.onclick = (): void => {
        remember();
        openRoom(String(b.dataset.host));
      };
    });

    /* ── 판 ──────────────────────────────────────────────────────── */
    let match: Match<unknown, unknown> | null = null;
    let render: Render<unknown> | null = null;
    let net: Net | null = null;
    let raf = 0;
    let t0 = 0;
    let gameId = '';
    let mySeat = 0;
    let peers: Peer[] = [];
    /** 주인이 정한 자리 지도 — 손님은 여기서 제 자리를 찾는다. */
    let seatOf: Record<string, number> = {};
    /** 손님 쪽엔 커널이 없다. 주인이 보낸 판을 들고 그린다. */
    let shadow: { v: MatchView<unknown>; now: number; at: number } | null = null;

    function paint(v: MatchView<unknown>, now: number): void {
      seatsEl.innerHTML = v.seats
        .map(
          (s, i) =>
            '<span class="ac-seat' + (i === mySeat ? ' ac-me' : '') + '">' +
            esc(s.name) + (s.bot ? ' 🤖' : '') + ' <b>' + s.score + '</b></span>'
        )
        .join('');
      render?.(v, mySeat, now);

      if (v.finished) {
        const top = Math.max(...v.seats.map((s) => s.score));
        const win = v.seats.filter((s) => s.score === top);
        say(
          win.length === v.seats.length
            ? t('arcade.result.draw')
            : t('arcade.result.win', { who: win.map((s) => s.name).join(', ') }),
          'ok'
        );
        againBtn.style.display = net && !net.host ? 'none' : '';
      } else if (v.note) {
        say(t(v.note.key, v.note.params));
      } else {
        say(t('arcade.status.round', { n: String(v.round + 1), of: String(v.rounds) }));
      }
    }

    function loop(): void {
      raf = requestAnimationFrame(loop);
      if (match) {
        const now = performance.now() - t0;
        match.step(now);
        const v = match.view();
        paint(v, now);
        /* 주인은 판을 통째로 흘려보낸다 — 손님이 커널을 안 돌려야 판정이 하나로 남는다. */
        sendBoard(v, now);
      } else if (shadow) {
        /* 손님 시계는 주인이 보낸 시각에서 이어 간다 — 소식이 30ms 마다 와도 막대는 부드럽다. */
        paint(shadow.v, shadow.now + (performance.now() - shadow.at));
      }
    }

    /**
     * 판을 손님들에게 보낸다.
     *
     * 감출 것이 있는 게임이면 **자리마다 다른 판**을 만들어 각자에게 따로 보낸다 —
     * 통째로 뿌리면 화면이 안 그려도 값은 이미 건너간 뒤다(개발자 도구로 다 보인다).
     */
    function sendBoard(v: MatchView<unknown>, now: number): void {
      if (!net?.host) return;
      const g = gameById(gameId);
      const base = { game: gameId, now, seatOf };
      if (!g?.redact) {
        net.sync({ ...base, v: v as unknown as Json });
        return;
      }
      for (const [peerId, seat] of Object.entries(seatOf)) {
        const safe = { ...v, state: g.redact(v.state, seat) };
        net.sync({ ...base, v: safe as unknown as Json }, peerId);
      }
    }

    function mountView(id: string): void {
      const gv = viewById(id);
      viewEl.innerHTML = '';
      render = gv ? (gv.mount(viewEl, (a: unknown) => sendAct(a)) as Render<unknown>) : null;
    }

    function sendAct(a: unknown): void {
      if (match) match.dispatch(mySeat, a);
      else net?.act({ a: a as Json });
    }

    function beginMatch(id: string, seats: SeatSpec[], seed: number): void {
      const g = gameById(id);
      if (!g) return;
      gameId = id;
      mySeat = 0;
      match = new Match(g, seed, seats) as Match<unknown, unknown>;
      shadow = null;
      mountView(id);
      againBtn.style.display = 'none';
      show('play');
      t0 = performance.now();
      cancelAnimationFrame(raf);
      loop();
      Toolbox.trackUse?.(id);
    }

    /** 혼자 — 그물망 없이 커널만. 빈 자리는 봇이 앉는다. */
    function startSolo(id: string): void {
      net?.leave();
      net = null;
      beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now())));
    }

    /* ── 여럿 ────────────────────────────────────────────────────── */
    function paintWait(code: string, host: boolean): void {
      $<HTMLElement>('#acCode').textContent = code;
      $<HTMLElement>('#acWaitSeats').innerHTML = [
        '<span class="ac-seat ac-me">' + esc(myName()) + '</span>',
        ...peers.map((p) => '<span class="ac-seat">' + esc(p.name) + '</span>')
      ].join('');
      $<HTMLElement>('#acWaitStatus').textContent = host
        ? t('arcade.wait.host', { n: String(peers.length + 1) })
        : t('arcade.wait.guest');
      startBtn.style.display = host ? '' : 'none';
      $<HTMLElement>('.ac-share').style.display = host ? '' : 'none';
    }

    function openRoom(id: string): void {
      const code = roomCode();
      gameId = id;
      peers = [];
      show('wait');
      $<HTMLInputElement>('#acUrl').value = location.origin + '/karmolab/t/arcade/?r=' + code;
      paintWait(code, true);
      net = connect(code, true, myName(), {
        onPeers: (list) => {
          peers = list;
          paintWait(code, true);
        },
        onAct: (peerId, data) => {
          const seat = seatOf[peerId];
          if (seat !== undefined) match?.dispatch(seat, (data as { a?: unknown }).a);
        },
        onSync: () => {
          /* 주인은 남의 판을 안 받는다 */
        }
      });
    }

    function joinRoomAs(code: string): void {
      peers = [];
      show('wait');
      paintWait(code, false);
      net = connect(code, false, myName(), {
        onPeers: (list) => {
          peers = list;
          paintWait(code, false);
        },
        onAct: () => {
          /* 손님은 남의 손을 안 받는다 */
        },
        onSync: (data) => {
          const p = data as unknown as { game: string; now: number; seatOf: Record<string, number>; v: MatchView<unknown> };
          if (!p?.v) return;
          if (gameId !== p.game) {
            gameId = p.game;
            mountView(p.game);
            show('play');
            cancelAnimationFrame(raf);
            match = null;
            loop();
          }
          seatOf = p.seatOf || {};
          mySeat = seatOf[net?.selfId ?? ''] ?? 0;
          shadow = { v: p.v, now: p.now, at: performance.now() };
        }
      });
    }

    /** 주인이 판을 연다 — 자리를 정하는 것은 주인 하나뿐이다. */
    function startTogether(): void {
      const g = gameById(gameId);
      if (!g) return;
      /* 자리를 정하는 것은 주인 하나다. 0 번은 주인, 그다음은 들어온 차례대로. */
      const take = peers.slice(0, g.seats[1] - 1);
      seatOf = {};
      take.forEach((p, i) => {
        seatOf[p.id] = i + 1;
      });
      const seats: SeatSpec[] = [
        { name: myName(), bot: false },
        ...take.map((p) => ({ name: p.name, bot: false }))
      ];
      beginMatch(gameId, seats, seedFrom(gameId + String(Date.now())));
    }

    startBtn.onclick = startTogether;

    /* 링크로 들어온 사람은 곧장 손님이 된다.
     *
     * **주소의 `#` 뒤는 셸의 것이다.** 셸이 어느 화면을 열었는지를 거기 적기 때문에, 방 이름을
     * `#r=...` 로 달면 화면이 열리는 순간 `#arcade` 로 덮여 사라진다(실측: `#r=CRL99` → `#home`
     * → `#arcade`). 그래서 방 이름은 **물음표 뒤**에 단다 — 그쪽은 셸이 안 건드린다. */
    const joined = location.search.match(/[?&]r=([A-Za-z0-9]{4,12})/);
    if (joined) joinRoomAs(joined[1]);

    $<HTMLButtonElement>('#acCopy').onclick = (): void => {
      void Toolbox.copyText?.($<HTMLInputElement>('#acUrl').value, { message: t('arcade.copy.done') });
    };

    const quit = (): void => {
      cancelAnimationFrame(raf);
      net?.leave();
      net = null;
      match = null;
      shadow = null;
      render = null;
      againBtn.style.display = 'none';
      show('lobby');
    };
    $<HTMLButtonElement>('#acQuit').onclick = quit;
    $<HTMLButtonElement>('#acWaitQuit').onclick = quit;

    againBtn.onclick = (): void => {
      if (!gameId) return;
      if (net?.host) startTogether();
      else startSolo(gameId);
    };

    Toolbox.onDispose?.(() => {
      cancelAnimationFrame(raf);
      net?.leave();
    });
  }
})();
