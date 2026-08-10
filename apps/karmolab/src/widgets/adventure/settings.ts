/**
 * Adventure 위젯 settings UI — KL-032 ι 단계.
 *
 * 사용자 prefer 박는 input 박스:
 * - provider (Claude / Vertex)  ← 메인 select 와 sync
 * - 모델 선택 (Claude Sonnet 4.6 / Opus 4.7 / Haiku 4.5 / Vertex Pro / Flash / Flash Lite)
 * - Vertex API key / Project ID / Location
 *
 * 저장 = Toolbox.setPref. 다음 turn 부터 자동 적용.
 */
import { ALL_ADVENTURE_PROVIDERS, ADV_PROVIDER_PREF_KEY } from './provider';
import type { AdventureProvider, AdventureProviderId } from './provider';
import { t, loadNamespace } from '../../lib/i18n';

interface ToolboxPrefAPI {
  getPref?: (key: string) => unknown;
  setPref?: (key: string, value: unknown) => void;
}

function pref(): ToolboxPrefAPI {
  const T = (globalThis as unknown as { Toolbox?: ToolboxPrefAPI }).Toolbox;
  return T ?? {};
}

function readStringPref(key: string, fallback = ''): string {
  const v = pref().getPref?.(key);
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}

function writeStringPref(key: string, value: string): void {
  pref().setPref?.(key, value);
}

const STYLE_TOKENS = {
  bgPrimary: 'var(--bg-primary, #0e0e0e)',
  bgSecondary: 'var(--bg-secondary, #181818)',
  bgTertiary: 'var(--bg-tertiary, #1f1f1f)',
  textPrimary: 'var(--text-primary, #e8e8e8)',
  textTertiary: 'var(--text-tertiary, #888)',
  accent: 'var(--accent, #a99bf5)',
  border: 'var(--border-color, #333)',
  radiusSm: 'var(--radius-sm, 4px)',
  radiusMd: 'var(--radius-md, 6px)',
};

function makeRow(labelText: string): { row: HTMLDivElement; cell: HTMLDivElement } {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.flexWrap = 'wrap';

  const label = document.createElement('label');
  label.style.minWidth = '140px';
  label.style.fontSize = '13px';
  label.style.color = STYLE_TOKENS.textTertiary;
  label.textContent = labelText;
  row.appendChild(label);

  const cell = document.createElement('div');
  cell.style.flex = '1';
  cell.style.display = 'flex';
  cell.style.gap = '6px';
  cell.style.flexWrap = 'wrap';
  row.appendChild(cell);
  return { row, cell };
}

function makeInput(value: string, placeholder: string, type: 'text' | 'password' = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.style.flex = '1';
  input.style.minWidth = '180px';
  input.style.padding = '4px 8px';
  input.style.background = STYLE_TOKENS.bgTertiary;
  input.style.color = STYLE_TOKENS.textPrimary;
  input.style.border = `1px solid ${STYLE_TOKENS.border}`;
  input.style.borderRadius = STYLE_TOKENS.radiusSm;
  input.style.fontFamily = 'inherit';
  input.style.fontSize = '13px';
  return input;
}

function makeSelect(options: { value: string; label: string }[], current: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.style.padding = '4px 8px';
  select.style.background = STYLE_TOKENS.bgTertiary;
  select.style.color = STYLE_TOKENS.textPrimary;
  select.style.border = `1px solid ${STYLE_TOKENS.border}`;
  select.style.borderRadius = STYLE_TOKENS.radiusSm;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  }
  select.value = current || (options[0]?.value ?? '');
  return select;
}

export function buildSettingsPanel(opts: {
  onProviderChange: (id: AdventureProviderId) => void;
}): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.background = STYLE_TOKENS.bgSecondary;
  wrap.style.border = `1px solid ${STYLE_TOKENS.border}`;
  wrap.style.borderRadius = STYLE_TOKENS.radiusMd;
  wrap.style.padding = '14px';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '10px';

  const heading = document.createElement('strong');
  heading.textContent = t('adventure.t36');
  wrap.appendChild(heading);

  const note = document.createElement('p');
  note.style.margin = '0';
  note.style.fontSize = '12px';
  note.style.color = STYLE_TOKENS.textTertiary;
  note.textContent =
    t('adventure.t37');
  wrap.appendChild(note);

  /* ===== Provider 선택 ===== */
  const { row: providerRow, cell: providerCell } = makeRow('Provider');
  const providerSelect = makeSelect(
    ALL_ADVENTURE_PROVIDERS.map((p: AdventureProvider) => ({ value: p.id, label: p.name })),
    readStringPref(ADV_PROVIDER_PREF_KEY) || 'claude',
  );
  providerSelect.addEventListener('change', () => {
    writeStringPref(ADV_PROVIDER_PREF_KEY, providerSelect.value);
    opts.onProviderChange(providerSelect.value as AdventureProviderId);
    // Provider 변경 시 모델 select 갱신
    refreshModelSelects();
  });
  providerCell.appendChild(providerSelect);
  wrap.appendChild(providerRow);

  /* ===== Claude 모델 ===== */
  const claudeProvider = ALL_ADVENTURE_PROVIDERS.find((p) => p.id === 'claude');
  const { row: claudeRow, cell: claudeCell } = makeRow(t('adventure.t38'));
  let claudeSelect: HTMLSelectElement | null = null;
  if (claudeProvider) {
    claudeSelect = makeSelect(
      claudeProvider.availableModels().map((m) => ({ value: m.id, label: m.name })),
      readStringPref('adv_claude_model_id') || claudeProvider.defaultModelId(),
    );
    claudeSelect.addEventListener('change', () => writeStringPref('adv_claude_model_id', claudeSelect!.value));
    claudeCell.appendChild(claudeSelect);
  }
  wrap.appendChild(claudeRow);

  /* ===== Vertex 모델 ===== */
  const vertexProvider = ALL_ADVENTURE_PROVIDERS.find((p) => p.id === 'vertex');
  const { row: vertexModelRow, cell: vertexModelCell } = makeRow(t('adventure.t39'));
  let vertexModelSelect: HTMLSelectElement | null = null;
  if (vertexProvider) {
    vertexModelSelect = makeSelect(
      vertexProvider.availableModels().map((m) => ({ value: m.id, label: m.name })),
      readStringPref('adv_vertex_model_id') || vertexProvider.defaultModelId(),
    );
    vertexModelSelect.addEventListener('change', () =>
      writeStringPref('adv_vertex_model_id', vertexModelSelect!.value),
    );
    vertexModelCell.appendChild(vertexModelSelect);
  }
  wrap.appendChild(vertexModelRow);

  function refreshModelSelects(): void {
    // 현재 provider 가 아닌 select 는 흐리게
    const current = providerSelect.value;
    if (claudeSelect) claudeSelect.style.opacity = current === 'claude' ? '1' : '0.5';
    if (vertexModelSelect) vertexModelSelect.style.opacity = current === 'vertex' ? '1' : '0.5';
  }
  refreshModelSelects();

  /* ===== Vertex API key / Project ID / Location ===== */
  const { row: keyRow, cell: keyCell } = makeRow('Vertex API key');
  const keyInput = makeInput(readStringPref('adv_vertex_api_key'), 'Vertex API key', 'password');
  keyInput.addEventListener('change', () => writeStringPref('adv_vertex_api_key', keyInput.value.trim()));
  keyCell.appendChild(keyInput);
  wrap.appendChild(keyRow);

  const { row: projRow, cell: projCell } = makeRow('Vertex Project ID');
  const projInput = makeInput(readStringPref('adv_vertex_project_id'), 'GCP project ID');
  projInput.addEventListener('change', () => writeStringPref('adv_vertex_project_id', projInput.value.trim()));
  projCell.appendChild(projInput);
  wrap.appendChild(projRow);

  const { row: locRow, cell: locCell } = makeRow('Vertex Location');
  const locInput = makeInput(readStringPref('adv_vertex_location'), 'us-central1 (default)');
  locInput.addEventListener('change', () => writeStringPref('adv_vertex_location', locInput.value.trim()));
  locCell.appendChild(locInput);
  wrap.appendChild(locRow);

  return wrap;
}
