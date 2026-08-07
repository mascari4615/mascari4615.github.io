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

(function (): void {
  const SAMPLE =
    '이름\t그림\t분류\t나이\t사는곳\n' +
    '멍멍이\t\t개, 큰개\t3\t마당\n' +
    '야옹이\t\t고양이\t2\t거실\n' +
    '짹짹이\t\t새\t1\t창가\n' +
    '꼬물이\t\t물고기\t1\t어항';

  Toolbox.register({
    id: 'packs',
    title: '내 표 만들기',
    category: 'tool',
    desc: '놀이에 쓸 표를 직접 만듭니다 — 붙여넣기 한 판이면 됩니다',
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/><path d="M15 13h4M17 11v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '내 표',
        build: function (container: HTMLElement): void {
          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: '좋아하는 걸로 표를 만들면 놀이가 그걸로 돌아가요!' });
          container.innerHTML = `
            <p class="pk-lead">놀이에 쓸 표를 직접 만드세요. 스프레드시트에서 긁어다 붙여넣으면 됩니다 —
              첫 줄은 칸 이름, 첫 칸은 이름, 「그림」 칸이 있으면 그림 주소로 씁니다.</p>
            <section class="pk-card">
              <div class="tool-grid-2">
                <div class="field-group">
                  <label class="field-label" for="pkTitle">표 이름</label>
                  <input type="text" id="pkTitle" placeholder="예: 우리 집 동물">
                </div>
                <div class="field-group">
                  <label class="field-label" for="pkEmoji">그림글자 하나</label>
                  <input type="text" id="pkEmoji" maxlength="4" placeholder="🐶">
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="pkText">표 붙여넣기</label>
                <textarea id="pkText" rows="8" spellcheck="false" placeholder="이름&#9;분류&#9;나이"></textarea>
              </div>
              <div class="pk-row">
                <button type="button" class="btn btn-primary" id="pkSave">이 표 만들기</button>
                <button type="button" class="btn btn-ghost" id="pkSample">보기 채워 넣기</button>
                <button type="button" class="btn btn-ghost" id="pkPaste">받은 주소로 가져오기</button>
              </div>
              <p class="tool-status" id="pkMsg" aria-live="polite"></p>
            </section>
            <div class="field-group" style="margin-top:18px">
              <div class="tool-sublabel">만들어 둔 표</div>
              <div id="pkList" class="pk-list"></div>
            </div>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          const val = (id: string) => (container.querySelector<HTMLInputElement>('#' + id)!).value;
          const esc = (s: string): string =>
            String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

          function paintList(): void {
            const list = loadPacks();
            if (!list.length) {
              $('pkList').innerHTML = '<p class="tool-status">아직 없습니다. 위에서 하나 만들어 보세요.</p>';
              return;
            }
            $('pkList').innerHTML = list
              .map(
                (p) =>
                  `<div class="pk-item" data-id="${esc(p.id)}">` +
                  `<span class="pk-emoji">${esc(p.emoji)}</span>` +
                  `<div class="pk-meta"><strong>${esc(p.title)}</strong>` +
                  `<span>${p.items.length}개 · 칸 ${p.fields.map((f) => esc(f.label)).join('·')}</span></div>` +
                  `<div class="pk-acts">` +
                  `<button type="button" class="btn btn-ghost" data-go="twenty">스무고개로</button>` +
                  `<a class="btn btn-ghost" href="/daily/mine/?pack=${esc(p.id)}">하나 맞히기로</a>` +
                  `<button type="button" class="btn btn-ghost" data-go="higher">높은 쪽으로</button>` +
                  `<button type="button" class="btn btn-ghost" data-share="1">주소 복사</button>` +
                  `<button type="button" class="btn btn-ghost" data-del="1">지우기</button>` +
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
              $('pkMsg').textContent = `「${p.title}」 를 지웠습니다.`;
              return;
            }
            if (btn.dataset.share) {
              const url = `${location.origin}/karmolab/?pack=${packToCode(p)}#packs`;
              void navigator.clipboard.writeText(url).then(() => {
                $('pkMsg').textContent =
                  url.length > 6000
                    ? '복사했습니다 — 다만 표가 커서 주소가 깁니다. 어떤 앱에서는 잘릴 수 있어요.'
                    : '주소를 복사했습니다. 받은 사람이 열면 그 표가 생깁니다.';
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
            (container.querySelector<HTMLTextAreaElement>('#pkText')!).value = SAMPLE;
            (container.querySelector<HTMLInputElement>('#pkTitle')!).value = '우리 집 동물';
            (container.querySelector<HTMLInputElement>('#pkEmoji')!).value = '🐶';
            $('pkMsg').textContent = '이대로 「이 표 만들기」 를 눌러 보세요.';
          });

          $('pkSave').addEventListener('click', () => {
            const { fields, items, problems } = parseTable(val('pkText'));
            if (problems.length) {
              $('pkMsg').textContent = problems.join(' ');
              return;
            }
            const pack: Pack = {
              id: 'p' + Date.now().toString(36),
              title: val('pkTitle').trim() || '이름 없는 표',
              emoji: val('pkEmoji').trim() || '🎲',
              fields,
              items
            };
            if (!putPack(pack)) {
              $('pkMsg').textContent = '이 브라우저에 저장을 못 했습니다 (사생활 모드이거나 자리가 없어요).';
              return;
            }
            $('pkMsg').textContent = `「${pack.title}」 만들었습니다 — ${items.length}개, 칸 ${fields.length}개.`;
            paintList();
          });

          $('pkPaste').addEventListener('click', () => {
            const url = prompt('받은 주소를 붙여넣으세요');
            if (!url) return;
            const m = url.match(/[?&]pack=([^&#]+)/);
            const p = m && codeToPack(m[1]);
            if (!p) {
              $('pkMsg').textContent = '그 주소에서 표를 못 읽었습니다.';
              return;
            }
            putPack(p);
            paintList();
            $('pkMsg').textContent = `「${p.title}」 를 가져왔습니다.`;
          });

          /* 주소로 받은 표는 **열자마자** 들어와야 한다 — 「가져오기를 누르세요」는 한 단계 더다. */
          const got = new URLSearchParams(location.search).get('pack');
          if (got) {
            const p = codeToPack(got);
            if (p && putPack(p)) $('pkMsg').textContent = `「${p.title}」 를 받았습니다. 아래에서 놀이로 보내세요.`;
            else $('pkMsg').textContent = '받은 주소에서 표를 못 읽었습니다.';
          }

          paintList();
        }
      }
    ]
  });
})();
