/**
 * 판 위 크롬. 무대 크기, 메뉴 종이, 전체화면, 소리 버튼 (2026-09-02 감사 B2, `arcade.ts` 에서 분리)
 *
 * 판의 상태를 모름. DOM 과 브라우저만 봄. 위젯이 내려갈 때 `dispose` 로 관찰자를 끊음
 */
import { blip, soundOn, setSoundOn } from '../../lib/blip';

export interface ChromeDeps {
  container: HTMLElement;
  /** 판 영역 `#acPlay`. 메뉴 열림과 방 채움 클래스를 여기서 봄 */
  play: HTMLElement;
  /** 위젯이 내려갈 때 끊길 신호. 문서와 창 리스너에 얹음 */
  dying: { signal: AbortSignal };
}

export interface Chrome {
  setMenu: (open: boolean) => void;
  fitStage: () => void;
  dispose: () => void;
}

export function mountChrome(d: ChromeDeps): Chrome {
  const $ = <T extends HTMLElement>(sel: string): T => d.container.querySelector<T>(sel) as T;
  const play = d.play;

  /* 풀스크린 (TASK-KL-314)
   * - 무대(`.ac-stage`)만. 자리줄, 상태글, 버튼까지 커지면 판이 도리어 작아짐. 게임 화면은 이걸 모름
   * - 안 되는 곳(iOS 사파리 일부)은 조용히 무시. 버튼은 안 숨김 (없는 쪽이 더 오래 헷갈림)
   * - 풀스크린이면 버튼 줄을 무대 안으로 이동. 브라우저가 대상 밖을 안 그려 나가기와 소리가 통째로 사라졌음 (실측)
   * - 복제가 아니라 이동이라 onclick 이 그대로. ESC 로 나가는 길도 있어 되돌리기는 `fullscreenchange` 몫
   *
   * 눕힌 좁은 화면의 무대 크기 (2026-08-15 실측)
   * - 옛 값 `78vh` 는 폰 둘(390x844, 844x390)에서 맞춘 상수. 셸 머리띠가 먹는 세로가 폭마다 다름
   *   (844 폭: 머리띠 76px, 남는 세로 314. 740 폭: 머리띠 123px, 남는 세로 237). 740x360 에서 판이 44px 밀림
   * - 그래서 vh 를 맞히지 않고 무대 위가 실제로 먹은 세로를 그 자리에서 재서 남은 만큼만
   * - 안 보일 때는 안 잼. 숨은 화면은 위치가 0 으로 잡혀 남은 세로가 화면 전체가 되고 판이 더 밀림 (44 -> 121px).
   *   보이는지 먼저 확인하고, 판이 실제로 그려지는 순간(관찰자) 다시 잼
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
    /* 안 보이면 안 잼. 0 을 진짜 위치로 읽으면 위 주석의 그 사고 */
    if (stageEl.offsetParent === null || box.height === 0) return;
    /* 무대 위가 먹은 세로는 무대의 화면상 위치. 아래로는 2px 만 남김(경계선 반올림 몫) */
    const remainingHeight = Math.max(120, Math.round(window.innerHeight - box.top - 2));
    stageEl.style.setProperty('--ac-stage', `min(62vw, ${remainingHeight}px, 640px)`);
  };
  /* 판이 그려질 때마다 다시 잼. 그때가 무대가 확실히 보이는 시점 */
  const viewWatch = new MutationObserver(() => requestAnimationFrame(fitStage));
  viewWatch.observe($<HTMLElement>('#acView'), { childList: true, subtree: false });
  window.addEventListener('resize', () => requestAnimationFrame(fitStage), d.dying);
  window.addEventListener('orientationchange', () => requestAnimationFrame(fitStage), d.dying);
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitStage), d.dying);

  const controls = $<HTMLElement>('#acControls');
  const menuBtn = $<HTMLButtonElement>('#acMenu');
  const controlsHome = controls.parentElement;
  const onFullscreenControls = (): void => {
    const stage = $<HTMLElement>('#acStage');
    if (document.fullscreenElement === stage) stage.append(menuBtn, controls);
    else controlsHome?.append(menuBtn, controls);
  };
  document.addEventListener('fullscreenchange', onFullscreenControls, d.dying);
  /* 방의 메뉴. 버튼 하나가 종이를 내리고 올린다. 줄 하나를 고르면 닫힘(소리 켜고 끄기는 열린 채) */
  const setMenu = (open: boolean): void => {
    if (open) tidySeps();
    play.classList.toggle('ac-menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  /* 구분선은 양쪽에 보이는 줄이 있을 때만. 숨은 버튼만 낀 무리 뒤의 선은 빈 선 */
  const tidySeps = (): void => {
    let seen = false;
    let lastSep: HTMLElement | null = null;
    for (const el of Array.from(controls.children) as HTMLElement[]) {
      if (el.classList.contains('ac-sep')) {
        el.hidden = !seen || !!lastSep;
        if (!el.hidden) lastSep = el;
        continue;
      }
      if (el.style.display !== 'none') {
        seen = true;
        lastSep = null;
      }
    }
    if (lastSep) lastSep.hidden = true;
  };
  menuBtn.onclick = () => setMenu(!play.classList.contains('ac-menu-open'));
  controls.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b && b.id !== 'acSound' && b.id !== 'acMdd' && b.id !== 'acCoords' && b.id !== 'acNums' && b.id !== 'acHand') setMenu(false);
  });
  const onMenuPointerdown = (ev: PointerEvent): void => {
    if (!play.classList.contains('ac-menu-open')) return;
    const el = ev.target as HTMLElement;
    if (!controls.contains(el) && !menuBtn.contains(el)) setMenu(false);
  };
  document.addEventListener('pointerdown', onMenuPointerdown, d.dying);
  const onMenuKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && play.classList.contains('ac-menu-open')) setMenu(false);
  };
  document.addEventListener('keydown', onMenuKeydown, d.dying);


  $<HTMLButtonElement>('#acFull').onclick = (): void => {
    /* 방(화면 채움)이면 판 영역 통째로. 무대만 키우면 자리 카드와 버튼이 무대 밖이라 안 보인다(사용자 실측) */
    const stage = play.classList.contains('ac-roomfill') ? play : $<HTMLElement>('#acStage');
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void stage.requestFullscreen?.();
    } catch {
      /* 못 키워도 판은 돈다 */
    }
  };


  /* 소리 끄기. 껐다 켠 것은 이 브라우저에만 남는다. */
  const soundBtn = $<HTMLButtonElement>('#acSound');
  const paintSound = (): void => {
    const emoji = soundBtn.querySelector('.ac-emoji');
    if (emoji) emoji.textContent = soundOn() ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', soundOn() ? 'true' : 'false');
  };
  paintSound();
  soundBtn.onclick = () => {
    setSoundOn(!soundOn());
    paintSound();
    if (soundOn()) blip('good');
  };

  return { setMenu, fitStage, dispose: () => viewWatch.disconnect() };
}
