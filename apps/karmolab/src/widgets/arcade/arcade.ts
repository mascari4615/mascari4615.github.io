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
import { iconOf, kindOf, KINDS, type Kind } from './meta';
import { viewById } from './view-registry';
import { makeCode, inviteLink } from '../../lib/room';
import { blip, soundOn, setSoundOn } from '../../lib/blip';
import { pickBots, withBotLevel, type BotLevel, type BotPersona } from './bots';
import { todayPicks, dailyState, markPlayed, PICKS } from './daily';
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
      '.ac-pr{max-width:400px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-prpile{min-height:70px;display:flex;gap:6px;justify-content:center;align-items:center;color:var(--text-secondary)}',
      '.ac-prhand{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-prc{position:relative;width:44px;height:62px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);display:inline-grid;place-items:center;font-size:19px;font-weight:700;padding:0}',
      '.ac-prc.ac-can{color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-prc:disabled{opacity:.45;cursor:default}',
      '.ac-prc.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-prc i{position:absolute;right:3px;bottom:2px;font-size:10px;font-style:normal;color:var(--text-secondary)}',
      '.ac-prpick{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:var(--space-lg);min-height:1px}',
      '.ac-dmwrap{max-width:420px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-dmline{display:flex;gap:3px;overflow-x:auto;padding:8px 4px;min-height:52px;align-items:center;justify-content:flex-start;border:1px solid var(--border);border-radius:8px;color:var(--text-secondary)}',
      '.ac-dm{display:inline-flex;flex-direction:column;align-items:center;gap:1px;min-width:22px;padding:3px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface);font-size:12px;font-weight:700;color:inherit}',
      '.ac-dm i{display:block;width:14px;height:1px;background:var(--border)}',
      '.ac-dmhand{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-dmt{padding:2px;border:1px solid var(--border);border-radius:6px;background:none;cursor:default;opacity:.5}',
      '.ac-dmt.ac-can{opacity:1;border-color:var(--accent);cursor:pointer}',
      '.ac-dmt.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-dmbar{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap}',
      '.ac-cl{max-width:min(92vw,360px);margin:var(--space-lg) auto}',
      '.ac-cl canvas{width:100%;display:block;border:1px solid var(--border);border-radius:8px;background:#eef4fb}',
      '.ac-clbar{display:flex;flex-direction:column;gap:8px;margin-top:var(--space-lg)}',
      '.ac-clbar label{display:flex;align-items:center;gap:8px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-clbar label span{min-width:52px}',
      '.ac-clbar input[type=range]{flex:1}',
      '.ac-bw{max-width:min(92vw,380px);margin:var(--space-lg) auto}',
      '.ac-bw canvas{width:100%;height:300px;display:block;border:1px solid var(--border);border-radius:8px;background:linear-gradient(#0f172a,#1e293b)}',
      '.ac-bwscore{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-bws{padding:4px 10px;border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-xs)}',
      '.ac-bws.ac-me{border-color:var(--accent)}',
      '.ac-pl{max-width:min(92vw,340px);margin:var(--space-lg) auto}',
      '.ac-pl canvas{width:100%;display:block;border-radius:8px}',
      '.ac-dt{max-width:320px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-dt canvas{width:100%;max-width:300px;display:block;margin:0 auto}',
      '.ac-dtleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-dts{padding:4px 10px;border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-xs)}',
      '.ac-dts.ac-me{border-color:var(--accent)}',
      '.ac-ah{max-width:min(90vw,300px);margin:var(--space-lg) auto}',
      '.ac-ah canvas{width:100%;display:block;border-radius:8px;touch-action:none;cursor:none}',
      '.ac-kind{margin:var(--space-lg) 0 6px;font-size:var(--font-size-sm);color:var(--text-secondary);font-weight:600;display:flex;align-items:center;gap:6px}',
      '.ac-kind i{font-style:normal;font-size:var(--font-size-xs);opacity:.6}',
      '.ac-hl{max-width:320px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hlcards{display:flex;gap:12px;justify-content:center}',
      '.ac-hlc{width:64px;height:90px;border-radius:10px;border:1px solid var(--border);background:var(--surface);display:grid;place-items:center;font-size:30px;font-weight:700}',
      '.ac-hlnext{color:var(--text-secondary)}',
      '.ac-hlnext.ac-ok{border-color:#22c55e;color:inherit}',
      '.ac-hlnext.ac-no{border-color:#ef4444;color:inherit;opacity:.7}',
      '.ac-hlpot{margin:var(--space-lg) 0;font-size:var(--font-size-lg);font-weight:700}',
      '.ac-hlbar{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-hlleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-nim{display:flex;flex-direction:column;gap:12px;align-items:center;margin:var(--space-lg) auto}',
      '.ac-nimrow{display:flex;gap:7px}',
      '.ac-nims{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--surface);padding:0;cursor:pointer}',
      '.ac-nims:disabled{cursor:default;opacity:.7}',
      '.ac-nims.ac-take{background:#ef4444;border-color:#ef4444}',
      '.ac-hb2{max-width:360px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hbpiles{display:flex;gap:8px;justify-content:center}',
      '.ac-hbp{width:38px;height:52px;border:2px solid var(--border);border-radius:8px;display:grid;place-items:center;font-size:22px;font-weight:700}',
      '.ac-hbmeta{margin:8px 0 var(--space-lg);font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-hbrow,.ac-hbmine{margin-bottom:var(--space-lg)}',
      '.ac-hbrow small,.ac-hbmine small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      '.ac-hbrow>div,.ac-hbmine>div{display:flex;gap:5px;justify-content:center}',
      '.ac-hbc{position:relative;width:34px;height:46px;border:2px solid var(--border);border-radius:6px;background:var(--surface);font-size:17px;font-weight:700;padding:0;cursor:pointer}',
      '.ac-hbc:disabled{cursor:default;opacity:.75}',
      '.ac-hbc.ac-back{background:color-mix(in srgb,var(--accent) 20%,var(--surface));color:var(--text-secondary)}',
      '.ac-hbc.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-hbc i{position:absolute;right:2px;top:0;font-size:11px;font-style:normal}',
      '.ac-hbact{display:flex;gap:6px;justify-content:center;min-height:32px;align-items:center}',
      '.ac-wc{max-width:360px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-wcchain{display:flex;gap:6px;align-items:center;justify-content:flex-start;overflow-x:auto;padding:8px;border:1px solid var(--border);border-radius:8px;min-height:42px;font-size:var(--font-size-md)}',
      '.ac-wcchain b{color:var(--text-secondary);font-weight:400}',
      '.ac-wclast{font-weight:700;color:var(--accent)}',
      '.ac-wcrow{display:flex;gap:6px;margin-top:var(--space-lg)}',
      '.ac-wcrow input{flex:1;min-width:0;text-align:center;font-size:var(--font-size-md)}',
      '.ac-wcwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-dts.ac-dead{opacity:.4;text-decoration:line-through}',
      '.ac-lu{max-width:360px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-luq{font-size:var(--font-size-lg);font-weight:700;min-height:2.4em;display:grid;place-items:center}',
      '.ac-lubig{font-size:44px;font-weight:800;margin:8px 0}',
      '.ac-lu input[type=range]{width:100%}',
      '.ac-lurow{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-lup{padding:8px 14px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:inherit;cursor:pointer}',
      '.ac-luline{display:flex;flex-direction:column;gap:4px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-luline span{padding:4px 12px;border:1px solid var(--border);border-radius:8px;font-size:var(--font-size-sm)}',
      '.ac-ms{max-width:min(92vw,340px);margin:var(--space-lg) auto}',
      '.ac-msgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:2px}',
      '.ac-mc{aspect-ratio:1;border:1px solid var(--border);border-radius:3px;background:color-mix(in srgb,var(--accent) 14%,var(--surface));font-size:min(3.6vw,15px);font-weight:700;padding:0;cursor:pointer;touch-action:none}',
      '.ac-mc.ac-open{background:var(--surface);cursor:default}',
      '.ac-mc.ac-flag{color:#ef4444}',
      '.ac-msbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-li{max-width:360px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-libid{font-size:var(--font-size-lg);font-weight:700;min-height:1.8em}',
      '.ac-lidice small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin:8px 0 4px}',
      '.ac-lidice>div{display:flex;gap:6px;justify-content:center}',
      '.ac-lid{font-size:34px;line-height:1}',
      '.ac-liwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-liopts{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-liopt{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer;font-size:var(--font-size-sm)}',
      '.ac-liopt:hover{border-color:var(--accent)}',
      '.ac-tw{max-width:380px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-twhead small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-twhead b{font-size:32px}',
      '.ac-twlog{max-height:160px;overflow:auto;margin:var(--space-lg) 0;display:flex;flex-direction:column;gap:3px}',
      '.ac-twl{padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:var(--font-size-xs);text-align:left}',
      '.ac-twl.ac-no{opacity:.6}',
      '.ac-twqs{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-twq,.ac-twg{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-twg{border-style:dashed}',
      '.ac-twq:hover,.ac-twg:hover{border-color:var(--accent)}',
      '.ac-sn{max-width:min(92vw,340px);margin:var(--space-lg) auto}',
      '.ac-sn canvas{width:100%;display:block;border-radius:8px;touch-action:none}',
      '.ac-os{max-width:min(90vw,320px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-os svg{width:100%;display:block}',
      '.ac-osl{stroke:var(--border);stroke-width:.09;cursor:pointer}',
      '.ac-osl.ac-near{stroke:var(--accent);stroke-width:.13}',
      '.ac-osl.ac-done{stroke:#22c55e;stroke-width:.14;cursor:default}',
      '.ac-osp{fill:var(--text-secondary)}',
      '.ac-osp.ac-at{fill:var(--accent)}',
      '.ac-osbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-fi{max-width:min(92vw,320px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-fi canvas{width:100%;display:block;border-radius:8px}',
      '.ac-fibtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-md)}',
      '.ac-fibtn.ac-bite{animation:acBite .28s infinite alternate}',
      '@keyframes acBite{from{transform:scale(1)}to{transform:scale(1.04)}}',
      '.ac-fibag{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0;min-height:1.4em;font-size:var(--font-size-xs)}',
      '.ac-fibag span{padding:3px 8px;border:1px solid var(--border);border-radius:999px}',
      '.ac-fiwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-sg{max-width:min(90vw,300px);margin:var(--space-lg) auto}',
      '.ac-sgboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;aspect-ratio:1;margin:8px 0}',
      '.ac-sgc{aspect-ratio:1;border:1px solid var(--border);border-radius:3px;background:color-mix(in srgb,#f59e0b 12%,var(--surface));font-size:min(5vw,20px);font-weight:700;padding:0;color:inherit;cursor:pointer}',
      '.ac-sgc.ac-flip{transform:rotate(180deg)}',
      '.ac-sgc.ac-p1{color:#b91c1c}',
      '.ac-sgc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-sgc.ac-can{background:color-mix(in srgb,var(--accent) 26%,var(--surface))}',
      '.ac-sgc.ac-last{border-color:var(--accent)}',
      '.ac-sghand{display:flex;gap:4px;justify-content:center;min-height:30px;flex-wrap:wrap}',
      '.ac-sgh{width:26px;height:26px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:inherit;font-size:14px;padding:0;cursor:pointer}',
      '.ac-sgh.ac-pick{outline:2px solid var(--accent)}',
      '.ac-hf{max-width:380px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hfrow{margin-bottom:var(--space-lg)}',
      '.ac-hfrow small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      '.ac-hfrow>div{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;min-height:52px}',
      '.ac-hfc{position:relative;width:34px;height:48px;border:2px solid var(--border);border-radius:6px;background:var(--surface);font-size:16px;font-weight:700;padding:0;cursor:pointer}',
      '.ac-hfc:disabled{cursor:default;opacity:.55}',
      '.ac-hfc.ac-can{opacity:1;box-shadow:0 0 0 2px var(--accent)}',
      '.ac-hfc.ac-pick{outline:2px solid var(--accent);outline-offset:2px;opacity:1}',
      '.ac-hfc i{position:absolute;right:2px;bottom:1px;font-size:9px;font-style:normal;opacity:.7}',
      '.ac-hfbar{min-height:32px;display:flex;justify-content:center;align-items:center}',
      '.ac-hfwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-tk{max-width:min(94vw,400px);margin:var(--space-lg) auto}',
      '.ac-tk canvas{width:100%;display:block;border-radius:8px}',
      '.ac-mn{max-width:min(94vw,380px);margin:var(--space-lg) auto}',
      '.ac-mnrow{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}',
      '.ac-mnp{aspect-ratio:1;border:1px solid var(--border);border-radius:50%;background:color-mix(in srgb,#a16207 16%,var(--surface));color:inherit;font-size:var(--font-size-md);padding:0;cursor:pointer}',
      '.ac-mnp:disabled{cursor:default;opacity:.6}',
      '.ac-mnp.ac-land{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-mnp.ac-last{border-color:var(--accent)}',
      '.ac-mnmid{display:flex;align-items:center;gap:8px;margin:8px 0}',
      '.ac-mnstore{flex:0 0 60px;text-align:center;padding:6px;border:1px solid var(--border);border-radius:10px}',
      '.ac-mnstore small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-mnstore b{font-size:var(--font-size-lg)}',
      '.ac-mnhint{flex:1;font-size:var(--font-size-xs);color:var(--text-secondary);text-align:center}',
      '.ac-sh{max-width:340px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-shstage{display:flex;gap:10px;justify-content:center;min-height:96px;align-items:flex-end}',
      '.ac-shc{width:74px;height:86px;border:0;background:none;padding:0;cursor:pointer;position:relative;transition:transform .18s}',
      '.ac-shc::before{content:"";position:absolute;inset:0;border-radius:38px 38px 8px 8px;background:linear-gradient(#b45309,#78350f)}',
      '.ac-shc.ac-move::before{transform:translateY(-6px)}',
      '.ac-shc.ac-pick::before{box-shadow:0 0 0 3px var(--accent)}',
      '.ac-shc span{position:absolute;left:50%;bottom:6px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#facc15;opacity:0}',
      '.ac-shc.ac-ball span{opacity:1}',
      '.ac-shc.ac-ball::before{opacity:.25}',
      '.ac-shmsg{margin:var(--space-lg) 0;font-size:var(--font-size-md);font-weight:600;min-height:1.5em}',
      '.ac-shwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-fx{max-width:min(92vw,380px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-fxrole{font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:8px}',
      '.ac-fxboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:1px solid var(--border);border-radius:6px;overflow:hidden}',
      '.ac-fxc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--surface));font-size:min(4vw,18px);cursor:default}',
      '.ac-fxc.ac-dark{background:color-mix(in srgb,var(--accent) 18%,var(--surface))}',
      '.ac-fxc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-fxc.ac-can{background:color-mix(in srgb,var(--accent) 40%,var(--surface));cursor:pointer}',
      '.ac-fxc:not(:disabled){cursor:pointer}',
      '.ac-pg{max-width:min(90vw,280px);margin:var(--space-lg) auto}',
      '.ac-pg canvas{width:100%;display:block;border-radius:8px;touch-action:none;cursor:none}',
      '.ac-db{max-width:380px;margin:var(--space-lg) auto}',
      '.ac-dbrow{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:var(--font-size-xs)}',
      '.ac-dbrow.ac-mine .ac-dblane{box-shadow:inset 0 0 0 1px var(--accent)}',
      '.ac-dbrow.ac-won .ac-dblane{background:color-mix(in srgb,#22c55e 25%,var(--surface))}',
      '.ac-dblane{position:relative;flex:1;height:20px;border-radius:10px;background:color-mix(in srgb,#a16207 12%,var(--surface));overflow:hidden}',
      '.ac-dblane i{position:absolute;top:1px;font-style:normal;transition:left .2s linear}',
      '.ac-dbodds{min-width:34px;text-align:right;color:var(--text-secondary)}',
      '.ac-dbbar{margin:var(--space-lg) 0;text-align:center;min-height:40px}',
      '.ac-dbamt{display:flex;align-items:center;gap:8px;justify-content:center;font-size:var(--font-size-xs);margin-bottom:8px}',
      '.ac-dbpick{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}',
      '.ac-dbp{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-dbp:hover{border-color:var(--accent)}',
      '.ac-dbwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-wk{max-width:min(90vw,320px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-wkgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:var(--space-lg) 0}',
      '.ac-wkh{aspect-ratio:1;border:2px solid var(--border);border-radius:50%;background:color-mix(in srgb,#78350f 22%,var(--surface));font-size:min(9vw,34px);padding:0;cursor:pointer;display:grid;place-items:center}',
      '.ac-wkh.ac-up{border-color:#22c55e}',
      '.ac-wkh.ac-bad{border-color:#ef4444}',
      '.ac-wkh span{line-height:1}',
      '.ac-wkwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-tg{max-width:360px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-tgline{position:relative;height:34px;border-radius:17px;background:color-mix(in srgb,#a16207 18%,var(--surface));margin:var(--space-lg) 0}',
      '.ac-tgline i{position:absolute;top:5px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:var(--accent);transition:left .12s}',
      '.ac-tgmsg{min-height:1.5em;font-size:var(--font-size-sm);color:var(--text-secondary)}',
      '.ac-tgmsg.ac-warn{color:#ef4444;font-weight:700}',
      '.ac-tgbtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-lg);padding:14px}',
      '.ac-go{max-width:min(92vw,360px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-goscore{display:flex;gap:10px;justify-content:center;margin-bottom:8px;font-size:var(--font-size-sm)}',
      '.ac-gos b{font-size:var(--font-size-lg)}',
      '.ac-gos.ac-me{color:var(--accent)}',
      '.ac-goboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;background:color-mix(in srgb,#a16207 22%,var(--surface));border-radius:6px;padding:4px}',
      '.ac-goc{aspect-ratio:1;border:0;background:none;padding:0;display:grid;place-items:center;position:relative;cursor:default}',
      '.ac-goc::after{content:"";position:absolute;inset:0;background:linear-gradient(var(--border),var(--border)) center/100% 1px no-repeat,linear-gradient(var(--border),var(--border)) center/1px 100% no-repeat;opacity:.5}',
      '.ac-goc i{position:relative;z-index:1;width:82%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-goc.ac-p1 i{background:#111827}',
      '.ac-goc.ac-p2 i{background:#f8fafc;box-shadow:inset 0 0 0 1px #94a3b8}',
      '.ac-goc.ac-can{cursor:pointer}',
      '.ac-goc.ac-can:hover i{background:color-mix(in srgb,var(--accent) 45%,transparent)}',
      '.ac-goc.ac-last i{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-rp{max-width:340px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-rpfoe small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-rplock{font-size:var(--font-size-sm)}',
      '.ac-rpvs{display:flex;gap:12px;justify-content:center;align-items:center;margin:var(--space-lg) 0;font-size:44px}',
      '.ac-rpvs i{font-size:var(--font-size-sm);font-style:normal;color:var(--text-secondary)}',
      '.ac-rphands{display:flex;gap:10px;justify-content:center}',
      '.ac-rph{width:70px;height:70px;font-size:34px;border:2px solid var(--border);border-radius:14px;background:var(--surface);padding:0;cursor:pointer}',
      '.ac-rph.ac-lock{opacity:.3;cursor:default}',
      '.ac-rph.ac-pick{border-color:var(--accent)}',
      '.ac-rpwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-si{max-width:300px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-simsg{min-height:1.6em;font-size:var(--font-size-md);font-weight:600;margin-bottom:var(--space-lg)}',
      '.ac-sipads{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.ac-sip{aspect-ratio:1;border:0;border-radius:14px;opacity:.45;transition:opacity .08s,transform .08s;cursor:pointer}',
      '.ac-sip.ac-lit{opacity:1;transform:scale(1.04)}',
      '.ac-sip:disabled{cursor:default}',
      '.ac-sip:not(:disabled):active{opacity:1}',
      '.ac-sidots{display:flex;gap:4px;justify-content:center;margin:var(--space-lg) 0;flex-wrap:wrap}',
      '.ac-sidots i{width:7px;height:7px;border-radius:50%;background:var(--border)}',
      '.ac-sidots i.ac-on{background:var(--accent)}',
      '.ac-siwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-su{max-width:min(90vw,320px);margin:var(--space-lg) auto;text-align:center}',
      '.ac-suboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:2px solid var(--text-secondary);border-radius:4px;overflow:hidden}',
      '.ac-suc{aspect-ratio:1;border:1px solid var(--border);background:var(--surface);color:var(--accent);font-size:min(6vw,22px);font-weight:600;padding:0;cursor:pointer}',
      '.ac-suc.ac-bl{border-left:2px solid var(--text-secondary)}',
      '.ac-suc.ac-bt{border-top:2px solid var(--text-secondary)}',
      '.ac-suc.ac-given{color:var(--text-primary);background:color-mix(in srgb,var(--accent) 8%,var(--surface));cursor:default}',
      '.ac-suc.ac-pick{background:color-mix(in srgb,var(--accent) 22%,var(--surface))}',
      '.ac-suc.ac-clash{color:#ef4444}',
      '.ac-supad{display:flex;gap:5px;justify-content:center;margin:var(--space-lg) 0;flex-wrap:wrap}',
      '.ac-sun{width:38px;height:38px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font-size:var(--font-size-md);cursor:pointer}',
      '.ac-sun:disabled{opacity:.45;cursor:default}',
      '.ac-suwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-th{max-width:360px;margin:0 auto;text-align:center}',
      '.ac-th canvas{width:100%;aspect-ratio:100/150;border-radius:8px;background:#3d3327}',
      '.ac-thscore{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-thscore i{display:inline-block;width:8px;height:8px;border-radius:50%}',
      '.ac-thscore .ac-now{outline:1px solid var(--accent-color)}',
      '.ac-au{max-width:380px;margin:0 auto;text-align:center}',
      '.ac-aulot{display:flex;flex-direction:column;gap:4px;margin:var(--space-lg) 0}',
      '.ac-aulot span{font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-aulot b{font-size:clamp(44px,14vw,76px);line-height:1;color:var(--accent-color)}',
      '.ac-aumsg{min-height:38px;font-size:var(--font-size-sm)}',
      '.ac-aubid{display:flex;flex-direction:column;gap:8px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-aubid input[type=range]{width:100%}',
      '.ac-aunum{font-size:var(--font-size-xl);font-weight:700}',
      '.ac-auwho{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-auwho i{font-style:normal;color:var(--accent-color)}',
      '.ac-jg{max-width:520px;margin:0 auto;text-align:center}',
      '.ac-jglanes{display:flex;gap:10px;justify-content:center;align-items:flex-end}',
      '.ac-jglane{position:relative;flex:1 1 0;max-width:78px;height:min(46vh,240px);border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);overflow:hidden}',
      '.ac-jglane.ac-me{border-color:var(--accent-color);border-width:2px}',
      '.ac-jglane.ac-dead{opacity:.35}',
      '.ac-jgband{position:absolute;left:0;right:0;bottom:0;background:var(--accent-color);opacity:.16}',
      '.ac-jgball{position:absolute;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--accent-color)}',
      '.ac-jgtag{position:absolute;left:0;right:0;bottom:2px;font-size:10px;color:var(--text-secondary)}',
      '.ac-jgkick{width:min(100%,320px);margin:var(--space-lg) 0;padding:18px;font-size:var(--font-size-lg)}',
      '.ac-jgmsg{font-size:var(--font-size-xs);color:var(--text-secondary);min-height:18px}',
      '.ac-yu{max-width:420px;margin:0 auto;text-align:center}',
      '.ac-yuboard{position:relative;width:min(80vw,340px);aspect-ratio:1;margin:24px auto}',
      '.ac-yuboard::before,.ac-yuboard::after{content:"";position:absolute;inset:0;border:2px solid var(--border-color)}',
      '.ac-yuboard::after{border:0;background:linear-gradient(to bottom right,transparent calc(50% - 1px),var(--border-color) 50%,transparent calc(50% + 1px)),linear-gradient(to bottom left,transparent calc(50% - 1px),var(--border-color) 50%,transparent calc(50% + 1px))}',
      '.ac-yun{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid var(--border-color);background:var(--bg-primary);display:flex;align-items:center;justify-content:center;gap:1px}',
      '.ac-yun.ac-big{width:30px;height:30px;margin:-15px 0 0 -15px;border-color:var(--accent-color)}',
      '.ac-yup{width:9px;height:9px;border-radius:50%;display:inline-block}',
      '.ac-p0{background:#ef4444}.ac-p1{background:#3b82f6}.ac-p2{background:#22c55e}.ac-p3{background:#eab308}',
      '.ac-yumsg{min-height:24px;font-size:var(--font-size-sm)}',
      '.ac-yuctl{display:flex;gap:8px;justify-content:center;margin:var(--space-md) 0}',
      '.ac-yuwho .ac-now{outline:1px solid var(--accent-color)}',
      '.ac-today{margin:var(--space-md) 0}',
      '.ac-todaystrip{display:flex;gap:8px;flex-wrap:wrap}',
      '.ac-todaycard{display:flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid var(--accent-color);border-radius:10px;background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-todaycard span{font-size:20px}',
      '.ac-todaycard.ac-done{opacity:.55;border-color:var(--border-color)}',
      '.ac-streak{margin-left:8px;font-size:var(--font-size-xs);color:var(--accent-color)}',
      '.ac-level{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-level button{padding:4px 10px;font-size:var(--font-size-xs);border:1px solid var(--border-color);border-radius:999px;background:var(--bg-secondary)}',
      '.ac-level button.ac-on{background:var(--accent-color);color:#fff;border-color:var(--accent-color)}',
      '.ac-level small{color:var(--text-secondary);font-size:11px}',
      '.ac-intro{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--bg-primary);text-align:center;padding:var(--space-lg)}',
      '.ac-introicon{font-size:44px}',
      '.ac-introname{font-size:var(--font-size-xl);font-weight:800}',
      '.ac-introdesc{font-size:var(--font-size-sm);color:var(--text-secondary);max-width:22em}',
      '.ac-introcount{font-size:clamp(48px,16vw,84px);font-weight:800;color:var(--accent-color);line-height:1}',
      '.ac-stage{position:relative;min-height:300px}',
      '.ac-fl{max-width:760px;margin:0 auto}',
      '.ac-flmsg{text-align:center;font-size:var(--font-size-sm);min-height:22px}',
      '.ac-flgrids{display:flex;flex-wrap:wrap;gap:var(--space-lg);justify-content:center}',
      '.ac-flone{flex:0 0 auto}',
      '.ac-flone.ac-dead{opacity:.45}',
      '.ac-flname{font-size:var(--font-size-xs);text-align:center;margin-bottom:4px}',
      '.ac-flone.ac-me .ac-flname{color:var(--accent-color)}',
      '.ac-flboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:1px;width:min(46vw,220px)}',
      '.ac-flc{aspect-ratio:1;padding:0;border:1px solid var(--border-color);background:var(--bg-secondary);border-radius:2px}',
      '.ac-flc.ac-ship{background:var(--text-secondary)}',
      '.ac-flc.ac-miss{background:var(--bg-tertiary);opacity:.6}',
      '.ac-flc.ac-hit{background:#ef4444}',
      '.ac-flc.ac-lastshot{outline:2px solid var(--accent-color)}',
      '.ac-nu{max-width:320px;margin:var(--space-lg) auto;text-align:center}',
      '.ac-nunum{font-size:clamp(60px,20vw,110px);font-weight:800;line-height:1}',
      '.ac-nubtn{width:100%;margin:var(--space-lg) 0;font-size:var(--font-size-lg);padding:16px}',
      '.ac-nulog{min-height:70px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-nul{padding:2px 0}',
      '.ac-nul.ac-clash{color:#ef4444}',
      '.ac-nuwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-code{font-size:clamp(28px,8vw,48px);font-weight:800;letter-spacing:.18em;text-align:center;margin:var(--space-lg) 0}',
      '.ac-share{display:flex;gap:6px;margin:var(--space-lg) 0}',
      '.ac-share input{flex:1;min-width:0}'
    ].join('\n');
    document.head.appendChild(el);
  }

  /** 방 이름 — 짧고, 헷갈리는 글자(0/O, 1/I)는 뺀다. */

  function draw(container: HTMLElement): void {
    injectStyles();
    if (typeof Mdd !== 'undefined') Mdd?.linePreset?.('tool_run', { msg: t('arcade.mdd') });

    container.innerHTML =
      '<div id="acLobby">' +
      '<p class="tool-status">' + esc(t('arcade.lobby.hint')) + '</p>' +
      '<div class="ac-today" id="acToday"></div>' +
      '<div class="ac-level" id="acLevel" role="group" aria-label="' + esc(t('arcade.level.aria')) + '">' +
      ['mild', 'normal', 'spicy']
        .map((v) => '<button data-level="' + v + '">' + esc(t('arcade.level.' + v)) + '</button>')
        .join('') +
      '<small>' + esc(t('arcade.level.note')) + '</small></div>' +
      '<div id="acGames"></div>' +
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
      '<div class="ac-stage" id="acStage">' +
      '<div class="ac-intro" id="acIntro" style="display:none">' +
      '<div class="ac-introicon" id="acIntroIcon"></div>' +
      '<div class="ac-introname" id="acIntroName"></div>' +
      '<div class="ac-introdesc" id="acIntroDesc"></div>' +
      '<div class="ac-introcount" id="acIntroNum"></div>' +
      '<div class="ac-introskip" id="acIntroSkip"></div>' +
      '</div>' +
      '<div id="acView"></div>' +
      '</div>' +
      '<div class="tool-status" id="acStatus"></div>' +
      '<div style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      '<button class="btn btn-ghost" id="acQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      '<button class="btn btn-ghost" id="acSound" aria-pressed="true" title="' + esc(t('arcade.btn.sound')) + '">🔊</button>' +
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

    /* ── 로비 ──────────────────────────────────────────────────────
     *
     * **갈래로 묶어 보여 준다.** 스물이 넘으면 나열은 목록이 아니라 벽이 된다.
     * 갈래가 비어 있으면 제목 자체를 안 그린다 — 「없음」이 적힌 칸은 자리만 먹는다. */
    const cardOf = (g: (typeof GAMES)[number]): string => {
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
    };

    /* 오늘의 세 판 — 51개 앞에서 「뭘 하지」를 대신 정해 준다 (TASK-KL-264). */
    const picks = todayPicks(GAMES.map((g) => ({ id: g.id, kind: kindOf(g.id) })));
    const paintToday = (): void => {
      const st = dailyState();
      $<HTMLElement>('#acToday').innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.today.title')) +
        ' <i>' + st.done.length + '/' + PICKS + '</i>' +
        (st.streak > 0 ? '<b class="ac-streak">🔥 ' + esc(t('arcade.today.streak', { n: String(st.streak) })) + '</b>' : '') +
        '</h3>' +
        '<div class="ac-todaystrip">' +
        picks
          .map((id) =>
            /* 표를 따로 쓴다 — `data-solo` 를 쓰면 「게임 몇 종인가」를 세는 자리가 셋만큼 샌다(실측 54종). */
            '<button class="ac-todaycard' + (st.done.includes(id) ? ' ac-done' : '') + '" data-today="' + id + '">' +
            '<span>' + iconOf(id) + '</span>' + esc(t('arcade.game.' + id + '.name')) +
            (st.done.includes(id) ? ' ✓' : '') + '</button>')
          .join('') +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('.ac-todaycard').forEach((b) => {
        b.onclick = (): void => {
          remember();
          startSolo(String(b.dataset.today));
        };
      });
    };
    paintToday();

    $<HTMLElement>('#acGames').innerHTML = KINDS.map((kind: Kind) => {
      const mine = GAMES.filter((g) => kindOf(g.id) === kind);
      if (!mine.length) return '';
      return (
        '<h3 class="ac-kind">' + esc(t('arcade.kind.' + kind)) + ' <i>' + mine.length + '</i></h3>' +
        '<div class="ac-grid">' + mine.map(cardOf).join('') + '</div>'
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
    /** 봇 세기 — 고른 것은 이 브라우저에만 남는다. */
    const LEVEL_KEY = 'karmolab.arcade.level';
    const levelNow = (): BotLevel => {
      try {
        const v = localStorage.getItem(LEVEL_KEY);
        if (v === 'mild' || v === 'spicy' || v === 'normal') return v;
      } catch {
        /* 못 읽으면 보통 */
      }
      return 'normal';
    };

    /** 이번 판의 끝소리를 이미 울렸나 — 매 프레임 울리면 소리가 아니라 경적이 된다. */
    let ended = false;
    /** 마지막으로 소리를 낸 판 번호 */
    let soundedRound = -1;

    /** 손님 쪽엔 커널이 없다. 주인이 보낸 판을 들고 그린다. */
    let shadow: { v: MatchView<unknown>; now: number; at: number } | null = null;

    function paint(v: MatchView<unknown>, now: number): void {
      /* 지금 이 창이 **들고 있는 판**을 밖에서 볼 수 있게 둔다 (TASK-KL-264).
         감추기가 새는지는 화면으로 못 잡는다 — 화면은 남의 배를 애초에 안 그리므로,
         새어도 그림은 똑같다(일부러 새게 해 보고 검사가 안 빨개지는 것을 확인했다).
         새는 자리는 「보낸 값」이라 받은 값을 직접 읽어야 한다. 이 창이 이미 가진 것이므로
         내보낸다고 더 알려지는 것은 없다. */
      (window as unknown as { __arcade?: unknown }).__arcade = { game: gameId, mySeat, state: v.state };
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
        if (!ended) {
          ended = true;
          /* 이긴 판만 세지 않는다 — 이겨야 세면 봇 세기를 순한맛으로 낮추는 놀이가 된다. */
          markPlayed(gameId, picks);
          paintToday();
          const mine = v.seats[mySeat]?.score ?? 0;
          blip(win.length === v.seats.length ? 'good' : mine === top ? 'win' : 'lose');
        }
      } else if (v.note) {
        say(t(v.note.key, v.note.params));
      } else {
        if (v.round !== soundedRound) {
          soundedRound = v.round;
          blip('start');
        }
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
      /* 놀이마다 소리를 붙이지 않는다 — **손이 지나가는 자리가 여기 하나**라, 여기서 울리면
         51개가 한꺼번에 소리를 얻는다(게임 파일은 소리를 몰라도 된다). */
      blip('tap');
      if (match) match.dispatch(mySeat, a);
      else net?.act({ a: a as Json });
    }

    function beginMatch(id: string, seats: SeatSpec[], seed: number): void {
      const g = gameById(id);
      if (!g) return;
      gameId = id;
      mySeat = 0;
      ended = false;
      soundedRound = -1;
      /* 빈 자리를 **이름 있는 사람**으로 채운다 (TASK-KL-264). 커널이 채우면 「봇 1」이 되는데,
         그건 자리를 채운 것이지 같이 논 것이 아니다. 손버릇도 여기서 정해 판 내내 지킨다. */
      const need = Math.max(0, g.seats[0] - seats.length);
      const crew = pickBots(need);
      const personas: Record<number, BotPersona> = {};
      crew.forEach((b, i) => {
        personas[seats.length + i] = b;
      });
      const withCrew: SeatSpec[] = [...seats, ...crew.map((b) => ({ name: b.name, bot: true }))];
      match = new Match(withBotLevel(g, levelNow(), personas), seed, withCrew) as Match<unknown, unknown>;
      shadow = null;
      mountView(id);
      againBtn.style.display = 'none';
      show('play');
      t0 = performance.now();
      cancelAnimationFrame(raf);
      loop();
      Toolbox.trackUse?.(id);
    }

    /**
     * 판 시작 3초 (TASK-KL-264).
     *
     * **51개가 한꺼번에 얻는다** — 껍데기에서 하니 게임 파일은 이걸 모른다. 규칙 한 줄은
     * 로비에 이미 적혀 있는 그 문장을 그대로 쓴다(두 벌 적으면 갈라진다).
     *
     * 왜 3초인가: 처음 여는 놀이는 규칙을 읽을 틈이 있어야 하고, 두 번째부터는 그 3초가
     * 「이제 시작한다」는 신호가 된다. 커널은 이 시간 동안 아예 안 돈다 — 덮개를 씌운 채로
     * 시계를 돌리면 반응 측정 같은 놀이는 시작하자마자 지고 있다.
     */
    /** 세는 중에 나가면 물린다 — 안 그러면 로비로 돌아간 뒤에 판이 저 혼자 시작한다(실측). */
    let dropIntro: (() => void) | null = null;

    function withIntro(id: string, go: () => void): void {
      const introEl = $<HTMLElement>('#acIntro');
      const numEl = $<HTMLElement>('#acIntroNum');
      $<HTMLElement>('#acIntroIcon').textContent = iconOf(id);
      $<HTMLElement>('#acIntroName').textContent = t('arcade.game.' + id + '.name');
      $<HTMLElement>('#acIntroDesc').textContent = t('arcade.game.' + id + '.desc');
      introEl.style.display = '';
      $<HTMLElement>('#acIntroSkip').textContent = t('arcade.intro.skip');
      let left = 3;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        window.clearInterval(tick);
        introEl.style.display = 'none';
        introEl.onclick = null;
        go();
      };
      /* 두 번째부터는 규칙을 이미 안다 — 누르면 바로 시작한다. */
      introEl.onclick = finish;
      dropIntro = (): void => {
        done = true;
        window.clearInterval(tick);
        introEl.style.display = 'none';
        introEl.onclick = null;
      };
      numEl.textContent = String(left);
      blip('start');
      const tick: number = window.setInterval(() => {
        left -= 1;
        if (left > 0) {
          numEl.textContent = String(left);
          blip('tap');
          return;
        }
        finish();
      }, 900);
      Toolbox.onDispose?.(() => window.clearInterval(tick));
    }

    /** 혼자 — 그물망 없이 커널만. 빈 자리는 봇이 앉는다. */
    function startSolo(id: string): void {
      net?.leave();
      net = null;
      show('play');
      withIntro(id, () => beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now()))));
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
      const code = makeCode();
      gameId = id;
      peers = [];
      show('wait');
      $<HTMLInputElement>('#acUrl').value = inviteLink('arcade', code);
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
      show('play');
      withIntro(gameId, () => beginMatch(gameId, seats, seedFrom(gameId + String(Date.now()))));
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
      dropIntro?.();
      dropIntro = null;
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

    /* 봇 세기 고르기 — 판을 시작할 때 규칙 겉에 씌운다. */
    const paintLevel = (): void => {
      const now = levelNow();
      container.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.level === now ? 'true' : 'false');
        b.className = b.dataset.level === now ? 'ac-on' : '';
      });
    };
    container.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
      b.onclick = () => {
        try {
          localStorage.setItem(LEVEL_KEY, String(b.dataset.level));
        } catch {
          /* 못 적어도 이 판에는 적용된다 */
        }
        paintLevel();
        blip('tap');
      };
    });
    paintLevel();

    /* 소리 끄기 — 껐다 켠 것은 이 브라우저에만 남는다. */
    const soundBtn = $<HTMLButtonElement>('#acSound');
    const paintSound = (): void => {
      soundBtn.textContent = soundOn() ? '🔊' : '🔇';
      soundBtn.setAttribute('aria-pressed', soundOn() ? 'true' : 'false');
    };
    paintSound();
    soundBtn.onclick = () => {
      setSoundOn(!soundOn());
      paintSound();
      if (soundOn()) blip('good');
    };
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
