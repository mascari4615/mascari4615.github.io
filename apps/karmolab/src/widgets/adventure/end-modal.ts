/**
 * 모험 종료 modal — KL-032 θ 단계.
 *
 * 흐름: 종료 버튼 클릭 → modal overlay
 *   1. 「정수 추출 진행 중...」
 *   2. summary 도착 → yaml + md textarea 박음 (사용자 편집 가능)
 *   3. 「commit + push」 / 「취소」 버튼
 *   4. commit → adventure_commit_summary Tauri command → 결과 토스트
 */
import type { AdventureSession } from './storage';
import { extractSummary } from './summary';
import type { AdventureSummary } from './summary';

interface CommitResult {
  karmolab_pushed: boolean;
  memo_pushed: boolean;
  wiki_yaml_path: string;
  wiki_md_path: string;
}

interface CommitPayload {
  payload: {
    slug: string;
    title: string;
    oneLine: string;
    yaml: string;
    md: string;
  };
}

type TauriInvoke = (
  cmd: 'adventure_commit_summary',
  args: CommitPayload,
) => Promise<CommitResult>;

function getInvoke(): TauriInvoke | null {
  const t = (globalThis as unknown as {
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
  }).__TAURI__;
  return t?.core?.invoke ?? null;
}

const STYLE = {
  bgPrimary: 'var(--bg-primary, #0e0e0e)',
  bgSecondary: 'var(--bg-secondary, #181818)',
  bgTertiary: 'var(--bg-tertiary, #1f1f1f)',
  textPrimary: 'var(--text-primary, #e8e8e8)',
  textTertiary: 'var(--text-tertiary, #888)',
  accent: 'var(--accent, #a99bf5)',
  border: 'var(--border-color, #333)',
  radiusSm: 'var(--radius-sm, 4px)',
  radiusMd: 'var(--radius-md, 6px)',
  danger: '#c44',
};

export async function showEndModal(session: AdventureSession): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.65)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.background = STYLE.bgSecondary;
    card.style.border = `1px solid ${STYLE.border}`;
    card.style.borderRadius = STYLE.radiusMd;
    card.style.padding = '20px';
    card.style.color = STYLE.textPrimary;
    card.style.width = 'min(820px, 90vw)';
    card.style.maxHeight = '90vh';
    card.style.overflow = 'auto';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    const heading = document.createElement('h3');
    heading.textContent = '모험 종료 — 정수 추출';
    heading.style.margin = '0';
    heading.style.color = STYLE.accent;
    card.appendChild(heading);

    const status = document.createElement('p');
    status.style.margin = '0';
    status.style.fontSize = '13px';
    status.style.color = STYLE.textTertiary;
    status.textContent = '정수 추출 중... (LLM 응답 대기)';
    card.appendChild(status);

    const yamlLabel = document.createElement('label');
    yamlLabel.textContent = 'yaml (편집 가능)';
    yamlLabel.style.fontSize = '12px';
    yamlLabel.style.color = STYLE.textTertiary;
    yamlLabel.style.display = 'none';
    card.appendChild(yamlLabel);

    const yamlArea = document.createElement('textarea');
    yamlArea.style.padding = '8px';
    yamlArea.style.background = STYLE.bgTertiary;
    yamlArea.style.color = STYLE.textPrimary;
    yamlArea.style.border = `1px solid ${STYLE.border}`;
    yamlArea.style.borderRadius = STYLE.radiusSm;
    yamlArea.style.fontFamily = 'var(--font-mono, monospace)';
    yamlArea.style.fontSize = '12px';
    yamlArea.style.minHeight = '160px';
    yamlArea.style.resize = 'vertical';
    yamlArea.style.display = 'none';
    card.appendChild(yamlArea);

    const mdLabel = document.createElement('label');
    mdLabel.textContent = 'md (편집 가능)';
    mdLabel.style.fontSize = '12px';
    mdLabel.style.color = STYLE.textTertiary;
    mdLabel.style.display = 'none';
    card.appendChild(mdLabel);

    const mdArea = document.createElement('textarea');
    mdArea.style.padding = '8px';
    mdArea.style.background = STYLE.bgTertiary;
    mdArea.style.color = STYLE.textPrimary;
    mdArea.style.border = `1px solid ${STYLE.border}`;
    mdArea.style.borderRadius = STYLE.radiusSm;
    mdArea.style.fontFamily = 'inherit';
    mdArea.style.fontSize = '13px';
    mdArea.style.minHeight = '180px';
    mdArea.style.resize = 'vertical';
    mdArea.style.display = 'none';
    card.appendChild(mdArea);

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '8px';
    buttons.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.background = STYLE.bgTertiary;
    cancelBtn.style.color = STYLE.textPrimary;
    cancelBtn.style.border = `1px solid ${STYLE.border}`;
    cancelBtn.style.borderRadius = STYLE.radiusSm;
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    buttons.appendChild(cancelBtn);

    const commitBtn = document.createElement('button');
    commitBtn.textContent = 'commit + push (wiki + memo raw)';
    commitBtn.style.padding = '8px 16px';
    commitBtn.style.background = STYLE.accent;
    commitBtn.style.color = '#000';
    commitBtn.style.border = 'none';
    commitBtn.style.borderRadius = STYLE.radiusSm;
    commitBtn.style.cursor = 'pointer';
    commitBtn.disabled = true;
    commitBtn.style.opacity = '0.5';
    buttons.appendChild(commitBtn);

    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let summary: AdventureSummary | null = null;

    void (async () => {
      try {
        summary = await extractSummary(session);
        status.textContent = `추출 완료 — slug: ${summary.slug}, title: ${summary.title}. 검토 후 commit.`;
        yamlLabel.style.display = '';
        yamlArea.style.display = '';
        yamlArea.value = summary.yaml;
        mdLabel.style.display = '';
        mdArea.style.display = '';
        mdArea.value = summary.md;
        commitBtn.disabled = false;
        commitBtn.style.opacity = '1';
      } catch (err) {
        status.textContent = '에러: ' + (err instanceof Error ? err.message : String(err));
        status.style.color = STYLE.danger;
      }
    })();

    commitBtn.addEventListener('click', () => {
      if (!summary) return;
      commitBtn.disabled = true;
      commitBtn.style.opacity = '0.5';
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.5';
      status.textContent = 'commit + push 진행 중...';
      const invoke = getInvoke();
      if (!invoke) {
        status.textContent = '에러: Tauri 환경 아님 (브라우저에서는 commit 불가)';
        status.style.color = STYLE.danger;
        return;
      }
      void (async () => {
        try {
          const result = await invoke('adventure_commit_summary', {
            payload: {
              slug: summary!.slug,
              title: summary!.title,
              oneLine: summary!.oneLine,
              yaml: yamlArea.value,
              md: mdArea.value,
            },
          });
          status.textContent = `완료 — wiki: ${result.karmolab_pushed ? '✅ push' : '✗'}, memo raw: ${result.memo_pushed ? '✅ push' : '(변경 없음)'}`;
          status.style.color = STYLE.accent;
          setTimeout(() => {
            overlay.remove();
            resolve(true);
          }, 2000);
        } catch (err) {
          status.textContent = '에러: ' + (err instanceof Error ? err.message : String(err));
          status.style.color = STYLE.danger;
          commitBtn.disabled = false;
          commitBtn.style.opacity = '1';
          cancelBtn.disabled = false;
          cancelBtn.style.opacity = '1';
        }
      })();
    });
  });
}
