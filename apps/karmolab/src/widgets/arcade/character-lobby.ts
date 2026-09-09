import { t } from '../../lib/i18n';
import type { GameCard } from './catalog-meta.generated';
import { iconOf } from './meta';
import { mountLobbyMusic } from './lobby-music';

const painted = new Set(['gomoku', 'yacht', 'solitaire', 'reversi', 'four', 'checkers', 'blackjack', 'snake', 'pong', 'airhockey']);
const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const nameOf = (game: GameCard): string => t('arcade.game.' + game.id + '.name');
function artwork(game: GameCard): string {
  return painted.has(game.id)
    ? '<img src="/apps/karmolab/img/arcade/covers/' + game.id + '.svg" alt="" loading="lazy">'
    : '<div class="ac-cover-fallback" aria-hidden="true">' + iconOf(game.id) + '</div>';
}

export function mountCharacterLobby(home: HTMLElement, cards: GameCard[], enter: (id: string) => void, signal: AbortSignal): { refresh: () => void } {
  const games = home.querySelector<HTMLElement>('#acGames')!;
  let selected = cards[0];
  let query = '';
  home.classList.add('ac-character-lobby');
  const fit = (): void => {
    const bounds = home.getBoundingClientRect();
    if (!home.offsetWidth) return;
    const scale = bounds.width / home.offsetWidth;
    const height = Math.max(480, (window.innerHeight - bounds.top - 16) / scale);
    home.style.setProperty('--ac-lobby-height', height.toFixed(1) + 'px');
  };
  const sizeObserver = new ResizeObserver(fit);
  sizeObserver.observe(home.parentElement!);
  window.addEventListener('resize', fit, { signal });
  signal.addEventListener('abort', () => sizeObserver.disconnect(), { once: true });
  fit();
  games.innerHTML = '<section class="ac-feature"><div class="ac-feature-art"></div><div class="ac-feature-copy"><small></small><h2></h2><p></p></div></section>' +
    '<div class="ac-lobby-actions"><button class="ac-enter"><span>' + escape(t('arcade.lobby.play')) + '</span><b aria-hidden="true">↗</b></button><button class="ac-library-open">' + escape(t('arcade.lobby.change')) + '</button></div>';
  const dialog = document.createElement('dialog');
  dialog.className = 'ac-library';
  dialog.setAttribute('aria-label', t('arcade.lobby.choose'));
  dialog.innerHTML = '<div class="ac-library-head"><h2>' + escape(t('arcade.lobby.choose')) + '</h2><button class="ac-library-close">' + escape(t('arcade.lobby.close')) + '</button></div>' +
    '<input class="ac-library-search" type="search" aria-label="' + escape(t('arcade.lobby.search')) + '" placeholder="' + escape(t('arcade.lobby.search')) + '"><div class="ac-library-covers"></div><p class="ac-library-empty" hidden>' + escape(t('arcade.lobby.empty')) + '</p>';
  home.append(dialog);
  const start = games.querySelector<HTMLButtonElement>('.ac-enter')!;
  const open = games.querySelector<HTMLButtonElement>('.ac-library-open')!;
  function refresh(): void {
    if (!selected) { start.disabled = true; return; }
    games.querySelector('.ac-feature-art')!.innerHTML = artwork(selected);
    games.querySelector('h2')!.textContent = nameOf(selected);
    games.querySelector('.ac-feature-copy small')!.textContent = selected.id.toUpperCase();
    games.querySelector('.ac-feature-copy p')!.textContent = t('arcade.game.' + selected.id + '.desc');
    start.dataset.obj = selected.id;
    start.setAttribute('aria-label', nameOf(selected) + ' / ' + t('arcade.lobby.play'));
  }
  function list(): void {
    const filtered = cards.filter(g => (nameOf(g) + ' ' + g.id).toLocaleLowerCase().includes(query));
    dialog.querySelector('.ac-library-covers')!.replaceChildren(...filtered.map(game => {
      const button = document.createElement('button');
      button.className = 'ac-game-cover';
      button.dataset.game = game.id;
      button.setAttribute('aria-pressed', String(game === selected));
      button.innerHTML = artwork(game) + '<span><small>' + escape(game.id.toUpperCase()) + '</small><b>' + escape(nameOf(game)) + '</b></span>';
      button.addEventListener('click', () => { selected = game; refresh(); dialog.close(); });
      return button;
    }));
    dialog.querySelector<HTMLElement>('.ac-library-empty')!.hidden = filtered.length > 0;
  }
  start.onclick = () => { if (selected) enter(selected.id); };
  open.addEventListener('click', () => { list(); dialog.showModal(); }, { signal });
  dialog.querySelector('.ac-library-close')!.addEventListener('click', () => dialog.close(), { signal });
  dialog.querySelector<HTMLInputElement>('.ac-library-search')!.addEventListener('input', event => { query = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase(); list(); }, { signal });
  dialog.addEventListener('click', event => { const r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); }, { signal });
  signal.addEventListener('abort', () => { dialog.close(); dialog.remove(); }, { once: true });
  mountLobbyMusic(home, signal);
  refresh();
  return { refresh };
}
