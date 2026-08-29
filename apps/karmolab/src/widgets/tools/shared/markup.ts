/**
 * **화면 뼈대 조각**. 통짜 안에서 되풀이되는 마크업만 뽑는다 (TASK-KL-257)
 *
 * 원장이 화면 통짜(innerHTML) 122파일, 어림 3,660줄로 세던 자리다. 통짜 전체를 없애는 것은
 * 선언형 조작 자리(KL-256) 이야기이고 **화면 모양이 바뀌므로 사용자 결정**이다. 그 결정 없이도
 * 지금 할 수 있는 것이 있다. 뼈대만 함수로 뽑기. 화면은 한 픽셀도 안 바뀐다.
 *
 * 왜 이것만 뽑나: 2단 격자 안에 든 것은 제각각이다(글칸, 슬라이더, 고르기, 숫자칸).
 * 그래서 **껍데기**와 **가장 잦은 한 쌍(라벨+글칸)** 둘만 뽑는다. 나머지를 억지로 함수로 만들면
 * 인자가 열 개짜리 함수가 나오고, 그건 통짜보다 읽기 어렵다.
 *
 * 값은 부르는 쪽이 이미 이스케이프한 조각을 넣는 자리다. 여기서 또 막지 않는다.
 */

/** 2단 격자 껍데기. 안에 무엇이 들어가든 상관없다. */
export function twoPane(left: string, right: string): string {
  return `<div class="tool-grid-2"><div>${left}</div><div>${right}</div></div>`;
}

export interface TextPane {
  id: string;
  /** 이미 이스케이프된 라벨 글 */
  label: string;
  name?: string;
  rows?: number;
  minHeight?: number;
  readonly?: boolean;
  placeholder?: string;
  /** 고정폭 글꼴 (코드, 데이터). 기본 켬. 이 뼈대를 쓰는 자리는 대개 코드다. */
  mono?: boolean;
}

/**
 * 라벨 + 글칸 한 쌍. `aria-label` 을 라벨과 **같은 글로** 자동으로 붙인다 . 
 * 손으로 적을 때 가장 자주 빠지던 자리다(빠지면 화면낭독기가 편집창이라고만 말한다).
 */
export function textPane(o: TextPane): string {
  const cls = o.mono === false ? '' : ' class="mono-input"';
  const style = o.minHeight ? ` style="min-height:${o.minHeight}px;"` : '';
  const rows = o.rows ? ` rows="${o.rows}"` : '';
  const name = o.name ? ` name="${o.name}"` : '';
  const ph = o.placeholder ? ` placeholder="${o.placeholder}"` : '';
  const ro = o.readonly ? ' readonly' : '';
  return (
    `<label class="field-label" for="${o.id}">${o.label}</label>` +
    `<textarea id="${o.id}"${name} aria-label="${o.label}"${cls}${rows}${style}${ph}${ro}></textarea>`
  );
}
