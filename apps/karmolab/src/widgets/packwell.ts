/**
 * 표 우물 (TASK-KL-153) — 바깥 세상에서 표를 길어 온다.
 *
 * 왜 있나: 놀이(높은 쪽 고르기·이상형 월드컵·티어표)의 재미는 놀이 방식이 아니라 **표**에서
 * 온다. 그런데 표는 지금까지 ① 우리가 손으로 넣은 셋 ② 사람이 붙여넣기로 만든 것뿐이었다 —
 * 둘 다 **사람이 타이핑한 만큼만** 늘어난다. 바깥 세상은 이미 숫자로 된 표를 갖고 있다.
 *
 * 새 모양을 안 만든다: 길어 온 것은 **「내 표」와 완전히 같은 물건**이 된다(`pack-store`).
 * 그래야 담는 순간 놀이 셋이 전부 그 표를 먹는다 — 이 파일이 놀이를 하나도 안 고치는 이유다.
 *
 * 통로가 왜 우리 서버인가: 스팀 쪽 주소는 CORS 헤더를 안 준다(실측) — 브라우저에서 직접
 * 부르면 무조건 막힌다. 서버가 6시간 캐시까지 진다(`karmolab-steam.ts`).
 */
import { loadPacks, putPack, type Pack, type PackField, type PackItem } from './pack-store';

const API_BASE = 'https://yawnbot.mascari4615.com';
const TIMEOUT_MS = 15000;

interface WellSource {
  id: string;
  title: string;
  emoji: string;
  desc: string;
  items: number | null;
}

interface WellPack {
  title: string;
  emoji: string;
  fields: PackField[];
  items: PackItem[];
  fetchedAt: string;
  stale: boolean;
}

(function (): void {
  const esc = (s: string): string =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** 「2026. 8. 8. 11:20」 — 표가 언제 기준인지 사람이 읽는 모양으로. */
  function whenText(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  }

  async function ask<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { signal });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('packwell'),
    tabs: [
      {
        id: 'app',
        label: '우물',
        build: function (root: HTMLElement): void {
          const control = new AbortController();
          const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
          // 화면을 떠나면 받다 만 것을 끊는다 — 안 끊으면 없어진 화면에 글을 쓴다.
          Toolbox.onDispose?.(() => {
            clearTimeout(timer);
            control.abort();
          });

          root.innerHTML =
            `<div style="max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">` +
            `<p style="margin:0;color:var(--text-secondary);font-size:var(--font-size-sm);line-height:1.7;">` +
            `놀이에 쓸 표를 바깥에서 길어 옵니다. 담으면 <b>내 표</b>가 되어 ` +
            `높은 쪽 고르기 · 이상형 월드컵 · 티어표에서 그대로 열립니다.</p>` +
            `<div id="pwList" style="display:grid;gap:12px;"></div>` +
            `<div id="pwView"></div></div>`;

          const list = root.querySelector('#pwList') as HTMLElement;
          const view = root.querySelector('#pwView') as HTMLElement;
          list.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">우물을 살펴보는 중…</div>`;

          ask<{ sources: WellSource[] }>('/kl/steam/sources', control.signal)
            .then((body) => {
              if (!root.isConnected) return;
              const sources = body.sources || [];
              if (!sources.length) throw new Error('empty');
              list.innerHTML = sources
                .map(
                  (s) =>
                    `<button class="btn btn-ghost" data-well="${esc(s.id)}" style="display:flex;align-items:center;gap:14px;` +
                    `text-align:left;padding:14px 16px;height:auto;width:100%;">` +
                    `<span style="font-size:26px;line-height:1;">${esc(s.emoji)}</span>` +
                    `<span style="display:flex;flex-direction:column;gap:3px;min-width:0;">` +
                    `<b style="color:var(--text-primary);">${esc(s.title)}</b>` +
                    `<span style="font-size:var(--font-size-xs);color:var(--text-secondary);">${esc(s.desc)}</span></span></button>`,
                )
                .join('');
              list.querySelectorAll<HTMLButtonElement>('[data-well]').forEach((btn) => {
                btn.addEventListener('click', () => void open(btn.dataset.well as string, btn));
              });
            })
            .catch(() => {
              if (!root.isConnected) return;
              // 우물이 안 열려도 「내 표 만들기」는 멀쩡하다 — 막다른 길로 두지 않는다.
              list.innerHTML =
                `<div style="padding:14px 16px;border:1px solid var(--border);border-radius:12px;color:var(--text-secondary);` +
                `font-size:var(--font-size-sm);line-height:1.7;">지금은 우물에 닿지 못했습니다. 잠시 뒤 다시 열어 보세요.<br>` +
                `<a class="btn btn-ghost" style="margin-top:10px;" href="/karmolab/#packs">표를 직접 만들기</a></div>`;
            });

          async function open(id: string, btn: HTMLButtonElement): Promise<void> {
            const label = btn.textContent;
            btn.disabled = true;
            view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">표를 길어 오는 중…</div>`;
            try {
              const body = await ask<{ pack: WellPack }>(`/kl/steam/pack?source=${encodeURIComponent(id)}`, control.signal);
              if (!root.isConnected) return;
              show(body.pack);
            } catch {
              if (!root.isConnected) return;
              view.innerHTML =
                `<div style="color:var(--text-secondary);font-size:var(--font-size-sm);">이 표는 지금 길어 올 수 없습니다.</div>`;
            } finally {
              btn.disabled = false;
              if (label) btn.textContent = label;
            }
          }

          function show(pack: WellPack): void {
            const numbers = pack.fields.filter((f) => f.kind === 'number');
            const preview = pack.items.slice(0, 8);
            const already = loadPacks().filter((p) => p.title === pack.title)[0];

            view.innerHTML =
              `<div style="border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:14px;">` +
              `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">` +
              `<b style="font-size:var(--font-size-lg);">${esc(pack.emoji)} ${esc(pack.title)}</b>` +
              `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${pack.items.length}개 · 견줄 칸 ${numbers.length}개 · ` +
              `${esc(whenText(pack.fetchedAt))} 기준${pack.stale ? ' (지금은 바깥에 못 닿아 지난 표입니다)' : ''}</span></div>` +
              `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
              pack.fields
                .map(
                  (f) =>
                    `<span style="padding:3px 9px;border-radius:100px;background:var(--bg-tertiary);border:1px solid var(--border);` +
                    `font-size:var(--font-size-xs);color:var(--text-secondary);">${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ''}</span>`,
                )
                .join('') +
              `</div>` +
              `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">` +
              preview
                .map(
                  (it) =>
                    `<div style="display:flex;flex-direction:column;gap:5px;min-width:0;">` +
                    (it.img
                      ? `<img src="${esc(String(it.img))}" alt="" loading="lazy" style="width:100%;aspect-ratio:92/43;object-fit:cover;` +
                        `border-radius:8px;background:var(--bg-tertiary);">`
                      : '') +
                    `<span style="font-size:var(--font-size-xs);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;` +
                    `white-space:nowrap;">${esc(it.name)}</span></div>`,
                )
                .join('') +
              `</div>` +
              `<div id="pwAct" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">` +
              `<button class="btn btn-primary" id="pwTake">${already ? '내 표 새로 고치기' : '내 표로 담기'}</button>` +
              (already
                ? `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">이미 담아 둔 표가 있습니다 — 숫자만 갈아 끼웁니다</span>`
                : '') +
              `</div></div>`;

            (view.querySelector('#pwTake') as HTMLButtonElement).addEventListener('click', () => take(pack, already ?? null));
          }

          /**
           * 담기. 이미 같은 제목이 있으면 **id 를 그대로 두고 내용만 갈아 끼운다** —
           * 새로 만들면 어제 담은 표와 오늘 담은 표가 목록에 나란히 서고, 순위판도 둘로 갈린다.
           */
          function take(pack: WellPack, already: Pack | null): void {
            const saved: Pack = {
              id: already?.id ?? 'p' + Date.now().toString(36),
              title: pack.title,
              emoji: pack.emoji,
              fields: pack.fields,
              items: pack.items,
              ...(already?.sharedId ? { sharedId: already.sharedId } : {}),
            };
            const ok = putPack(saved);
            const act = view.querySelector('#pwAct') as HTMLElement;
            if (!ok) {
              act.innerHTML =
                `<span style="font-size:var(--font-size-sm);color:var(--danger,#e5484d);">이 브라우저에 표를 못 담았습니다 — 사생활 모드이거나 저장 공간이 찼습니다.</span>`;
              return;
            }
            Toolbox.showToast?.(`「${pack.title}」 담았습니다 (${pack.items.length}개)`, 'success', undefined);
            /* 담고 나면 **어디서 노는지**가 바로 보여야 한다. 여기서 끊기면 담은 표가 잠든다.
             * 주소는 `/karmolab/t/<id>/`(도구 상세) 가 아니라 앱 안 해시다 — 놀이 넷은 상세
             * 페이지가 찍히지 않는다(`tools-seo.json` 에 없다). 상세 주소로 걸면 전부 404 다. */
            act.innerHTML =
              `<a class="btn btn-primary" href="/karmolab/#higher">높은 쪽 고르기</a>` +
              `<a class="btn btn-ghost" href="/karmolab/#worldcup">이상형 월드컵</a>` +
              `<a class="btn btn-ghost" href="/karmolab/#tierlist">티어표</a>` +
              `<a class="btn btn-ghost" href="/karmolab/#packs">내 표 보기</a>`;
          }
        },
      },
    ],
  });
})();
