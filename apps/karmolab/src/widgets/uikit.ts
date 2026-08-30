/**
 * 부품 킷 카탈로그 (change.karmolab-ui-kit). 위젯이 쓰는 공용 부품을 그 클래스 그대로 나열한다.
 *
 * 정본 목록은 `src/widgets/README.md` 부품 킷 절, 모양 규칙은 `css/toolbox.css` 부품 킷 절.
 * 여기에는 부품이 아닌 것을 두지 않는다. 새 부품은 README 와 CSS 에 먼저, 그 다음 여기.
 * 주소는 `#uikit`. 목록에는 안 뜬다(hidden). 만드는 사람이 보는 장이다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
    const esc = (v: unknown): string =>
        String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    interface Part {
        name: string;
        classes: string;
        note?: string;
        html: string;
    }

    /* 견본 하나에 부품 하나. html 은 그 부품의 실제 쓰임 그대로 */
    const PARTS: Part[] = [
        {
            name: '버튼',
            classes: '.btn .btn-primary .btn-ghost .btn-sm',
            note: '실행 하나만 primary. 나머지는 기본이나 조용한 것',
            html: `<div class="tool-actions">
  <button class="btn btn-primary">실행</button>
  <button class="btn">기본</button>
  <button class="btn btn-ghost">조용한 것</button>
  <button class="btn btn-sm">작은 것</button>
  <button class="btn" disabled>못 누름</button>
</div>`
        },
        {
            name: '입력 묶음',
            classes: '.field-group > .field-label + input | select | textarea',
            note: '라벨은 모노 대문자. 묶음 하나에 입력 하나',
            html: `<div class="field-group">
  <label class="field-label">글</label>
  <input type="text" placeholder="여기에 적기" value="">
</div>
<div class="field-group">
  <label class="field-label">고르기</label>
  <select><option>첫째</option><option>둘째</option></select>
</div>
<div class="field-group">
  <label class="field-label">긴 글</label>
  <textarea rows="3" placeholder="여러 줄"></textarea>
</div>`
        },
        {
            name: '고정폭 입력',
            classes: 'input.mono-input',
            html: `<div class="field-group">
  <label class="field-label">색 값</label>
  <input type="text" class="mono-input" value="#e8963a">
</div>`
        },
        {
            name: '두 칸',
            classes: '.tool-grid-2',
            html: `<div class="tool-grid-2">
  <div class="field-group"><label class="field-label">너비</label><input type="number" value="1440"></div>
  <div class="field-group"><label class="field-label">높이</label><input type="number" value="900"></div>
</div>`
        },
        {
            name: '상태 줄',
            classes: '.tool-status (.ok .error)',
            html: `<div class="tool-status">기다리는 중</div>
<div class="tool-status ok">됐다. 3개 처리</div>
<div class="tool-status error">파일을 못 읽음</div>`
        },
        {
            name: '보조 라벨',
            classes: '.tool-sublabel .tool-hint',
            html: `<div class="tool-sublabel">결과</div>
<p class="tool-hint">파일은 브라우저 밖으로 안 나간다</p>`
        },
        {
            name: '고르기 칩',
            classes: '.tool-chips > .tool-chip (.active)',
            note: '고른 것은 띠 반전. 하나 고르기와 여럿 고르기 둘 다 이 모양',
            html: `<div class="tool-chips">
  <button class="tool-chip active">PNG</button>
  <button class="tool-chip">JPG</button>
  <button class="tool-chip">WEBP</button>
  <button class="tool-chip">SVG</button>
</div>`
        },
        {
            name: '키, 값 목록',
            classes: '.tool-list > .tool-list-row > .tool-list-key .tool-list-val .tool-list-dim',
            html: `<div class="tool-list">
  <div class="tool-list-row"><span class="tool-list-key">크기</span><span class="tool-list-val">1440 x 900</span></div>
  <div class="tool-list-row"><span class="tool-list-key">형식</span><span class="tool-list-val">PNG <span class="tool-list-dim">8bit</span></span></div>
  <div class="tool-list-row"><span class="tool-list-key">용량</span><span class="tool-list-val">212 KB</span></div>
</div>`
        },
        {
            name: '놓는 곳',
            classes: '.tool-drop (.over)',
            html: `<div class="tool-drop">파일을 여기 놓거나 눌러서 고르기</div>`
        },
        {
            name: '탭',
            classes: '.tab-row > .tab-btn (.active)',
            note: '위젯 탭은 셸이 만든다. 위젯 안에서 또 만들 때만 이 짜임',
            html: `<div class="tab-row">
  <button class="tab-btn active">만들기</button>
  <button class="tab-btn">읽기</button>
  <button class="tab-btn">기록</button>
</div>`
        },
        {
            name: '큰 수',
            classes: '.tool-display',
            html: `<div class="tool-display">12:34.56</div>`
        },
        {
            name: '알림',
            classes: 'Toolbox.showToast(msg, type)',
            note: '위젯이 직접 안 그린다. 셸의 것을 부른다',
            html: `<div class="tool-actions tight">
  <button class="btn btn-sm" data-toast="success">잘 됨</button>
  <button class="btn btn-sm" data-toast="error">안 됨</button>
  <button class="btn btn-sm" data-toast="info">알림</button>
</div>`
        }
    ];

    function build(container: HTMLElement): void {
        const cards = PARTS.map(
            (p) => `<section class="kit-part">
  <div class="kit-part-head">
    <span class="kit-part-name">${esc(p.name)}</span>
    <code class="kit-part-classes">${esc(p.classes)}</code>
  </div>
  ${p.note ? `<p class="tool-hint">${esc(p.note)}</p>` : ''}
  <div class="kit-part-body">${p.html}</div>
</section>`
        ).join('');
        container.innerHTML = `<p class="tool-hint">${esc(t('uikit.hint', { n: PARTS.length }))}</p>
<div class="kit-parts">${cards}</div>`;
        container.querySelectorAll<HTMLButtonElement>('[data-toast]').forEach((btn) => {
            btn.onclick = () => Toolbox.showToast(`${btn.textContent} 알림`, btn.dataset.toast);
        });
        container.querySelectorAll<HTMLButtonElement>('.kit-part .tool-chip, .kit-part .tab-btn').forEach((btn) => {
            btn.onclick = () => {
                btn.parentElement?.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    }

    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('uikit') ?? {}),
        id: 'uikit',
        tabs: [{ id: 'app', label: t('uikit.tab', undefined, '부품'), build: (c: HTMLElement) => { void loadNamespace('uikit').then(() => build(c)); } }]
    });
})();
