/**
 * 자료표 공용 렌더러 (TASK-KL-088)
 *
 * 특수문자·ASCII·HTTP 상태코드 같은 「찾아보고 눌러 복사」 표는 화면 구조가 전부 같다.
 * 표마다 UI 를 복제하면 검색·복사·칩 동작이 6벌로 갈라지므로, 렌더러 하나에 데이터만 갈아 끼운다.
 *
 * 각 자료 위젯은 `RefTable.build(container, spec)` 만 호출한다.
 */
interface RefItem {
  /** 클릭 시 복사되는 값 */
  copy: string;
  /** 크게 보이는 것 (문자·코드) */
  glyph: string;
  /** 이름·설명 */
  label: string;
  /** 부가 정보 한 줄 (코드값 등) */
  sub?: string;
  /** 검색에 걸리게 할 추가 키워드 */
  keywords?: string;
  /** 분류 칩 */
  group: string;
  /** 미리보기 색 (색상표용) */
  color?: string;
}

interface RefSpec {
  items: RefItem[];
  /** 검색창 placeholder */
  placeholder: string;
  /** 복사 시 토스트 문구 접두 */
  copyNoun: string;
  /** 표 형태 — glyph 강조(문자표) / 줄 목록(코드표) */
  layout?: 'grid' | 'list';
  /** 표 아래 각주 */
  note?: string;
}

(function (): void {
  /**
   * 표 정의를 이름표로 보관한다.
   *
   * 같은 표를 「문자표」 위젯의 탭과 그 표의 개별 검색 페이지에서 둘 다 그려야 하는데,
   * 데이터를 양쪽에 복제하면 한쪽만 고쳐지는 날이 온다. 정의는 한 곳, 그리는 쪽이 꺼내 쓴다.
   */
  const specs: Record<string, RefSpec> = {};
  function define(id: string, spec: RefSpec): void {
    specs[id] = spec;
  }
  function get(id: string): RefSpec | undefined {
    return specs[id];
  }

  function build(container: HTMLElement, spec: RefSpec): void {
    const groups: string[] = [];
    spec.items.forEach((it) => {
      if (groups.indexOf(it.group) < 0) groups.push(it.group);
    });
    const layout = spec.layout || 'grid';

    container.innerHTML = `
      <div class="field-group">
        <input type="text" class="rt-search" placeholder="${spec.placeholder}">
        <div class="tool-chips rt-chips" style="margin-top:10px;">
          <button type="button" class="tool-chip active" data-group="">전체</button>
          ${groups.map((g) => `<button type="button" class="tool-chip" data-group="${g}">${g}</button>`).join('')}
        </div>
      </div>
      <div class="rt-body ${layout === 'grid' ? 'rt-grid' : 'rt-list'}"></div>
      <div class="tool-status rt-status" style="margin-top:12px;">${spec.note || '항목을 누르면 클립보드로 복사됩니다.'}</div>
    `;

    const search = container.querySelector('.rt-search') as HTMLInputElement;
    const body = container.querySelector('.rt-body') as HTMLElement;
    const status = container.querySelector('.rt-status') as HTMLElement;
    let group = '';

    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    function render(): void {
      const q = search.value.trim().toLowerCase();
      const list = spec.items.filter((it) => {
        if (group && it.group !== group) return false;
        if (!q) return true;
        return (
          it.label.toLowerCase().includes(q) ||
          it.glyph.toLowerCase().includes(q) ||
          (it.sub || '').toLowerCase().includes(q) ||
          (it.keywords || '').toLowerCase().includes(q)
        );
      });

      body.innerHTML = list
        .map((it, i) =>
          layout === 'grid'
            ? `<button type="button" class="rt-cell" data-i="${i}" title="${esc(it.label)}">
                 ${it.color ? `<span class="rt-swatch" style="background:${it.color}"></span>` : `<span class="rt-glyph">${esc(it.glyph)}</span>`}
                 <span class="rt-label">${esc(it.label)}</span>
                 ${it.sub ? `<span class="rt-sub">${esc(it.sub)}</span>` : ''}
               </button>`
            : `<button type="button" class="rt-row" data-i="${i}">
                 ${it.color ? `<span class="rt-swatch rt-swatch-sm" style="background:${it.color}"></span>` : `<span class="rt-row-glyph">${esc(it.glyph)}</span>`}
                 <span class="rt-row-label">${esc(it.label)}</span>
                 <span class="rt-row-sub">${esc(it.sub || '')}</span>
               </button>`
        )
        .join('');

      // 필터 결과 기준 인덱스라 매 렌더마다 다시 묶는다.
      body.querySelectorAll('[data-i]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          const item = list[Number((el as HTMLElement).dataset.i)];
          if (!item) return;
          void Toolbox.copyText?.(item.copy, { message: `${spec.copyNoun} 복사: ${item.copy}` }).then((ok) => {
            if (!ok) return;
            el.classList.add('rt-copied');
            setTimeout(() => el.classList.remove('rt-copied'), 600);
          });
        };
      });

      status.textContent = list.length
        ? `${list.length.toLocaleString('ko-KR')}개 · ${spec.note || '누르면 복사됩니다.'}`
        : '검색 결과가 없어요.';
    }

    search.addEventListener('input', render);
    container.querySelectorAll('.rt-chips .tool-chip').forEach((chip) => {
      (chip as HTMLButtonElement).onclick = () => {
        container.querySelectorAll('.rt-chips .tool-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        group = (chip as HTMLElement).dataset.group || '';
        render();
      };
    });

    render();
  }

  window.RefTable = { build, define, get };
})();
