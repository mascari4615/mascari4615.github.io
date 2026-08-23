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
import { CARDS, cardById } from './catalog-meta.generated';
import { ensureGame, gameById } from './loader';
import { Match, type MatchView, type SeatSpec } from './kernel';
import { seedFrom } from './rng';
import { iconOf, kindOf } from './meta';
import { viewById, view3dById, ensureView3d } from './loader';
import { makeCode, inviteLink } from '../../lib/room';
import { blip, soundOn, setSoundOn } from '../../lib/blip';
import { buzz } from '../../lib/haptic';
import { pickBots, withBotLevel, type BotLevel, type BotPersona } from './bots';
import { todayPicks, dailyState, markPlayed, PICKS } from './daily';
import { soloPlays, inAppTool, type SoloPlay } from './solo';
import { loadPacks } from '../pack-store';
import { courseSteps, courseRun } from '../play-course';
import { lengthOf, secondsOf } from './length';
import { readPlays, notePlay, noteBest, bestOf } from './plays';
import { withGhost, GHOST_NAME } from './ghost';
import { fold, deal, turnOf, letterLink, letterFromUrl, type Letter } from './mail';
import { split, isTeamy, teamScores, TEAM_NAMES, type Plan } from './teams';
import { listRooms, holdRoom, type OpenRoom } from './open-rooms';
import { matches } from './pick6';
import { ranks } from './rank';
import { intervalWhileVisible } from '../../lib/tick';
import { record, type Tape } from './replay';
import { forWatcher } from './spectate';
import { pickGames, award, isOver, ROUNDS, type TourState } from './tour';
import { PARTY, partySize } from './seating';
import type { Render } from './views';
import { connect, type Net, type Peer, type Json } from './net';

declare const Toolbox: {
  register: (w: unknown) => void;
  onDispose?: (fn: () => void) => void;
  trackUse?: (s: string) => void;
  copyText?: (s: string, o?: { message?: string }) => Promise<void>;
  /** 앱 안 도구로 화면만 바꾼다 (혼자 놀이로 건너갈 때 — TASK-KL-313). */
  switchPage?: (id: string) => void;
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
      /**
       * ── 오락실 로비 = 진열장 (change.arcade-redesign) ──
       *
       * 로비만 테마와 무관하게 **따뜻한 상아색 탁자**다. 어두운 방에서도 진열장에는 불이
       * 켜져 있는 것 — 그게 이 방의 정체성이다. 판(무대) 화면은 테마를 그대로 따른다.
       *
       * 안쪽 요소(찾기·오늘의 세 판·혼자 놀이·표)는 전부 토큰을 쓰므로, 여기서 토큰만
       * 상아 팔레트로 덮으면 로비 전체가 한 번에 따라온다. 다크에서 밝은 글자가 상아 위에
       * 얹히는 사고를 토큰 층에서 막는다.
       */
      /**
       * ── 무대 어휘 (단계 3) — 판은 재질로 만든다 ──
       * 51판이 각자 색을 정하는 대신 여기 있는 재질·그림자만 조립한다.
       * 나무 = 판놀이, 펠트 = 카드·당구, 종이 = 점수표. 조각(돌·공)은 좌상단 하이라이트
       * + 바닥 그림자 한 규칙.
       */
      '.ac-root{' +
      '--ac-wood:repeating-linear-gradient(93deg,rgba(150,105,55,.13) 0 2px,rgba(150,105,55,0) 2px 9px),repeating-linear-gradient(88deg,rgba(110,72,32,.09) 0 1px,rgba(110,72,32,0) 1px 23px),linear-gradient(160deg,#e8bd7f 0%,#dfae6c 45%,#cf9a55 100%);' +
      '--ac-wood-line:rgba(92,61,24,.5);' +
      '--ac-felt:repeating-linear-gradient(74deg,rgba(0,0,0,.045) 0 2px,rgba(0,0,0,0) 2px 5px),linear-gradient(180deg,#17694f 0%,#125540 55%,#0d422f 100%);' +
      '--ac-paper:linear-gradient(168deg,#ffffff 0%,#fbf8f2 62%,#f0ebe0 100%);' +
      '--ac-sh-rest:0 3px 5px rgba(60,40,16,.4);' +
      '--ac-sh-lift:0 14px 22px rgba(20,24,20,.35);' +
      '--ac-stone-b:radial-gradient(circle at 34% 28%,#6e6a66 0%,#262422 42%,#100f0e 100%);' +
      '--ac-stone-w:radial-gradient(circle at 34% 28%,#ffffff 0%,#f3efe6 45%,#cfc7b8 100%);' +
      /* 카드 한 벌 — 같은 카드가 판마다 7가지 치수였다(64×88·64×90·52×72·44×62·38×52·34×48·34×46).
         종이는 한 종류다: 치수·모서리·뒷면을 여기서 한 번 정하고 열여섯 판이 같이 쓴다. */
      '--ac-card-w:64px;--ac-card-h:90px;--ac-card-r:9px;' +
      '--ac-card-face:linear-gradient(168deg,#ffffff 0%,#fbf8f2 62%,#f0ebe0 100%);' +
      '--ac-card-back:repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 4px,rgba(255,255,255,0) 4px 8px),linear-gradient(150deg,#2f6f5e 0%,#245647 100%);' +
      '--ac-card-sh:0 6px 12px rgba(10,40,30,.3),inset 0 0 0 1px rgba(20,40,32,.1);' +
      '--ac-red:#c62f36;--ac-black:#23201c' +
      '}',
      /* 카드 부품 — 앞면/뒷면/낼 수 있음/집은 것. 판마다 `.ac-card2`(짝 맞추기)처럼 제 이름이
         있던 것을 이 한 벌로 모은다. 크기가 다를 이유가 있는 판만 --ac-card-w 를 덮어쓴다. */
      '.ac-root .ac-pc{position:relative;width:var(--ac-card-w);height:var(--ac-card-h);border:0;border-radius:var(--ac-card-r);background:var(--ac-card-face);box-shadow:var(--ac-card-sh);color:var(--ac-black);font-weight:700;padding:0;cursor:default;transition:transform var(--transition-fast)}',
      '.ac-root .ac-pc.ac-red{color:var(--ac-red)}',
      '.ac-root .ac-pc.ac-back{background:var(--ac-card-back);color:transparent}',
      '.ac-root .ac-pc.ac-can{cursor:pointer}',
      '.ac-root .ac-pc.ac-can:hover{transform:translateY(-6px)}',
      '.ac-root .ac-pc.ac-pick{transform:translateY(-10px);box-shadow:0 14px 22px rgba(10,40,30,.38),inset 0 0 0 2px #ffd66b}',
      /* 못 내는 카드도 **종이는 종이다** — 투명하게 만들면 펠트가 비쳐 카드가 사라진다(실측).
         흐린 것은 글자다: 종이는 그대로 두고 잉크만 옅게. */
      '.ac-root .ac-pc:disabled{cursor:default}',
      '.ac-root .ac-pc.ac-dim{color:#9a958c}',
      '.ac-root .ac-pc.ac-dim .ac-pcm{opacity:.55}',
      /* 모서리 두 곳 + 가운데 큰 무늬 — 진짜 카드의 읽는 법이다. */
      '.ac-root .ac-pc .ac-pcc{position:absolute;left:7px;top:5px;font-size:15px;line-height:1.05;text-align:center}',
      '.ac-root .ac-pc .ac-pcc.ac-br{left:auto;top:auto;right:7px;bottom:5px;transform:rotate(180deg)}',
      '.ac-root .ac-pc .ac-pcs{display:block;font-size:13px}',
      '.ac-root .ac-pc .ac-pcm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:36px;line-height:1}',
      '.ac-root #acLobby{background:radial-gradient(ellipse 120% 90% at 50% 18%,#f2f1e8 0%,#e9e8de 60%,#dedcd0 100%);border-radius:18px;padding:20px 28px 28px;color:#3c3a30;' +
      '--text-primary:#3c3a30;--text-secondary:#8b897b;--text-tertiary:#a5a396;--bg-primary:#fdfcf7;--bg-secondary:#f4f3ea;--bg-tertiary:#e4e2d6;--bg-hover:#efeee4;--border:rgba(60,58,48,.16);--border-hover:rgba(60,58,48,.3);' +
      '--accent:#3c3a30;--accent-fg:#fdfcf7;--accent-hover:#55523f;--accent-dim:rgba(60,58,48,.08);--accent-subtle:rgba(60,58,48,.05);--accent-glow:rgba(60,58,48,.18)}',
      '.ac-root #acLobby .btn-primary{background:#3c3a30;background-image:none;color:#fdfcf7;border-color:transparent}',
      '.ac-root #acLobby .btn-primary:hover{background:#55523f;background-image:none}',
      '.ac-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 var(--space-md)}',
      '.ac-brand{font-size:15px;font-weight:900;letter-spacing:3px;color:#8b897b}',
      '.ac-sub{font-size:12px;color:#a5a396}',
      '.ac-top .ac-find{flex:1;min-width:180px;margin:0}',
      '.ac-namechip{display:flex;align-items:center;gap:6px;font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap}',
      '.ac-namechip input{width:110px;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--bg-primary);color:var(--text-primary)}',
      /* ── 진열장 — 물건은 끝을 맞춰(align-items:end) 같은 바닥에 선다. */
      '.ac-shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:22px 8px;align-items:end;justify-items:center;margin:26px auto var(--space-md);max-width:1060px;min-height:180px}',
      '.ac-obj{position:relative;display:flex;flex-direction:column;align-items:center;background:none;border:0;padding:0;line-height:1;cursor:pointer;transition:transform var(--transition-fast)}',
      '.ac-obj:hover,.ac-obj:focus-visible{transform:translateY(-3px);z-index:2}',
      '.ac-obj:focus-visible{outline:none}',
      /* 바닥 반사는 얼굴에만 — 이름까지 물에 비치면 안 된다. 이름은 반사 아래 값표처럼. */
      '.ac-objface{display:block;filter:drop-shadow(0 3px 4px rgba(60,58,48,.18));-webkit-box-reflect:below -8px linear-gradient(transparent 58%,rgba(0,0,0,.16))}',
      '.ac-objname{margin-top:16px;font-size:11.5px;font-weight:700;color:#8b897b;font-family:var(--font-sans);line-height:1.3;text-align:center;max-width:96px;word-break:keep-all}',
      '.ac-obj:hover .ac-objname,.ac-obj:focus-visible .ac-objname{color:#3c3a30}',
      /* ── 집은 물건 — 탁자 가운데로. */
      '#acDetail{position:relative;padding:6px 0 20px}',
      '.ac-back{background:none;border:0;padding:4px 0;font-size:14px;font-weight:700;color:#8b897b;cursor:pointer}',
      '.ac-back:hover{color:#3c3a30}',
      '.ac-dwrap{display:flex;align-items:center;justify-content:center;gap:64px;padding:34px 10px;flex-wrap:wrap}',
      '.ac-dface{font-size:140px;line-height:1;filter:drop-shadow(0 10px 14px rgba(60,58,48,.25));-webkit-box-reflect:below -16px linear-gradient(transparent 60%,rgba(0,0,0,.14))}',
      '.ac-dinfo{max-width:400px}',
      '.ac-dinfo h3{display:flex;align-items:center;gap:10px;font-size:32px;font-weight:900;margin:0}',
      '.ac-dinfo h3 i{font-style:normal;background:#3c3a30;color:#fdfcf7;font-size:13px;font-weight:900;padding:5px 9px;border-radius:6px}',
      '.ac-dinfo p{font-size:var(--font-size-sm);color:#6d6b5d;line-height:1.7;margin:10px 0 0}',
      '.ac-dmeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
      '.ac-dmeta span{background:#fdfcf7;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:700;color:#5b5949;box-shadow:0 1px 3px rgba(60,58,48,.12)}',
      '#acDetail .ac-go{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}',
      '#acDetail .ac-go button{border:0;border-radius:999px;padding:13px 30px;font-size:15px;font-weight:900;cursor:pointer;white-space:nowrap}',
      '#acDetail .ac-go button[data-solo]{background:#3c3a30;color:#fdfcf7;box-shadow:0 4px 10px rgba(60,58,48,.28)}',
      '#acDetail .ac-go button[data-host]{background:#fdfcf7;color:#3c3a30;box-shadow:0 2px 6px rgba(60,58,48,.15)}',
      '#acDetail .ac-go button:hover{filter:brightness(1.06);transform:translateY(-1px)}',
      '#acDetail .ac-more{display:flex;gap:16px;margin-top:14px}',
      '#acDetail .ac-more button{background:none;border:0;padding:0;font-size:12.5px;color:#8b897b;text-decoration:underline;cursor:pointer}',
      '#acDetail .ac-more button:hover{color:#3c3a30}',
      /* ── 진열장 아래 딸린 것들(혼자 놀이·표)은 낮은 흰 받침으로. */
      '.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:var(--space-md) 0 var(--space-lg)}',
      '.ac-emoji{font-size:26px;line-height:1}',
      '.ac-foot{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:var(--space-lg);flex-wrap:wrap}',
      '@media (prefers-reduced-motion:reduce){.ac-obj,.ac-todaycard,.ac-solocard{transition:none}.ac-introicon{animation:none}}',
      /**
       * 무대 크기 — **이 한 줄이 51개 화면의 크기를 정한다** (TASK-KL-314).
       *
       * 셋 중 제일 작은 값을 쓴다: 가로 여유 · **세로 여유** · 상한.
       * 세로를 안 넣었더니 노트북·와이드에서 무대가 폰에서 온 460px 에 갇혀 세로의 절반만
       * 쓰고 있었다(실측 — 1920 화면에서도 오목 칸이 폰과 같은 49px). 큰 화면에서 판이
       * 작은 것은 「화면이 남는다」가 아니라 그냥 안 보이는 것이다.
       *
       * 세로 몫이 58vh 인 이유: 72vh 로 뒀더니 노트북(1280×900)에서 **「나가기」 단추가 화면
       * 밖으로 밀렸다**(단추 끝 977 > 900). 판이 큰 대가로 판을 못 나가는 것은 남는 장사가
       * 아니다. 58vh 면 41px 여유로 들어가고 칸은 49px → 56px 로 는다(실측).
       * 더 키우고 싶으면 풀스크린이 그 자리다 — 거기서는 단추가 아예 없다.
       */
      ':root{--ac-stage:min(94vw,58vh,640px)}',
      /* 무대에 옅은 판때기 — 게임이 노는 자리가 로비와 구별된다 (크기 계약은 아래 § 그대로). */
      '.ac-stage{text-align:center;padding:var(--space-lg) 0;background:color-mix(in srgb,var(--accent) 4%,var(--bg-primary));border-radius:20px}',
      /* ★ 세로로 긴 캔버스 판의 **세로 상한** (실측: 컬링 1900px · 당구 1393px 가 1274px
         화면을 뚫었다). 캔버스에 직접 걸면 안 된다 — 그리기 코드가 래퍼의 clientWidth 로
         해상도를 정하므로(위 view 들), **래퍼 폭**을 판 비율(W/H)만큼 좁혀 준다.
         62vh × (W/H) = 세로가 62vh 를 넘지 않는 폭. 눕힘·전체화면에서도 vh 라 같이 준다. */
      '.ac-root .ac-cl{max-width:min(100%,calc(62vh*.385))}' /* 컬링 100:260 */,
      '.ac-root .ac-pl{max-width:min(100%,calc(62vh*.556))}' /* 당구 100:180 */,
      '.ac-root .ac-ah{max-width:min(100%,calc(62vh*.572))}' /* 에어하키 80:140 */,
      '.ac-root .ac-pg{max-width:min(100%,calc(62vh*.667))}' /* 핑퐁 80:120 */,
      '.ac-order{font-size:clamp(22px,5vw,34px);font-weight:700;min-height:1.4em}',
      '.ac-choices{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:100%;margin:var(--space-lg) auto 0}',
      '.ac-choice{padding:16px 8px;font-size:var(--font-size-lg);font-weight:700;border-radius:10px;border:1px solid var(--border);background:var(--bg-primary);color:inherit;cursor:pointer}',
      '.ac-choice:disabled{cursor:default;opacity:.75}',
      '.ac-choice.ac-right{border-color:#22c55e;box-shadow:inset 0 0 0 1px #22c55e}',
      '.ac-choice.ac-wrong{border-color:#ef4444;opacity:.5}',
      '.ac-bar{height:5px;border-radius:3px;background:var(--border);margin:var(--space-lg) auto 0;max-width:100%;overflow:hidden}',
      '.ac-fill{height:100%;background:var(--accent);width:100%}',
      /* 오목판 = 나무. 글자 돌(●○)은 판정·읽기용으로 두고 투명 처리 — 보이는 돌은 ::after 가 재질로 그린다. */
      '.ac-board{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1;background:var(--ac-wood);padding:10px;box-sizing:border-box;border-radius:10px;box-shadow:0 14px 26px rgba(84,56,22,.28),inset 0 2px 0 rgba(255,240,215,.7),inset 0 -6px 12px rgba(120,78,30,.28)}',
      '.ac-board.ac-waiting{opacity:.85}',
      '.ac-cell{aspect-ratio:1;border:1px solid var(--ac-wood-line);background:transparent;color:transparent;border-radius:0;font-size:min(4vw,20px);line-height:1;padding:0;cursor:pointer;position:relative}',
      '.ac-cell:disabled{cursor:default}',
      '.ac-cell.ac-s1::after,.ac-cell.ac-s2::after{content:"";position:absolute;inset:10%;border-radius:50%;box-shadow:var(--ac-sh-rest)}',
      '.ac-cell.ac-s1::after{background:var(--ac-stone-b)}',
      '.ac-cell.ac-s2::after{background:var(--ac-stone-w)}',
      '.ac-cell.ac-last.ac-s1::after,.ac-cell.ac-last.ac-s2::after{outline:2px solid rgba(226,80,60,.9);outline-offset:1px}',
      '.ac-cell:not(:disabled):hover{background:rgba(30,26,20,.12)}',
      /**
       * ── 입체 판 (표현 = 3D) ──
       * 같은 규칙을 눕혀 놓은 판 위에 그린다. WebGL 없이 CSS 원근만 쓴다 —
       * 칸이 여전히 `<button>` 이라 자판 조작·읽는 기계가 그대로 산다.
       * 돌은 판 위로 `translateZ` 만큼 떠 있어 그림자가 판에 진다.
       */
      /* 입체 판일 때는 무대 판때기를 걷는다 — 눕힌 판보다 **앞에** 떠서 위쪽을 가린다(실측). */
      '.ac-stage:has(.ac-b3){background:none}',
      '.ac-b3{perspective:1400px;perspective-origin:50% 42%;max-width:100%;margin:var(--space-lg) auto;padding:6% 0 9%}',
      '.ac-b3tilt{position:relative;transform-style:preserve-3d;transform:rotateX(52deg) rotateZ(-1deg);transition:transform var(--transition-slow)}',
      '.ac-b3:hover .ac-b3tilt{transform:rotateX(46deg) rotateZ(-1deg)}',
      /* 판의 두께 — 옆면이 보여야 바닥에 놓인 것으로 읽힌다. */
      '.ac-b3edge{position:absolute;inset:-10px;border-radius:12px;background:linear-gradient(180deg,#b9832f,#7d5416);transform:translateZ(-16px);box-shadow:0 40px 50px rgba(40,26,8,.45)}',
      /* 판 면도 3D 문맥을 이어야 한다 — 여기서 끊기면 안의 돌이 판과 함께 눕는다(실측). */
      '.ac-b3face{position:relative;transform-style:preserve-3d;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;background:var(--ac-wood);padding:10px;box-sizing:border-box;border-radius:8px;box-shadow:inset 0 2px 0 rgba(255,240,215,.7),inset 0 -6px 12px rgba(120,78,30,.28)}',
      '.ac-b3face.ac-waiting{opacity:.9}',
      '.ac-c3{position:relative;aspect-ratio:1;border:1px solid var(--ac-wood-line);background:transparent;padding:0;cursor:pointer;transform-style:preserve-3d}',
      '.ac-c3:disabled{cursor:default}',
      '.ac-c3 i{position:absolute;inset:12%;border-radius:50%;display:block;opacity:0;transform:translateZ(0)}',
      /**
       * 돌 = 판에서 떠오른 볼록한 알. 위에서 오는 빛을 좌상단에 받는다.
       *
       * ★ 판을 눕힌 각(52도)을 **되돌려 세운다**(rotateX(-52deg)). 안 세우면 돌이 판과 같이
       *   눕어 타원 전병이 된다(실측 — 첫 판이 그랬다). 세워 두면 어느 각에서도 동그란 알이다.
       *   `translateZ` 는 세우기 **뒤에** 곱해야 판 위로 떠오른다 — 순서를 바꾸면 옆으로 민다.
       */
      '.ac-c3.ac-s1 i,.ac-c3.ac-s2 i{opacity:1;transform:translateZ(11px) rotateX(-52deg);box-shadow:0 9px 10px rgba(40,26,8,.45)}',
      '.ac-c3.ac-s1 i{background:var(--ac-stone-b)}',
      '.ac-c3.ac-s2 i{background:var(--ac-stone-w)}',
      '.ac-c3.ac-last i{outline:2px solid rgba(226,80,60,.95);outline-offset:1px}',
      '.ac-c3:not(:disabled):hover{background:rgba(30,26,20,.14)}',
      /* 둘 수 있는 자리 — 아직 알이 아니라 **놓일 자리**라, 작고 반투명하게 판에 붙어 있다. */
      '.ac-c3.ac-can i{opacity:.45;inset:34%;background:rgba(30,26,20,.5);transform:translateZ(2px) rotateX(-52deg)}',
      /* 체커: 어두운 칸 · 왕관 · 집어 든 말 */
      '.ac-c3.ac-dark{background:rgba(92,61,24,.22)}',
      '.ac-c3.ac-king i{box-shadow:0 9px 10px rgba(40,26,8,.45),inset 0 0 0 3px #e8c15a}',
      '.ac-c3.ac-pick i{outline:2px solid rgba(232,193,90,.95);outline-offset:2px}',
      '@media (prefers-reduced-motion:reduce){.ac-b3tilt,.ac-b3:hover .ac-b3tilt{transition:none}}',
      /* 화점 — 나무판의 기준점. 9칸 판에서 네 귀와 한가운데(0-based 2·6 교차, 4,4). */
      /* 화점 — **자리는 판이 정한다**(`board3d.ts` 의 `star`). 여기 칸 번호를 박으면
         칸 수가 다른 판에 엉뚱한 점이 찍힌다(8칸 판에서 실측). 2D 오목판만 아직 번호로 찍는다. */
      '.ac-cell::before,.ac-c3::before{content:"";position:absolute;left:50%;top:50%;width:0;height:0}',
      '.ac-board .ac-cell:nth-child(21)::before,.ac-board .ac-cell:nth-child(25)::before,' +
      '.ac-board .ac-cell:nth-child(41)::before,' +
      '.ac-board .ac-cell:nth-child(57)::before,.ac-board .ac-cell:nth-child(61)::before,' +
      '.ac-c3.ac-star::before' +
      '{width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:rgba(92,61,24,.8)}',
      '.ac-seats{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-seat{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-secondary);font-size:var(--font-size-xs);font-weight:600}',
      '.ac-seat.ac-me{border-color:var(--accent);background:var(--accent-dim)}',
      '.ac-seat b{font-size:var(--font-size-md)}',
      '.ac-four{position:relative;max-width:100%;margin:var(--space-lg) auto}',
      '.ac-four .ac-col{position:absolute;top:0;bottom:0;width:calc(100%/var(--w));border:0;background:none;cursor:pointer;z-index:2;border-radius:8px}',
      '.ac-four .ac-col:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 12%,transparent)}',
      '.ac-four .ac-col:disabled{cursor:default}',
      '.ac-four .ac-col:nth-child(1){left:0}.ac-four .ac-col:nth-child(2){left:calc(100%/var(--w)*1)}.ac-four .ac-col:nth-child(3){left:calc(100%/var(--w)*2)}.ac-four .ac-col:nth-child(4){left:calc(100%/var(--w)*3)}.ac-four .ac-col:nth-child(5){left:calc(100%/var(--w)*4)}.ac-four .ac-col:nth-child(6){left:calc(100%/var(--w)*5)}.ac-four .ac-col:nth-child(7){left:calc(100%/var(--w)*6)}',
      '.ac-fgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:4px}',
      '.ac-disc{aspect-ratio:1;border-radius:50%;background:var(--bg-primary);border:1px solid var(--border)}',
      '.ac-disc.ac-p1{background:#ef4444;border-color:#ef4444}',
      '.ac-disc.ac-p2{background:#eab308;border-color:#eab308}',
      '.ac-disc.ac-last{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-four.ac-waiting{opacity:.75}',
      '.ac-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-width:100%;margin:var(--space-lg) auto}',
      '.ac-mem.ac-waiting{opacity:.75}',
      '.ac-card2{aspect-ratio:3/4;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;font-size:min(7vw,26px);cursor:pointer}',
      '.ac-card2:disabled{cursor:default}',
      '.ac-card2.ac-open{border-color:var(--accent)}',
      '.ac-card2.ac-gone{opacity:.35}',
      '.ac-hb{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-hblist{list-style:none;padding:0;margin:0 0 10px;max-height:230px;overflow:auto;display:flex;flex-direction:column;gap:4px}',
      '.ac-hblist li{display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-variant-numeric:tabular-nums}',
      '.ac-hblist b{letter-spacing:.2em;font-size:var(--font-size-md)}',
      '.ac-hblist span{color:var(--text-secondary);font-size:var(--font-size-xs)}',
      '.ac-hbrow{display:flex;gap:6px}',
      '.ac-hbrow input{flex:1;min-width:0;letter-spacing:.3em;text-align:center;font-size:var(--font-size-lg)}',
      '.ac-rv{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1;background:var(--border);padding:2px;border-radius:6px}',
      '.ac-rv.ac-waiting{opacity:.8}',
      '.ac-rvcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 8%,var(--bg-primary));padding:0;display:grid;place-items:center;cursor:default}',
      '.ac-rvcell i{width:74%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-rvcell.ac-p1 i{background:#111827;box-shadow:inset 0 0 0 1px #374151}',
      '.ac-rvcell.ac-p2 i{background:#f9fafb;box-shadow:inset 0 0 0 1px #d1d5db}',
      '.ac-rvcell.ac-can{cursor:pointer}',
      '.ac-rvcell.ac-can i{width:26%;background:var(--accent);opacity:.55}',
      '.ac-rvcell.ac-last{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-dots{display:grid;gap:0;margin:var(--space-lg) auto;max-width:100%;grid-template-columns:repeat(calc(var(--c)*2+1),auto);justify-content:center}',
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
      '.ac-sp{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-spfoe{color:var(--text-secondary);font-size:var(--font-size-sm);letter-spacing:2px;min-height:1.4em}',
      '.ac-spcenter{display:flex;gap:14px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-spc{width:64px;height:88px;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);color:inherit;font-size:26px;font-weight:700;cursor:default}',
      '.ac-spc.ac-can{border-color:var(--accent);cursor:pointer}',
      '.ac-sphand{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-spcard{width:52px;height:72px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-size:20px;font-weight:700;cursor:default;opacity:.5}',
      '.ac-spcard.ac-can{opacity:1;color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-spcard.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-sl{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-slt{aspect-ratio:1;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-size:min(6vw,22px);font-weight:700;padding:0;cursor:default}',
      '.ac-slt.ac-hole{border-color:transparent;background:none}',
      '.ac-slt.ac-home{color:var(--text-primary)}',
      '.ac-slt.ac-can{cursor:pointer;border-color:var(--accent);color:inherit}',
      '.ac-ut{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-ut.ac-waiting{opacity:.8}',
      '.ac-utsmall{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;padding:3px;border:1px solid var(--border);border-radius:6px}',
      '.ac-utsmall.ac-open{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}',
      '.ac-utcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 6%,var(--bg-primary));color:inherit;font-size:min(2.6vw,13px);line-height:1;padding:0;border-radius:2px;cursor:pointer}',
      '.ac-utcell:disabled{cursor:default}',
      '.ac-utcell.ac-last{outline:1px solid var(--accent)}',
      '.ac-utown{position:absolute;inset:0;display:grid;place-items:center;font-size:min(9vw,44px);pointer-events:none}',
      '.ac-utsmall.ac-took .ac-utcell{opacity:.25}',
      '.ac-yc{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-ycdice{display:flex;gap:8px;justify-content:center}',
      '.ac-ycd{width:52px;height:52px;font-size:34px;line-height:1;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);color:inherit;padding:0;cursor:pointer}',
      '.ac-ycd.ac-keep{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--bg-primary))}',
      '.ac-ycd:disabled{cursor:default;opacity:.7}',
      '.ac-ycbar{display:flex;gap:10px;align-items:center;justify-content:center;margin:var(--space-lg) 0;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-ycsheet{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}',
      '.ac-yccat{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;font-size:var(--font-size-xs);cursor:pointer}',
      '.ac-yccat b{font-variant-numeric:tabular-nums;font-size:var(--font-size-md)}',
      '.ac-yccat.ac-zero{opacity:.5}',
      '.ac-yccat.ac-done{background:color-mix(in srgb,var(--accent) 10%,var(--bg-primary));border-color:var(--accent);cursor:default}',
      '.ac-yccat:disabled{cursor:default}',
      '.ac-yctotal{grid-column:1/-1;margin-top:6px;font-weight:700}',
      '.ac-ck{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1;border:1px solid var(--border);border-radius:6px;overflow:hidden}',
      '.ac-ck.ac-waiting{opacity:.8}',
      '.ac-ckc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--bg-primary));display:grid;place-items:center;cursor:default}',
      '.ac-ckc.ac-dark{background:color-mix(in srgb,var(--accent) 16%,var(--bg-primary))}',
      '.ac-ckc i{width:72%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-ckc.ac-p1 i{background:#e5e7eb;box-shadow:inset 0 0 0 2px #9ca3af}',
      '.ac-ckc.ac-p2 i{background:#7f1d1d;box-shadow:inset 0 0 0 2px #b91c1c}',
      '.ac-ckc.ac-king i{box-shadow:inset 0 0 0 3px var(--accent)}',
      '.ac-ckc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-ckc.ac-can{cursor:pointer}',
      '.ac-ckc.ac-can i{width:28%;background:var(--accent);opacity:.6}',
      '.ac-ckc.ac-last{outline:1px dashed var(--accent);outline-offset:-3px}',
      '.ac-ckc:not(:disabled){cursor:pointer}',
      '.ac-bj{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-bjrow{margin:var(--space-lg) 0}',
      '.ac-bjrow small{display:block;color:var(--text-secondary);font-size:var(--font-size-xs);margin-bottom:6px}',
      '.ac-bjrow>div{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-bjc{width:44px;height:62px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);display:grid;place-items:center;font-size:20px;font-weight:700}',
      '.ac-bjc.ac-back{background:color-mix(in srgb,var(--accent) 22%,var(--bg-primary));color:var(--text-secondary)}',
      '.ac-bjbar{display:flex;gap:8px;justify-content:center}',
      /* 카드 판은 **펠트 위**에서 논다 — 판마다 다른 바닥을 쓰면 열여섯 판이 열여섯 방이 된다. */
      '.ac-root .ac-pr{max-width:100%;margin:var(--space-lg) auto;text-align:center;background:var(--ac-felt);border-radius:18px;padding:var(--space-lg) var(--space-md);box-shadow:inset 0 6px 18px rgba(0,0,0,.34);color:#eaf2ee}',
      '.ac-root .ac-pr small{color:rgba(234,242,238,.7)}',
      /* 바닥에 깔린 짝 — 살짝 겹쳐 던져 놓은 모양(카드마다 tilt). */
      '.ac-prpile{min-height:104px;display:flex;gap:0;justify-content:center;align-items:center}',
      '.ac-prpile .ac-pc{margin-left:-22px}',
      '.ac-prpile .ac-pc:first-child{margin-left:0}',
      /* 내 손패 — 겹쳐 쥔다. 낼 수 있는 것만 떠오른다(`.ac-can:hover`). */
      '.ac-prhand{display:flex;gap:0;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0;padding-top:12px}',
      /* 겹침은 카드 폭의 1/6 만 — 절반을 겹치면 끗수가 가려져 무엇을 드는지 안 보인다(실측). */
      '.ac-prhand .ac-pc{margin-left:calc(var(--ac-card-w) / -6)}',
      '.ac-prhand .ac-pc:first-child{margin-left:0}',
      /* 손패의 「몇 장」은 카드 아래쪽에 작게 — 가운데 큰 글자와 겹치면 둘 다 안 읽힌다. */
      '.ac-prhand .ac-pcm{font-size:30px;top:42%}',
      '.ac-prhand .ac-pcn{position:absolute;left:0;right:0;bottom:8px;font-size:12px;color:#7d776d}',
      '.ac-prc{position:relative;width:44px;height:62px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);display:inline-grid;place-items:center;font-size:19px;font-weight:700;padding:0}',
      '.ac-prc.ac-can{color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-prc:disabled{opacity:.45;cursor:default}',
      '.ac-prc.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-prc i{position:absolute;right:3px;bottom:2px;font-size:10px;font-style:normal;color:var(--text-secondary)}',
      '.ac-prpick{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:var(--space-lg);min-height:1px}',
      '.ac-dmwrap{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-dmline{display:flex;gap:3px;overflow-x:auto;padding:8px 4px;min-height:52px;align-items:center;justify-content:flex-start;border:1px solid var(--border);border-radius:8px;color:var(--text-secondary)}',
      '.ac-dm{display:inline-flex;flex-direction:column;align-items:center;gap:1px;min-width:22px;padding:3px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-primary);font-size:12px;font-weight:700;color:inherit}',
      '.ac-dm i{display:block;width:14px;height:1px;background:var(--border)}',
      '.ac-dmhand{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-dmt{padding:2px;border:1px solid var(--border);border-radius:6px;background:none;cursor:default;opacity:.5}',
      '.ac-dmt.ac-can{opacity:1;border-color:var(--accent);cursor:pointer}',
      '.ac-dmt.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-dmbar{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap}',
      '.ac-cl{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-cl canvas{width:100%;display:block;border:1px solid var(--border);border-radius:8px;background:#eef4fb}',
      '.ac-clbar{display:flex;flex-direction:column;gap:8px;margin-top:var(--space-lg)}',
      '.ac-clbar label{display:flex;align-items:center;gap:8px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-clbar label span{min-width:52px}',
      '.ac-clbar input[type=range]{flex:1}',
      '.ac-bw{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-bw canvas{width:100%;height:300px;display:block;border:1px solid var(--border);border-radius:8px;background:linear-gradient(#0f172a,#1e293b)}',
      '.ac-bwscore{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-bws{padding:4px 10px;border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-xs)}',
      '.ac-bws.ac-me{border-color:var(--accent)}',
      '.ac-pl{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-pl canvas{width:100%;display:block;border-radius:8px}',
      '.ac-dt{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-dt canvas{width:100%;max-width:100%;display:block;margin:0 auto}',
      '.ac-dtleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-dts{padding:4px 10px;border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-xs)}',
      '.ac-dts.ac-me{border-color:var(--accent)}',
      '.ac-ah{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-ah canvas{width:100%;display:block;border-radius:8px;touch-action:none;cursor:none}',
      '.ac-kind{margin:var(--space-xl) 0 10px;font-size:var(--font-size-md);color:var(--text-primary);font-weight:800;display:flex;align-items:center;gap:8px}',
      '.ac-kind i{font-style:normal;font-size:var(--font-size-2xs);font-weight:700;color:var(--accent);background:var(--accent-dim);border-radius:999px;padding:2px 8px}',
      '.ac-hl{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hlcards{display:flex;gap:12px;justify-content:center}',
      '.ac-hlc{width:64px;height:90px;border-radius:10px;border:1px solid var(--border);background:var(--bg-primary);display:grid;place-items:center;font-size:30px;font-weight:700}',
      '.ac-hlnext{color:var(--text-secondary)}',
      '.ac-hlnext.ac-ok{border-color:#22c55e;color:inherit}',
      '.ac-hlnext.ac-no{border-color:#ef4444;color:inherit;opacity:.7}',
      '.ac-hlpot{margin:var(--space-lg) 0;font-size:var(--font-size-lg);font-weight:700}',
      '.ac-hlbar{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-hlleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-nim{display:flex;flex-direction:column;gap:12px;align-items:center;margin:var(--space-lg) auto}',
      '.ac-nimrow{display:flex;gap:7px}',
      '.ac-nims{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg-primary);padding:0;cursor:pointer}',
      '.ac-nims:disabled{cursor:default;opacity:.7}',
      '.ac-nims.ac-take{background:#ef4444;border-color:#ef4444}',
      '.ac-hb2{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hbpiles{display:flex;gap:8px;justify-content:center}',
      '.ac-hbp{width:38px;height:52px;border:2px solid var(--border);border-radius:8px;display:grid;place-items:center;font-size:22px;font-weight:700}',
      '.ac-hbmeta{margin:8px 0 var(--space-lg);font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-hbrow,.ac-hbmine{margin-bottom:var(--space-lg)}',
      '.ac-hbrow small,.ac-hbmine small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      '.ac-hbrow>div,.ac-hbmine>div{display:flex;gap:5px;justify-content:center}',
      '.ac-hbc{position:relative;width:34px;height:46px;border:2px solid var(--border);border-radius:6px;background:var(--bg-primary);font-size:17px;font-weight:700;padding:0;cursor:pointer}',
      '.ac-hbc:disabled{cursor:default;opacity:.75}',
      '.ac-hbc.ac-back{background:color-mix(in srgb,var(--accent) 20%,var(--bg-primary));color:var(--text-secondary)}',
      '.ac-hbc.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-hbc i{position:absolute;right:2px;top:0;font-size:11px;font-style:normal}',
      '.ac-hbact{display:flex;gap:6px;justify-content:center;min-height:32px;align-items:center}',
      '.ac-wc{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-wcchain{display:flex;gap:6px;align-items:center;justify-content:flex-start;overflow-x:auto;padding:8px;border:1px solid var(--border);border-radius:8px;min-height:42px;font-size:var(--font-size-md)}',
      '.ac-wcchain b{color:var(--text-secondary);font-weight:400}',
      '.ac-wclast{font-weight:700;color:var(--accent)}',
      '.ac-wcrow{display:flex;gap:6px;margin-top:var(--space-lg)}',
      '.ac-wcrow input{flex:1;min-width:0;text-align:center;font-size:var(--font-size-md)}',
      '.ac-wcwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-dts.ac-dead{opacity:.4;text-decoration:line-through}',
      '.ac-lu{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-luq{font-size:var(--font-size-lg);font-weight:700;min-height:2.4em;display:grid;place-items:center}',
      '.ac-lubig{font-size:44px;font-weight:800;margin:8px 0}',
      '.ac-lu input[type=range]{width:100%}',
      '.ac-lurow{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-lup{padding:8px 14px;border:1px solid var(--border);border-radius:999px;background:var(--bg-primary);color:inherit;cursor:pointer}',
      '.ac-luline{display:flex;flex-direction:column;gap:4px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-luline span{padding:4px 12px;border:1px solid var(--border);border-radius:8px;font-size:var(--font-size-sm)}',
      '.ac-ms{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-msgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:2px}',
      '.ac-mc{aspect-ratio:1;border:1px solid var(--border);border-radius:3px;background:color-mix(in srgb,var(--accent) 14%,var(--bg-primary));font-size:min(3.6vw,15px);font-weight:700;padding:0;cursor:pointer;touch-action:none}',
      '.ac-mc.ac-open{background:var(--bg-primary);cursor:default}',
      '.ac-mc.ac-flag{color:#ef4444}',
      '.ac-msbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-li{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-libid{font-size:var(--font-size-lg);font-weight:700;min-height:1.8em}',
      '.ac-lidice small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin:8px 0 4px}',
      '.ac-lidice>div{display:flex;gap:6px;justify-content:center}',
      '.ac-lid{font-size:34px;line-height:1}',
      '.ac-liwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-liopts{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-liopt{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-sm)}',
      '.ac-liopt:hover{border-color:var(--accent)}',
      '.ac-tw{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-twhead small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-twhead b{font-size:32px}',
      '.ac-twlog{max-height:160px;overflow:auto;margin:var(--space-lg) 0;display:flex;flex-direction:column;gap:3px}',
      '.ac-twl{padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:var(--font-size-xs);text-align:left}',
      '.ac-twl.ac-no{opacity:.6}',
      '.ac-twqs{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-twq,.ac-twg{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-twg{border-style:dashed}',
      '.ac-twq:hover,.ac-twg:hover{border-color:var(--accent)}',
      '.ac-sn{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-sn canvas{width:100%;display:block;border-radius:8px;touch-action:none}',
      '.ac-os{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-os svg{width:100%;display:block}',
      '.ac-osl{stroke:var(--border);stroke-width:.09;cursor:pointer}',
      '.ac-osl.ac-near{stroke:var(--accent);stroke-width:.13}',
      '.ac-osl.ac-done{stroke:#22c55e;stroke-width:.14;cursor:default}',
      '.ac-osp{fill:var(--text-secondary)}',
      '.ac-osp.ac-at{fill:var(--accent)}',
      '.ac-osbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-fi{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-fi canvas{width:100%;display:block;border-radius:8px}',
      '.ac-fibtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-md)}',
      '.ac-fibtn.ac-bite{animation:acBite .28s infinite alternate}',
      '@keyframes acBite{from{transform:scale(1)}to{transform:scale(1.04)}}',
      '.ac-fibag{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0;min-height:1.4em;font-size:var(--font-size-xs)}',
      '.ac-fibag span{padding:3px 8px;border:1px solid var(--border);border-radius:999px}',
      '.ac-fiwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-sg{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-sgboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;aspect-ratio:1;margin:8px 0}',
      '.ac-sgc{aspect-ratio:1;border:1px solid var(--border);border-radius:3px;background:color-mix(in srgb,#f59e0b 12%,var(--bg-primary));font-size:min(5vw,20px);font-weight:700;padding:0;color:inherit;cursor:pointer}',
      '.ac-sgc.ac-flip{transform:rotate(180deg)}',
      '.ac-sgc.ac-p1{color:#b91c1c}',
      '.ac-sgc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-sgc.ac-can{background:color-mix(in srgb,var(--accent) 26%,var(--bg-primary))}',
      '.ac-sgc.ac-last{border-color:var(--accent)}',
      '.ac-sghand{display:flex;gap:4px;justify-content:center;min-height:30px;flex-wrap:wrap}',
      '.ac-sgh{width:26px;height:26px;border:1px solid var(--border);border-radius:4px;background:var(--bg-primary);color:inherit;font-size:14px;padding:0;cursor:pointer}',
      '.ac-sgh.ac-pick{outline:2px solid var(--accent)}',
      '.ac-hf{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hfrow{margin-bottom:var(--space-lg)}',
      '.ac-hfrow small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      '.ac-hfrow>div{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;min-height:52px}',
      '.ac-hfc{position:relative;width:34px;height:48px;border:2px solid var(--border);border-radius:6px;background:var(--bg-primary);font-size:16px;font-weight:700;padding:0;cursor:pointer}',
      '.ac-hfc:disabled{cursor:default;opacity:.55}',
      '.ac-hfc.ac-can{opacity:1;box-shadow:0 0 0 2px var(--accent)}',
      '.ac-hfc.ac-pick{outline:2px solid var(--accent);outline-offset:2px;opacity:1}',
      '.ac-hfc i{position:absolute;right:2px;bottom:1px;font-size:9px;font-style:normal;opacity:.7}',
      '.ac-hfbar{min-height:32px;display:flex;justify-content:center;align-items:center}',
      '.ac-hfwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-tk{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-tk canvas{width:100%;display:block;border-radius:8px}',
      '.ac-mn{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-mnrow{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}',
      '.ac-mnp{aspect-ratio:1;border:1px solid var(--border);border-radius:50%;background:color-mix(in srgb,#a16207 16%,var(--bg-primary));color:inherit;font-size:var(--font-size-md);padding:0;cursor:pointer}',
      '.ac-mnp:disabled{cursor:default;opacity:.6}',
      '.ac-mnp.ac-land{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-mnp.ac-last{border-color:var(--accent)}',
      '.ac-mnmid{display:flex;align-items:center;gap:8px;margin:8px 0}',
      '.ac-mnstore{flex:0 0 60px;text-align:center;padding:6px;border:1px solid var(--border);border-radius:10px}',
      '.ac-mnstore small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-mnstore b{font-size:var(--font-size-lg)}',
      '.ac-mnhint{flex:1;font-size:var(--font-size-xs);color:var(--text-secondary);text-align:center}',
      '.ac-sh{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
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
      '.ac-fx{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-fxrole{font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:8px}',
      '.ac-fxboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:1px solid var(--border);border-radius:6px;overflow:hidden}',
      '.ac-fxc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--bg-primary));font-size:min(4vw,18px);cursor:default}',
      '.ac-fxc.ac-dark{background:color-mix(in srgb,var(--accent) 18%,var(--bg-primary))}',
      '.ac-fxc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-fxc.ac-can{background:color-mix(in srgb,var(--accent) 40%,var(--bg-primary));cursor:pointer}',
      '.ac-fxc:not(:disabled){cursor:pointer}',
      '.ac-pg{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-pg canvas{width:100%;display:block;border-radius:8px;touch-action:none;cursor:none}',
      '.ac-db{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-dbrow{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:var(--font-size-xs)}',
      '.ac-dbrow.ac-mine .ac-dblane{box-shadow:inset 0 0 0 1px var(--accent)}',
      '.ac-dbrow.ac-won .ac-dblane{background:color-mix(in srgb,#22c55e 25%,var(--bg-primary))}',
      '.ac-dblane{position:relative;flex:1;height:20px;border-radius:10px;background:color-mix(in srgb,#a16207 12%,var(--bg-primary));overflow:hidden}',
      '.ac-dblane i{position:absolute;top:1px;font-style:normal;transition:left .2s linear}',
      '.ac-dbodds{min-width:34px;text-align:right;color:var(--text-secondary)}',
      '.ac-dbbar{margin:var(--space-lg) 0;text-align:center;min-height:40px}',
      '.ac-dbamt{display:flex;align-items:center;gap:8px;justify-content:center;font-size:var(--font-size-xs);margin-bottom:8px}',
      '.ac-dbpick{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}',
      '.ac-dbp{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-dbp:hover{border-color:var(--accent)}',
      '.ac-dbwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-wk{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-wkgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:var(--space-lg) 0}',
      '.ac-wkh{aspect-ratio:1;border:2px solid var(--border);border-radius:50%;background:color-mix(in srgb,#78350f 22%,var(--bg-primary));font-size:min(9vw,34px);padding:0;cursor:pointer;display:grid;place-items:center}',
      '.ac-wkh.ac-up{border-color:#22c55e}',
      '.ac-wkh.ac-bad{border-color:#ef4444}',
      '.ac-wkh span{line-height:1}',
      '.ac-wkwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-tg{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-tgline{position:relative;height:34px;border-radius:17px;background:color-mix(in srgb,#a16207 18%,var(--bg-primary));margin:var(--space-lg) 0}',
      '.ac-tgline i{position:absolute;top:5px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:var(--accent);transition:left .12s}',
      '.ac-tgmsg{min-height:1.5em;font-size:var(--font-size-sm);color:var(--text-secondary)}',
      '.ac-tgmsg.ac-warn{color:#ef4444;font-weight:700}',
      '.ac-tgbtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-lg);padding:14px}',
      '.ac-go{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-goscore{display:flex;gap:10px;justify-content:center;margin-bottom:8px;font-size:var(--font-size-sm)}',
      '.ac-gos b{font-size:var(--font-size-lg)}',
      '.ac-gos.ac-me{color:var(--accent)}',
      '.ac-goboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;background:color-mix(in srgb,#a16207 22%,var(--bg-primary));border-radius:6px;padding:4px}',
      '.ac-goc{aspect-ratio:1;border:0;background:none;padding:0;display:grid;place-items:center;position:relative;cursor:default}',
      '.ac-goc::after{content:"";position:absolute;inset:0;background:linear-gradient(var(--border),var(--border)) center/100% 1px no-repeat,linear-gradient(var(--border),var(--border)) center/1px 100% no-repeat;opacity:.5}',
      '.ac-goc i{position:relative;z-index:1;width:82%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-goc.ac-p1 i{background:#111827}',
      '.ac-goc.ac-p2 i{background:#f8fafc;box-shadow:inset 0 0 0 1px #94a3b8}',
      '.ac-goc.ac-can{cursor:pointer}',
      '.ac-goc.ac-can:hover i{background:color-mix(in srgb,var(--accent) 45%,transparent)}',
      '.ac-goc.ac-last i{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-rp{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-rpfoe small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-rplock{font-size:var(--font-size-sm)}',
      '.ac-rpvs{display:flex;gap:12px;justify-content:center;align-items:center;margin:var(--space-lg) 0;font-size:44px}',
      '.ac-rpvs i{font-size:var(--font-size-sm);font-style:normal;color:var(--text-secondary)}',
      '.ac-rphands{display:flex;gap:10px;justify-content:center}',
      '.ac-rph{width:70px;height:70px;font-size:34px;border:2px solid var(--border);border-radius:14px;background:var(--bg-primary);padding:0;cursor:pointer}',
      '.ac-rph.ac-lock{opacity:.3;cursor:default}',
      '.ac-rph.ac-pick{border-color:var(--accent)}',
      '.ac-rpwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-si{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
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
      '.ac-su{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-suboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:2px solid var(--text-secondary);border-radius:4px;overflow:hidden}',
      '.ac-suc{aspect-ratio:1;border:1px solid var(--border);background:var(--bg-primary);color:var(--accent);font-size:min(6vw,22px);font-weight:600;padding:0;cursor:pointer}',
      '.ac-suc.ac-bl{border-left:2px solid var(--text-secondary)}',
      '.ac-suc.ac-bt{border-top:2px solid var(--text-secondary)}',
      '.ac-suc.ac-given{color:var(--text-primary);background:color-mix(in srgb,var(--accent) 8%,var(--bg-primary));cursor:default}',
      '.ac-suc.ac-pick{background:color-mix(in srgb,var(--accent) 22%,var(--bg-primary))}',
      '.ac-suc.ac-clash{color:#ef4444}',
      '.ac-supad{display:flex;gap:5px;justify-content:center;margin:var(--space-lg) 0;flex-wrap:wrap}',
      '.ac-sun{width:38px;height:38px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:inherit;font-size:var(--font-size-md);cursor:pointer}',
      '.ac-sun:disabled{opacity:.45;cursor:default}',
      '.ac-suwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-th{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-th canvas{width:100%;aspect-ratio:100/150;border-radius:8px;background:#3d3327}',
      '.ac-thscore{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-thscore i{display:inline-block;width:8px;height:8px;border-radius:50%}',
      '.ac-thscore .ac-now{outline:1px solid var(--accent)}',
      '.ac-au{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-aulot{display:flex;flex-direction:column;gap:4px;margin:var(--space-lg) 0}',
      '.ac-aulot span{font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-aulot b{font-size:clamp(44px,14vw,76px);line-height:1;color:var(--accent)}',
      '.ac-aumsg{min-height:38px;font-size:var(--font-size-sm)}',
      '.ac-aubid{display:flex;flex-direction:column;gap:8px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-aubid input[type=range]{width:100%}',
      '.ac-aunum{font-size:var(--font-size-lg);font-weight:700}',
      '.ac-auwho{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-auwho i{font-style:normal;color:var(--accent)}',
      '.ac-jg{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-jglanes{display:flex;gap:10px;justify-content:center;align-items:flex-end}',
      '.ac-jglane{position:relative;flex:1 1 0;max-width:100%;height:min(46vh,240px);border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);overflow:hidden}',
      '.ac-jglane.ac-me{border-color:var(--accent);border-width:2px}',
      '.ac-jglane.ac-dead{opacity:.35}',
      '.ac-jgband{position:absolute;left:0;right:0;bottom:0;background:var(--accent);opacity:.16}',
      '.ac-jgball{position:absolute;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--accent)}',
      '.ac-jgtag{position:absolute;left:0;right:0;bottom:2px;font-size:10px;color:var(--text-secondary)}',
      '.ac-jgkick{width:min(100%,320px);margin:var(--space-lg) 0;padding:18px;font-size:var(--font-size-lg)}',
      '.ac-jgmsg{font-size:var(--font-size-xs);color:var(--text-secondary);min-height:18px}',
      '.ac-yu{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-yuboard{position:relative;width:min(80vw,340px);aspect-ratio:1;margin:24px auto}',
      '.ac-yuboard::before,.ac-yuboard::after{content:"";position:absolute;inset:0;border:2px solid var(--border)}',
      '.ac-yuboard::after{border:0;background:linear-gradient(to bottom right,transparent calc(50% - 1px),var(--border) 50%,transparent calc(50% + 1px)),linear-gradient(to bottom left,transparent calc(50% - 1px),var(--border) 50%,transparent calc(50% + 1px))}',
      '.ac-yun{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid var(--border);background:var(--bg-primary);display:flex;align-items:center;justify-content:center;gap:1px}',
      '.ac-yun.ac-big{width:30px;height:30px;margin:-15px 0 0 -15px;border-color:var(--accent)}',
      '.ac-yup{width:9px;height:9px;border-radius:50%;display:inline-block}',
      '.ac-p0{background:#ef4444}.ac-p1{background:#3b82f6}.ac-p2{background:#22c55e}.ac-p3{background:#eab308}',
      '.ac-yumsg{min-height:24px;font-size:var(--font-size-sm)}',
      '.ac-yuctl{display:flex;gap:8px;justify-content:center;margin:var(--space-md) 0}',
      '.ac-yuwho .ac-now{outline:1px solid var(--accent)}',
      '.ac-today{margin:var(--space-md) 0}',
      '.ac-todaystrip{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      /* 오늘의 세 판 = 빨강 초대장 — 로비에서 제일 먼저 눈이 가는 자리. */
      '.ac-todaycard{display:flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid var(--border);border-radius:999px;background:var(--bg-primary);font-size:var(--font-size-sm);font-weight:700;color:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(60,58,48,.1);transition:transform var(--transition-fast),box-shadow var(--transition-fast)}',
      '.ac-todaycard:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.08)}',
      '.ac-todaycard span{font-size:24px}',
      '.ac-todaycard.ac-done{opacity:.5;border-color:var(--border);font-weight:400}',
      '.ac-tourbtn{align-self:center;width:auto;flex:0 0 auto;border-radius:999px;padding:10px 22px;font-weight:900}',
      '.ac-seat.ac-watch{border-color:var(--accent);color:var(--accent)}',
      '.ac-seat.ac-team0{border-color:#6aa9ff}',
      '.ac-seat.ac-team1{border-color:#ff7a7a}',
      '.ac-letter{margin-top:var(--space-md);padding:10px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-room{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--bg-secondary);margin:var(--space-md) 0;font-size:var(--font-size-sm)}',
      '.ac-over{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:color-mix(in srgb, var(--bg-primary) 88%, transparent);backdrop-filter:blur(2px);border-radius:12px;z-index:3;padding:var(--space-lg)}',
      '.ac-overhead{font-size:var(--font-size-lg);font-weight:700;text-align:center}',
      '.ac-overlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:200px;max-width:100%;width:100%}',
      '.ac-overrow{display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-overrow.ac-me{outline:1px solid var(--accent)}',
      '.ac-overrank{width:1.6em;text-align:center;font-weight:700;color:var(--text-secondary)}',
      '.ac-overname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ac-overscore{font-variant-numeric:tabular-nums;font-weight:600}',
      '.ac-overnote{font-size:var(--font-size-sm);color:var(--text-secondary);text-align:center}',
      '.ac-find{width:100%;max-width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--bg-secondary);color:var(--text-primary);margin:var(--space-md) 0}',
      '.ac-openstrip{display:flex;gap:8px;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-opencard{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-opencard span{font-size:18px}',
      '.ac-best{font-size:var(--font-size-xs);color:var(--accent);align-self:flex-start}',
      '.ac-len{font-size:var(--font-size-xs);color:var(--text-secondary);border:1px solid var(--border);border-radius:999px;padding:1px 7px;align-self:flex-start}',
      '.ac-len.ac-short{color:var(--accent);border-color:var(--accent)}',
      '.ac-none{color:var(--text-secondary);font-size:var(--font-size-sm);margin:var(--space-lg) 0}',
      '.ac-streak{margin-left:8px;font-size:var(--font-size-xs);color:var(--accent)}',
      /* 봇 세기 = 이어붙은 세 칸 한 덩어리 (segmented control). */
      '.ac-level{display:flex;gap:0;align-items:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-level button{padding:6px 14px;font-size:var(--font-size-xs);font-weight:700;border:1px solid var(--border);background:var(--bg-secondary);cursor:pointer;margin-left:-1px}',
      '.ac-level button:first-child{border-radius:999px 0 0 999px;margin-left:0}',
      '.ac-level button:nth-child(3){border-radius:0 999px 999px 0}',
      '.ac-level button.ac-on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent);position:relative;z-index:1}',
      '.ac-level small{color:var(--text-secondary);font-size:11px;margin-left:10px}',
      '.ac-intro{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--bg-primary);text-align:center;padding:var(--space-lg)}',
      /* 판이 열리는 순간의 「짠」 — 아이콘 하나만 튀어 오른다 (reduced-motion 이면 정지). */
      '.ac-introicon{font-size:56px;animation:acPop .45s cubic-bezier(.34,1.56,.64,1)}',
      '@keyframes acPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}',
      '.ac-introname{font-size:var(--font-size-lg);font-weight:800}',
      '.ac-introdesc{font-size:var(--font-size-sm);color:var(--text-secondary);max-width:22em}',
      '.ac-introcount{font-size:clamp(48px,16vw,84px);font-weight:800;color:var(--accent);line-height:1}',
      /**
       * **무대** — 51개 화면이 여기 안에서만 산다 (TASK-KL-314).
       *
       * 전에는 놀이마다 제 최대폭을 들고 있었다(300·320·340·360·380·420 여섯 가지). 그래서
       * 판을 갈아탈 때마다 화면이 출렁였고, 대회로 다섯 판을 이으면 매 판 크기가 바뀌었다.
       * 크기를 정하는 자리는 **여기 하나**다.
       *
       * 비율은 안 박는다. 풀스크린이 요구인데 16:9 로 못 박으면 폰에서 위아래 검은 띠가 남고,
       * 정사각 판의 칸이 22px(손가락 최소권장의 절반)이 된다 — 재 보고 정했다.
       * 대신 WM 웹판과 같은 원리를 쓴다: **화면을 다 쓰고 콘텐츠가 비율을 흡수한다.**
       */
      /* `place-items:center` 를 쓰면 안 된다 — 자식이 shrink-to-fit 이 되어 `width:100%` 인 판이
         **폭 0 으로 무너진다**(실측: 오목 칸이 2px 이 됐다. 51종 화면검사는 「떴다」만 보므로
         초록이었다 — 크기를 안 재는 검사는 이런 것을 못 잡는다). 세로만 가운데, 가로는 채운다. */
      '.ac-stage{position:relative;width:100%;max-width:var(--ac-stage);margin:0 auto;min-height:min(62vh,var(--ac-stage));display:grid;align-items:center;justify-items:stretch}',
      /**
       * ── 넓은 화면: 판을 키우고 곁을 옆에 세운다 (사용자 요구 — 「화면 전체·반응형」) ──
       *
       * 640px 상한은 폰 기준으로 정해진 수였다. 데스크톱에서는 판이 화면의 3분의 1만 쓰고
       * 나머지가 빈 벽이 된다(실측: 1920 화면에서 무대 640 · 좌우 여백 각 640).
       * 눕힌 폰에 쓰던 2열 배치를 **넓은 화면 전체**로 올린다 — 세로가 넉넉할 때만 걸어
       * 노트북 짧은 세로에서 판이 밀리는 일은 없게 한다.
       *
       * `--ac-stage` 는 여기서만 커진다: 세로 몫(72vh)·가로 몫(56vw)·상한(900px) 중 최솟값.
       * 곁줄(자리·상태·단추)은 오른쪽 한 칸에 세로로 쌓는다.
       */
      '@media (min-width:1000px) and (min-height:700px){',
      '  #acPlay{display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,290px);grid-template-rows:auto auto 1fr auto;gap:var(--space-sm) var(--space-xl);align-items:start}',
      '  #acStage{grid-column:1;grid-row:1/5;--ac-stage:min(56vw,72vh,900px);align-self:center}',
      /* 곁줄은 **한 장의 종이**로 묶는다 — 넓은 화면에서 흩어 놓으면 허공에 뜬 글자가 된다. */
      '  #acSeats{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;gap:6px;justify-content:flex-start;margin:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:14px}',
      '  #acSeats .ac-seat{justify-content:flex-start;background:none;border:0;padding:2px 0}',
      '  #acSeats .ac-seat.ac-me{background:none;border:0;font-weight:900}',
      '  #acStatus{grid-column:2;grid-row:2;text-align:left;padding:0 14px}',
      '  .ac-controls{grid-column:2;grid-row:4;flex-wrap:wrap;align-self:end;margin:0}',
      '  .ac-letter{grid-column:2;grid-row:3;align-self:start}',
      '}',
      /* 아주 넓은 화면(와이드·4K)은 세로가 먼저 동난다 — 가로 몫을 더 열어 세로를 다 쓴다. */
      '@media (min-width:1600px) and (min-height:900px){',
      '  #acStage{--ac-stage:min(62vw,78vh,1100px)}',
      '}',
      /* 풀스크린이면 무대가 화면이 된다 — 안에 있는 51개가 그대로 커진다. */
      /**
       * **폰을 눕히면 판을 옆으로 세운다** (TASK-KL-314).
       *
       * 세로로 쌓는 배치(자리줄 / 무대 / 상태 / 단추)는 화면이 누우면 무너진다 — 세로가 390px 인데
       * 그걸 넷이 나눠 가지니 무대에 226px 밖에 안 남고 오목 칸이 23px 이 됐다(실측). 게다가
       * 단추가 22px 밀려 화면 밖으로 나갔다. 눕힌 화면에서 남는 것은 **가로**이므로 그쪽을 쓴다:
       * 왼쪽에 판, 오른쪽에 자리줄·상태·단추를 세로로 쌓는다.
       *
       * `max-height` 로 거는 이유: 「가로다」만으로 걸면 노트북(1280×900)도 가로라 걸린다.
       * 좁은 것은 방향이 아니라 **세로 길이**다.
       *
       * 세로 몫이 78vh 인 이유: 90 → 84 → 78 로 내려 보며 쟀다. 90·84 에서는 판이 화면 밖으로
       * 37px·14px 밀렸다 — 무대만 보면 들어가는데 **셸 머리띠가 세로를 먼저 먹기** 때문이다.
       * 78vh 면 두 폰 모두 한 화면에 들어간다. 눕힌 채로도 오목 칸이 32px(세로일 때 38px)이라
       * 손가락이 닿는다 — 고치기 전에는 23px 이었다.
       */
      '@media (orientation:landscape) and (max-height:560px){',
      '  #acPlay{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,26vw);grid-template-rows:auto 1fr auto;gap:0 var(--space-md);align-items:center}',
      /* 눕힌 화면에서는 **무대가 곧 틀**이라 여백이 사치다 — 무대 padding 48 + 판 바깥여백 48 이
         세로 96px 을 먹어 판이 화면 밖으로 밀렸다(실측). 둘 다 걷고 세로를 판에 준다. */
      '  #acStage{grid-column:1;grid-row:1/4;--ac-stage:min(62vw,78vh,640px);padding:0;min-height:0}',
      /* ★ **좁게 눕히면 셸 메뉴 띠가 판 몫을 먹는다** (2026-08-15 실측).
         폭이 좁아지면 메뉴가 상단 바에서 빠져나와 **바 아래 가로 띠**(`.mobile-nav`)가 된다:
           844 폭 → 메뉴가 바 안 · 판 위 공간 76px  → 오목 칸 33px
           740 폭 → 띠가 따로 생김(55px) · 판 위 공간 123px → 오목 칸 24px (손가락 최소 28px 미달)
         판을 줄이면 화면엔 들어가지만 칸이 눌리지 않고, 판을 키우면 화면 밖으로 밀린다 —
         **둘 다 만족시킬 세로가 애초에 없다.** 모자란 31px 이 이 띠 안에 있다.
         그래서 **판이 도는 동안만** 접는다. 나가는 길(상단 바 52px)은 그대로 남고,
         판을 끝내면 곧바로 돌아온다. 세운 폰·넓은 화면은 아무것도 안 바뀐다. */
      /* 셸이 이 띠를 display:flex 로 「강제(!important)」 박아 뒀다(css/shell-critical.css) —
         같은 세기로 말해야 접힌다. 접는 조건이 좁고(눕힘+판 도는 중) 판이 끝나면 풀린다. */
      '  html.ac-playing .mobile-nav{display:none!important}',
      '  #acStage #acView>*{margin-top:0;margin-bottom:0}',
      '  #acSeats{grid-column:2;grid-row:1;justify-content:flex-start}',
      '  #acStatus{grid-column:2;grid-row:2}',
      '  .ac-controls{grid-column:2;grid-row:3;flex-wrap:wrap;margin-top:0}',
      '}',
      '.ac-stage:focus{outline:none}',
      /* 키로 짚고 있는 자리 — 눌린 것과 구별되게 테두리만. */
      '.ac-key{outline:3px solid var(--accent);outline-offset:1px;border-radius:4px}',
      '.ac-stage:fullscreen{max-width:none;width:100vw;height:100vh;min-height:0;background:var(--bg-primary);padding:var(--space-lg)}',
      '.ac-stage:fullscreen #acView{width:100%;max-width:min(96vmin,900px);margin:0 auto}',
      /* 풀스크린이면 단추 줄이 무대 **안으로 들어온다** — 아래 § 참고. 판 위에 뜨되 가리지 않게. */
      '.ac-stage:fullscreen .ac-controls{position:absolute;left:0;right:0;bottom:var(--space-lg);justify-content:center;margin:0;z-index:4}',
      '.ac-fl{max-width:100%;margin:0 auto}',
      '.ac-flmsg{text-align:center;font-size:var(--font-size-sm);min-height:22px}',
      '.ac-flgrids{display:flex;flex-wrap:wrap;gap:var(--space-lg);justify-content:center}',
      '.ac-flone{flex:0 0 auto}',
      '.ac-flone.ac-dead{opacity:.45}',
      '.ac-flname{font-size:var(--font-size-xs);text-align:center;margin-bottom:4px}',
      '.ac-flone.ac-me .ac-flname{color:var(--accent)}',
      '.ac-flboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:1px;width:min(46vw,220px)}',
      '.ac-flc{aspect-ratio:1;padding:0;border:1px solid var(--border);background:var(--bg-secondary);border-radius:2px}',
      '.ac-flc.ac-ship{background:var(--text-secondary)}',
      '.ac-flc.ac-miss{background:var(--bg-tertiary);opacity:.6}',
      '.ac-flc.ac-hit{background:#ef4444}',
      '.ac-flc.ac-lastshot{outline:2px solid var(--accent)}',
      '.ac-nu{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-nunum{font-size:clamp(60px,20vw,110px);font-weight:800;line-height:1}',
      '.ac-nubtn{width:100%;margin:var(--space-lg) 0;font-size:var(--font-size-lg);padding:16px}',
      '.ac-nulog{min-height:70px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-nul{padding:2px 0}',
      '.ac-nul.ac-clash{color:#ef4444}',
      '.ac-nuwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-code{font-size:clamp(28px,8vw,48px);font-weight:800;letter-spacing:.18em;text-align:center;margin:var(--space-lg) 0}',
      '.ac-share{display:flex;gap:6px;margin:var(--space-lg) 0}',
      '.ac-share input{flex:1;min-width:0}',
      /* 혼자 놀이 카드 (TASK-KL-313) — 방 게임과 같은 틀을 쓰되 **링크**라 밑줄을 지운다. */
      /* 생김새는 방 게임 카드와 같게 — 세는 이름만 다르다. */
      /* 혼자 놀이 = 같은 진열장의 물건. 링크라는 것만 다르다. */
      '.ac-solocard{display:flex;flex-direction:column;align-items:center;background:none;border:0;padding:0;color:inherit;text-decoration:none;transition:transform var(--transition-fast)}',
      '.ac-solocard:hover{transform:translateY(-3px)}',
      '.ac-solocard:hover .ac-objname{color:#3c3a30}',
      '.ac-solocourse{margin:0 0 6px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-packrow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--space-lg)}'
    ].join('\n');
    document.head.appendChild(el);
  }

  /** 방 이름 — 짧고, 헷갈리는 글자(0/O, 1/I)는 뺀다. */

  function draw(container: HTMLElement): void {
    injectStyles();
    /* 오락실 전용 스킨의 뿌리 — 이 클래스 아래에서만 토큰이 바뀐다(다른 위젯 불변). */
    container.classList.add('ac-root');
    if (typeof Mdd !== 'undefined') Mdd?.linePreset?.('tool_run', { msg: t('arcade.mdd') });

    /* 로비 = **진열장**. 카드도 테두리도 없다 — 따뜻한 상아색 탁자 위에 게임이 물건처럼
       놓이고, 올리면 이름표가 서고, 누르면 그 물건이 가운데로 온다(#acDetail). */
    container.innerHTML =
      '<div id="acLobby">' +
      '<div class="ac-top">' +
      '<span class="ac-brand">' + esc(t('widgets.arcade.title', undefined, '오락실')) + '</span>' +
      '<span class="ac-sub">' + esc(t('arcade.lobby.hint')) + '</span>' +
      '<input type="search" id="acFind" class="ac-find" placeholder="' + esc(t('arcade.find.hint')) +
      '" aria-label="' + esc(t('arcade.find.hint')) + '">' +
      '<label class="ac-namechip">' + esc(t('arcade.label.name')) +
      '<input type="text" id="acName" maxlength="12" placeholder="' + esc(t('arcade.name.default')) +
      '" aria-label="' + esc(t('arcade.aria.name')) + '"></label>' +
      '</div>' +
      /* 진열장과 그 딸린 것들 — 물건을 집으면(#acDetail) 통째로 접힌다. */
      '<div id="acShelfAll">' +
      '<div class="ac-room" id="acRoom" style="display:none"></div>' +
      '<div id="acOpen"></div>' +
      '<div class="ac-today" id="acToday"></div>' +
      '<div id="acPicks"></div>' +
      '<div id="acGames" class="ac-shelf"></div>' +
      /* 혼자 놀이 — 오락실이 놀이의 **유일한 문**이 되는 자리 (TASK-KL-313).
         방 게임 뒤에 둔다: 여기는 오락실이고, 혼자 놀이는 각자 제 페이지로 나가는 손님이다. */
      '<div id="acSolo"></div>' +
      /* 놀이의 재료 = 표. 만드는 문이 놀이터에만 있어서, 오락실로 들어온 사람은 우물을
         파 놓고도 못 들어갔다 (TASK-KL-313 — 놀이터에서 옮겨 온 자리). */
      '<div id="acPacks"></div>' +
      '<div class="ac-foot">' +
      '<div class="ac-level" id="acLevel" role="group" aria-label="' + esc(t('arcade.level.aria')) + '">' +
      ['mild', 'normal', 'spicy']
        .map((v) => '<button data-level="' + v + '">' + esc(t('arcade.level.' + v)) + '</button>')
        .join('') +
      '<small>' + esc(t('arcade.level.note')) + '</small></div>' +
      '</div>' +
      '</div>' +
      '<div id="acDetail" style="display:none"></div>' +
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
      '<div class="ac-stage" id="acStage" tabindex="0">' +
      '<div class="ac-intro" id="acIntro" style="display:none">' +
      '<div class="ac-introicon" id="acIntroIcon"></div>' +
      '<div class="ac-introname" id="acIntroName"></div>' +
      '<div class="ac-introdesc" id="acIntroDesc"></div>' +
      '<div class="ac-introcount" id="acIntroNum"></div>' +
      '<div class="ac-introskip" id="acIntroSkip"></div>' +
      '</div>' +
      '<div id="acView"></div>' +
      '<div class="ac-over" id="acOver" style="display:none">' +
      '<div class="ac-overhead" id="acOverHead"></div>' +
      '<ol class="ac-overlist" id="acOverList"></ol>' +
      '<div class="ac-overnote" id="acOverNote"></div>' +
      '</div>' +
      '</div>' +
      '<div class="ac-letter" id="acLetter" style="display:none">' +
      '<div id="acLetterSay"></div>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
      '<input type="text" id="acLetterUrl" readonly aria-label="' + esc(t('arcade.letter.link')) + '" style="flex:1;min-width:0">' +
      '<button class="btn btn-primary" id="acLetterCopy">' + esc(t('arcade.btn.copy')) + '</button>' +
      '</div></div>' +
      '<div class="tool-status" id="acStatus"></div>' +
      '<div class="ac-controls" id="acControls" style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      '<button class="btn btn-ghost" id="acQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      '<button class="btn btn-ghost" id="acSound" aria-pressed="true" title="' + esc(t('arcade.btn.sound')) + '">🔊</button>' +
      '<button class="btn btn-ghost" id="acFull" title="' + esc(t('arcade.btn.full')) + '">⛶</button>' +
      /* 표현 고르기 — 규칙은 그대로, 보는 법만 바뀐다. 입체 화면이 있는 판에서만 뜬다. */
      '<button class="btn btn-ghost" id="acDim" style="display:none" aria-pressed="false" title="' +
      esc(t('arcade.btn.dim', undefined, '2D / 3D 로 보기')) + '">2D</button>' +
      '<button class="btn btn-ghost" id="acReplay" style="display:none">' + esc(t('arcade.btn.replay')) + '</button>' +
      '<button class="btn btn-ghost" id="acSwap" style="display:none">' + esc(t('arcade.btn.swap')) + '</button>' +
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
    const swapBtn = $<HTMLButtonElement>('#acSwap');
    const replayBtn = $<HTMLButtonElement>('#acReplay');
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
      /* 판에서 로비로 돌아오면 진열장부터 — 집었던 물건 화면에 걸려 있으면 길을 잃는다. */
      if (which === 'lobby') closeDetail();
      /* 판이 도는 동안임을 뿌리에 남긴다 — 좁게 눕힌 화면에서 셸 메뉴 띠를 접는 데 쓴다.
         (아래 `--ac-playing` 규칙 · 그 이유는 거기 적어 뒀다) */
      document.documentElement.classList.toggle('ac-playing', which === 'play');
    };

    /* ── 로비 ──────────────────────────────────────────────────────
     *
     * **진열장의 물건 하나.** 카드가 아니라 물건이다 — 이름은 올렸을 때만 이름표로 선다.
     * 크기는 id 에서 결정적으로 뽑는다: 진열장이 자를 대고 그린 듯 균일하면 물건이 아니라
     * 아이콘 표가 된다. 이름표의 번호 = 명부 순서 (사람이 「몇 번」으로 부를 수 있게). */
    const objOf = (g: (typeof CARDS)[number]): string => {
      const sizes = [40, 46, 52, 58];
      const size = sizes[(g.id.charCodeAt(0) + g.id.length) % sizes.length];
      /* 이름은 **상시** 보인다 — 그림만으로는 무슨 놀이인지 모른다(사용자 실측 피드백).
         물건 밑의 작은 값표처럼, 진열장 감은 지키고 접근성만 얹는다. */
      return (
        '<button class="ac-obj" data-obj="' + g.id + '">' +
        '<span class="ac-objface" style="font-size:' + size + 'px">' + iconOf(g.id) + '</span>' +
        '<b class="ac-objname">' + esc(t('arcade.game.' + g.id + '.name')) + '</b>' +
        '</button>'
      );
    };

    /**
     * 물건을 집으면 — 진열장이 접히고 그 물건이 탁자 가운데로 온다.
     * 시작 단추의 data-* 는 카드 시절 그대로다(`wireCards`·화면 검사가 같은 이름을 본다).
     */
    function openDetail(id: string): void {
      const g = CARDS.find((x) => x.id === id);
      if (!g) return;
      const [min, max] = g.seats;
      /* **차례 놀이만** 편지로 둘 수 있다. 실시간 놀이를 편지로 두면 상대가 링크를 여는
         순간에 이미 판이 끝나 있다 — 그건 놀이가 아니라 결과 통보다.
         **넷부터 편이 선다.** 둘·셋은 나눠 봐야 한 편에 하나씩이라 개인전과 같다. */
      const more =
        (!g.realtime && g.seats[0] === 2
          ? '<button data-letter="' + g.id + '">' + esc(t('arcade.btn.letter')) + '</button>'
          : '') +
        (isTeamy(g.seats[1])
          ? '<button data-team="' + g.id + '">' + esc(t('arcade.btn.team')) + '</button>'
          : '') +
        '<button data-find="' + g.id + '">' + esc(t('arcade.btn.find')) + '</button>';
      const d = $<HTMLElement>('#acDetail');
      d.innerHTML =
        '<button class="ac-back" id="acBack">‹ ' + esc(t('widgets.arcade.title', undefined, '오락실')) + '</button>' +
        '<div class="ac-dwrap">' +
        '<div class="ac-dface">' + iconOf(g.id) + '</div>' +
        '<div class="ac-dinfo">' +
        '<h3><i>' + (CARDS.indexOf(g) + 1) + '</i>' + esc(t('arcade.game.' + g.id + '.name')) + '</h3>' +
        '<p>' + esc(t('arcade.game.' + g.id + '.desc')) + '</p>' +
        '<div class="ac-dmeta">' +
        '<span>' + esc(t('arcade.seats', { min: String(min), max: String(max) })) + '</span>' +
        /* 길이는 손으로 안 적는다 — 저울이 잰 수에서 나온다(`length.ts`). */
        '<span title="' +
        esc(secondsOf(g.id) === null ? '' : t('arcade.len.secs', { n: String(Math.round(secondsOf(g.id) as number)) })) +
        '">' + esc(t('arcade.len.' + lengthOf(g.id))) + '</span>' +
        (bestOf(g.id) ? '<span>🏅 ' + esc(t('arcade.best.card', { n: String(bestOf(g.id)?.score ?? 0) })) + '</span>' : '') +
        '</div>' +
        '<div class="ac-go">' +
        '<button data-solo="' + g.id + '">' + esc(t('arcade.btn.solo')) + '</button>' +
        '<button data-host="' + g.id + '">' + esc(t('arcade.btn.together')) + '</button>' +
        '</div>' +
        '<div class="ac-more">' + more + '</div>' +
        '</div></div>';
      $<HTMLElement>('#acShelfAll').style.display = 'none';
      d.style.display = '';
      wireCards();
      const back = container.querySelector<HTMLButtonElement>('#acBack');
      if (back) back.onclick = closeDetail;
    }

    function closeDetail(): void {
      const d = $<HTMLElement>('#acDetail');
      d.style.display = 'none';
      d.innerHTML = '';
      $<HTMLElement>('#acShelfAll').style.display = '';
    }

    /* 오늘의 세 판 — 51개 앞에서 「뭘 하지」를 대신 정해 준다 (TASK-KL-264). */
    const picks = todayPicks(CARDS.map((g) => ({ id: g.id, kind: kindOf(g.id) })));
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
        '<button class="btn btn-primary ac-tourbtn" id="acTour">' + esc(t('arcade.tour.start', { n: String(ROUNDS) })) + '</button>' +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('.ac-todaycard').forEach((b) => {
        b.onclick = (): void => {
          remember();
          startSolo(String(b.dataset.today));
        };
      });
      const tourBtn = container.querySelector<HTMLButtonElement>('#acTour');
      if (tourBtn) tourBtn.onclick = startTour;
    };
    paintToday();

    /* ── 추천 여섯 칸 + 찾기 (TASK-KL-264 F4) ──────────────────────
     *
     * 51개를 갈래로 묶어 늘어놓는 것만으로는 부족했다 — 묶어도 51개는 51개다. 그래서 위에
     * **여섯 칸**을 두고(내가 안 해 본 것 먼저), 그래도 특정 판을 찾는 사람을 위해 **찾기**를 둔다.
     * 찾는 중에는 갈래 제목도 추천도 걷어 낸다 — 찾는 사람에게 그건 전부 방해다. */
    const findEl = $<HTMLInputElement>('#acFind');

    function remember(): void {
      try {
        localStorage.setItem('karmolab.arcade.name', nameInput.value.trim());
      } catch {
        /* 못 적어도 그만 */
      }
    }

    /** 카드는 찾을 때마다 다시 그려지므로 배선도 그때마다 다시 한다. */
    function wireCards(): void {
      const on = (attr: string, key: string, go: (id: string) => void): void => {
        container.querySelectorAll<HTMLButtonElement>('[' + attr + ']').forEach((b) => {
          b.onclick = (): void => {
            remember();
            go(String(b.dataset[key]));
          };
        });
      };
      on('data-obj', 'obj', openDetail);
      on('data-solo', 'solo', startSolo);
      on('data-pick', 'pick', startSolo);
      on('data-host', 'host', openRoom);
      on('data-pickhost', 'pickhost', openRoom);
      on('data-letter', 'letter', startLetter);
      on('data-pickletter', 'pickletter', startLetter);
      on('data-team', 'team', startTeam);
      on('data-pickteam', 'pickteam', startTeam);
      on('data-find', 'find', (id) => openRoom(id, true));
      on('data-pickfind', 'pickfind', (id) => openRoom(id, true));
    }

    /** 이 게임이 검색어에 걸리나 — 이름·설명·갈래·길이 어디든. */
    const hayOf = (id: string): string[] => [
      id,
      t('arcade.game.' + id + '.name'),
      t('arcade.game.' + id + '.desc'),
      t('arcade.kind.' + kindOf(id)),
      t('arcade.len.' + lengthOf(id))
    ];

    /**
     * 지금 열린 방 — 혼자 연 사람이 남을 만나는 유일한 길 (arcade-next ★2).
     *
     * 못 물어보면(봇이 죽었거나 회선이 끊겼거나) **그냥 안 그린다.** 「불러올 수 없음」을
     * 띄우면 로비가 고장 난 것처럼 보이는데, 이건 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
     */
    const paintOpen = async (): Promise<void> => {
      const box = $<HTMLElement>('#acOpen');
      const rooms = await listRooms();
      /* 내 방은 빼고 보여 준다 — 내가 연 방에 내가 들어가는 단추는 뜻이 없다. */
      const mine = new Set(net ? [$<HTMLElement>('#acCode').textContent ?? ''] : []);
      const list = rooms.filter((r) => !mine.has(r.code));
      if (!list.length) { box.innerHTML = ''; return; }
      box.innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.open.title')) + ' <i>' + list.length + '</i></h3>' +
        '<div class="ac-openstrip">' +
        list
          .map((r: OpenRoom) =>
            '<button class="ac-opencard" data-join="' + esc(r.code) + '">' +
            '<span>' + iconOf(r.game) + '</span>' +
            esc(t('arcade.open.card', {
              game: gameById(r.game) ? t('arcade.game.' + r.game + '.name') : r.game,
              host: r.host
            })) + '</button>')
          .join('') +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('[data-join]').forEach((b) => {
        b.onclick = (): void => {
          remember();
          joinRoomAs(String(b.dataset.join));
        };
      });
    };

    /* 추천 칸은 접었다 — 진열장은 전부를 한눈에 놓으므로 「여섯 개 골라 주기」가 할 일이 없다. */
    const paintPicks = (): void => {
      $<HTMLElement>('#acPicks').innerHTML = '';
    };

    /* 진열장 — 갈래 제목 없이 전부 한 탁자에. 찾는 중에는 걸리는 물건만 남긴다. */
    const paintGames = (): void => {
      const q = findEl.value;
      const box = $<HTMLElement>('#acGames');
      const mine = q.trim() ? CARDS.filter((g) => matches(hayOf(g.id), q)) : CARDS;
      box.innerHTML = mine.length
        ? mine.map((g) => objOf(g)).join('')
        : '<p class="ac-none">' + esc(t('arcade.find.none')) + '</p>';
      wireCards();
    };

    /* ── 혼자 놀이 (TASK-KL-313) ─────────────────────────────────
     *
     * 오락실 밖에 「놀이터」라는 두 번째 문이 있었다. 문이 둘이면 어느 문으로 들어왔느냐가
     * 무엇을 아는지를 정한다 — 오락실만 본 사람은 하나 맞히기를 영영 몰랐다. 그래서 그 문의
     * 알맹이(오늘의 코스 줄 · 놀이 카드)를 여기로 옮기고 저쪽 문은 닫는다.
     *
     * 명부는 여기 다시 안 적는다 — `apps/play/games.json` 하나가 정본이다(`solo.ts`).
     */
    let solo: SoloPlay[] = [];

    const soloCard = (g: SoloPlay): string =>
      /* `data-obj` 를 같이 쓰지 않는다 — 그 이름이 곧 「방 게임 몇 종인가」를 세는 자리다
         (추천 여섯에서 이미 겪었다: 51종이 54종이 됐다). 생김새만 진열장 물건과 같다 —
         혼자 놀이를 따로 분류할 이유가 없다는 피드백대로 같은 선반에 이어 놓는다. */
      '<a class="ac-solocard" href="' + esc(g.url) + '" data-solo-go="' + esc(g.id) + '">' +
      '<span class="ac-objface" style="font-size:44px">' + esc(g.emoji || '🎲') + '</span>' +
      '<b class="ac-objname">' + esc(g.title) + '</b>' +
      '</a>';

    const paintSolo = (): void => {
      const box = $<HTMLElement>('#acSolo');
      if (!solo.length) { box.innerHTML = ''; return; }
      const q = findEl.value;
      const mine = q.trim()
        ? solo.filter((g) => matches([g.id, g.title, g.lead], q))
        : solo;
      if (!mine.length) { box.innerHTML = ''; return; }

      /* 오늘의 코스 — 셈은 놀이들과 **같은 한 벌**(`play-course`)을 쓴다. 여기서 따로 세면
         「하나 남았다」가 놀이 안과 오락실에서 서로 다른 말을 한다. */
      const steps = courseSteps(solo);
      const left = steps.filter((x) => !x.done).length;
      const head = q.trim()
        ? ''
        : '<p class="ac-solocourse">' +
          (left
            ? esc(t('arcade.solo.left', { n: String(left) }))
            : esc(t('arcade.solo.allDone', { n: String(courseRun(true)) }))) +
          '</p>';

      /* 갈래 제목 없이 같은 진열장이 이어진다 — 방 게임과 혼자 놀이를 사람이 구분할 이유가 없다.
         코스 줄은 선반 뒤에 — 두 선반 사이에 끼면 끊어 읽힌다. */
      box.innerHTML =
        '<div class="ac-shelf">' + mine.map(soloCard).join('') + '</div>' +
        head;

      /* 앱 안의 놀이는 새 페이지를 받을 이유가 없다 — 그 자리에서 화면만 바꾼다.
         밖에 있는 것(`/daily/`)은 진짜 링크 그대로 둔다(새 창·복사가 살아 있어야 한다). */
      box.querySelectorAll<HTMLAnchorElement>('a[data-solo-go]').forEach((a) => {
        const tool = inAppTool(a.getAttribute('href') || '');
        if (!tool) return;
        a.onclick = (e): void => {
          e.preventDefault();
          Toolbox.switchPage?.(tool);
        };
      });
    };

    /* ── 놀이의 재료: 표 (TASK-KL-313 — 놀이터에서 옮김) ────────
     *
     * 표를 만들면 높은 쪽 고르기·스무고개·이상형 월드컵이 한꺼번에 켜진다. 그런데 그 문이
     * 놀이터 화면에만 있었다 — 오락실로 들어온 사람에게는 없는 기능이었다.
     *
     * fail-open: 오늘의 표(우물)에 못 닿으면 그 줄만 없다. 오락실은 그대로 선다.
     */
    const paintPacks = (): void => {
      const box = $<HTMLElement>('#acPacks');
      if (findEl.value.trim()) { box.innerHTML = ''; return; }
      const packs = loadPacks();
      box.innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.packs.title')) + '</h3>' +
        '<p class="ac-solocourse">' +
        esc(packs.length ? t('arcade.packs.mine', { n: String(packs.length) }) : t('arcade.packs.none')) +
        '</p>' +
        '<div class="ac-packrow">' +
        '<button type="button" class="btn btn-ghost" id="acPackNew">' +
        esc(packs.length ? t('arcade.packs.more') : t('arcade.packs.new')) + '</button>' +
        '<button type="button" class="btn btn-ghost" id="acPackWell" hidden></button>' +
        '</div>';
      $<HTMLButtonElement>('#acPackNew').onclick = (): void => Toolbox.switchPage?.('packs');

      /* 오늘의 표 = 서버가 날짜(KST)로 고른 한 벌 — 누구에게나 같아야 겨룰 수 있다. */
      void fetch('https://yawnbot.mascari4615.com/kl/wells')
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { wells?: Array<{ id: string; title: string; emoji: string }>; today?: string } | null) => {
          const today = (body?.wells || []).filter((w) => w.id === body?.today)[0];
          const btn = container.querySelector<HTMLButtonElement>('#acPackWell');
          if (!today || !btn || !container.isConnected) return;
          btn.hidden = false;
          btn.textContent = t('arcade.packs.well', { table: `${today.emoji} ${today.title}` });
          btn.onclick = (): void => Toolbox.switchPage?.('packwell');
        })
        .catch(() => {
          /* 우물에 못 닿으면 이 단추만 없다 */
        });
    };

    void soloPlays().then((rows) => {
      if (!container.isConnected) return;
      solo = rows;
      paintSolo();
    });

    paintPicks();
    paintGames();
    void paintOpen();
    /* 목록은 살아 있는 것이라 가끔 다시 본다 — 로비에 있을 때만. */
    // 보이는 동안만 다시 본다 (`lib/tick`) — 덮어 둔 탭에서 방 목록을 받아 올 이유가 없다.
    Toolbox.onDispose?.(intervalWhileVisible(() => {
      if (lobby.style.display !== 'none') void paintOpen();
    }, 20000));
    paintPacks();

    /* 찾는 중에는 오늘의 셋도 접는다 — 찾는 사람은 이미 무엇을 할지 정했다. */
    findEl.oninput = (): void => {
      $<HTMLElement>('#acToday').style.display = findEl.value.trim() ? 'none' : '';
      paintPicks();
      paintGames();
      void paintOpen();
      paintSolo();
      paintPacks();
    };

    /* ── 판 ──────────────────────────────────────────────────────── */
    let match: Match<unknown, unknown> | null = null;
    /** 방금 끝난 판을 되살릴 재료 (TASK-KL-264 다시 보기). */
    let lastSeed = 0;
    let lastSeats: SeatSpec[] = [];
    /* 봇의 손버릇·세기까지 같아야 같은 판이 나온다 — 뜸 들이는 시간이 곧 수의 시각이다. */
    let lastPersonas: Record<number, BotPersona> = {};
    let lastLevel: BotLevel = 'normal';
    /** 이 판을 시작할 때의 내 최고 기록 — 결과에 「어제 N」으로 적는다. */
    let lastBest: number | null = null;
    let tape: Tape<unknown> | null = null;
    /** 편을 갈랐으면 자리→편 표. 개인전이면 null. */
    let plan: Plan | null = null;
    /** 지금 화면에 도는 것이 **다시 보기**인가 — 그렇다면 손이 안 먹는다. */
    let replaying = false;
    /** 되살리는 중 아직 안 넣은 수의 자리 */
    let tapeAt = 0;
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

    /** 자리를 못 받아 **구경만** 하는 중인가 (TASK-KL-264 D2). */
    let watching = false;
    /** 이번 판의 끝소리를 이미 울렸나 — 매 프레임 울리면 소리가 아니라 경적이 된다. */
    let ended = false;
    /** 마지막으로 소리를 낸 판 번호 */
    let soundedRound = -1;

    /** 손님 쪽엔 커널이 없다. 주인이 보낸 판을 들고 그린다. */
    let shadow: { v: MatchView<unknown>; now: number; at: number } | null = null;

    /**
     * 끝난 판의 결과를 **판 위에 덮어** 보여 준다 (TASK-KL-264 C2).
     *
     * 전에는 판 아래 한 줄이 전부였다 — 「이슬이 이겼다」. 몇 점이었는지, 내가 몇 등인지는
     * 자리 줄을 눈으로 훑어야 알았고, 게임마다 제 나름의 결과를 그리기도 했다. 이걸 껍데기
     * 한 곳으로 모은다: **51개가 한꺼번에 같은 결과 화면을 얻는다.**
     *
     * 등수는 `rank.ts` 가 센다 — 대회 점수와 같은 셈이라 화면과 점수표가 안 갈린다.
     */
    function showResult(v: MatchView<unknown>, draw: boolean, top: number, note: string): void {
      /* 편을 갈랐으면 **편 점수로** 줄을 세운다 — 개인 등수를 보여 주면 편이 아니라 개인전이다. */
      if (plan) {
        const ts = teamScores(plan, v.seats.map((x) => x.score));
        const best = Math.max(...ts);
        const myTeam = plan[mySeat] ?? -1;
        $<HTMLElement>('#acOverHead').textContent = ts[0] === ts[1]
          ? '🤝 ' + t('arcade.team.draw')
          : (ts[myTeam] === best ? '🏆 ' : '🏁 ') + t('arcade.team.win', { who: TEAM_NAMES[ts.indexOf(best)] ?? '' });
        $<HTMLElement>('#acOverList').innerHTML = ts
          .map((sc, ti) =>
            '<li class="ac-overrow' + (ti === myTeam ? ' ac-me' : '') + '">' +
            '<span class="ac-overrank">' + esc(TEAM_NAMES[ti] ?? '') + '</span>' +
            '<span class="ac-overname">' +
            v.seats.filter((_, i) => plan?.[i] === ti).map((x) => esc(x.name)).join(', ') +
            '</span><span class="ac-overscore">' + sc + '</span></li>')
          .join('');
        $<HTMLElement>('#acOverNote').textContent = note;
        $<HTMLElement>('#acOver').style.display = '';
        return;
      }
      const order = ranks(v.seats.map((x) => x.score));
      /* 구경꾼에게는 「내가 이겼다」가 없다. 자리가 -1 이라 점수가 0 인데, 아무도 점수를
         못 낸 판(0:0)에서는 그 0 이 1등과 같아져 구경꾼이 이긴 것으로 뜬다. */
      const mine = watching ? NaN : (v.seats[mySeat]?.score ?? 0);
      $<HTMLElement>('#acOverHead').textContent = draw
        ? '🤝 ' + t('arcade.result.draw')
        : mine === top
          ? '🏆 ' + t('arcade.over.mine')
          : '🏁 ' + t('arcade.result.win', { who: v.seats.filter((x) => x.score === top).map((x) => x.name).join(', ') });
      $<HTMLElement>('#acOverList').innerHTML = v.seats
        .map((sq, i) => ({ sq, i, r: order[i] }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map(
          ({ sq, i, r }) =>
            '<li class="ac-overrow' + (i === mySeat ? ' ac-me' : '') + '">' +
            '<span class="ac-overrank">' + (r + 1) + '</span>' +
            '<span class="ac-overname">' + esc(sq.name) + (sq.bot ? ' 🤖' : '') + '</span>' +
            '<span class="ac-overscore">' + sq.score + '</span></li>'
        )
        .join('');
      /* 「어제 N」 — 기록이 있고 혼자 논 판일 때만. 남과 논 판의 점수는 내 기록과 견줄 것이 아니다. */
      const mineNow = v.seats[mySeat]?.score ?? 0;
      const record = lastBest !== null && !net && !watching
        ? (mineNow > lastBest
            ? t('arcade.best.new', { n: String(mineNow), was: String(lastBest) })
            : t('arcade.best.was', { n: String(lastBest) }))
        : '';
      $<HTMLElement>('#acOverNote').textContent = [note, record].filter(Boolean).join(' · ');
      $<HTMLElement>('#acOver').style.display = '';
    }

    /** 다음 판·나가기 전에 걷는다 — 안 걷으면 다음 판이 지난 결과 뒤에서 돈다. */
    function hideResult(): void {
      $<HTMLElement>('#acOver').style.display = 'none';
    }

    function paint(v: MatchView<unknown>, now: number): void {
      /* 지금 이 창이 **들고 있는 판**을 밖에서 볼 수 있게 둔다 (TASK-KL-264).
         감추기가 새는지는 화면으로 못 잡는다 — 화면은 남의 배를 애초에 안 그리므로,
         새어도 그림은 똑같다(일부러 새게 해 보고 검사가 안 빨개지는 것을 확인했다).
         새는 자리는 「보낸 값」이라 받은 값을 직접 읽어야 한다. 이 창이 이미 가진 것이므로
         내보낸다고 더 알려지는 것은 없다. */
      /* 이 판이 **언제 저절로 끝나나**(`endsAt`)도 같이 내놓는다 — 놀이마다 제한이 25초에서 300초까지 다르다.
         밖에서 기다리는 검사가 그걸 모르면 제 맘대로 잡은 참을성으로 「안 끝났다」고 적는다(2026-08-17 실측:
         참을성 60초인데 지뢰찾기 제한이 180초라, 그 놀이가 뽑히면 무조건 빨강이었다). */
      (window as unknown as { __arcade?: unknown }).__arcade = { game: gameId, mySeat, state: v.state, finished: v.finished, endsAt: (v.state as { endsAt?: number } | undefined)?.endsAt ?? null, tour: tour ? { at: tour.at, games: tour.games, points: tour.points } : null };
      seatsEl.innerHTML =
        (watching ? '<span class="ac-seat ac-watch">👀 ' + esc(t('arcade.watch.now')) + '</span>' : '') +
        v.seats
          .map(
            (s, i) =>
              '<span class="ac-seat' + (i === mySeat ? ' ac-me' : '') +
              (plan ? ' ac-team' + plan[i] : '') + '">' +
              (plan ? esc(TEAM_NAMES[plan[i]] ?? '') + ' ' : '') +
              esc(s.name) + (s.bot ? ' 🤖' : '') + ' <b>' + s.score + '</b></span>'
          )
          .join('');
      render?.(v, mySeat, now);
      /* 화면이 판을 다시 그리면 **짚은 자리 표시가 같이 지워진다** (2026-08-16 실측).
         매 프레임 `innerHTML` 을 새로 쓰는 놀이에서는 화살표를 눌러도 테두리가 0.4초 안에
         사라져, 키로는 못 논다고 느낀다(체커·미니장기·여우와사냥개·대통령·도미노 다섯이 그랬다).
         표시는 그림의 일부라 그림을 다시 그리면 다시 얹어야 한다 — 여기가 그 자리다. */
      markKeyCursor();

      if (v.finished) {
        const top = Math.max(...v.seats.map((s) => s.score));
        const win = v.seats.filter((s) => s.score === top);
        againBtn.style.display = net && !net.host ? 'none' : '';
        /* 방을 든 주인에게는 「다른 게임」이 하나 더 뜬다 — 방을 닫지 않고 갈아탄다. */
        swapBtn.style.display = net?.host ? '' : 'none';
        /* 끝난 판의 말은 **한 번만** 적는다. 매 프레임 다시 적으면 대회 점수판을 적어 놔도
           다음 프레임에 이겼다/졌다로 덮인다(실측 — 점수판이 안 보였다). */
        if (!ended) {
          ended = true;
          const draw = win.length === v.seats.length;
          const mine = watching ? NaN : (v.seats[mySeat]?.score ?? 0);
          say(
            draw ? t('arcade.result.draw') : t('arcade.result.win', { who: win.map((s) => s.name).join(', ') }),
            'ok'
          );
          /* 이긴 판만 세지 않는다 — 이겨야 세면 봇 세기를 순한맛으로 낮추는 놀이가 된다. */
          markPlayed(gameId, picks);
          paintToday();
          /* 구경꾼에게는 이기고 지는 소리가 없다 — 남의 승부다. */
          blip(watching ? 'good' : draw ? 'good' : mine === top ? 'win' : 'lose');
          buzz(watching ? 'tap' : draw ? 'tap' : mine === top ? 'win' : 'lose');
          let note = '';
          if (tour) {
            tour = award(tour, v.seats.map((x) => x.score));
            const board = v.seats.map((x, i) => x.name + ' ' + (tour?.points[i] ?? 0)).join(' · ');
            note = t('arcade.tour.standing', {
              n: String(Math.min(tour.at, ROUNDS)),
              of: String(tour.games.length),
              board
            });
            say(note, 'ok');
            againBtn.textContent = isOver(tour) ? t('arcade.tour.done') : t('arcade.tour.next');
            againBtn.style.display = '';
          }
          /* 끝난 순간의 기록을 챙긴다 — 다음 판을 시작하면 커널이 새로 만들어져 사라진다. */
          if (match && !replaying) {
            const g0 = gameById(gameId);
            if (g0) tape = record(g0, match as never, lastSeats, lastSeed) as Tape<unknown>;
          }
          /* 여태 가장 잘한 판이면 남긴다 — 다음 판에 이 사람이 옆자리에 앉는다 (`ghost.ts`).
             혼자 둔 판만 남긴다: 여럿이 둔 판의 내 수는 남의 수에 기대어 나온 것이라
             혼자 하는 판에 옮겨 놓으면 「어제의 나」가 아니라 딴사람이 된다. */
          if (tape && !net && !replaying && mySeat >= 0) {
            const mine = tape.moves.filter((mv) => mv.seat === mySeat).map((mv) => ({ at: mv.at, action: mv.action }));
            if (mine.length) noteBest(gameId, v.seats[mySeat]?.score ?? 0, mine);
          }
          /* 다시 보기는 **내 커널이 있을 때만** — 손님은 판을 받아 그리기만 해서 되살릴 것이 없다. */
          replayBtn.style.display = tape && tape.moves.length >= 0 && !replaying ? '' : 'none';
          showResult(v, draw, top, note);
        }
      } else if (v.note) {
        /* ★ **한 줄 알림이 판을 죽이면 안 된다** (2026-08-17, 진짜로 죽였다).
           i18n 은 없는 열쇠를 **던진다** — 열쇠 이름이 화면에 뜨는 것보다 낫다는 판단이고 옳다.
           그런데 그 던짐이 그리기 고리 한가운데서 나면 판이 거기서 멎는다: 지뢰를 밟는 순간
           `arcade.mine.boom` 이 없어서 대회 한 판이 통째로 안 끝났다(빠진 열쇠 17개를 찾아 채웠다).
           알림은 **그 순간의 곁말**이라 없어도 놀이는 굴러가야 한다. 못 옮기면 조용히 건너뛴다 —
           대신 창 기록에 한 번 남긴다(감사 `audit:i18n-keys` 가 push 전에 잡으므로 여기는 마지막 그물이다). */
        try {
          say(t(v.note.key, v.note.params));
        } catch (err) {
          console.warn('[arcade] 알림 글을 못 옮겼다 — 판은 그대로 간다:', v.note.key, err);
        }
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
        /* 다시 보기 중이면 **적어 둔 수를 그때가 되면 다시 넣는다.** 봇의 수는 안 넣는다 —
           커널이 같은 씨앗에서 똑같이 만들어 내기 때문이다(`replay.ts` 와 같은 규율). */
        if (replaying && tape) {
          while (tapeAt < tape.moves.length && tape.moves[tapeAt].at <= match.clock()) {
            const mv = tape.moves[tapeAt++];
            match.dispatch(mv.seat, mv.action);
          }
        }
        match.step(now);
        const v = match.view();
        paint(v, now);
        /* 다시 보기는 이 창 안의 일이다 — 남에게 흘리면 손님 화면이 지난 판으로 되돌아간다. */
        if (replaying) return;
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
      /* 자리를 못 받은 사람 = 구경꾼. **빼먹으면 빈 화면 앞에 앉아 있게 된다** — 위 고리는
         자리 있는 사람에게만 보내기 때문이다. 구경꾼 몫은 자리마다 겹쳐 지운 판이다. */
      const watchers = peers.filter((p) => seatOf[p.id] === undefined);
      if (!watchers.length) return;
      const shown = { ...v, state: forWatcher(g, v.state, v.seats.length) };
      for (const w of watchers) net.sync({ ...base, v: shown as unknown as Json }, w.id);
    }

    /* ── 키로 논다 (TASK-KL-314 다음 · arcade-next ★1) ───────────────
     *
     * **규약을 51개에 나눠 주지 않는다.** 화면들은 이미 `<button>` 으로 판을 그린다 — 오목의 칸,
     * 반응 측정의 고르기, 카드 한 장. 그러면 껍데기가 할 일은 하나뿐이다:
     * **그 단추들 위를 화살표로 옮기고 엔터로 누른다.** 게임 화면은 이 사실을 몰라도 된다.
     *
     * 열리는 것 셋: 마우스 없는 데스크톱 · 화면낭독기 · **검사가 좌표 대신 키로 두는 것**
     * (지금은 좌표를 눌러야 해서 놀이마다 다르게 짠다).
     *
     * 판이 격자면 2차원으로 움직인다 — 칸 수를 CSS 에서 읽는다(`grid-template-columns`).
     * 격자가 아니면 한 줄로 본다. 그림판(canvas)만 쓰는 놀이 10개는 손이 그대로 마우스다 —
     * 거기까지 키로 하려면 게임마다 뜻이 달라 규약이 깨진다.
     */
    let keyAt = -1;

    /** 지금 화면에서 누를 수 있는 단추들. 화면이 다시 그려지면 이 목록도 새로 만든다. */
    const keyable = (): HTMLElement[] =>
      [...viewEl.querySelectorAll<HTMLElement>('button:not([disabled]),[role="button"]:not([aria-disabled="true"])')]
        .filter((e) => e.offsetParent !== null);

    const paintKey = (list: HTMLElement[]): void => {
      list.forEach((e, i) => e.classList.toggle('ac-key', i === keyAt));
    };

    /** 그림을 다시 그린 뒤 짚은 자리를 도로 얹는다. 아직 아무 데도 안 짚었으면 아무것도 안 한다. */
    const markKeyCursor = (): void => {
      if (keyAt < 0) return;
      const list = keyable();
      if (!list.length) return;
      // 단추 수가 줄었으면(카드를 냈다) 끝으로 당긴다 — 안 그러면 짚은 자리가 사라진다.
      keyAt = Math.min(keyAt, list.length - 1);
      paintKey(list);
    };

    /** 격자면 한 줄에 몇 칸인가. 아니면 0. */
    const cols = (el: HTMLElement): number => {
      const box = el.parentElement;
      if (!box) return 0;
      const t = getComputedStyle(box).gridTemplateColumns;
      return t && t !== 'none' ? t.split(' ').filter(Boolean).length : 0;
    };

    $<HTMLElement>('#acStage').addEventListener('keydown', (ev: KeyboardEvent) => {
      const list = keyable();
      if (!list.length) return;
      const key = ev.key;
      if (key === 'Enter' || key === ' ') {
        if (keyAt < 0) keyAt = 0;
        list[Math.min(keyAt, list.length - 1)]?.click();
        ev.preventDefault();
        return;
      }
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
      let move = step[key];
      if (move === undefined && (key === 'ArrowDown' || key === 'ArrowUp')) {
        const n = cols(list[Math.max(0, keyAt)] ?? list[0]);
        move = (key === 'ArrowDown' ? 1 : -1) * (n || 1);
      }
      if (move === undefined) return;
      /* 처음 누르는 화살표는 「고르기 시작」이다 — 그때 0번으로 들어간다. */
      keyAt = keyAt < 0 ? 0 : Math.min(list.length - 1, Math.max(0, keyAt + move));
      paintKey(list);
      list[keyAt]?.scrollIntoView({ block: 'nearest' });
      ev.preventDefault();
    });

    /**
     * 그리는 법을 고른다 — **규칙은 그대로, 표현만 바뀐다** (`views.ts` 의 좁은 구멍).
     *
     * 입체 화면이 있는 판에서 3D 를 골랐고 그 조각이 이미 와 있으면 그것으로, 아니면 2D 로.
     * 「아직 안 왔다」는 조용히 2D 다 — 표현 하나 못 받았다고 판이 안 서면 안 된다.
     */
    function viewFor(id: string): ReturnType<typeof viewById> {
      if (dim() === '3d' && cardById(id)?.d3) {
        const v3 = view3dById(id);
        if (v3) return v3;
      }
      return viewById(id);
    }

    function mountView(id: string): void {
      const gv = viewFor(id);
      viewEl.innerHTML = '';
      render = gv ? (gv.mount(viewEl, (a: unknown) => sendAct(a)) as Render<unknown>) : null;
      /* 조각이 아직 안 왔으면 받아서 **그때 다시 붙인다** (TASK-KL-242 쪼개기).
         그 사이 `render` 는 null 이고 `paint` 는 그걸 이미 견딘다 — 판은 커널이 들고 있어서
         화면이 늦게 와도 놓치는 수가 없다. 그 사이 딴 게임으로 넘어갔으면 안 붙인다. */
      if (!gv) void ensureGame(id).then(() => { if (gameId === id && !render) mountView(id); });
      /* 3D 로 보기로 했는데 그 표현이 아직 없으면 받아 두고 **그때 갈아 끼운다**.
         지금은 2D 가 이미 서 있으므로 사람은 끊김을 안 본다. */
      else if (dim() === '3d' && cardById(id)?.d3 && !view3dById(id)) {
        /* 다시 그리라고 부르지 않는다 — 시계가 매 tick 그린다(`paint`). 붙이기만 하면 다음 칸에 찬다. */
        void ensureView3d(id).then((ok) => {
          if (ok && gameId === id && dim() === '3d') mountView(id);
        });
      }
      paintDim(id);
    }

    /** 지금 표현 — 사람이 고른 것이 브라우저에 남는다. */
    function dim(): '2d' | '3d' {
      try {
        return localStorage.getItem('karmolab.arcade.dim') === '3d' ? '3d' : '2d';
      } catch {
        return '2d';
      }
    }

    /** 이 판에 입체 화면이 있을 때만 단추가 선다 — 없는 판에 죽은 단추를 두지 않는다. */
    function paintDim(id: string): void {
      const btn = container.querySelector<HTMLButtonElement>('#acDim');
      if (!btn) return;
      const has = !!cardById(id)?.d3;
      btn.style.display = has ? '' : 'none';
      const on3d = dim() === '3d';
      btn.textContent = on3d ? '3D' : '2D';
      btn.setAttribute('aria-pressed', String(on3d));
    }

    function sendAct(a: unknown): void {
      /* 구경꾼의 손은 여기서 멈춘다. 주인도 자리 없는 사람의 수는 흘리지만, **화면이 반응하면
         사람은 자기가 두고 있다고 믿는다** — 막는 자리는 손이 나가기 전이어야 한다. */
      if (watching || replaying) return;
      /* 편지 판이면 **내 차례에 한 수만** 둔다 — 두고 나면 링크가 새로 나온다. */
      if (letter) {
        if (turnOf(letter) !== mySeat || match?.view().finished) return;
        const before = JSON.stringify(match?.view().state);
        match?.dispatch(mySeat, a);
        if (JSON.stringify(match?.view().state) === before) return; /* 못 두는 수는 안 적는다 */
        letter = { ...letter, moves: [...letter.moves, a] };
        blip('tap');
        buzz('tap');
        paintLetter();
        return;
      }
      /* 놀이마다 소리를 붙이지 않는다 — **손이 지나가는 자리가 여기 하나**라, 여기서 울리면
         51개가 한꺼번에 소리를 얻는다(게임 파일은 소리를 몰라도 된다). */
      blip('tap');
      if (match) match.dispatch(mySeat, a);
      else net?.act({ a: a as Json });
    }

    /** 대회가 돌고 있으면 여기 있다 (혼자 하는 대회 — 여럿 대회는 다음 걸음). */
    let tour: TourState | null = null;

    function beginMatch(id: string, seats: SeatSpec[], seed: number, want?: number): void {
      const g = gameById(id);
      /* 조각이 아직이면 **받아서 다시 들어온다** (TASK-KL-242 쪼개기). 부르는 자리가 예닐곱인데
         저마다 기다리게 하면 언젠가 한 곳을 빠뜨린다 — 문을 하나로 두고 여기서만 기다린다. */
      if (!g) {
        void ensureGame(id).then(() => {
          if (gameById(id)) beginMatch(id, seats, seed, want);
        });
        return;
      }
      gameId = id;
      mySeat = 0;
      watching = false;
      ended = false;
      soundedRound = -1;
      /* 빈 자리를 **이름 있는 사람**으로 채운다 (TASK-KL-264). 커널이 채우면 「봇 1」이 되는데,
         그건 자리를 채운 것이지 같이 논 것이 아니다. 손버릇도 여기서 정해 판 내내 지킨다. */
      /* 인원은 **판이 아니라 오락실이** 정한다 (`seating.ts`). 최솟값으로 채우면 「1명부터」인
         판 17개가 혼자 열었을 때 봇 없이 혼자 돈다 — 경주에 상대가 없었다(F1 실측). */
      /* 편을 가른 판은 인원을 편이 정한다(넷) — 그 밖에는 오락실이 정한다(`seating.ts`). */
      const need = Math.max(0, (want ?? partySize(g)) - seats.length);
      /* 대회 중이면 다섯 판 내내 **같은 사람들**과 논다 — 또 깜냥한테 졌다가 되려면 그래야 한다. */
      const crew = tour ? tour.crew.slice(0, need) : pickBots(need);
      const personas: Record<number, BotPersona> = {};
      crew.forEach((b, i) => {
        personas[seats.length + i] = b;
      });
      const withCrew: SeatSpec[] = [...seats, ...crew.map((b) => ({ name: b.name, bot: true }))];

      /* **어제의 나**를 마지막 자리에 앉힌다 (TASK-KL-264 A3). 고스트는 봇의 한 종류라
         여기 한 줄이면 끝난다 — 자리도 점수도 결과 화면도 이미 있는 것을 쓴다.
         혼자 놀 때만. 여럿이 있는 방에 내 지난 판을 끼워 넣으면 자리가 하나 줄어든다. */
      const past = !net && !tour ? bestOf(id) : null;
      /* 끝나면 `noteBest` 가 덮으므로 **시작할 때** 챙겨 둔다 — 결과에 「어제 N」을 적으려면 필요하다. */
      lastBest = bestOf(id)?.score ?? null;
      let def = withBotLevel(g, levelNow(), personas);
      if (past && withCrew.length > seats.length) {
        const gseat = withCrew.length - 1;
        withCrew[gseat] = { name: GHOST_NAME, bot: true };
        def = withGhost(def, gseat, past as never) as typeof def;
      }
      match = new Match(def, seed, withCrew) as Match<unknown, unknown>;
      /* 되살릴 재료 — 씨앗과 자리. 이 둘과 「누른 것」이면 판이 다시 만들어진다(`replay.ts`). */
      lastSeed = seed;
      lastSeats = withCrew;
      lastPersonas = personas;
      lastLevel = levelNow();
      tape = null;
      replaying = false;
      shadow = null;
      mountView(id);
      againBtn.style.display = 'none';
      show('play');
      t0 = performance.now();
      cancelAnimationFrame(raf);
      loop();
      /* 판이 서면 무대에 초점을 준다 — 키를 누를 곳이 어디인지 화면이 말해 줘야 한다.
         `preventScroll` 없이 부르면 폰에서 화면이 무대로 튄다. */
      keyAt = -1;
      $<HTMLElement>('#acStage').focus({ preventScroll: true });
      Toolbox.trackUse?.(id);
      /* 「안 해 본 것 먼저」가 성립하려면 해 본 것을 적어야 한다 (`plays.ts`). */
      notePlay(id);
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
      /* **세는 동안 받는다** (TASK-KL-242 쪼개기). 「셋·둘·하나」 3초가 그대로 조각 받는 시간이
         되어, 사람 눈에는 기다림이 하나도 안 는다. 못 받아도 `beginMatch` 가 한 번 더 기다린다. */
      void ensureGame(id);
      const introEl = $<HTMLElement>('#acIntro');
      const numEl = $<HTMLElement>('#acIntroNum');
      $<HTMLElement>('#acIntroIcon').textContent = iconOf(id);
      $<HTMLElement>('#acIntroName').textContent = t('arcade.game.' + id + '.name');
      $<HTMLElement>('#acIntroDesc').textContent = t('arcade.game.' + id + '.desc');
      introEl.style.display = '';
      /* 지난 판의 결과와 「한 판 더」를 치운다 — 안 치우면 다음 판을 세는 동안 지난 판이
         아직 안 끝난 것처럼 보인다(대회에서 다음 판이 안 넘어가는 것처럼 보였다). */
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      hideResult();
      say('');
      $<HTMLElement>('#acIntroSkip').textContent = t('arcade.intro.skip');
      let left = 3;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        stopTick();
        introEl.style.display = 'none';
        introEl.onclick = null;
        go();
      };
      /* 두 번째부터는 규칙을 이미 안다 — 누르면 바로 시작한다. */
      introEl.onclick = finish;
      dropIntro = (): void => {
        done = true;
        stopTick();
        introEl.style.display = 'none';
        introEl.onclick = null;
      };
      numEl.textContent = String(left);
      blip('start');
      // 시작 카운트다운도 보이는 동안만 — 안 보는 사이에 판이 시작돼 있으면 지고 들어간다.
      const stopTick = intervalWhileVisible(() => {
        left -= 1;
        if (left > 0) {
          numEl.textContent = String(left);
          blip('tap');
          return;
        }
        finish();
      }, 900);
      Toolbox.onDispose?.(stopTick);
    }

    /** 대회 — 다섯 판을 이어서. 점수는 판마다 등수로 매긴다(점수의 뜻이 판마다 달라서다). */
    function startTour(): void {
      net?.leave();
      net = null;
      tour = {
        games: pickGames(CARDS.map((g) => ({ id: g.id, kind: kindOf(g.id), seats: g.seats }))),
        at: 0,
        points: new Array(PARTY).fill(0) as number[],
        crew: pickBots(PARTY - 1)
      };
      nextTourGame();
    }

    function nextTourGame(): void {
      if (!tour || isOver(tour)) return;
      const id = tour.games[tour.at];
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now()))));
    }

    /* ── 편지로 두기 (TASK-KL-264 D5) ─────────────────────────────
     *
     * 방을 안 연다. 판 전체가 링크 안에 있고, **한 수 두면 새 링크가 나온다.**
     * 그래서 이 자리에는 그물망도 봇도 없다 — 사람 둘이 번갈아 둘 뿐이다.
     */
    let letter: Letter | null = null;

    function paintLetter(): void {
      const box = $<HTMLElement>('#acLetter');
      if (!letter) { box.style.display = 'none'; return; }
      box.style.display = '';
      const mine = turnOf(letter) === mySeat;
      const done = match?.view().finished;
      const packed = fold(letter);
      $<HTMLInputElement>('#acLetterUrl').value = packed ? letterLink('arcade', packed) : '';
      $<HTMLElement>('#acLetterSay').textContent = done
        ? t('arcade.letter.over')
        : !packed
          ? t('arcade.letter.toobig')
          : mine
            ? t('arcade.letter.your')
            : t('arcade.letter.sent');
    }

    /** 링크로 들어왔다 — 적힌 수를 다 두고, 다음 차례면 내가 둘 수 있게 연다. */
    function openLetter(post: Letter): void {
      const g = gameById(post.game);
      if (!g) {
        void ensureGame(post.game).then(() => {
          if (gameById(post.game)) openLetter(post);
        });
        return;
      }
      net?.leave();
      net = null;
      tour = null;
      letter = post;
      gameId = post.game;
      /* **내 자리는 「다음에 둘 자리」다.** 링크를 받은 사람이 지금 둘 사람이므로. */
      mySeat = turnOf(post);
      watching = false;
      replaying = false;
      ended = false;
      soundedRound = -1;
      match = deal(g, post) as Match<unknown, unknown>;
      shadow = null;
      mountView(post.game);
      show('play');
      t0 = performance.now() - match.clock();
      cancelAnimationFrame(raf);
      loop();
      paintLetter();
    }

    /** 편지 판을 새로 시작한다 — 아직 아무도 안 둔 판. */
    function startLetter(id: string): void {
      /* 조각은 아직 없어도 된다 — 새 편지 판은 이름과 씨앗만 있으면 접힌다.
         받아 오는 것은 `openLetter` 한 곳에서만 기다린다(문을 둘로 만들지 않는다). */
      if (!cardById(id)) return;
      openLetter({ game: id, seed: seedFrom(id + String(Date.now())), who: [myName(), t('arcade.letter.friend')], moves: [] });
    }

    /**
     * 편 갈라 — 넷이 앉아 둘씩 나눈다 (TASK-KL-264 E1).
     *
     * 커널에는 아무 말도 안 한다. 자리는 그대로 각자 점수를 내고 **합치는 것만 여기서** 한다 —
     * 그래서 게임 파일은 편이 있다는 것을 모르고, 같은 규칙이 「우리가 잘하기」로 달리 놀린다.
     */
    function startTeam(id: string): void {
      const card = cardById(id);
      if (!card) return;
      net?.leave();
      net = null;
      letter = null;
      const n = Math.min(4, card.seats[1]);
      plan = split(n);
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now())), n));
    }

    /** 혼자 — 그물망 없이 커널만. 빈 자리는 봇이 앉는다. */
    function startSolo(id: string): void {
      net?.leave();
      net = null;
      plan = null;
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
      /* 자리가 몇이고 지금 몇이 넘치는지를 **기다리는 동안** 말해 준다 — 시작하고 나서
         「나는 왜 못 두지」를 겪게 하면 그건 관전이 아니라 고장으로 느껴진다. */
      const cap = cardById(gameId)?.seats[1] ?? 0;
      const over = Math.max(0, peers.length + 1 - cap);
      $<HTMLElement>('#acWaitStatus').textContent =
        (host ? t('arcade.wait.host', { n: String(peers.length + 1) }) : t('arcade.wait.guest')) +
        (over > 0 ? ' · ' + t('arcade.watch.over', { n: String(over) }) : '');
      startBtn.style.display = host ? '' : 'none';
      $<HTMLElement>('.ac-share').style.display = host ? '' : 'none';
    }

    /** 목록에 올린 방을 내리는 손 — 방을 닫을 때 부른다. */
    let dropOpen: (() => void) | null = null;

    function openRoom(id: string, publicly = false): void {
      /* 이미 방을 들고 있으면 새로 파지 않는다 — 그게 「방 유지」의 전부다. */
      if (net?.host) {
        startTogether(id);
        return;
      }
      const code = makeCode();
      /* 「같이 찾기」로 연 방만 목록에 올린다 — 「같이」는 그대로 링크 아는 사람만이다. */
      dropOpen?.();
      dropOpen = publicly ? holdRoom({ code, game: id, host: myName() }) : null;
      gameId = id;
      peers = [];
      show('wait');
      $<HTMLInputElement>('#acUrl').value = inviteLink('arcade', code);
      paintWait(code, true);
      net = connect(code, true, myName(), {
        onPeers: (list) => {
          peers = list;
          paintWait(code, true);
          paintRoom();
        },
        onAct: (peerId, data) => {
          const seat = seatOf[peerId];
          if (seat !== undefined) match?.dispatch(seat, (data as { a?: unknown }).a);
        },
        onSync: () => {
          /* 주인은 남의 판을 안 받는다 */
        },
        onSay: () => {
          /* 주인은 제 소식을 안 받는다 */
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
        onSay: (data) => {
          /* 판 밖의 소식. 지금은 하나뿐 — 주인이 다음 판을 고르는 중이다.
             `sync` 로는 못 알린다: 그 순간 보낼 판이 아예 없다. */
          if ((data as { kind?: string })?.kind !== 'picking') return;
          $<HTMLElement>('#acOverHead').textContent = '⏳ ' + t('arcade.room.picking');
          $<HTMLElement>('#acOverList').innerHTML = '';
          $<HTMLElement>('#acOverNote').textContent = '';
          $<HTMLElement>('#acOver').style.display = '';
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
          /* **자리가 없으면 -1.** 0 으로 두면 구경꾼이 제가 1번 자리인 줄 알고 수를 두려 든다
             (주인이 흘리므로 판은 안 깨지지만, 화면은 내 차례라고 말한다). */
          mySeat = seatOf[net?.selfId ?? ''] ?? -1;
          watching = mySeat < 0;
          shadow = { v: p.v, now: p.now, at: performance.now() };
        }
      });
    }

    /** 주인이 판을 연다 — 자리를 정하는 것은 주인 하나뿐이다. */
    /**
     * 방에 있는 사람들과 시작한다 — **판이 끝나도 방은 안 닫는다** (TASK-KL-264 D3).
     *
     * 전에는 「한 판 더」가 **같은 게임**만 다시 열었다. 다른 것을 하려면 방을 닫고, 링크를
     * 다시 보내고, 다시 모여야 했다 — 모으는 비용이 노는 비용보다 커서 실제로는 한 판 하고 끝났다.
     * 그래서 주인은 로비로 **방을 든 채** 돌아가 아무 게임이나 고를 수 있다. 손님 쪽은 이미
     * 「받은 판의 게임이 바뀌면 갈아 끼운다」로 되어 있어서 따라오는 데 새 코드가 필요 없었다.
     */
    function startTogether(id?: string): void {
      if (id) gameId = id;
      const card = cardById(gameId);
      if (!card) return;
      /* 자리를 정하는 것은 주인 하나다. 0 번은 주인, 그다음은 들어온 차례대로. */
      const take = peers.slice(0, card.seats[1] - 1);
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

    /* 단추는 마우스 사건을 넘긴다 — 그게 게임 이름 자리에 들어가면 안 된다. */
    startBtn.onclick = (): void => startTogether();

    /* 링크로 들어온 사람은 곧장 손님이 된다.
     *
     * **주소의 `#` 뒤는 셸의 것이다.** 셸이 어느 화면을 열었는지를 거기 적기 때문에, 방 이름을
     * `#r=...` 로 달면 화면이 열리는 순간 `#arcade` 로 덮여 사라진다(실측: `#r=CRL99` → `#home`
     * → `#arcade`). 그래서 방 이름은 **물음표 뒤**에 단다 — 그쪽은 셸이 안 건드린다. */
    const joined = location.search.match(/[?&]r=([A-Za-z0-9]{4,12})/);
    if (joined) joinRoomAs(joined[1]);

    /* 편지가 실려 있으면 그 판을 편다 — 방과 다른 자리(`?m=`)를 쓴다 (TASK-KL-264 D5). */
    const posted = letterFromUrl();
    if (posted) openLetter(posted);

    $<HTMLButtonElement>('#acLetterCopy').onclick = (): void => {
      void Toolbox.copyText?.($<HTMLInputElement>('#acLetterUrl').value, { message: t('arcade.copy.done') });
    };

    $<HTMLButtonElement>('#acCopy').onclick = (): void => {
      void Toolbox.copyText?.($<HTMLInputElement>('#acUrl').value, { message: t('arcade.copy.done') });
    };

    /**
     * 로비 머리의 「방 유지 중」 띠. 방을 든 채 로비에 서 있다는 것을 **화면이 말해야 한다** —
     * 안 그러면 게임을 고르는 순간 방이 닫혔는지 이어지는지 아무도 모른다.
     */
    function paintRoom(): void {
      const box = $<HTMLElement>('#acRoom');
      if (!net?.host) {
        box.style.display = 'none';
        return;
      }
      box.style.display = '';
      box.innerHTML =
        '<b>🔗 ' + esc(t('arcade.room.kept', { n: String(peers.length + 1) })) + '</b>' +
        '<span style="flex:1"></span>' +
        '<button class="btn btn-ghost" id="acRoomClose">' + esc(t('arcade.room.close')) + '</button>';
      const close = container.querySelector<HTMLButtonElement>('#acRoomClose');
      if (close) {
        close.onclick = (): void => {
          net?.leave();
          net = null;
          peers = [];
          paintRoom();
        };
      }
    }

    /**
     * 「다시 보기」 — 방금 그 판을 처음부터 다시 굴린다 (TASK-KL-264).
     *
     * 판을 저장해 두고 되감는 것이 **아니다.** 씨앗과 「누가 언제 무엇을 눌렀나」로 커널을
     * 다시 굴린다 — 그래서 51개가 한꺼번에 얻는다. 게임 파일은 이걸 모른다.
     */
    replayBtn.onclick = (): void => {
      const g = gameById(gameId);
      if (!g || !tape) return;
      replaying = true;
      tapeAt = 0;
      ended = false;
      soundedRound = -1;
      match = new Match(withBotLevel(g, lastLevel, lastPersonas), tape.seed, tape.seats) as Match<unknown, unknown>;
      mountView(gameId);
      hideResult();
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      say(t('arcade.replay.now'), 'ok');
      t0 = performance.now();
      cancelAnimationFrame(raf);
      loop();
    };

    /** 「다른 게임」 — 방을 든 채 로비로. 손님에게는 「고르는 중」이라고 알린다. */
    swapBtn.onclick = (): void => {
      if (!net?.host) return;
      net.say({ kind: 'picking' });
      cancelAnimationFrame(raf);
      match = null;
      render = null;
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      replaying = false;
      plan = null;
      letter = null;
      $<HTMLElement>('#acLetter').style.display = 'none';
      hideResult();
      paintRoom();
      paintPicks();
      show('lobby');
    };

    const quit = (): void => {
      dropIntro?.();
      dropIntro = null;
      /* 방을 닫으면 목록에서도 내린다 — 안 내리면 10분 동안 「눌렀는데 아무도 없네」가 된다. */
      dropOpen?.();
      dropOpen = null;
      cancelAnimationFrame(raf);
      net?.leave();
      net = null;
      match = null;
      shadow = null;
      render = null;
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      hideResult();
      paintRoom();
      /* 방금 논 것이 **로비 전체**에 바로 반영돼야 한다 — 추천 여섯의 차례뿐 아니라
         카드의 「🏅 최고 N」도 그렇다. 추천만 다시 그렸더니 기록을 세우고 나와도 뱃지가
         안 붙어 있었다(실측). 로비를 반만 갱신하면 반은 옛 화면이다. */
      paintPicks();
      paintGames();
      show('lobby');
    };
    $<HTMLButtonElement>('#acQuit').onclick = quit;

    /**
     * 풀스크린 — **무대만** 키운다 (TASK-KL-314).
     *
     * 창 전체가 아니라 `.ac-stage` 하나를 키우는 이유: 자리줄·상태글·단추가 같이 커지면
     * 판이 오히려 작아진다. 무대만 키우면 그 안의 51개가 그대로 커진다 — 게임 화면은 이걸 모른다.
     *
     * 안 되는 곳(iOS 사파리의 일부)에서는 조용히 아무 일도 안 일어난다. 단추를 숨기지는 않는다 —
     * 눌러 보고 안 되는 것과 아예 없는 것 중, 없는 쪽이 더 오래 헷갈린다.
     */
    /**
     * 풀스크린이면 단추 줄을 **무대 안으로 옮긴다** (TASK-KL-314).
     *
     * 브라우저는 풀스크린 대상 **밖을 아예 안 그린다.** 그래서 무대만 키웠더니 나가기·한 판
     * 더·소리가 통째로 사라졌다 — 판이 끝나도 아무것도 못 하고, 나가려면 ESC 를 알아야 했다
     * (실측: 그 자리를 눌러 보면 무대가 잡힌다). 화면에 안 보이는 단추는 없는 단추다.
     *
     * 옮기는 것으로 푼다 — 복제가 아니라 이동이라 붙여 둔 손잡이(onclick)가 그대로 따라온다.
     * ESC 로 나가는 길도 있으므로 되돌리는 것은 `fullscreenchange` 가 맡는다(단추만 보면 샌다).
     */
    /* ── 눕힌 좁은 화면: 무대 크기를 **남은 자리에서** 정한다 (2026-08-15 실측) ──────
     *
     * 여태 `78vh` 라는 **손으로 맞춘 상수**였다. 그 값은 폰 둘(390×844 · 844×390)에서 재서
     * 고른 것인데, 셸 머리띠가 세로를 먼저 먹는 양이 **화면 너비마다 다르다**:
     *   844 폭 → 머리띠 76px · 남는 세로 314 (=80vh)
     *   740 폭 → 머리띠 **123px** · 남는 세로 237 (=66vh)   ← 머리띠가 한 줄 더 접힌다
     * 한 개의 vh 상수로는 둘을 동시에 만족시킬 수 없다 — 740×360 에서 판이 **44px** 밀렸다.
     * 상수를 더 내리면 큰 폰에서 판이 쓸데없이 작아진다.
     *
     * 그래서 「몇 vh」를 맞히려 들지 않고, **무대 위가 실제로 얼마를 먹었는지 그 자리에서
     * 재서** 남은 만큼만 준다.
     *
     * ★ **안 보일 때 재면 안 된다** (첫 판에 이걸로 데었다): 화면이 숨어 있으면 무대의 위치가
     *   0 으로 잡혀 「남은 세로 = 화면 전체」가 되고, 그러면 판이 머리띠 높이만큼 **더** 밀린다
     *   (44px → 121px 로 악화). 그래서 ⓐ 보이는지 먼저 확인하고 ⓑ 판이 실제로 그려지는
     *   순간에 다시 잰다.
     */
    const stageEl = $<HTMLElement>('#acStage');
    const landscapeNarrow = (): boolean => window.matchMedia('(orientation:landscape) and (max-height:560px)').matches;
    const fitStage = (): void => {
      if (!stageEl.isConnected) return;
      if (!landscapeNarrow() || document.fullscreenElement) {
        stageEl.style.removeProperty('--ac-stage');
        return;
      }
      const box = stageEl.getBoundingClientRect();
      /* 안 보이면 재지 않는다 — 0 을 진짜 위치로 읽으면 위 주석의 그 사고가 난다. */
      if (stageEl.offsetParent === null || box.height === 0) return;
      /* 무대 위가 먹은 세로 = 무대의 화면상 위치. 아래로는 2px 만 남긴다(경계선 반올림 몫). */
      const remainingHeight = Math.max(120, Math.round(window.innerHeight - box.top - 2));
      stageEl.style.setProperty('--ac-stage', `min(62vw, ${remainingHeight}px, 640px)`);
    };
    /* 판이 그려질 때마다 다시 잰다 — 그때가 무대가 확실히 보이는 시점이다. */
    new MutationObserver(() => requestAnimationFrame(fitStage))
      .observe($<HTMLElement>('#acView'), { childList: true, subtree: false });
    window.addEventListener('resize', () => requestAnimationFrame(fitStage));
    window.addEventListener('orientationchange', () => requestAnimationFrame(fitStage));
    document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitStage));

    const controls = $<HTMLElement>('#acControls');
    const controlsHome = controls.parentElement;
    document.addEventListener('fullscreenchange', () => {
      const stage = $<HTMLElement>('#acStage');
      if (document.fullscreenElement === stage) stage.appendChild(controls);
      else controlsHome?.appendChild(controls);
    });

    /* 표현 갈아 끼우기 — 판은 커널이 들고 있으므로 그리는 법만 바꿔 다시 붙이면 그대로 이어진다. */
    $<HTMLButtonElement>('#acDim').onclick = (): void => {
      const next = dim() === '3d' ? '2d' : '3d';
      try {
        localStorage.setItem('karmolab.arcade.dim', next);
      } catch {
        /* 못 적어도 이 판에서는 바뀐다 */
      }
      if (gameId) mountView(gameId);
    };

    $<HTMLButtonElement>('#acFull').onclick = (): void => {
      const stage = $<HTMLElement>('#acStage');
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void stage.requestFullscreen?.();
      } catch {
        /* 못 키워도 판은 돈다 */
      }
    };

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
      if (tour) {
        /* 대회 중이면 「한 판 더」가 「다음 판」이 된다. 다 돌았으면 대회를 닫고 로비로. */
        if (isOver(tour)) {
          tour = null;
          againBtn.textContent = t('arcade.btn.again');
          quit();
          return;
        }
        nextTourGame();
        return;
      }
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
