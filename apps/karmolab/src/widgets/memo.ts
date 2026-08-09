import { t, loadNamespace } from '../lib/i18n';

;(function (): void {
  Mdd.injectCSS(
    'memo',
    `
        .memo-container { display:flex; flex:1; min-height:400px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
        .memo-sidebar { width:250px; background:var(--bg-secondary); border-right:1px solid var(--border); display:flex; flex-direction:column; }
        .memo-sidebar-header { padding:16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
        .memo-sidebar-title { font-size:var(--font-size-sm); font-weight:600; color:var(--text-primary); }
        .memo-add-btn { padding:6px; }
        .memo-list { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:4px; }
        .memo-item { padding:12px; border-radius:var(--radius-sm); cursor:pointer; transition:background var(--transition); border:1px solid transparent; }
        .memo-item:hover { background:var(--bg-hover); }
        .memo-item.active { background:var(--bg-hover); border-color:var(--border); }
        .memo-item-title { font-size:var(--font-size-sm); font-weight:500; color:var(--text-primary); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .memo-item-date { font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .memo-empty-state { padding:24px 16px; text-align:center; font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .memo-editor { flex:1; display:flex; flex-direction:column; background:var(--bg-tertiary); }
        .memo-editor-header { padding:16px 24px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:center; }
        .memo-title-input { flex:1; background:transparent; border:none; font-size:18px; font-weight:600; color:var(--text-primary); padding:0; outline:none; }
        .memo-title-input::placeholder { color:var(--text-tertiary); font-weight:500; }
        .memo-body-input { flex:1; background:transparent; border:none; resize:none; padding:24px; font-size:14px; line-height:1.7; color:var(--text-primary); outline:none; font-family:inherit; }
        .memo-body-input::placeholder { color:var(--text-tertiary); }
        .memo-status-indicator { padding:8px 24px; font-size:var(--font-size-xs); color:var(--text-tertiary); text-align:right; border-top:1px solid var(--border); background:var(--bg-secondary); }
        @media (max-width:768px) { .memo-container { flex-direction:column; min-height:500px; } .memo-sidebar { width:100%; height:200px; flex:none; border-right:none; border-bottom:1px solid var(--border); } }
    `
  )

  interface StoredMemo {
    id: string
    title: string
    body: string
    updatedAt: number
  }

  const MemoApp = (() => {
    const STORAGE_KEY = 'toolbox_memos'
    let memos: StoredMemo[] = []
    let currentId: string | null = null

    function esc(s: unknown): string {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    function loadMemos(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        memos = raw ? (JSON.parse(raw) as StoredMemo[]) : []
      } catch {
        memos = []
      }
    }

    function saveMemos(): void {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memos))
    }

    function createMemo(): void {
      const newMemo: StoredMemo = {
        id: Date.now().toString(),
        title: t('widgets.memo.title', undefined, "새 메모"),
        body: '',
        updatedAt: Date.now()
      }
      memos.unshift(newMemo)
      saveMemos()
      currentId = newMemo.id
      render()
      Mdd.linePreset('success', { mood: 'happy', msg: t('memo.t03') })
    }

    function deleteMemo(id: string): void {
      if (!confirm(t('memo.t04'))) return
      memos = memos.filter((m) => m.id !== id)
      if (currentId === id) currentId = memos.length > 0 ? memos[0].id : null
      saveMemos()
      render()
      Toolbox.showToast?.(t('memo.t05'), 'info', undefined)
      Mdd.linePreset('idle_wake', { msg: t('memo.t06') })
    }

    function updateMemo(updates: Partial<Pick<StoredMemo, 'title' | 'body'>>): void {
      const msg = memos.find((m) => m.id === currentId)
      if (!msg) return
      Object.assign(msg, updates)
      msg.updatedAt = Date.now()
      saveMemos()
      renderList()
      const status = document.getElementById('memoStatus')
      if (status) status.textContent = t('memo.t07') + new Date().toLocaleTimeString() + ')'
    }

    let saveTimeout: number | undefined

    function handleInput(): void {
      const status = document.getElementById('memoStatus')
      if (status) status.textContent = t('memo.t08')
      if (saveTimeout !== undefined) {
        window.clearTimeout(saveTimeout)
      }
      saveTimeout = window.setTimeout(() => {
        const titleInput = document.getElementById('memoTitleInput') as HTMLInputElement | null
        const bodyInput = document.getElementById('memoBodyInput') as HTMLTextAreaElement | null
        if (!titleInput || !bodyInput) return
        updateMemo({
          title: titleInput.value.trim() || t('memo.t09'),
          body: bodyInput.value
        })
        Mdd.linePreset('success', { mood: 'happy', msg: t('memo.t10') })
      }, 500)
    }

    function renderList(): void {
      const list = document.getElementById('memoList')
      if (!list) return
      if (memos.length === 0) {
        list.innerHTML =
          `<div class="memo-empty-state">${esc(t('memo.empty.list'))}<br>${esc(t('memo.empty.listHint'))}</div>`
        return
      }
      list.innerHTML = ''
      memos.forEach((m) => {
        const d = new Date(m.updatedAt)
        const dateStr =
          d.toLocaleDateString() +
          ' ' +
          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const item = document.createElement('div')
        item.className = 'memo-item' + (m.id === currentId ? ' active' : '')
        item.onclick = () => {
          currentId = m.id
          render()
        }
        item.innerHTML = `<div class="memo-item-title">${esc(m.title)}</div><div class="memo-item-date">${dateStr}</div>`
        list.appendChild(item)
      })
    }

    function renderEditor(): void {
      const editor = document.getElementById('memoEditor')
      if (!editor) return
      if (!currentId || memos.length === 0) {
        editor.innerHTML =
          `<div style="margin:auto; color:var(--text-tertiary); font-size:var(--font-size-sm);">${esc(t('memo.empty.pick'))}</div>`
        return
      }
      const m = memos.find((x) => x.id === currentId)
      if (!m) return
      editor.innerHTML = `
                <div class="memo-editor-header">
                    <input type="text" id="memoTitleInput" class="memo-title-input" placeholder="${esc(t('memo.ph.titleInput'))}" value="${esc(m.title)}">
                    <button class="btn btn-danger" id="memoDeleteBtn">${esc(t('memo.btn.deleteBtn'))}</button>
                </div>
                <textarea id="memoBodyInput" class="memo-body-input" placeholder="${esc(t('memo.ph.bodyInput'))}">${esc(m.body)}</textarea>
                <div class="memo-status-indicator" id="memoStatus">${esc(t('memo.label.status'))}</div>
                <div class="memo-status-indicator">${esc(t('memo.t01'))}</div>
            `
      const titleInput = document.getElementById('memoTitleInput') as HTMLInputElement | null
      const bodyInput = document.getElementById('memoBodyInput') as HTMLTextAreaElement | null
      const deleteBtn = document.getElementById('memoDeleteBtn') as HTMLButtonElement | null
      if (titleInput) titleInput.oninput = handleInput
      if (bodyInput) bodyInput.oninput = handleInput
      /* 같이 쓰기 (TASK-KL-183 C) — 글칸 하나를 건네주면 끝이다.
       * 같은 메모를 열고 있는 사람끼리 글자가 서로에게 흘러간다. 서버는 글을 저장하지 않아
       * **방에 있는 동안만**이다(새로고침하면 내 것만 남는다) — 그 사실을 아래 줄에 적었다. */
      if (bodyInput) void window.KarmoCopresence?.share?.(bodyInput, `memo:${m.id}`)
      if (deleteBtn)
        deleteBtn.onclick = () => {
          deleteMemo(m.id)
        }
    }

    function render(): void {
      renderList()
      renderEditor()
    }

    function exportMemos(): void {
      if (memos.length === 0) {
        Toolbox.showToast?.(t('memo.t13'), 'error', undefined)
        return
      }
      const a = document.createElement('a')
      a.href =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(memos, null, 2))
      a.download = `toolbox_memos_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      Toolbox.showToast?.(t('memo.t14'), 'success', undefined)
    }

    function importMemos(): void {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement | null
        const file = target?.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev: ProgressEvent<FileReader>) => {
          try {
            const text = ev.target?.result
            const imported = typeof text === 'string' ? JSON.parse(text) : null
            if (!Array.isArray(imported)) throw new Error('Invalid format')
            if (
              confirm(
                t('memo.confirm.import', { n: String(imported.length) })
              )
            ) {
              memos = imported as StoredMemo[]
              saveMemos()
              currentId = memos.length > 0 ? memos[0].id : null
              render()
              Toolbox.showToast?.(t('memo.t15'), 'success', undefined)
            }
          } catch {
            Toolbox.showToast?.(t('memo.t16'), 'error', undefined)
          }
        }
        reader.readAsText(file)
      }
      input.click()
    }

    return {
      build(container: HTMLElement): void {
        loadMemos()
        if (memos.length > 0 && !currentId) currentId = memos[0].id
        container.innerHTML = `
                    <div class="memo-container">
                        <div class="memo-sidebar">
                            <div class="memo-sidebar-header">
                                <span class="memo-sidebar-title">${esc(t('memo.t02'))}</span>
                                <div style="display:flex; gap:4px;">
                                    <button class="btn btn-ghost memo-add-btn" id="memoImportBtn" title="${esc(t('memo.title.importBtn'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                                    <button class="btn btn-ghost memo-add-btn" id="memoExportBtn" title="${esc(t('memo.title.exportBtn'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                                    <button class="btn btn-ghost memo-add-btn" id="memoAddBtn" title="${esc(t('memo.title.addBtn'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                                </div>
                            </div>
                            <div class="memo-list" id="memoList"></div>
                        </div>
                        <div class="memo-editor" id="memoEditor"></div>
                    </div>
                `
        Mdd.linePreset('tool_run', { mood: 'idle', msg: t('memo.t17') })
        requestAnimationFrame(() => {
          const addBtn = document.getElementById('memoAddBtn') as HTMLButtonElement | null
          if (addBtn) addBtn.onclick = createMemo
          const exportBtn = document.getElementById('memoExportBtn') as HTMLButtonElement | null
          if (exportBtn) exportBtn.onclick = exportMemos
          const importBtn = document.getElementById('memoImportBtn') as HTMLButtonElement | null
          if (importBtn) importBtn.onclick = importMemos
          render()
        })
      }
    }
  })()

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta?.('memo'),
    tabs: [
      {
        id: 'editor',
        label: t('memo.label.tab', undefined, '에디터'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('memo').then(function () {
            MemoApp.build(container)
          })
        }
      }
    ]
  })
})()
