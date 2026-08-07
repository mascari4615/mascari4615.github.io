/**
 * 붙여넣기로 파일 넣기 (TASK-KL-088)
 *
 * 사진 도구에서 가장 잦은 쓰임은 **화면 캡처를 바로 쓰는 것**이다. 그런데 지금은 캡처를
 * 파일로 저장한 뒤 다시 골라야 한다 — 한 단계가 통째로 낭비다.
 *
 * 붙여넣기를 받으면 그 단계가 사라진다. 다만 두 가지를 지켜야 한다:
 *  ① **글자를 적는 중에는 가로채면 안 된다** — 입력칸에 붙여 넣으려던 것을 뺏으면 더 나쁘다.
 *  ② 도구가 화면에 없을 때도 반응하면 엉뚱한 곳에서 파일이 들어간다 — 그 위젯이 보일 때만.
 */

/**
 * `container` 안에서 붙여넣기로 들어온 그림 파일을 `onFiles` 로 넘긴다.
 * 문서 전체에서 듣되, 글자를 적는 중이거나 이 도구가 화면에 없으면 아무 일도 하지 않는다.
 */
export function acceptPastedFiles(
  container: HTMLElement,
  onFiles: (files: File[]) => void,
  accept: (f: File) => boolean = (f) => f.type.startsWith('image/')
): void {
  const handler = (e: ClipboardEvent): void => {
    // 이 도구가 화면에 없으면 남의 자리다
    if (!container.isConnected || !container.offsetParent) return;
    // 글자를 적는 중이면 그쪽이 우선이다
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    const files = Array.from(e.clipboardData?.items || [])
      .map((i) => (i.kind === 'file' ? i.getAsFile() : null))
      .filter((f): f is File => !!f && accept(f));
    if (!files.length) return;
    e.preventDefault();
    onFiles(files);
  };

  document.addEventListener('paste', handler);
}
