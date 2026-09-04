/**
 * **파일 받는 자리**를 한 곳으로 (TASK-KL-290)
 *
 * 도구 서른둘을 재 보니(2026-08-13) 같은 열두 줄이 **31곳**에 손으로 적혀 있었다:
 * 눌러서 고르기, `change`, `dragover`/`dragleave`/`drop`, 끌 때 테두리 표시.
 *
 * 그런데 **똑같지가 않았다**. 붙여넣기(`acceptPastedFiles`)는 **23곳에만** 있다.
 * 사진 크기 맞추기, 여백 자르기, PDF 가리개, 페이드... 여덟 곳은 화면 캡처를 붙여넣어도
 * 아무 일이 안 일어난다. 같은 일을 서른한 번 적으면 **서른한 곳이 서로 다르게 낡는다**는
 * 말의 실물이다(어디가 되고 어디가 안 되는지 아무도 모른다).
 *
 * 그래서 여기 하나 둔다. **한 곳에 붙이면 서른한 곳이 같이 는다.**
 */
import { acceptPastedFiles } from './paste';

export interface DropWell {
  /** 끌어다 놓는 자리 (테두리 표시가 붙는 요소) */
  drop: HTMLElement;
  /** 숨은 파일 칸. 눌렀을 때 열린다 */
  input: HTMLInputElement;
  /** 붙여넣기를 받을 자리. 대개 도구 화면 전체 */
  scope?: HTMLElement;
  /** 파일이 들어왔다. 여러 개를 안 받는 도구면 첫 장만 쓰면 된다. */
  onFiles: (files: File[]) => void;
  /** 끌 때 붙일 표시 (기본 `over`. 지금 도구들이 쓰는 이름) */
  overClass?: string;
}

/**
 * 배선한다. **끄는 손잡이는 안 준다**. 도구 화면이 사라지면 DOM 리스너도 같이 죽는다.
 * (붙여넣기만 창에 걸리는데, 그건 `acceptPastedFiles` 가 스스로 거둔다.)
 */
/** `accept` 한 줄을 이 파일 받나로 바꾼다. 비어 있으면 다 받는다. */
function matcher(accept: string): (f: File) => boolean {
  const parts = (accept || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return () => true;
  return (f: File): boolean =>
    parts.some((p) => {
      if (p.endsWith('/*')) return f.type.toLowerCase().startsWith(p.slice(0, -1));
      if (p.startsWith('.')) return f.name.toLowerCase().endsWith(p);
      return f.type.toLowerCase() === p;
    });
}

export function wireDrop(o: DropWell): void {
  const over = o.overClass ?? 'over';
  const hand = (list: FileList | File[] | null | undefined): void => {
    const files = Array.from(list || []);
    if (files.length) o.onFiles(files);
  };

  o.drop.addEventListener('click', () => o.input.click());
  /* **키보드로도 열린다** (TASK-KL-290). 파일 칸을 감춰 두고 상자를 누르게 해 놓으면
   * 마우스가 없는 사람에게는 길이 막힌다. 이 배선은 여태 **두 도구에만** 있었다
   * (`audiocut`, `filehash`). 공용으로 올리니 서른둘이 같이 얻는다. */
  /* 상자 안에 이미 누를 것이 있으면 상자에 역할을 안 준다. 누를 것 안에 누를 것이 되면
     낭독기가 둘을 하나로 읽는다 (axe nested-interactive. 그림글자 도구에서 잡혔다) */
  const ownControl = o.drop.querySelector('button, a[href], [role="button"]');
  if (!ownControl) {
    if (!o.drop.hasAttribute('tabindex')) o.drop.tabIndex = 0;
    if (!o.drop.getAttribute('role')) o.drop.setAttribute('role', 'button');
  }
  o.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      o.input.click();
    }
  });
  o.input.addEventListener('change', () => hand(o.input.files));

  o.drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    o.drop.classList.add(over);
  });
  o.drop.addEventListener('dragleave', () => o.drop.classList.remove(over));
  o.drop.addEventListener('drop', (e) => {
    e.preventDefault();
    o.drop.classList.remove(over);
    hand((e as DragEvent).dataTransfer?.files);
  });

  /* **붙여넣기는 기본이다**. 화면을 캡처해서 바로 붙이는 게 가장 잦은 쓰임인데,
   * 손으로 배선하던 때는 여덟 도구가 이걸 빠뜨리고 있었다. 여기 있으면 안 빠진다.
   *
   * 무엇을 받을지는 **그 도구의 파일 칸에게 묻는다**(`accept`). 여기 또 적으면 두 곳이 갈린다.
   * PDF 도구에 그림을 붙여넣는 일이 없게. */
  acceptPastedFiles(o.scope || o.drop, (files) => hand(files), matcher(o.input.accept));
}
