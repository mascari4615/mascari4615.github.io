// @ts-nocheck
/**
 * 무한 텍스트 어드벤처 (KL-032).
 *
 * 단계: α (provider abstraction) + β (wiki entity kind) + γ (UI) + δ (turn loop) + ε (NPC chatbot context).
 * 시드: memo/projects/karmolab/tasks/TASK-KL-032-infinite-text-adventure.md
 */
import {
  ALL_ADVENTURE_PROVIDERS,
  ADV_PROVIDER_PREF_KEY,
  createAdventureProvider,
  getAdventureProviderIdPref,
} from './provider';
import type { AdventureProviderId } from './provider';
import { listAllCharacterSlugs } from './npc-context';
import { createSession, saveSession, listLocalSessionSlugs, loadSession, deleteSession } from './storage';
import type { AdventureSession } from './storage';
import { createInitialState, runTurn } from './turn-loop';
import type { TurnLoopState } from './turn-loop';
import { parseTurnResponse } from './prompt';
import { buildSettingsPanel } from './settings';
import { showEndModal } from './end-modal';
import { generateAdventureImage } from './imagegen';
import { attachImageRef } from './turn-loop';

(function () {
  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> & { style?: Partial<CSSStyleDeclaration> } = {},
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (props.style) Object.assign(node.style, props.style);
    for (const k in props) {
      if (k === 'style') continue;
      (node as Record<string, unknown>)[k] = (props as Record<string, unknown>)[k];
    }
    return node;
  }

  function buildAdventure(panel: HTMLElement) {
    panel.innerHTML = '';

    const wrap = el('div', {
      style: {
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        color: 'var(--text-primary, #e8e8e8)',
        maxWidth: '900px',
        margin: '0 auto',
      },
    });

    /* ===== 헤더 ===== */
    const heading = el('h3', {
      textContent: '무한 텍스트 어드벤처',
      style: { margin: '0', color: 'var(--accent, #d4a849)' },
    });
    wrap.appendChild(heading);

    const phase = el('p', {
      textContent: '티메토 GM 의 KarmoWorld 모험 — α/β/γ/δ/ε 박힘. ζ (Tauri save) / θ (정수 추출) / κ (sample) 다음.',
      style: { margin: '0', fontSize: '13px', color: 'var(--text-tertiary, #888)' },
    });
    wrap.appendChild(phase);

    /* ===== provider 토글 + 설정 ===== */
    const providerRow = el('div', {
      style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
    });
    providerRow.appendChild(el('strong', { textContent: 'Provider' }));
    const providerSelect = el('select', {
      style: {
        padding: '4px 8px',
        background: 'var(--bg-tertiary, #1f1f1f)',
        color: 'var(--text-primary, #e8e8e8)',
        border: '1px solid var(--border-color, #333)',
        borderRadius: 'var(--radius-sm, 4px)',
      },
    });
    for (const p of ALL_ADVENTURE_PROVIDERS) {
      const opt = el('option', { value: p.id, textContent: `${p.name} (default: ${p.defaultModelId()})` });
      providerSelect.appendChild(opt);
    }
    providerSelect.value = getAdventureProviderIdPref();
    const Tx = (globalThis as unknown as {
      Toolbox?: { setPref?: (key: string, value: unknown) => void };
    }).Toolbox;
    providerSelect.addEventListener('change', () => Tx?.setPref?.(ADV_PROVIDER_PREF_KEY, providerSelect.value));
    providerRow.appendChild(providerSelect);

    const settingsToggle = el('button', {
      textContent: '⚙ 설정',
      style: {
        padding: '4px 10px',
        background: 'var(--bg-tertiary, #1f1f1f)',
        color: 'var(--text-primary, #e8e8e8)',
        border: '1px solid var(--border-color, #333)',
        borderRadius: 'var(--radius-sm, 4px)',
        cursor: 'pointer',
        marginLeft: 'auto',
      },
    });
    providerRow.appendChild(settingsToggle);
    wrap.appendChild(providerRow);

    const settingsPanel = buildSettingsPanel({
      onProviderChange: (id) => {
        providerSelect.value = id;
      },
    });
    settingsPanel.style.display = 'none';
    wrap.appendChild(settingsPanel);
    settingsToggle.addEventListener('click', () => {
      const open = settingsPanel.style.display === 'none';
      settingsPanel.style.display = open ? 'flex' : 'none';
      settingsToggle.textContent = open ? '⚙ 설정 닫기' : '⚙ 설정';
    });

    /* ===== 모험 컨테이너 (cast picker / turn loop / 종료) ===== */
    const stage = el('div', {
      style: {
        background: 'var(--bg-secondary, #181818)',
        border: '1px solid var(--border-color, #333)',
        borderRadius: 'var(--radius-md, 6px)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      },
    });
    wrap.appendChild(stage);

    let state: TurnLoopState | null = null;

    // turn 진행 중 페이지 이탈 경고 — panel.isConnected 로 위젯 unload 시 자동 무효화
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (state?.busy && panel.isConnected) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    function resumeFromSession(session: AdventureSession) {
      const resumed = createInitialState(session);
      for (const turn of session.turns) {
        resumed.history.push({ role: 'user', content: turn.userText });
        resumed.history.push({ role: 'assistant', content: turn.assistantText });
      }
      const lastTurn = session.turns[session.turns.length - 1];
      if (lastTurn?.parsed) {
        resumed.lastParsed = {
          narrative: lastTurn.parsed.narrative,
          choices: lastTurn.parsed.choices.slice(),
          npcSlugs: lastTurn.parsed.npcSlugs.slice(),
          sceneTitles: lastTurn.parsed.sceneTitles.slice(),
          ended: lastTurn.parsed.ended,
        };
      }
      state = resumed;
      renderTurnUI();
      if (resumed.lastParsed) {
        const nb = stage.querySelector('#kl-adv-narrative') as HTMLDivElement | null;
        const cb = stage.querySelector('#kl-adv-choices') as HTMLDivElement | null;
        if (nb) nb.textContent = resumed.lastParsed.narrative || '(이전 narrative)';
        if (cb) {
          cb.innerHTML = '';
          for (let i = 0; i < resumed.lastParsed.choices.length; i++) {
            const choice = resumed.lastParsed.choices[i];
            const btn = el('button', {
              textContent: `${i + 1}. ${choice}`,
              style: {
                padding: '8px 12px',
                background: 'var(--bg-tertiary, #1f1f1f)',
                color: 'var(--text-primary, #e8e8e8)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: 'var(--radius-sm, 4px)',
                cursor: 'pointer',
                textAlign: 'left',
              },
            });
            btn.addEventListener('click', () => void doTurn(choice, false));
            cb.appendChild(btn);
          }
        }
      }
    }

    function renderCastPicker() {
      stage.innerHTML = '';

      // 미완 모험 resume box
      const savedSlugs = listLocalSessionSlugs();
      if (savedSlugs.length > 0) {
        const resumeWrapper = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0' } });
        const resumeSec = el('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' },
        });
        resumeWrapper.appendChild(resumeSec);
        resumeSec.appendChild(el('strong', { textContent: '미완 모험 이어가기' }));

        let hasCard = false;
        for (const slug of savedSlugs) {
          const saved = loadSession(slug);
          if (!saved) continue;
          hasCard = true;

          const card = el('div', {
            style: {
              padding: '10px 12px',
              background: 'var(--bg-tertiary, #1f1f1f)',
              border: '1px solid var(--border-color, #333)',
              borderRadius: 'var(--radius-sm, 4px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            },
          });
          card.dataset.slug = slug;

          const date = new Date(saved.startedAt).toLocaleString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });
          card.appendChild(el('div', {
            textContent: slug,
            style: { fontWeight: '600', fontSize: '13px', color: 'var(--text-primary, #e8e8e8)' },
          }));
          card.appendChild(el('div', {
            textContent: `${date} · ${saved.turns.length}턴 · cast: ${saved.castSlugs.join(', ') || '(없음)'}`,
            style: { fontSize: '12px', color: 'var(--text-tertiary, #888)' },
          }));

          const btnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } });

          const resumeBtn = el('button', {
            textContent: '이어가기',
            style: {
              padding: '4px 12px',
              background: 'var(--accent, #d4a849)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              fontSize: '13px',
            },
          });
          resumeBtn.addEventListener('click', () => resumeFromSession(saved));

          const discardBtn = el('button', {
            textContent: '버리기',
            style: {
              padding: '4px 12px',
              background: 'var(--bg-secondary, #181818)',
              color: 'var(--text-tertiary, #888)',
              border: '1px solid var(--border-color, #333)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              fontSize: '13px',
            },
          });
          discardBtn.addEventListener('click', () => {
            void deleteSession(slug).then(() => {
              card.remove();
              if (resumeSec.querySelectorAll('[data-slug]').length === 0) {
                resumeWrapper.remove();
              }
            });
          });

          btnRow.appendChild(resumeBtn);
          btnRow.appendChild(discardBtn);
          card.appendChild(btnRow);
          resumeSec.appendChild(card);
        }

        if (hasCard) {
          const divider = el('hr', {
            style: { border: 'none', borderTop: '1px solid var(--border-color, #444)', margin: '4px 0 8px' },
          });
          resumeWrapper.appendChild(divider);
          stage.appendChild(resumeWrapper);
        }
      }

      stage.appendChild(el('strong', { textContent: '새 모험 — cast 선택' }));
      stage.appendChild(el('p', {
        textContent: '모험 시작 시 자세한 컨텍스트로 박을 NPC 를 선택하세요 (선택은 0~3명, 모험 도중 자동으로 새 NPC cast 흡수됨)',
        style: { margin: '0', fontSize: '13px', color: 'var(--text-tertiary, #888)' },
      }));

      const checkboxList = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
      const slugs = listAllCharacterSlugs();
      const checked = new Set<string>();
      for (const c of slugs) {
        const lab = el('label', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: 'var(--bg-tertiary, #1f1f1f)',
            borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer',
            fontSize: '13px',
          },
        });
        const cb = el('input');
        cb.type = 'checkbox';
        cb.value = c.slug;
        cb.addEventListener('change', () => {
          if (cb.checked) checked.add(c.slug);
          else checked.delete(c.slug);
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(`${c.name} (${c.slug})`));
        checkboxList.appendChild(lab);
      }
      stage.appendChild(checkboxList);

      const startBtn = el('button', {
        textContent: '모험 시작',
        style: {
          padding: '8px 16px',
          background: 'var(--accent, #d4a849)',
          color: '#000',
          border: 'none',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        },
      });
      startBtn.addEventListener('click', () => {
        const session = createSession(Array.from(checked));
        state = createInitialState(session);
        void saveSession(session);
        renderTurnUI();
        // 첫 turn — 사용자 입력 없이 GM 이 도입부 시작
        void doTurn('(모험을 시작하세요. 도입 narrative + 첫 선택지를 박아주세요.)', true);
      });
      stage.appendChild(startBtn);
    }

    function renderTurnUI() {
      stage.innerHTML = '';

      const meta = el('div', {
        style: { fontSize: '12px', color: 'var(--text-tertiary, #888)', display: 'flex', gap: '12px', flexWrap: 'wrap' },
      });
      if (state) {
        meta.appendChild(document.createTextNode(`session: ${state.session.slug}`));
        meta.appendChild(document.createTextNode(`turn: ${state.session.turns.length}`));
        meta.appendChild(document.createTextNode(`cast: ${state.session.castSlugs.join(', ') || '(없음)'}`));
      }
      stage.appendChild(meta);

      const narrativeBox = el('div', {
        style: {
          background: 'var(--bg-tertiary, #1f1f1f)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: 'var(--radius-md, 6px)',
          padding: '14px',
          minHeight: '160px',
          maxHeight: '480px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6',
          fontSize: '14px',
        },
      });
      narrativeBox.id = 'kl-adv-narrative';
      narrativeBox.textContent = '(GM 의 narrative 가 박힙니다)';
      stage.appendChild(narrativeBox);

      const choicesBox = el('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '6px' },
      });
      choicesBox.id = 'kl-adv-choices';
      stage.appendChild(choicesBox);

      const inputRow = el('div', {
        style: { display: 'flex', gap: '8px' },
      });
      const inputArea = el('textarea', {
        placeholder: '자유 입력 (선택지 외 행동) — Ctrl+Enter 로 전송',
        style: {
          flex: '1',
          padding: '8px',
          background: 'var(--bg-tertiary, #1f1f1f)',
          color: 'var(--text-primary, #e8e8e8)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: 'var(--radius-sm, 4px)',
          minHeight: '60px',
          resize: 'vertical',
          fontFamily: 'inherit',
        },
      });
      const sendBtn = el('button', {
        textContent: '전송',
        style: {
          padding: '0 16px',
          background: 'var(--accent, #d4a849)',
          color: '#000',
          border: 'none',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
        },
      });
      sendBtn.addEventListener('click', () => {
        const t = inputArea.value.trim();
        if (!t) return;
        inputArea.value = '';
        void doTurn(t, false);
      });
      inputArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          sendBtn.click();
        }
      });
      inputRow.appendChild(inputArea);
      inputRow.appendChild(sendBtn);
      stage.appendChild(inputRow);

      const tools = el('div', {
        style: { display: 'flex', gap: '8px', marginTop: '4px' },
      });
      const cameraBtn = el('button', {
        textContent: '📷 장면 이미지 (Vertex Imagen)',
        style: {
          padding: '4px 10px',
          background: 'var(--bg-tertiary, #1f1f1f)',
          color: 'var(--text-primary, #e8e8e8)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
        },
      });
      cameraBtn.addEventListener('click', () => {
        if (!state) return;
        const lastTurn = state.session.turns[state.session.turns.length - 1];
        if (!lastTurn) {
          alert('아직 narrative 없습니다. turn 한 번 진행 후 시도하세요.');
          return;
        }
        const narrative = lastTurn.parsed?.narrative || lastTurn.assistantText;
        cameraBtn.disabled = true;
        const originalLabel = cameraBtn.textContent;
        cameraBtn.textContent = '📷 생성 중…';
        void (async () => {
          try {
            const result = await generateAdventureImage(narrative);
            // 실시간 표시는 dataUrl (메모리), 영구 저장은 path (KL-037 — Tauri 시 별 PNG).
            await attachImageRef(state!.session, result.dataUrl);
            const img = el('img', {
              src: result.dataUrl,
              alt: result.prompt.slice(0, 100),
              title: result.prompt,
              style: {
                marginTop: '8px',
                maxWidth: '100%',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--border-color, #333)',
              },
            });
            const narrativeBox = stage.querySelector('#kl-adv-narrative') as HTMLDivElement | null;
            narrativeBox?.appendChild(img);
          } catch (err) {
            alert('이미지 생성 실패: ' + (err instanceof Error ? err.message : String(err)));
          } finally {
            cameraBtn.disabled = false;
            cameraBtn.textContent = originalLabel;
          }
        })();
      });
      tools.appendChild(cameraBtn);
      const endBtn = el('button', {
        textContent: '모험 종료 + 정수 추출 → wiki commit',
        style: {
          padding: '4px 10px',
          background: 'var(--bg-tertiary, #1f1f1f)',
          color: 'var(--text-primary, #e8e8e8)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
        },
      });
      endBtn.addEventListener('click', () => {
        if (!state) return;
        if (state.session.turns.length === 0) {
          if (!confirm('아직 turn 없는 모험입니다. 그냥 종료할까요?')) return;
          state = null;
          renderCastPicker();
          return;
        }
        void (async () => {
          const committed = await showEndModal(state!.session);
          if (committed) {
            // wiki 갱신 — 다음 위젯 진입 시 bindings.adventure 자동 fetch (페이지 새로고침 권장)
            state = null;
            renderCastPicker();
          }
        })();
      });
      tools.appendChild(endBtn);
      stage.appendChild(tools);
    }

    async function doTurn(userText: string, isOpener: boolean) {
      if (!state) return;
      const narrativeBox = stage.querySelector('#kl-adv-narrative') as HTMLDivElement | null;
      const choicesBox = stage.querySelector('#kl-adv-choices') as HTMLDivElement | null;
      if (!narrativeBox || !choicesBox) return;

      narrativeBox.textContent = '(GM 응답 기다리는 중…)';
      choicesBox.innerHTML = '';

      const provider = createAdventureProvider(providerSelect.value as AdventureProviderId);
      try {
        const result = await runTurn(state, provider, userText);
        narrativeBox.textContent = result.parsed.narrative || '(narrative 비어있음)';
        for (let i = 0; i < result.parsed.choices.length; i++) {
          const choice = result.parsed.choices[i];
          const btn = el('button', {
            textContent: `${i + 1}. ${choice}`,
            style: {
              padding: '8px 12px',
              background: 'var(--bg-tertiary, #1f1f1f)',
              color: 'var(--text-primary, #e8e8e8)',
              border: '1px solid var(--border-color, #333)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              textAlign: 'left',
            },
          });
          btn.addEventListener('click', () => {
            void doTurn(choice, false);
          });
          choicesBox.appendChild(btn);
        }
        if (result.parsed.choices.length === 0 && !result.parsed.ended) {
          const note = el('div', {
            textContent: '(선택지 박히지 않음 — 자유 입력으로 진행)',
            style: { fontSize: '12px', color: 'var(--text-tertiary, #888)' },
          });
          choicesBox.appendChild(note);
        }
        if (result.parsed.ended) {
          const note = el('div', {
            textContent: '[END] 박힘 — 모험 종료. (θ 단계 후 정수 추출 자동)',
            style: {
              fontSize: '13px',
              color: 'var(--accent, #d4a849)',
              padding: '8px',
              background: 'var(--bg-tertiary, #1f1f1f)',
              borderRadius: 'var(--radius-sm, 4px)',
            },
          });
          choicesBox.appendChild(note);
        }
        // meta 갱신
        renderTurnUI();
        const nb2 = stage.querySelector('#kl-adv-narrative') as HTMLDivElement | null;
        const cb2 = stage.querySelector('#kl-adv-choices') as HTMLDivElement | null;
        if (nb2) nb2.textContent = result.parsed.narrative || '(narrative 비어있음)';
        if (cb2) {
          cb2.innerHTML = '';
          for (let i = 0; i < result.parsed.choices.length; i++) {
            const choice = result.parsed.choices[i];
            const btn = el('button', {
              textContent: `${i + 1}. ${choice}`,
              style: {
                padding: '8px 12px',
                background: 'var(--bg-tertiary, #1f1f1f)',
                color: 'var(--text-primary, #e8e8e8)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: 'var(--radius-sm, 4px)',
                cursor: 'pointer',
                textAlign: 'left',
              },
            });
            btn.addEventListener('click', () => {
              void doTurn(choice, false);
            });
            cb2.appendChild(btn);
          }
        }
      } catch (err) {
        narrativeBox.textContent = '에러: ' + (err instanceof Error ? err.message : String(err));
      }
      void isOpener;
    }

    /* ===== 누적된 모험 (β 사용처) ===== */
    const advList = el('div', {
      style: {
        background: 'var(--bg-secondary, #181818)',
        border: '1px solid var(--border-color, #333)',
        borderRadius: 'var(--radius-md, 6px)',
        padding: '10px 12px',
        fontSize: '13px',
      },
    });
    advList.appendChild(el('strong', {
      textContent: '누적된 모험 (wiki entity)',
      style: { display: 'block', marginBottom: '6px' },
    }));
    const KW = (globalThis as unknown as {
      KarmoWorld?: {
        bindings?: { adventure?: { adventures?: Array<{ slug: string; title: string; oneLine?: string }> } };
      };
    }).KarmoWorld;
    const adventures = KW?.bindings?.adventure?.adventures ?? [];
    if (adventures.length === 0) {
      advList.appendChild(el('div', {
        textContent: '(아직 박힌 모험 없음 — 첫 모험 종료 시 wiki entity 로 누적됨)',
        style: { color: 'var(--text-tertiary, #888)' },
      }));
    } else {
      const ul = el('ul', { style: { margin: '0', paddingLeft: '18px' } });
      for (const adv of adventures) {
        const li = el('li');
        li.textContent = `${adv.title || adv.slug}${adv.oneLine ? ' — ' + adv.oneLine : ''}`;
        ul.appendChild(li);
      }
      advList.appendChild(ul);
    }
    wrap.appendChild(advList);

    panel.appendChild(wrap);

    /* 첫 진입 — cast picker 표시 */
    renderCastPicker();

    void parseTurnResponse;
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('adventure'),
    tabs: [{ id: 'adventure-main', label: '모험', build: buildAdventure }],
  });
})();
