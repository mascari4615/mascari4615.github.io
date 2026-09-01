/**
 * 부품 킷 카탈로그 (change.karmolab-ui-kit). 우리가 실제로 쓰는 공용 부품을 한 자리에 다 늘어놓는다.
 *
 * 목록의 근거는 실측이다 (2026-09-01). 셸 CSS(`toolbox.css`, `tools.css`)가 규칙을 가진 클래스 가운데
 * 위젯이 세 번 이상 쓰는 것 66개를 뽑고, 그중 위젯 하나만 쓰는 자체 클래스(`hu-btn`, `tl-btn` 등)를 뺐다.
 * 옆에 적은 숫자가 그 쓰임 수다. 새 부품을 만들면 여기와 `src/widgets/README.md` 와 `css/toolbox.css` 셋을 같이 고친다.
 *
 * 주소는 `#uikit`. 목록에는 안 뜬다(hidden). 만드는 사람이 보는 장이다.
 */
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
    const esc = (v: unknown): string =>
        String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    interface Part {
        group: string;
        name: string;
        classes: string;
        note?: string;
        html: string;
    }

    /* 견본 하나에 부품 하나. html 은 그 부품의 실제 쓰임 그대로 */
    const PARTS: Part[] = [
        {
            group: '기본',
            name: '버튼',
            classes: '.btn .btn-primary .btn-ghost .btn-sm',
            note: '실행 하나만 primary. 쓰임 670, 154, 436, 31',
            html: `<div class="tool-actions">
  <button class="btn btn-primary">실행</button>
  <button class="btn">기본</button>
  <button class="btn btn-ghost">조용한 것</button>
  <button class="btn btn-sm">작은 것</button>
  <button class="btn" disabled>못 누름</button>
</div>`
        },
        {
            group: '기본',
            name: '뜻이 있는 버튼',
            classes: '.btn-accent .btn-secondary .btn-danger',
            note: '되돌릴 수 없는 것은 danger. 쓰임 7, 15, 12',
            html: `<div class="tool-actions">
  <button class="btn btn-accent">강조</button>
  <button class="btn btn-secondary">보조</button>
  <button class="btn btn-danger">지우기</button>
</div>`
        },
        {
            group: '입력',
            name: '입력 묶음',
            classes: '.field-group > .field-label + input | select | textarea',
            note: '라벨은 모노 대문자. 묶음 하나에 입력 하나. 쓰임 229, 194',
            html: `<div class="field-group">
  <label class="field-label">글</label>
  <input type="text" placeholder="여기에 적기">
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
            group: '입력',
            name: '한 줄 묶음',
            classes: '.field-row',
            note: '라벨과 조작을 한 줄에 좌우로. 쓰임 7',
            html: `<div class="field-row"><span class="tool-sublabel">가로 세로 묶기</span><input type="checkbox" checked></div>`
        },
        {
            group: '입력',
            name: '고정폭 입력',
            classes: 'input.mono-input',
            note: '값을 그대로 보여 줄 때. 쓰임 69',
            html: `<div class="field-group">
  <label class="field-label">색 값</label>
  <input type="text" class="mono-input" value="#5f4dc2">
</div>`
        },
        {
            group: '입력',
            name: '밀개와 그 값',
            classes: 'input[type=range] + .range-value',
            note: '값은 밀개 옆에 숫자로. 쓰임 79',
            html: `<div class="field-group">
  <div class="tool-sublabel">길이 <span class="range-value">20자</span></div>
  <input type="range" min="4" max="40" value="20">
</div>`
        },
        {
            group: '입력',
            name: '설정 줄',
            classes: '.settings-control',
            note: '설정 창 오른쪽의 조작. 쓰임 22',
            html: `<div class="field-row"><span>테마</span><select class="settings-control"><option>다크</option><option>라이트</option></select></div>`
        },
        {
            group: '입력',
            name: '체크 줄',
            classes: '.tool-checkline',
            note: '체크 상자와 그 말을 한 줄로. 쓰임 21',
            html: `<label class="tool-checkline"><input type="checkbox" checked> 헷갈리는 글자 빼기 (l, I, O, 0, 1)</label>`
        },
        {
            group: '입력',
            name: '놓는 곳',
            classes: '.tool-drop (.over)',
            note: '파일을 끌어다 놓는 자리. 쓰임 39',
            html: `<div class="tool-drop">파일을 여기 놓거나 눌러서 고르기</div>`
        },
        {
            group: '알림과 값',
            name: '상태 줄',
            classes: '.tool-status (.ok .error)',
            note: '한 줄로 결과를 말한다. 쓰임 270',
            html: `<div class="tool-status">기다리는 중</div>
<div class="tool-status ok">됐다. 3개 처리</div>
<div class="tool-status error">파일을 못 읽음</div>`
        },
        {
            group: '알림과 값',
            name: '보조 라벨',
            classes: '.tool-sublabel .tool-hint',
            note: '작은 제목과 귀띔. 쓰임 249, 35',
            html: `<div class="tool-sublabel">결과</div>
<p class="tool-hint">파일은 브라우저 밖으로 안 나간다</p>`
        },
        {
            group: '알림과 값',
            name: '큰 수',
            classes: '.tool-display',
            note: '타이머와 셈의 결과. 쓰임 23',
            html: `<div class="tool-display">12:34.56</div>`
        },
        {
            group: '알림과 값',
            name: '숫자 카드',
            classes: '.cc-stats > .cc-stat > .cc-stat-label + .cc-stat-value',
            note: '한눈에 보는 값 여럿. 첫 칸은 .cc-stat-primary. 쓰임 41',
            html: `<div class="cc-stats">
  <div class="cc-stat cc-stat-primary"><div class="cc-stat-label">세기</div><div class="cc-stat-value">아주 강함</div></div>
  <div class="cc-stat"><div class="cc-stat-label">버티는 시간</div><div class="cc-stat-value">수백 년</div></div>
  <div class="cc-stat"><div class="cc-stat-label">글자 종류</div><div class="cc-stat-value">70가지</div></div>
</div>`
        },
        {
            group: '알림과 값',
            name: '키, 값 목록',
            classes: '.tool-list > .tool-list-row > .tool-list-key .tool-list-val .tool-list-dim',
            note: '쓰임 80, 93, 84, 90, 41',
            html: `<div class="tool-list">
  <div class="tool-list-row"><span class="tool-list-key">크기</span><span class="tool-list-val">1440 x 900</span></div>
  <div class="tool-list-row"><span class="tool-list-key">형식</span><span class="tool-list-val">PNG <span class="tool-list-dim">8bit</span></span></div>
  <div class="tool-list-row"><span class="tool-list-key">용량</span><span class="tool-list-val">212 KB</span></div>
</div>`
        },
        {
            group: '고르기',
            name: '고르기 칩',
            classes: '.tool-chips > .tool-chip (.active)',
            note: '고른 것은 띠 반전. 하나 고르기와 여럿 고르기 둘 다 이 모양. 쓰임 53, 109',
            html: `<div class="tool-chips">
  <button class="tool-chip active">PNG</button>
  <button class="tool-chip">JPG</button>
  <button class="tool-chip">WEBP</button>
  <button class="tool-chip">SVG</button>
</div>`
        },
        {
            group: '고르기',
            name: '탭',
            classes: '.tab-row > .tab-btn (.active), .tab-panel',
            note: '위젯 탭은 셸이 만든다. 위젯 안에서 또 만들 때만 이 짜임',
            html: `<div class="tab-row">
  <button class="tab-btn active">만들기</button>
  <button class="tab-btn">읽기</button>
  <button class="tab-btn">기록</button>
</div>`
        },
        {
            group: '짜임',
            name: '버튼 줄',
            classes: '.tool-actions (.tight)',
            note: '버튼을 가로로 모은다. 쓰임 61',
            html: `<div class="tool-actions tight"><button class="btn btn-sm">하나</button><button class="btn btn-sm">둘</button></div>`
        },
        {
            group: '짜임',
            name: '두 칸',
            classes: '.tool-grid-2',
            note: '좁아지면 한 칸으로 접힌다. 쓰임 98',
            html: `<div class="tool-grid-2">
  <div class="field-group"><label class="field-label">너비</label><input type="number" value="1440"></div>
  <div class="field-group"><label class="field-label">높이</label><input type="number" value="900"></div>
</div>`
        },
        {
            group: '짜임',
            name: '좌우 나눔',
            classes: '.tool-split > .tool-split-pane',
            note: '재료와 결과를 나란히. 쓰임 4',
            html: `<div class="tool-split">
  <div class="tool-split-pane"><div class="tool-sublabel">넣을 것</div><textarea rows="3"></textarea></div>
  <div class="tool-split-pane"><div class="tool-sublabel">나온 것</div><textarea rows="3" readonly></textarea></div>
</div>`
        },
        {
            group: '짜임',
            name: '절',
            classes: '.tool-section .tool-section-end',
            note: '도구 안의 문단 나누기. 마지막 절에는 -end',
            html: `<div class="tool-section"><div class="tool-sublabel">첫째 절</div><p class="tool-hint">여기 내용</p></div>
<div class="tool-section tool-section-end"><div class="tool-sublabel">마지막 절</div></div>`
        },
        {
            group: '짜임',
            name: '재료 도구 틀',
            classes: 'tools/shared/material-shell.ts (.pf-*)',
            note: '재료 아홉이 같은 틀을 쓴다. 왼쪽은 재료, 오른쪽은 할 일',
            html: `<p class="tool-hint">이 틀은 도구가 통째로 쓰는 것이라 여기서는 안 그린다. PDF 도구를 열면 보인다</p>`
        },
        {
            group: '그 밖',
            name: '고정폭 글',
            classes: '.mono',
            note: '값, 경로, 코드 조각. 쓰임 18',
            html: `<p>저장된 곳 <span class="mono">/apps/karmolab/data/</span></p>`
        },
        {
            group: '그 밖',
            name: '알림',
            classes: 'Toolbox.showToast(msg, type)',
            note: '위젯이 직접 안 그린다. 셸의 것을 부른다',
            html: `<div class="tool-actions tight">
  <button class="btn btn-sm" data-toast="success">잘 됨</button>
  <button class="btn btn-sm" data-toast="error">안 됨</button>
  <button class="btn btn-sm" data-toast="info">알림</button>
</div>`
        },
        {
            group: '그 밖',
            name: '클래스 없이도 되는 것',
            classes: 'button, input[type=file], table, details (클래스 없을 때)',
            note: '위젯이 아무것도 안 정한 자리는 셸이 킷 모양으로 채운다. 클래스를 하나라도 붙이면 그쪽이 이긴다',
            html: `<button>맨 버튼</button>
<input type="file">
<table><tr><th>키</th><td>값</td></tr><tr><th>키</th><td>값</td></tr></table>
<details><summary>접힌 것</summary><p class="tool-hint">펼치면 이 글</p></details>`
        }
    ];

    /* 스킨이 정하는 값. 위젯은 이 이름만 쓴다 */
    const TOKENS: { group: string; names: string[] }[] = [
        { group: '판', names: ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-hover'] },
        { group: '글자', names: ['--text-primary', '--text-secondary', '--text-tertiary'] },
        { group: '테두리', names: ['--border', '--border-hover', '--border-strong'] },
        { group: '강조', names: ['--accent', '--accent-ink', '--accent-fg', '--accent-dim', '--accent-subtle'] },
        { group: '상태', names: ['--success', '--error', '--warning', '--status-fg'] },
        { group: '띠', names: ['--band', '--band-ink', '--band-mute'] },
        { group: '모양', names: ['--radius-sm', '--radius-md', '--radius-pill', '--chip-radius', '--skew', '--cut'] }
    ];

    function build(container: HTMLElement): void {
        const groups: string[] = [];
        for (const p of PARTS) if (!groups.includes(p.group)) groups.push(p.group);
        const cards = groups
            .map((g) => {
                const inner = PARTS.filter((p) => p.group === g)
                    .map(
                        (p) => `<section class="kit-part">
  <div class="kit-part-head">
    <span class="kit-part-name">${esc(p.name)}</span>
    <code class="kit-part-classes">${esc(p.classes)}</code>
  </div>
  ${p.note ? `<p class="tool-hint">${esc(p.note)}</p>` : ''}
  <div class="kit-part-body">${p.html}</div>
</section>`
                    )
                    .join('');
                return `<h3 class="tool-sublabel">${esc(g)}</h3><div class="kit-parts">${inner}</div>`;
            })
            .join('');
        const cs = getComputedStyle(document.documentElement);
        const swatches = TOKENS.map((g) => `<section class="kit-part">
  <div class="kit-part-head"><span class="kit-part-name">${esc(g.group)}</span></div>
  <div class="kit-tokens">${g.names.map((n) => `<div class="kit-token"><span class="kit-token-chip" style="background:var(${n})"></span><code>${esc(n)}</code><span class="tool-list-dim">${esc(cs.getPropertyValue(n).trim())}</span></div>`).join('')}</div>
</section>`).join('');
        container.innerHTML = `<p class="tool-hint">${esc(t('uikit.hint', { n: PARTS.length }))}</p>
${cards}
<h3 class="tool-sublabel">${esc(t('uikit.tokens', undefined, '토큰'))}</h3>
<div class="kit-parts">${swatches}</div>`;
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
