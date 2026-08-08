/**
 * 표 우물 (TASK-KL-153) — 바깥 세상에서 놀이 재료를 길어 온다.
 *
 * 왜 있나: 놀이(높은 쪽 고르기·이상형 월드컵·티어표)의 재미는 놀이 방식이 아니라 **표**에서
 * 온다. 그런데 표는 지금까지 ① 우리가 손으로 넣은 셋 ② 사람이 붙여넣기로 만든 것뿐이었다 —
 * 둘 다 **사람이 타이핑한 만큼만** 늘어난다. 바깥 세상은 이미 숫자로 된 표를 갖고 있다.
 *
 * 새 모양을 안 만든다: 길어 온 것은 **「내 표」와 완전히 같은 물건**이 된다(`pack-store`).
 * 그래야 담는 순간 놀이 셋이 전부 그 표를 먹는다 — 이 파일이 놀이를 하나도 안 고치는 이유다.
 *
 * 담고 나서 끊기지 않게: 담은 표를 놀이로 **밀어 넣고**(`pack-pick`) 바로 가는 단추를 준다.
 * 「담았는데 어디서 노는지 모르겠다」가 표를 잠재우는 가장 흔한 자리였다.
 *
 * 오늘의 표: 어느 우물을 뜨는지는 **서버가 정한다**(날짜 KST). 화면이 따로 세면 자정 언저리에
 * 사람마다 다른 표가 뜨고, 그러면 「오늘 이거 해 봤어?」도 순위판도 성립하지 않는다.
 */
import { loadPacks, putPack, type Pack, type PackField, type PackItem } from './pack-store';
import { putPick } from './pack-pick';

const API_BASE = 'https://yawnbot.mascari4615.com';
const TIMEOUT_MS = 30000;

interface WellRow {
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
  well: string;
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
            `<div style="max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">` +
            `<p style="margin:0;color:var(--text-secondary);font-size:var(--font-size-sm);line-height:1.7;">` +
            `놀이에 쓸 표를 바깥에서 길어 옵니다. 담으면 <b>내 표</b>가 되어 ` +
            `높은 쪽 고르기 · 이상형 월드컵 · 티어표에서 그대로 열립니다. ` +
            `같은 우물에서 길어 온 표는 <b>모두가 같은 표</b>라 순위판에서 서로 겨룹니다.</p>` +
            `<div id="pwList" style="display:grid;gap:12px;"></div>` +
            `<div id="pwView"></div></div>`;

          const list = root.querySelector('#pwList') as HTMLElement;
          const view = root.querySelector('#pwView') as HTMLElement;
          list.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">우물을 살펴보는 중…</div>`;

          ask<{ wells: WellRow[]; today: string; day: string }>('/kl/wells', control.signal)
            .then((body) => {
              if (!root.isConnected) return;
              const wells = body.wells || [];
              if (!wells.length) throw new Error('empty');
              /* 오늘의 표를 맨 위로 올린다 — 「무엇부터 눌러야 하나」가 없으면 다섯 개가
               * 나란히 서 있기만 하고 아무도 안 누른다. */
              const ordered = wells.slice().sort((a, b) => Number(b.id === body.today) - Number(a.id === body.today));
              list.innerHTML = ordered
                .map((w) => {
                  const today = w.id === body.today;
                  return (
                    `<button class="btn ${today ? 'btn-primary' : 'btn-ghost'}" data-well="${esc(w.id)}" ` +
                    `style="display:flex;align-items:center;gap:14px;text-align:left;padding:14px 16px;height:auto;width:100%;">` +
                    `<span style="font-size:26px;line-height:1;">${esc(w.emoji)}</span>` +
                    `<span style="display:flex;flex-direction:column;gap:3px;min-width:0;">` +
                    `<b>${today ? '오늘의 표 · ' : ''}${esc(w.title)}</b>` +
                    `<span style="font-size:var(--font-size-xs);opacity:.85;">${esc(w.desc)}` +
                    `${w.items ? ` · ${w.items}개` : ''}</span></span></button>`
                  );
                })
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
            const wasDisabled = btn.disabled;
            btn.disabled = true;
            view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">표를 길어 오는 중…</div>`;
            try {
              const body = await ask<{ pack: WellPack }>(`/kl/wells/pack?well=${encodeURIComponent(id)}`, control.signal);
              if (!root.isConnected) return;
              show(body.pack);
              view.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch {
              if (!root.isConnected) return;
              view.innerHTML =
                `<div style="color:var(--text-secondary);font-size:var(--font-size-sm);">이 표는 지금 길어 올 수 없습니다.</div>`;
            } finally {
              btn.disabled = wasDisabled;
            }
          }

          function show(pack: WellPack): void {
            const numbers = pack.fields.filter((f) => f.kind === 'number');
            const withImage = pack.items.filter((i) => i.img).length;
            const preview = pack.items.slice(0, 8);
            // 같은 우물에서 이미 담아 둔 표가 있으면 그것을 갈아 끼운다(새로 만들지 않는다).
            const already = loadPacks().filter((p) => p.well === pack.well || p.title === pack.title)[0];

            view.innerHTML =
              `<div style="border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:14px;">` +
              `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">` +
              `<b style="font-size:var(--font-size-lg);">${esc(pack.emoji)} ${esc(pack.title)}</b>` +
              `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${pack.items.length}개 · 견줄 칸 ${numbers.length}개 · ` +
              `그림 ${withImage}개 · ${esc(whenText(pack.fetchedAt))} 기준${pack.stale ? ' (지금은 바깥에 못 닿아 지난 표입니다)' : ''}</span></div>` +
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
                      ? `<img src="${esc(String(it.img))}" alt="" loading="lazy" style="width:100%;aspect-ratio:3/4;object-fit:cover;` +
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
           * 담기. 이미 같은 우물의 표가 있으면 **id 를 그대로 두고 내용만 갈아 끼운다** —
           * 새로 만들면 어제 담은 표와 오늘 담은 표가 목록에 나란히 서고, 순위판도 둘로 갈린다.
           */
          function take(pack: WellPack, already: Pack | null): void {
            const saved: Pack = {
              id: already?.id ?? 'p' + Date.now().toString(36),
              title: pack.title,
              emoji: pack.emoji,
              fields: pack.fields,
              items: pack.items,
              well: pack.well,
              ...(already?.sharedId ? { sharedId: already.sharedId } : {}),
            };
            const ok = putPack(saved);
            const act = view.querySelector('#pwAct') as HTMLElement;
            if (!ok) {
              act.innerHTML =
                `<span style="font-size:var(--font-size-sm);color:var(--danger,#e5484d);">이 브라우저에 표를 못 담았습니다 — 사생활 모드이거나 저장 공간이 찼습니다.</span>`;
              return;
            }
            // 놀이가 열릴 때 **이 표가 이미 골라져 있게** 밀어 넣는다 (「내 표」가 쓰는 길과 같다).
            putPick(saved.id);
            Toolbox.showToast?.(`「${pack.title}」 담았습니다 (${pack.items.length}개)`, 'success', undefined);

            const numbers = pack.fields.filter((f) => f.kind === 'number').length;
            const images = pack.items.filter((i) => i.img).length;
            /* 담고 나면 **어디서 노는지**가 바로 보여야 한다. 여기서 끊기면 담은 표가 잠든다.
             * 못 노는 놀이는 아예 안 보여 준다 — 숫자 칸이 없으면 「높은 쪽 고르기」는 그 표를
             * 안 받고, 그림이 없으면 월드컵은 화면이 텅 빈다. 주소는 앱 안 해시다(놀이 넷은
             * 도구 상세 페이지가 안 찍힌다 — 상세 주소로 걸면 전부 404). */
            const links = [
              numbers > 0 ? `<a class="btn btn-primary" href="/karmolab/#higher">높은 쪽 고르기</a>` : '',
              images >= 4 ? `<a class="btn btn-ghost" href="/karmolab/#worldcup">이상형 월드컵</a>` : '',
              images >= 4 ? `<a class="btn btn-ghost" href="/karmolab/#tierlist">티어표</a>` : '',
              `<a class="btn btn-ghost" href="/karmolab/#packs">내 표 보기</a>`,
            ].filter(Boolean);
            act.innerHTML =
              links.join('') +
              `<span style="width:100%;font-size:var(--font-size-xs);color:var(--text-tertiary);">놀이를 열면 이 표가 이미 골라져 있습니다.</span>`;
          }
        },
      },
      {
        id: 'library',
        label: '내 서재',
        /**
         * 내 스팀 서재로 표를 만든다 (TASK-KL-153 C).
         *
         * 우물과 다른 점: 이건 **내 것**이다. 그래서 순위판을 우물 이름으로 가르지 않는다
         * (`well` 을 안 붙인다) — 남과 겨룰 표가 아니라 나를 보는 표다.
         */
        build: function (root: HTMLElement): void {
          const control = new AbortController();
          Toolbox.onDispose?.(() => control.abort());

          root.innerHTML =
            `<div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px;">` +
            `<p style="margin:0;color:var(--text-secondary);font-size:var(--font-size-sm);line-height:1.7;">` +
            `내가 가진 게임으로 표를 만듭니다 — 플레이 시간까지. 「내 인생 게임 월드컵」이 됩니다.<br>` +
            `<b>스팀 프로필이 공개</b>여야 읽을 수 있습니다(설정 → 개인정보 → 게임 세부 정보).</p>` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
            `<input id="pwWho" class="input" placeholder="steamcommunity.com/id/내별명 또는 17자리 숫자 ID" ` +
            `style="flex:1;min-width:260px;" autocomplete="off">` +
            `<button class="btn btn-primary" id="pwGo">가져오기</button></div>` +
            `<div id="pwLibView"></div></div>`;

          const input = root.querySelector('#pwWho') as HTMLInputElement;
          const view = root.querySelector('#pwLibView') as HTMLElement;
          const go = root.querySelector('#pwGo') as HTMLButtonElement;

          /** 왜 안 됐는지를 **사람 말로**. 코드만 보여 주면 아무도 못 고친다. */
          const reason = (code: string): string =>
            ({
              no_key: '이 기능은 아직 안 켜져 있습니다 — 스팀 열쇠가 서버에 등록되면 바로 됩니다.',
              not_found: '그런 계정을 못 찾았습니다. 프로필 주소를 그대로 붙여넣어 보세요.',
              private: '프로필이 비공개라 게임 목록을 못 읽습니다 — 스팀 설정에서 「게임 세부 정보」를 공개로 바꿔 주세요.',
              too_few: '가진 게임이 넷도 안 됩니다 — 놀이가 되려면 넷은 넘어야 해요.',
            })[code] || '지금은 서재를 못 읽었습니다. 잠시 뒤 다시 눌러 주세요.';

          async function load(): Promise<void> {
            const who = input.value.trim();
            if (!who) {
              view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">프로필 주소나 ID 를 넣어 주세요.</div>`;
              return;
            }
            go.disabled = true;
            view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">서재를 읽는 중…</div>`;
            try {
              const res = await fetch(`${API_BASE}/kl/steam/library?who=${encodeURIComponent(who)}`, { signal: control.signal });
              const body = (await res.json()) as { pack?: WellPack; error?: string };
              if (!root.isConnected) return;
              if (!res.ok || !body.pack) {
                view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.7;">${esc(
                  reason(body.error || 'failed'),
                )}</div>`;
                return;
              }
              const pack = body.pack;
              view.innerHTML =
                `<div style="border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;">` +
                `<b>${esc(pack.emoji)} ${esc(pack.title)} · ${pack.items.length}개</b>` +
                `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">` +
                pack.items
                  .slice(0, 8)
                  .map(
                    (it) =>
                      `<div style="display:flex;flex-direction:column;gap:5px;min-width:0;">` +
                      (it.img
                        ? `<img src="${esc(String(it.img))}" alt="" loading="lazy" style="width:100%;aspect-ratio:92/43;` +
                          `object-fit:cover;border-radius:8px;background:var(--bg-tertiary);">`
                        : '') +
                      `<span style="font-size:var(--font-size-xs);color:var(--text-secondary);overflow:hidden;` +
                      `text-overflow:ellipsis;white-space:nowrap;">${esc(it.name)}</span></div>`,
                  )
                  .join('') +
                `</div><div id="pwLibAct"><button class="btn btn-primary" id="pwLibTake">내 표로 담기</button></div></div>`;

              (view.querySelector('#pwLibTake') as HTMLButtonElement).addEventListener('click', () => {
                // 같은 서재를 다시 가져오면 갈아 끼운다 — 두 벌이 서면 어느 게 최신인지 모른다.
                const already = loadPacks().filter((p) => p.title === pack.title)[0];
                const saved: Pack = {
                  id: already?.id ?? 'p' + Date.now().toString(36),
                  title: pack.title,
                  emoji: pack.emoji,
                  fields: pack.fields,
                  items: pack.items,
                };
                if (!putPack(saved)) {
                  (view.querySelector('#pwLibAct') as HTMLElement).innerHTML =
                    `<span style="font-size:var(--font-size-sm);color:var(--danger,#e5484d);">이 브라우저에 표를 못 담았습니다.</span>`;
                  return;
                }
                putPick(saved.id);
                Toolbox.showToast?.(`「${pack.title}」 담았습니다 (${pack.items.length}개)`, 'success', undefined);
                (view.querySelector('#pwLibAct') as HTMLElement).innerHTML =
                  `<a class="btn btn-primary" href="/karmolab/#higher">높은 쪽 고르기</a>` +
                  `<a class="btn btn-ghost" href="/karmolab/#worldcup">이상형 월드컵</a>`;
              });
            } catch {
              if (root.isConnected) {
                view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">${esc(reason('failed'))}</div>`;
              }
            } finally {
              go.disabled = false;
            }
          }

          go.addEventListener('click', () => void load());
          // 붙여넣고 엔터가 사람의 기본값이다 — 단추만 두면 한 번 더 손이 간다.
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') void load();
          });
        },
      },
    ],
  });
})();
