// @ts-nocheck
/**
 * 무한 텍스트 어드벤처 (KL-032).
 *
 * 현재 단계: α (provider abstraction). γ 단계부터 turn 루프 진입.
 * 시드: memo/projects/karmolab/tasks/TASK-KL-032-infinite-text-adventure.md
 */
import {
  ALL_ADVENTURE_PROVIDERS,
  ADV_PROVIDER_PREF_KEY,
  createAdventureProvider,
  getAdventureProviderIdPref,
} from './provider';
import type { AdventureProviderId } from './provider';

(function () {
  function buildAdventure(panel: HTMLElement) {
    panel.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'kl-adventure-root';
    wrap.style.padding = '16px';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';
    wrap.style.color = 'var(--text-primary, #e8e8e8)';

    const heading = document.createElement('h3');
    heading.textContent = '무한 텍스트 어드벤처';
    heading.style.margin = '0';
    heading.style.color = 'var(--accent, #d4a849)';
    wrap.appendChild(heading);

    const phase = document.createElement('p');
    phase.style.margin = '0';
    phase.style.fontSize = '13px';
    phase.style.color = 'var(--text-tertiary, #888)';
    phase.textContent = 'α + β 단계 — provider abstraction + wiki entity kind 박힘. δ 단계부터 turn 루프 진입.';
    wrap.appendChild(phase);

    /* ===== 누적된 모험 (bindings.adventure) ===== */
    const advList = document.createElement('div');
    advList.style.background = 'var(--bg-secondary, #181818)';
    advList.style.border = '1px solid var(--border-color, #333)';
    advList.style.borderRadius = 'var(--radius-md, 6px)';
    advList.style.padding = '10px 12px';
    advList.style.fontSize = '13px';

    const advTitle = document.createElement('strong');
    advTitle.textContent = '누적된 모험';
    advTitle.style.display = 'block';
    advTitle.style.marginBottom = '6px';
    advList.appendChild(advTitle);

    const KW = (globalThis as unknown as {
      KarmoWorld?: {
        bindings?: { adventure?: { adventures?: Array<{ slug: string; title: string; oneLine?: string }> } };
      };
    }).KarmoWorld;
    const adventures = KW?.bindings?.adventure?.adventures ?? [];
    if (adventures.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--text-tertiary, #888)';
      empty.textContent = '(아직 박힌 모험 없음 — 첫 모험 종료 시 wiki entity 로 누적됨)';
      advList.appendChild(empty);
    } else {
      const ul = document.createElement('ul');
      ul.style.margin = '0';
      ul.style.paddingLeft = '18px';
      for (const adv of adventures) {
        const li = document.createElement('li');
        li.textContent = `${adv.title || adv.slug}${adv.oneLine ? ' — ' + adv.oneLine : ''}`;
        ul.appendChild(li);
      }
      advList.appendChild(ul);
    }
    wrap.appendChild(advList);

    /* ===== provider 토글 ===== */
    const providerRow = document.createElement('div');
    providerRow.style.display = 'flex';
    providerRow.style.gap = '12px';
    providerRow.style.alignItems = 'center';
    providerRow.style.flexWrap = 'wrap';

    const label = document.createElement('strong');
    label.textContent = 'Provider';
    providerRow.appendChild(label);

    const select = document.createElement('select');
    select.style.padding = '4px 8px';
    select.style.background = 'var(--bg-tertiary, #1f1f1f)';
    select.style.color = 'var(--text-primary, #e8e8e8)';
    select.style.border = '1px solid var(--border-color, #333)';
    select.style.borderRadius = 'var(--radius-sm, 4px)';
    for (const p of ALL_ADVENTURE_PROVIDERS) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (default: ${p.defaultModelId()})`;
      select.appendChild(opt);
    }
    select.value = getAdventureProviderIdPref();

    const Tx = (globalThis as unknown as {
      Toolbox?: { setPref?: (key: string, value: unknown) => void };
    }).Toolbox;
    select.addEventListener('change', () => {
      Tx?.setPref?.(ADV_PROVIDER_PREF_KEY, select.value);
    });
    providerRow.appendChild(select);

    wrap.appendChild(providerRow);

    /* ===== 테스트 호출 ===== */
    const testRow = document.createElement('div');
    testRow.style.display = 'flex';
    testRow.style.gap = '8px';

    const testBtn = document.createElement('button');
    testBtn.textContent = 'provider 테스트 호출';
    testBtn.style.padding = '6px 12px';
    testBtn.style.background = 'var(--accent, #d4a849)';
    testBtn.style.color = '#000';
    testBtn.style.border = 'none';
    testBtn.style.borderRadius = 'var(--radius-sm, 4px)';
    testBtn.style.cursor = 'pointer';
    testRow.appendChild(testBtn);

    const status = document.createElement('span');
    status.style.color = 'var(--text-tertiary, #888)';
    status.style.fontSize = '13px';
    testRow.appendChild(status);

    wrap.appendChild(testRow);

    const out = document.createElement('pre');
    out.style.background = 'var(--bg-tertiary, #1f1f1f)';
    out.style.border = '1px solid var(--border-color, #333)';
    out.style.borderRadius = 'var(--radius-md, 6px)';
    out.style.padding = '12px';
    out.style.minHeight = '120px';
    out.style.maxHeight = '320px';
    out.style.overflow = 'auto';
    out.style.fontFamily = 'var(--font-mono, monospace)';
    out.style.fontSize = '12px';
    out.style.whiteSpace = 'pre-wrap';
    out.style.wordBreak = 'break-word';
    out.textContent = '(테스트 호출 결과 / 에러가 여기에 표시됩니다)';
    wrap.appendChild(out);

    testBtn.addEventListener('click', async () => {
      const pid = select.value as AdventureProviderId;
      status.textContent = `[${pid}] 호출 중...`;
      out.textContent = '';
      try {
        const provider = createAdventureProvider(pid);
        const res = await provider.complete({
          systemInstruction:
            '당신은 무한 텍스트 어드벤처의 GM 티메토입니다. 지금은 α 단계 테스트입니다. 한국어로 정확히 "OK" 라고만 답하세요.',
          history: [],
          userText: 'ping',
        });
        status.textContent = `[${res.providerId} / ${res.modelId}] 응답 도착`;
        out.textContent = res.text;
      } catch (err) {
        status.textContent = `[${pid}] 에러`;
        out.textContent = err instanceof Error ? err.message : String(err);
      }
    });
  }

  /* ===== 위젯 등록 ===== */
  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('adventure'),
    tabs: [{ id: 'adventure-main', label: '모험', build: buildAdventure }],
  });
})();
