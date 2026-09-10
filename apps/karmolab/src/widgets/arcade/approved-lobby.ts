import type { GameCard } from './catalog-meta.generated';
import { LobbyRun } from './lobby';
import { mountLobbyMusic } from './lobby-music';

export function mountApprovedLobby(home: HTMLElement, cards: GameCard[], enter: (id: string, mode?: 'solo' | 'multi') => void, signal: AbortSignal): { refresh: () => void } {
  home.classList.add('ac-approved-lobby');
  const frame = document.createElement('iframe');
  frame.className = 'ac-approved-frame';
  frame.title = '오락실 로비';
  frame.src = '/apps/karmolab/arcade-lobby/index.html';
  home.append(frame);
  const history = new LobbyRun();
  const refresh = (): void => {
    frame.contentWindow?.postMessage({type:'arcade-lobby-context',recent:history.recent()[0]},location.origin);
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'arcade-lobby-ready') refresh();
    if (event.data?.type === 'arcade-lobby-enter' && typeof event.data.game === 'string') {
      if (cards.some(card => card.id === event.data.game)) {
        const mode = event.data.mode === 'solo' || event.data.mode === 'multi' ? event.data.mode : undefined;
        enter(event.data.game, mode);
      }
      else frame.contentWindow?.postMessage({type:'arcade-lobby-unavailable'},location.origin);
    }
  }, {signal});
  signal.addEventListener('abort', () => frame.remove(), {once:true});
  mountLobbyMusic(home, signal);
  refresh();
  return {refresh};
}
