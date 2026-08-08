/**
 * 표를 티어표로 (TASK-KL-190 ⑥).
 *
 * 왜 있나: 놀이 넷 중 **티어표만** 표를 못 먹었다. 표를 만들거나 길어 와도(KL-089/150/153)
 * 티어표에서는 그림을 한 장씩 다시 올려야 했다 — 백 개짜리 표를 그렇게 넣는 사람은 없다.
 *
 * 어떻게 붙나: 티어표의 그림은 「열쇠 → 그림 주소」로 풀린다(`TL.db`). 그 값은 그냥 `<img src>`
 * 에 들어가는 글자라서, **바깥 주소를 그대로 넣어도 된다** — 백 장을 파일로 복사하지 않는다.
 *
 * 건네받는 길: 「표 우물」이 이 브라우저에 쪽지를 남기고(`karmolab_tierlist_pack`),
 * 티어표가 열릴 때 한 번만 읽고 지운다. 표 자체를 주소에 실어 보내지 않는 이유 = 백 개짜리
 * 표는 주소로 못 보낸다(수십 KB).
 *
 * 자기 파일에 사는 이유: 티어표는 여덟 파일 4000줄짜리다. 남이 고치는 자리에 내 줄을 끼우면
 * 통째 덮어쓰기 한 번에 사라진다(2026-08-08 실제로 두 번 났다).
 * 이 폴더의 다른 파일들처럼 **모듈이 아니라** 그냥 실행되는 파일이다(같은 방식으로 로드된다).
 */
;(function (): void {
  const HANDOFF_KEY = 'karmolab_tierlist_pack'

  interface HandoffItem {
    name: string
    img?: string
  }

  function takeHandoff(): { title: string; items: HandoffItem[] } | null {
    try {
      const raw = localStorage.getItem(HANDOFF_KEY)
      if (!raw) return null
      localStorage.removeItem(HANDOFF_KEY) // 한 번만 쓰인다 — 안 지우면 열 때마다 새 표가 생긴다
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null
      return { title: String(parsed.title || '받은 표'), items: parsed.items as HandoffItem[] }
    } catch {
      return null
    }
  }

  /** 실패해도 **조용히** 끝낸다 — 티어표 자체는 멀쩡히 열려야 한다. */
  async function absorb(): Promise<void> {
    const handoff = takeHandoff()
    if (!handoff) return
    const T = (window as unknown as { TL?: { state?: unknown; db?: unknown } }).TL
    const state = T?.state as
      | {
          createList?: (title: string, category: string) => string
          addItem?: (name: string, key: string | null) => string | null
        }
      | undefined
    const db = T?.db as { save?: (id: string, dataUrl: string) => Promise<void> } | undefined
    if (!state?.createList || !state.addItem || !db?.save) return

    try {
      state.createList(handoff.title, '')
      for (const item of handoff.items) {
        if (!item.img) continue
        const key = 'well-' + Math.random().toString(36).slice(2, 10)
        // 값이 그림 주소여도 된다 — 화면은 이걸 그대로 `<img src>` 에 넣는다.
        await db.save(key, item.img)
        state.addItem(item.name, key)
      }
      Toolbox.showToast?.(`「${handoff.title}」을(를) 티어표로 가져왔습니다`, 'success', undefined)
      // 화면을 새로 그려 준다 — 안 그리면 「가져왔다」는 말만 뜨고 화면은 그대로다.
      const render = (window as unknown as { TL?: { render?: { renderAll?: () => void } } }).TL?.render
      render?.renderAll?.()
    } catch {
      /* 못 가져와도 티어표는 열린다 */
    }
  }

  // 다른 파일들이 다 실린 뒤에 돈다(이 파일이 목록의 마지막이다). 한 박자 늦춰 TL 이 다 서게 둔다.
  setTimeout(() => {
    void absorb()
  }, 0)
})()
