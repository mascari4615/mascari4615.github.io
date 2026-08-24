/**
 * 정적 블로그 글의 커뮤니티 답글 조각 (change.board-unify ③).
 *
 * 본문은 git에서 구워진 채 그대로 산다. 이 파일이 실패해도 `#comments` 안만 실패 문구로 바뀌고
 * 글은 막지 않는다. 모양·익명 이름표·대댓글·좋아요·삭제 규칙은 커뮤니티 글 상세와 같다.
 */
import { renderMarkdown, escapeHtml as esc } from './widgets/community-markdown';

interface AnonFace {
  name: string;
  color: string;
}

interface Reply {
  id: string;
  text: string;
  authorHandle: string;
  anon: AnonFace | null;
  createdAt: string;
  byOwner: boolean;
  parentId: string | null;
  likes: number;
  likedByMe: boolean;
}

interface ThreadResponse {
  slug: string;
  replies: Reply[];
  signedIn: boolean;
  isAdmin: boolean;
  myHandle: string | null;
  myAnon: AnonFace | null;
  replyMaxLength: number;
}

interface AccountBridge {
  apiBase: string;
  signIn(): void;
}

type BlogWindow = Window & { KARMOLAB_API_BASE?: string; KarmoAccount?: AccountBridge };
const bridge = (): BlogWindow => window as BlogWindow;

const root = document.querySelector<HTMLElement>('[data-blog-comments]');
const DEFAULT_API = 'https://yawnbot.mascari4615.com';

function apiBase(): string {
  return bridge().KarmoAccount?.apiBase || bridge().KARMOLAB_API_BASE || DEFAULT_API;
}

function relativeTime(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(at));
}

function face(handle: string): string {
  return `<img class="c-face" data-reply-face src="${esc(apiBase())}/kl/u/${encodeURIComponent(handle)}/avatar" alt="">`;
}

function who(reply: Reply): string {
  if (reply.anon) {
    return `<span class="c-anon" style="color:${esc(reply.anon.color)}">${esc(reply.anon.name)}</span>`;
  }
  return `${face(reply.authorHandle)}<span>@${esc(reply.authorHandle)}</span>`;
}

/** 부모 바로 뒤에 자식 한 단을 편다. 부모가 사라진 옛 줄도 끝에 남겨 안 보이는 말을 만들지 않는다. */
function ordered(replies: Reply[]): Reply[] {
  const out: Reply[] = [];
  for (const top of replies.filter((reply) => !reply.parentId)) {
    out.push(top, ...replies.filter((reply) => reply.parentId === top.id));
  }
  for (const reply of replies) if (!out.includes(reply)) out.push(reply);
  return out;
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(`${apiBase()}${path}`, { ...init, credentials: 'include' });
  } catch {
    return null;
  }
}

function asName(data: ThreadResponse): string {
  const anon = data.myAnon
    ? `<span class="c-anon" style="color:${esc(data.myAnon.color)}">${esc(data.myAnon.name)}</span>`
    : '오늘의 익명';
  if (!data.myHandle) return `${anon}(으)로 남는다 · <button type="button" class="c-linkbtn" data-signin>로그인</button>`;
  return `<label class="c-anonpick"><input type="checkbox" data-anon> 익명</label>
      <span data-asname data-mine="@${esc(data.myHandle)}">@${esc(data.myHandle)}</span>(으)로 남는다
      <template data-anonname>${anon}</template>`;
}

function replyHtml(reply: Reply, data: ThreadResponse): string {
  const canDelete = data.isAdmin || (reply.anon === null && data.myHandle !== null && data.myHandle === reply.authorHandle);
  return `<li class="c-reply" data-child="${reply.parentId ? '1' : '0'}" data-owner="${reply.byOwner ? '1' : '0'}">
      <div class="c-reply-head">${who(reply)}
          ${reply.byOwner ? '<b class="c-owner">주인</b>' : ''}<span class="c-dot">${relativeTime(reply.createdAt)}</span></div>
      <div class="c-reply-body md">${renderMarkdown(reply.text)}</div>
      <div class="c-reply-foot">
          <button type="button" class="c-linkbtn" data-reply-like="${esc(reply.id)}" data-on="${reply.likedByMe ? '1' : '0'}"
              ${data.signedIn ? '' : 'disabled'}>좋아요${reply.likes ? ` ${reply.likes}` : ''}</button>
          ${data.signedIn && !reply.parentId ? `<button type="button" class="c-linkbtn" data-reply-to="${esc(reply.id)}">답글</button>` : ''}
          ${canDelete ? `<button type="button" class="c-linkbtn" data-reply-del="${esc(reply.id)}">삭제</button>` : ''}
      </div>
  </li>`;
}

function signIn(): void {
  if (bridge().KarmoAccount) {
    bridge().KarmoAccount?.signIn();
    return;
  }
  const back = encodeURIComponent(location.href.split('#')[0]);
  location.href = `${apiBase()}/kl/auth/discord?return=${back}`;
}

function failure(): void {
  if (!root) return;
  root.removeAttribute('aria-busy');
  root.innerHTML = `<div class="c-empty">답글 서버에 못 닿았다 — 글은 그대로 읽을 수 있다.
      <button type="button" class="c-linkbtn" data-retry>다시 받기</button></div>`;
  root.querySelector('[data-retry]')?.addEventListener('click', () => void load());
}

async function load(): Promise<void> {
  if (!root) return;
  const slug = root.dataset.slug ?? '';
  const title = root.dataset.title ?? document.title;
  if (!slug) return;
  root.setAttribute('aria-busy', 'true');
  const response = await call(`/kl/blog/${encodeURIComponent(slug)}/comments`);
  if (!response?.ok) {
    failure();
    return;
  }
  const data = (await response.json()) as ThreadResponse;
  root.removeAttribute('aria-busy');
  const list = data.replies.length
    ? ordered(data.replies).map((reply) => replyHtml(reply, data)).join('')
    : '<li class="c-empty">아직 답글이 없다. 첫 말을 남겨도 좋다.</li>';
  root.innerHTML = `<ul class="c-replies">${list}</ul>
      <form class="c-write" data-reply-form>
          <textarea name="cReply" data-reply-text maxlength="${data.replyMaxLength}" placeholder="답글을 남겨 보라" aria-label="답글" required></textarea>
          <div class="c-write-foot">
              <span class="c-write-hint" data-reply-target></span>
              <span class="c-write-hint">${asName(data)}</span>
              <button type="submit" class="btn btn-primary">답글</button>
          </div>
      </form>`;
  const heading = root.previousElementSibling;
  if (heading?.classList.contains('c-section')) heading.textContent = `답글 ${data.replies.length}`;

  // 정적 글의 CSP는 인라인 이벤트 핸들러를 허용하지 않는다. 아바타 실패 처리는 번들 안에서 연결한다.
  root.querySelectorAll<HTMLImageElement>('[data-reply-face]').forEach((image) => {
    image.addEventListener('error', () => {
      const blank = document.createElement('span');
      blank.className = 'c-face-blank';
      image.replaceWith(blank);
    }, { once: true });
  });
  root.querySelector('[data-signin]')?.addEventListener('click', signIn);
  root.querySelectorAll<HTMLInputElement>('[data-anon]').forEach((box) => {
    const foot = box.closest('.c-write-foot');
    const label = foot?.querySelector<HTMLElement>('[data-asname]');
    const anon = foot?.querySelector<HTMLTemplateElement>('[data-anonname]');
    if (!label || !anon) return;
    box.addEventListener('change', () => {
      label.innerHTML = box.checked ? anon.innerHTML : esc(label.dataset.mine ?? '');
    });
  });

  const threadPath = `/kl/blog/${encodeURIComponent(slug)}/comments`;
  root.querySelectorAll<HTMLButtonElement>('[data-reply-like]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await call(`${threadPath}/${encodeURIComponent(button.dataset.replyLike ?? '')}/like`, { method: 'POST' });
      if (!result?.ok) button.disabled = false;
      else await load();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-reply-del]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('이 답글을 지울까?')) return;
      const result = await call(`${threadPath}/${encodeURIComponent(button.dataset.replyDel ?? '')}`, { method: 'DELETE' });
      if (result?.ok) await load();
    });
  });

  let parentId: string | null = null;
  const target = root.querySelector<HTMLElement>('[data-reply-target]');
  const textarea = root.querySelector<HTMLTextAreaElement>('[data-reply-text]');
  root.querySelectorAll<HTMLButtonElement>('[data-reply-to]').forEach((button) => {
    button.addEventListener('click', () => {
      parentId = button.dataset.replyTo ?? null;
      if (target) target.textContent = '위 답글에 이어서 남긴다';
      textarea?.focus();
    });
  });
  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      root.querySelector<HTMLFormElement>('[data-reply-form]')?.requestSubmit();
    }
  });
  root.querySelector<HTMLFormElement>('[data-reply-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const text = (textarea?.value ?? '').trim();
    if (!text) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    const anon = form.querySelector<HTMLInputElement>('[data-anon]');
    const result = await call(threadPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, title, parentId, anon: anon ? anon.checked : true }),
    });
    if (!result?.ok) {
      if (button) button.disabled = false;
      return;
    }
    await load();
  });
}

if (root) void load();

export {};
