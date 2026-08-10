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
import { t, loadNamespace, locale } from '../lib/i18n';

const API_BASE = 'https://yawnbot.mascari4615.com';
const TIMEOUT_MS = 30000;

interface WellRow {
  id: string;
  title: string;
  emoji: string;
  desc: string;
  items: number | null;
}

interface WellQuiz {
  well: string;
  day: string;
  question: string;
  choices: string[];
  answerHash: string;
  because: string;
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
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  /** 「2026. 8. 8. 11:20」 — 표가 언제 기준인지 사람이 읽는 모양으로. */
  function whenText(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(locale(), { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  }

  /** 기존 「오늘의 문제」와 같은 대조 규칙 — 소문자·공백·쉼표를 지우고 잰다. */
  function normalize(text: string): string {
    return String(text).toLowerCase().replace(/[\s,]/g, '');
  }

  /** 정답 지문. 브라우저가 직접 재므로 정답 글자는 서버에서 안 온다. */
  async function sha256Short(text: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
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
        label: t('packwell.t26', undefined, "우물"),
        build: function (root: HTMLElement): void {
          /* **받아온 뒤 그린다** — 말 묶음보다 먼저 그리면 한국어가 한 번 스친다. */
          void loadNamespace('packwell').then(() => {
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
              t('packwell.intro', { mine: `<b>${esc(t('packwell.t01'))}</b>`, same: `<b>${esc(t('packwell.t02'))}</b>` }) +
              `</p>` +
              `<div id="pwList" style="display:grid;gap:12px;"></div>` +
              `<div id="pwView"></div></div>`;

            const list = root.querySelector('#pwList') as HTMLElement;
            const view = root.querySelector('#pwView') as HTMLElement;
            list.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">${esc(t('packwell.t04'))}</div>`;

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
                      `<b>${today ? t('packwell.t27') : ''}${esc(w.title)}</b>` +
                      `<span style="font-size:var(--font-size-xs);opacity:.85;">${esc(w.desc)}` +
                      `${w.items ? ' · ' + t('packwell.count', { n: w.items }) : ''}</span></span></button>`
                    );
                  })
                  .join('');
                list.querySelectorAll<HTMLButtonElement>('[data-well]').forEach((btn) => {
                  btn.addEventListener('click', () => void open(btn.dataset.well as string, btn));
                });
                paintMix(ordered);
              })
              .catch(() => {
                if (!root.isConnected) return;
                // 우물이 안 열려도 「내 표 만들기」는 멀쩡하다 — 막다른 길로 두지 않는다.
                list.innerHTML =
                  `<div style="padding:14px 16px;border:1px solid var(--border);border-radius:12px;color:var(--text-secondary);` +
                  `font-size:var(--font-size-sm);line-height:1.7;">${esc(t('packwell.t05'))}<br>` +
                  `<a class="btn btn-ghost" style="margin-top:10px;" href="/karmolab/#packs">${esc(t('packwell.t06'))}</a></div>`;
              });

            /**
             * 표 섞기 (TASK-KL-190 ⑤ — 서브 콘텐츠).
             *
             * 「애니 vs 게임」처럼 원래 견줄 수 없는 것들을 한 판에 올린다. 메인이 아니라서
             * 목록 아래 한 줄로만 둔다 — 우물 고르기가 주인공이다.
             * 숫자로는 못 겨루므로 그림만 담긴 표가 나온다(월드컵·티어표용).
             */
            function paintMix(wells: WellRow[]): void {
              if (wells.length < 2) return;
              const row = document.createElement('div');
              row.style.cssText =
                'display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:var(--font-size-xs);color:var(--text-secondary);';
              const pickA = document.createElement('select');
              const pickB = document.createElement('select');
              for (const select of [pickA, pickB]) {
                select.className = 'input';
                select.style.cssText = 'width:auto;min-width:150px;';
                select.innerHTML = wells.map((w) => `<option value="${esc(w.id)}">${esc(w.emoji)} ${esc(w.title)}</option>`).join('');
              }
              pickB.selectedIndex = 1;
              const go = document.createElement('button');
              go.className = 'btn btn-ghost';
              go.textContent = t('packwell.t28');
              row.append(t('packwell.t29'), pickA, document.createTextNode('vs'), pickB, go);
              list.after(row);

              go.addEventListener('click', () => {
                if (pickA.value === pickB.value) {
                  view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">${esc(t('packwell.t07'))}</div>`;
                  return;
                }
                go.disabled = true;
                view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">${esc(t('packwell.t08'))}</div>`;
                ask<{ pack: WellPack }>(
                  `/kl/wells/mix?a=${encodeURIComponent(pickA.value)}&b=${encodeURIComponent(pickB.value)}`,
                  control.signal,
                )
                  .then((body) => {
                    if (root.isConnected) show(body.pack);
                  })
                  .catch(() => {
                    if (root.isConnected) {
                      view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">${esc(t('packwell.t09'))}</div>`;
                    }
                  })
                  .finally(() => {
                    go.disabled = false;
                  });
              });
            }

            async function open(id: string, btn: HTMLButtonElement): Promise<void> {
              const wasDisabled = btn.disabled;
              btn.disabled = true;
              view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">${esc(t('packwell.t10'))}</div>`;
              try {
                const body = await ask<{ pack: WellPack }>(`/kl/wells/pack?well=${encodeURIComponent(id)}`, control.signal);
                if (!root.isConnected) return;
                show(body.pack);
                view.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              } catch {
                if (!root.isConnected) return;
                view.innerHTML =
                  `<div style="color:var(--text-secondary);font-size:var(--font-size-sm);">${esc(t('packwell.t11'))}</div>`;
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
                `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">` +
                t('packwell.packStat', {
                  items: pack.items.length,
                  numbers: numbers.length,
                  images: withImage,
                  when: esc(whenText(pack.fetchedAt)),
                }) +
                `${pack.stale ? t('packwell.t30') : ''}</span></div>` +
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
                `<div id="pwMovers" hidden></div>` +
                `<div id="pwAct" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">` +
                `<button class="btn btn-primary" id="pwTake">${already ? t('packwell.t31') : t('packwell.btn.pwLibTake')}</button>` +
                (already
                  ? `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${esc(t('packwell.t12'))}</span>`
                  : '') +
                `</div></div>`;

              (view.querySelector('#pwTake') as HTMLButtonElement).addEventListener('click', () => take(pack, already ?? null));
              paintMovers(pack.well);
            }

            /**
             * 며칠 전보다 많이 움직인 것 (TASK-KL-190 ②).
             *
             * 「지금 1등」은 아무나 보여 준다. **「지난주보다 뭐가 올라왔나」**는 우리가 쌓아 둔
             * 것에서만 나온다. 쌓인 날이 이틀도 안 되면 **아무 말도 안 한다** — 지어내지 않는다.
             */
            function paintMovers(well: string): void {
              const slot = view.querySelector('#pwMovers') as HTMLElement | null;
              if (!slot) return;
              ask<{ ready: boolean; since?: string; rows?: Array<{ name: string; changePct: number; rankDelta: number | null }> }>(
                `/kl/wells/movers?well=${encodeURIComponent(well)}`,
                control.signal,
              )
                .then((body) => {
                  if (!root.isConnected || !body.ready || !body.rows?.length) return;
                  slot.hidden = false;
                  slot.innerHTML =
                    `<div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:6px;">` +
                    t('packwell.movedSince', { since: esc(body.since ?? '') }) +
                    `</div>` +
                    `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
                    body.rows
                      .map((r) => {
                        const up = r.changePct > 0;
                        return (
                          `<span style="padding:3px 9px;border-radius:100px;border:1px solid var(--border);` +
                          `font-size:var(--font-size-xs);color:var(--text-secondary);">` +
                          `${up ? '▲' : '▼'} ${esc(r.name)} ${Math.abs(r.changePct)}%` +
                          `${r.rankDelta ? ` <span style="opacity:.7">${t('packwell.rankDelta', { n: Math.abs(r.rankDelta) })}</span>` : ''}</span>`
                        );
                      })
                      .join('') +
                    `</div>`;
                })
                .catch(() => {
                  /* 아직 쌓인 게 없거나 못 닿았다 — 이 칸만 없다 */
                });
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
                  `<span style="font-size:var(--font-size-sm);color:var(--danger,#e5484d);">${esc(t('packwell.t13'))}</span>`;
                return;
              }
              // 놀이가 열릴 때 **이 표가 이미 골라져 있게** 밀어 넣는다 (「내 표」가 쓰는 길과 같다).
              putPick(saved.id);
              Toolbox.showToast?.(t('packwell.tookIt', { title: pack.title, n: pack.items.length }), 'success', undefined);

              const numbers = pack.fields.filter((f) => f.kind === 'number').length;
              const images = pack.items.filter((i) => i.img).length;
              /* 담고 나면 **어디서 노는지**가 바로 보여야 한다. 여기서 끊기면 담은 표가 잠든다.
               * 못 노는 놀이는 아예 안 보여 준다 — 숫자 칸이 없으면 「높은 쪽 고르기」는 그 표를
               * 안 받고, 그림이 없으면 월드컵은 화면이 텅 빈다. 주소는 앱 안 해시다(놀이 넷은
               * 도구 상세 페이지가 안 찍힌다 — 상세 주소로 걸면 전부 404). */
              /* 티어표는 표를 못 먹는 유일한 놀이였다 (TASK-KL-190 ⑥) — 그림을 한 장씩 다시
               * 올려야 했다. 쪽지를 놓아 두면 티어표가 열릴 때 한 번 읽어 표를 세운다. */
              if (images >= 2) {
                try {
                  localStorage.setItem(
                    'karmolab_tierlist_pack',
                    JSON.stringify({
                      title: pack.title,
                      items: pack.items.filter((i) => i.img).slice(0, 200).map((i) => ({ name: i.name, img: i.img })),
                    }),
                  );
                } catch {
                  /* 자리가 없으면 티어표 단추만 안 먹는다 — 나머지는 그대로 */
                }
              }

              const links = [
                numbers > 0 ? `<a class="btn btn-primary" href="/karmolab/#higher">${esc(t('packwell.t14'))}</a>` : '',
                images >= 4 ? `<a class="btn btn-ghost" href="/karmolab/#worldcup">${esc(t('packwell.t15'))}</a>` : '',
                images >= 2 ? `<a class="btn btn-ghost" href="/karmolab/#tierlist">${esc(t('packwell.t16'))}</a>` : '',
                `<a class="btn btn-ghost" href="/karmolab/#packs">${esc(t('packwell.t17'))}</a>`,
              ].filter(Boolean);
              act.innerHTML =
                links.join('') +
                `<span style="width:100%;font-size:var(--font-size-xs);color:var(--text-tertiary);">${esc(t('packwell.t18'))}</span>`;
            }
        });
        },
      },
      {
        id: 'quiz',
        label: t('packwell.t32', undefined, "오늘의 문제"),
        /**
         * 우물에서 자동으로 뽑은 오늘의 문제 (TASK-KL-190 ③).
         *
         * 손으로 적어 둔 문제는 다 풀면 끝이다. 우물은 매일 새 숫자를 길어 오므로 여기서
         * 뽑으면 사람 손 없이 는다. 정답 글자는 서버가 안 보낸다(지문만) — 소스를 열어도
         * 답이 안 보이게. 대조 규칙은 기존 「오늘의 문제」와 같다(소문자·공백·쉼표 지우기).
         */
        build: function (root: HTMLElement): void {
          /* **받아온 뒤 그린다** — 말 묶음보다 먼저 그리면 한국어가 한 번 스친다. */
          void loadNamespace('packwell').then(() => {
            const control = new AbortController();
            Toolbox.onDispose?.(() => control.abort());
            root.innerHTML = `<div id="pwQuiz" style="max-width:640px;margin:0 auto;color:var(--text-tertiary);font-size:var(--font-size-sm);">${esc(t('packwell.label.pwQuiz'))}</div>`;
            const box = root.querySelector('#pwQuiz') as HTMLElement;

            ask<{ ready: boolean; quiz?: WellQuiz; reason?: string }>('/kl/wells/quiz', control.signal)
              .then(async (body) => {
                if (!root.isConnected) return;
                if (!body.ready || !body.quiz) {
                  box.innerHTML = t('packwell.noQuiz');
                  return;
                }
                const quiz = body.quiz;
                box.style.color = 'var(--text-primary)';
                box.innerHTML =
                  `<p style="font-size:var(--font-size-lg);font-weight:700;margin:0 0 14px;">${esc(quiz.question)}</p>` +
                  `<div style="display:grid;gap:8px;">` +
                  quiz.choices
                    .map((c, i) => `<button class="btn btn-ghost" data-pick="${i}" style="justify-content:flex-start;">${esc(c)}</button>`)
                    .join('') +
                  `</div><div id="pwQuizSaid" style="margin-top:14px;font-size:var(--font-size-sm);"></div>`;

                const said = box.querySelector('#pwQuizSaid') as HTMLElement;
                box.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((btn) => {
                  btn.addEventListener('click', async () => {
                    const picked = quiz.choices[Number(btn.dataset.pick)];
                    const right = (await sha256Short(normalize(picked))) === quiz.answerHash;
                    box.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => (b.disabled = true));
                    btn.className = right ? 'btn btn-primary' : 'btn btn-ghost';
                    said.innerHTML = right
                      ? `<b>${esc(t('packwell.t19'))}</b> ${esc(quiz.because)}`
                      : `<b>${esc(t('packwell.t20'))}</b> ${esc(quiz.because)}`;
                  });
                });
              })
              .catch(() => {
                if (root.isConnected) box.textContent = t('packwell.t33');
              });
        });
        },
      },
      {
        id: 'library',
        label: t('packwell.t34', undefined, "내 서재"),
        /**
         * 내 스팀 서재로 표를 만든다 (TASK-KL-153 C).
         *
         * 우물과 다른 점: 이건 **내 것**이다. 그래서 순위판을 우물 이름으로 가르지 않는다
         * (`well` 을 안 붙인다) — 남과 겨룰 표가 아니라 나를 보는 표다.
         */
        build: function (root: HTMLElement): void {
          /* **받아온 뒤 그린다** — 말 묶음보다 먼저 그리면 한국어가 한 번 스친다. */
          void loadNamespace('packwell').then(() => {
            const control = new AbortController();
            Toolbox.onDispose?.(() => control.abort());

            root.innerHTML =
              `<div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px;">` +
              `<p style="margin:0;color:var(--text-secondary);font-size:var(--font-size-sm);line-height:1.7;">` +
              t('packwell.libIntro') +
              `<br>` +
              t('packwell.libNeedPublic', { public: `<b>${esc(t('packwell.t21'))}</b>` }) +
              `</p>` +
              `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
              `<input id="pwWho" class="input" placeholder="${esc(t('packwell.ph.pwWho'))}" ` +
              `style="flex:1;min-width:260px;" autocomplete="off">` +
              `<button class="btn btn-primary" id="pwGo">${esc(t('packwell.btn.pwGo'))}</button></div>` +
              `<div id="pwLibView"></div></div>`;

            const input = root.querySelector('#pwWho') as HTMLInputElement;
            const view = root.querySelector('#pwLibView') as HTMLElement;
            const go = root.querySelector('#pwGo') as HTMLButtonElement;

            /** 왜 안 됐는지를 **사람 말로**. 코드만 보여 주면 아무도 못 고친다. */
            const reason = (code: string): string =>
              ({
                no_key: t('packwell.t35'),
                not_found: t('packwell.t36'),
                private: t('packwell.t37'),
                too_few: t('packwell.t38'),
              })[code] || t('packwell.libFailed');

            async function load(): Promise<void> {
              const who = input.value.trim();
              if (!who) {
                view.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">${esc(t('packwell.t23'))}</div>`;
                return;
              }
              go.disabled = true;
              view.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);">${esc(t('packwell.t24'))}</div>`;
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
                  `<b>${esc(pack.emoji)} ${esc(pack.title)} · ${t('packwell.count', { n: pack.items.length })}</b>` +
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
                  `</div><div id="pwLibAct"><button class="btn btn-primary" id="pwLibTake">${esc(t('packwell.btn.pwLibTake'))}</button></div></div>`;

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
                      `<span style="font-size:var(--font-size-sm);color:var(--danger,#e5484d);">${esc(t('packwell.t25'))}</span>`;
                    return;
                  }
                  putPick(saved.id);
                  Toolbox.showToast?.(t('packwell.tookIt', { title: pack.title, n: pack.items.length }), 'success', undefined);
                  (view.querySelector('#pwLibAct') as HTMLElement).innerHTML =
                    `<a class="btn btn-primary" href="/karmolab/#higher">${esc(t('packwell.t14'))}</a>` +
                    `<a class="btn btn-ghost" href="/karmolab/#worldcup">${esc(t('packwell.t15'))}</a>`;
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
        });
        },
      },
    ],
  });
})();
