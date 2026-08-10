/**
 * 내 표 만들기 (TASK-KL-089) — 놀이의 재료를 사람이 만드는 자리.
 *
 * 만드는 길은 하나다: **붙여넣기**. 스프레드시트에서 긁어 오면 그대로 표가 된다.
 * 칸을 하나하나 만드는 화면을 붙일 수도 있었지만, 그건 사람이 이미 가진 표를 다시 치게 한다.
 *
 * 여기서 만든 표는 놀이들이 그대로 먹는다(스무고개 · 높은 쪽 고르기 …) — 표의 모양이
 * 우리 표와 같기 때문이다(`pack-store`).
 */
import { codeToPack, dropPack, loadPacks, packToCode, parseTable, putPack, type Pack } from './pack-store';
import {
  adoptShared,
  flushQueuedUploads,
  listShared,
  packErrorText,
  queueUpload,
  updateShared,
  uploadPack,
  type SharedPackSummary
} from '../lib/shared-packs';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 보기 표는 **쓸 때 정한다** — 모듈이 뜨는 순간에 굳으면 한국어 표가 그대로 붙는다.
     칸 이름·값이 다 그 언어여야 「내 표를 이렇게 붙이면 되는구나」가 읽힌다. */
  const sample = (): string => t('packs.sample');

  Toolbox.register({
    id: 'packs',
    title: t('widgets.packs.title', undefined, "내 표 만들기"),
    category: 'tool',
    desc: t('widgets-desc.packs.desc', undefined, "놀이에 쓸 표를 직접 만듭니다 — 붙여넣기 한 판이면 됩니다"),
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/><path d="M15 13h4M17 11v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('packs.t16', undefined, "내 표"),
        build: function (container: HTMLElement): void {
          void loadNamespace('packs').then(function () {

          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: t('packs.t17') });
          container.innerHTML = `
            <p class="pk-lead">${esc(t('packs.t01'))}</p>
            <section class="pk-card">
              <div class="tool-grid-2">
                <div class="field-group">
                  <label class="field-label" for="pkTitle">${esc(t('packs.label.pkTitle'))}</label>
                  <input type="text" id="pkTitle" placeholder="${esc(t('packs.ph.pkTitle'))}">
                </div>
                <div class="field-group">
                  <label class="field-label" for="pkEmoji">${esc(t('packs.label.pkEmoji'))}</label>
                  <input type="text" id="pkEmoji" maxlength="4" placeholder="🐶">
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="pkText">${esc(t('packs.label.pkText'))}</label>
                <textarea id="pkText" rows="8" spellcheck="false" placeholder="${esc(t('packs.ph.pkText'))}"></textarea>
              </div>
              <div class="pk-row">
                <button type="button" class="btn btn-primary" id="pkSave">${esc(t('packs.btn.pkSave'))}</button>
                <button type="button" class="btn btn-ghost" id="pkSample">${esc(t('packs.btn.pkSample'))}</button>
                <button type="button" class="btn btn-ghost" id="pkPaste">${esc(t('packs.btn.pkPaste'))}</button>
              </div>
              <p class="tool-status" id="pkMsg" aria-live="polite"></p>
            </section>
            <div class="field-group" style="margin-top:18px">
              <div class="tool-sublabel">${esc(t('packs.t02'))}</div>
              <div id="pkList" class="pk-list"></div>
            </div>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          const val = (id: string) => (container.querySelector<HTMLInputElement>('#' + id)!).value;

          function paintList(): void {
            const list = loadPacks();
            if (!list.length) {
              $('pkList').innerHTML = t('packs.t18');
              return;
            }
            $('pkList').innerHTML = list
              .map(
                (p) =>
                  `<div class="pk-item" data-id="${esc(p.id)}">` +
                  `<span class="pk-emoji">${esc(p.emoji)}</span>` +
                  `<div class="pk-meta"><strong>${esc(p.title)}</strong>` +
                  `<span>${t('packs.packLine', { n: p.items.length, fields: p.fields.map((f) => esc(f.label)).join('·') })}` +
                  (p.sharedId ? ` · <b>${esc(t('packs.t03'))}</b>${p.sharedBy ? ` (${esc(p.sharedBy)})` : ''}` : '') +
                  `</span></div>` +
                  `<div class="pk-acts">` +
                  `<button type="button" class="btn btn-ghost" data-up="1">${p.sharedId ? t('packs.t19') : t('packs.t20')}</button>` +
                  `<button type="button" class="btn btn-ghost" data-go="twenty">${esc(t('packs.t04'))}</button>` +
                  `<a class="btn btn-ghost" href="/daily/mine/?pack=${esc(p.id)}">${esc(t('packs.t05'))}</a>` +
                  `<button type="button" class="btn btn-ghost" data-go="higher">${esc(t('packs.t06'))}</button>` +
                  (p.items.filter((it) => it.img).length >= 4
                    ? `<button type="button" class="btn btn-ghost" data-go="worldcup">${esc(t('packs.t07'))}</button>`
                    : '') +
                  `<button type="button" class="btn btn-ghost" data-share="1">${esc(t('packs.t08'))}</button>` +
                  `<button type="button" class="btn btn-ghost" data-del="1">${esc(t('packs.t09'))}</button>` +
                  `</div></div>`
              )
              .join('');
          }

          $('pkList').addEventListener('click', (e) => {
            const box = (e.target as HTMLElement).closest('.pk-item') as HTMLElement | null;
            const btn = (e.target as HTMLElement).closest('button') as HTMLElement | null;
            if (!box || !btn) return;
            const p = loadPacks().filter((x) => x.id === box.dataset.id)[0];
            if (!p) return;
            if (btn.dataset.del) {
              dropPack(p.id);
              paintList();
              $('pkMsg').textContent = t('packs.msg.dropped', { title: p.title });
              return;
            }
            if (btn.dataset.share) {
              const url = `${location.origin}/karmolab/?pack=${packToCode(p)}#packs`;
              void navigator.clipboard.writeText(url).then(() => {
                $('pkMsg').textContent =
                  url.length > 6000
                    ? t('packs.t21')
                    : t('packs.t22');
              });
              return;
            }
            if (btn.dataset.up) {
              /* 올리기 = 이 표에 **주소를 붙이는 일**이다 (TASK-KL-150).
               * 주소가 붙으면 남이 이어받을 수 있고, 같은 표로 논 사람끼리 한 순위판에서 만난다. */
              btn.setAttribute('disabled', 'true');
              $('pkMsg').textContent = t('packs.t23');
              void (p.sharedId ? updateShared(p.sharedId, p) : uploadPack(p)).then((res) => {
                btn.removeAttribute('disabled');
                if (res.error === 'not_signed_in') {
                  /* 「로그인하세요」로 끝내면 대부분 거기서 나간다 — 붙여넣고 다듬어 만든 표를
                     두고 왕복을 다녀오라는 뜻이기 때문이다. 올리려던 표를 적어 두고 보낸다:
                     돌아오면 저절로 올라간다 (TASK-KL-151 ⑦). */
                  queueUpload(p.id);
                  $('pkMsg').textContent = t('packs.t24');
                  setTimeout(() => window.KarmoAccount?.signIn(), 700);
                  return;
                }
                if (res.error || !res.id) {
                  $('pkMsg').textContent = packErrorText(res.error ?? 'unknown', res.detail);
                  return;
                }
                putPack({ ...p, sharedId: res.id });
                paintList();
                $('pkMsg').textContent = t('packs.msg.uploaded', { title: p.title });
              });
              return;
            }
            if (btn.dataset.go) {
              // 놀이가 어느 표로 놀지는 이 한 줄로 정한다 — 놀이 쪽은 이것만 읽는다.
              try {
                localStorage.setItem('karmolab_pack_pick', p.id);
              } catch {
                /* 사생활 모드 — 그래도 기본 표로는 놀 수 있다 */
              }
              Toolbox.switchPage(btn.dataset.go);
            }
          });

          $('pkSample').addEventListener('click', () => {
            (container.querySelector<HTMLTextAreaElement>('#pkText')!).value = sample();
            (container.querySelector<HTMLInputElement>('#pkTitle')!).value = t('packs.t25');
            (container.querySelector<HTMLInputElement>('#pkEmoji')!).value = '🐶';
            $('pkMsg').textContent = t('packs.t26');
          });

          $('pkSave').addEventListener('click', () => {
            const { fields, items, problems } = parseTable(val('pkText'));
            if (problems.length) {
              $('pkMsg').textContent = problems.join(' ');
              return;
            }
            const pack: Pack = {
              id: 'p' + Date.now().toString(36),
              title: val('pkTitle').trim() || t('packs.untitled'),
              emoji: val('pkEmoji').trim() || '🎲',
              fields,
              items
            };
            if (!putPack(pack)) {
              $('pkMsg').textContent = t('packs.t27');
              return;
            }
            $('pkMsg').textContent = t('packs.msg.made', {
              title: pack.title,
              n: items.length,
              fields: fields.length,
            });
            paintList();
          });

          $('pkPaste').addEventListener('click', () => {
            const url = prompt(t('packs.t28'));
            if (!url) return;
            const m = url.match(/[?&]pack=([^&#]+)/);
            const p = m && codeToPack(m[1]);
            if (!p) {
              $('pkMsg').textContent = t('packs.t29');
              return;
            }
            putPack(p);
            paintList();
            $('pkMsg').textContent = t('packs.msg.imported', { title: p.title });
          });

          /* 주소로 받은 표는 **열자마자** 들어와야 한다 — 「가져오기를 누르세요」는 한 단계 더다. */
          const got = new URLSearchParams(location.search).get('pack');
          if (got) {
            const p = codeToPack(got);
            if (p && putPack(p)) $('pkMsg').textContent = t('packs.msg.received', { title: p.title });
            else $('pkMsg').textContent = t('packs.t30');
          }

          /* 로그인하고 돌아왔으면 적어 둔 표를 올린다 (TASK-KL-151 ⑦).
             로그인 상태가 늦게 도착하므로 상태가 바뀔 때마다 본다 — 화면을 그릴 때 한 번만
             보면 「로그인 직후 첫 화면」에서는 아직 로그인 전으로 보인다. */
          const stopWatch = window.KarmoAccount?.subscribe((st: { account?: unknown } | null) => {
            if (!st || !st.account) return;
            void flushQueuedUploads().then((done) => {
              if (!done.length || !container.isConnected) return;
              paintList();
              $('pkMsg').textContent =
                done.length === 1
                  ? t('packs.msg.uploadedOne', { title: done[0].title })
                  : t('packs.msg.uploadedMany', { n: done.length });
            });
          });
          if (stopWatch) Toolbox.onDispose?.(stopWatch);

          paintList();
                  });
        }
      },
      {
        id: 'browse',
        label: t('packs.t31', undefined, "둘러보기"),
        /**
         * 남들이 올린 표 (TASK-KL-150).
         *
         * 왜 별도 탭인가: 「내 표」는 만드는 자리라 입력칸이 화면을 먹는다. 둘러보기는 **고르는**
         * 자리다 — 목록이 주인공이어야 한다.
         *
         * 서버에 못 닿으면 「지금 못 불러왔다」 한 줄만 남긴다. 빈 목록을 그리면 「아무도 안 만든
         * 곳」으로 읽히는데, 그건 사실이 아니다.
         */
        build: function (container: HTMLElement): void {
          void loadNamespace('packs').then(function () {

          container.innerHTML = `
            <p class="pk-lead">${t('packs.browseLead', { board: `<b>${esc(t('packs.t11'))}</b>` })}</p>
            <section class="pk-card">
              <div class="pk-row">
                <input type="search" id="pkFind" placeholder="${esc(t('packs.ph.pkFind'))}" style="flex:1;min-width:180px">
                <button type="button" class="btn btn-ghost" id="pkSortPop">${esc(t('packs.btn.pkSortPop'))}</button>
                <button type="button" class="btn btn-ghost" id="pkSortNew">${esc(t('packs.btn.pkSortNew'))}</button>
              </div>
              <p class="tool-status" id="pkBrowseMsg" aria-live="polite">${esc(t('packs.label.pkBrowseMsg'))}</p>
            </section>
            <div id="pkShared" class="pk-list" style="margin-top:14px"></div>
          `;
          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          let sort: 'popular' | 'new' = 'popular';

          function paint(rows: SharedPackSummary[]): void {
            $('pkShared').innerHTML = rows
              .map(
                (r) =>
                  `<div class="pk-item" data-shared="${esc(r.id)}">` +
                  `<span class="pk-emoji">${esc(r.emoji)}</span>` +
                  `<div class="pk-meta"><strong>${esc(r.title)}</strong>` +
                  `<span>${t('packs.sharedLine', { n: r.items, who: esc(r.ownerHandle) })}` +
                  (r.opens ? ' · ' + t('packs.opens', { n: r.opens }) : '') +
                  (r.forkOf ? t('packs.t32') : '') +
                  `</span></div>` +
                  `<div class="pk-acts">` +
                  `<button type="button" class="btn btn-primary" data-adopt="1">${esc(t('packs.t13'))}</button>` +
                  `</div></div>`
              )
              .join('');
          }

          function load(): void {
            const q = (container.querySelector<HTMLInputElement>('#pkFind')!).value.trim();
            $('pkBrowseMsg').textContent = t('packs.label.pkBrowseMsg');
            void listShared({ sort, q, limit: 30 }).then((got) => {
              if (!container.isConnected) return;
              if (!got) {
                // 서버에 못 닿았다 — 없는 것과 다르다. 그 둘을 같은 화면으로 말하지 않는다.
                $('pkBrowseMsg').textContent = t('packs.t33');
                $('pkShared').innerHTML = '';
                return;
              }
              if (!got.packs.length) {
                $('pkBrowseMsg').textContent = q
                  ? t('packs.t34')
                  : t('packs.t35');
                $('pkShared').innerHTML = '';
                return;
              }
              $('pkBrowseMsg').textContent = `표 ${got.total.packs}개 · 만든 사람 ${got.total.makers}명`;
              paint(got.packs);
            });
          }

          $('pkShared').addEventListener('click', (e) => {
            const box = (e.target as HTMLElement).closest('.pk-item') as HTMLElement | null;
            const btn = (e.target as HTMLElement).closest('button') as HTMLElement | null;
            if (!box || !btn || !btn.dataset.adopt) return;
            btn.setAttribute('disabled', 'true');
            void adoptShared(box.dataset.shared ?? '').then((pack) => {
              btn.removeAttribute('disabled');
              $('pkBrowseMsg').textContent = pack
                ? `「${pack.title}」 를 이어받았습니다 — 「내 표」에서 놀이로 보내세요.`
                : t('packs.t36');
            });
          });

          $('pkSortPop').addEventListener('click', () => {
            sort = 'popular';
            load();
          });
          $('pkSortNew').addEventListener('click', () => {
            sort = 'new';
            load();
          });
          let timer: ReturnType<typeof setTimeout> | null = null;
          $('pkFind').addEventListener('input', () => {
            // 글자마다 부르면 서버를 타자 속도로 두드린다.
            if (timer) clearTimeout(timer);
            timer = setTimeout(load, 300);
          });
          Toolbox.onDispose?.(() => {
            if (timer) clearTimeout(timer);
          });

          load();
                  });
        }
      }
    ]
  });
})();
