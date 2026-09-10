import { t } from '../../lib/i18n';
import { readRooms, type OpenRoom } from './open-rooms';

/** 종목별 방 목록과 코드 참가. 화면 이탈 시 요청과 이벤트 해제 */
export function mountRoomPicker(host: HTMLElement, game: string, join: (code: string) => void, signal: AbortSignal): void {
  if (signal.aborted) return;
  const head = document.createElement('div');
  head.className = 'ac-entry-roomhead';
  const title = document.createElement('h4');
  title.textContent = t('arcade.entry.rooms');
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = t('arcade.entry.refresh');
  head.append(title, refresh);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'ac-entry-roomlist';
  const pager = document.createElement('nav');
  pager.className = 'ac-entry-roomhead';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = '←';
  previous.setAttribute('aria-label', t('arcade.entry.previous'));
  const pageLabel = document.createElement('output');
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = '→';
  next.setAttribute('aria-label', t('arcade.entry.next'));
  pager.append(previous, pageLabel, next);
  pager.hidden = true;
  let page = 0;
  let available: OpenRoom[] = [];
  const paint = (): void => {
    const pages = Math.max(1, Math.ceil(available.length / 4));
    page = Math.min(page, pages - 1);
    list.replaceChildren();
    for (const room of available.slice(page * 4, page * 4 + 4)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(room.playing ? 'arcade.entry.watchRoom' : 'arcade.entry.joinRoom', { host: room.host });
      button.onclick = () => join(room.code);
      list.append(button);
    }
    pager.hidden = pages <= 1;
    pageLabel.textContent = `${page + 1} / ${pages}`;
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
  };
  previous.addEventListener('click', () => { page = Math.max(0, page - 1); paint(); }, { signal });
  next.addEventListener('click', () => { page++; paint(); }, { signal });
  const form = document.createElement('form');
  form.className = 'ac-entry-code';
  const label = document.createElement('label');
  label.textContent = t('arcade.entry.code');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.required = true;
  input.pattern = '[A-Za-z0-9]{5,20}';
  input.placeholder = 'ABCDE';
  label.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = t('arcade.entry.join');
  form.append(label, submit);
  host.append(head, status, list, pager, form);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (/^[A-Z0-9]{5,20}$/.test(code)) join(code);
  }, { signal });
  let request = 0;
  const load = async (): Promise<void> => {
    const current = ++request;
    refresh.disabled = true;
    status.textContent = t('arcade.entry.loading');
    list.replaceChildren();
    pager.hidden = true;
    const rooms = await readRooms(signal);
    if (signal.aborted || current !== request) return;
    refresh.disabled = false;
    if (rooms === null) { status.textContent = t('arcade.entry.unavailable'); return; }
    available = rooms.filter(room => room.game === game);
    page = 0;
    status.textContent = available.length ? '' : t('arcade.entry.empty');
    paint();
  };
  refresh.addEventListener('click', () => { void load(); }, { signal });
  void load();
}
