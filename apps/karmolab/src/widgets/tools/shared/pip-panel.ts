/**
 * 떠 있는 창 (Document Picture-in-Picture). 지켜보기에서 뽑아낸 공용 부품
 *
 * - 다른 창 위에 남는 작은 상태 판. 줄마다 이름과 값, 강조 표시. 아래 한 줄 덧말
 * - 브라우저가 지원 안 하면 `pipSupported()` 가 false. 열기가 거부되면 null
 * - 사용자가 창을 닫으면 `onClose` 로 통지
 */
import { escapeHtml as esc } from './text';

interface PipWindowLike extends Window {
  document: Document;
}
interface DocPipLike {
  requestWindow(o: { width: number; height: number }): Promise<PipWindowLike>;
}

export interface PipRow {
  label: string;
  value: string;
  hit?: boolean;
  dim?: boolean;
}

export interface PipPanel {
  setRow(i: number, value: string, hit?: boolean): void;
  setFooter(text: string): void;
  close(): void;
}

export function pipSupported(): boolean {
  return 'documentPictureInPicture' in window;
}

export async function openPipPanel(rows: PipRow[], footer: string, onClose?: () => void): Promise<PipPanel | null> {
  const api = (window as unknown as { documentPictureInPicture?: DocPipLike }).documentPictureInPicture;
  if (!api) return null;
  let win: PipWindowLike;
  try {
    win = await api.requestWindow({ width: 260, height: 40 + rows.length * 26 });
  } catch {
    return null;
  }
  const d = win.document;
  /* 떠 있는 창은 딴 문서라 스킨 토큰이 안 닿는다. 본 문서의 값을 읽어 옮긴다 */
  const tok = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  d.body.style.cssText = `margin:0;font:12px var(--font-sans,system-ui,sans-serif);background:${tok('--bg-primary')};color:${tok('--text-primary')};`;
  const style = d.createElement('style');
  style.textContent = `.is-hit{background:${tok('--accent')};color:${tok('--bg-primary')}}`;
  d.head.appendChild(style);
  const box = d.createElement('div');
  box.style.cssText = 'padding:6px 8px;display:grid;gap:4px;';
  rows.forEach((r) => {
    const row = d.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:2px 6px;border-radius:' + tok('--radius-sm') + ';';
    row.innerHTML = `<span>${esc(r.label)}</span><b>${esc(r.value)}</b>`;
    if (r.hit) row.classList.add('is-hit');
    if (r.dim) row.style.opacity = '0.4';
    box.appendChild(row);
  });
  d.body.appendChild(box);
  const foot = d.createElement('div');
  foot.style.cssText = 'padding:2px 14px 6px;font-size:' + tok('--font-size-xs') + ';opacity:.7;';
  foot.textContent = footer;
  d.body.appendChild(foot);
  let open = true;
  win.addEventListener('pagehide', () => {
    if (!open) return;
    open = false;
    onClose?.();
  });
  return {
    setRow(i, value, hit) {
      const row = box.children[i] as HTMLElement | undefined;
      if (!row) return;
      (row.querySelector('b') as HTMLElement).textContent = value;
      if (hit !== undefined) row.classList.toggle('is-hit', hit);
    },
    setFooter(text) {
      foot.textContent = text;
    },
    close() {
      if (!open) return;
      open = false;
      try {
        win.close();
      } catch {
        /* 이미 닫힌 창 */
      }
    }
  };
}
