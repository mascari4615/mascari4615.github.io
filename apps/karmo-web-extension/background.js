/**
 * MV3 service worker — 배지·알림·메시지 중계 등은 여기에 추가.
 *
 * 즐겨찾기 원격 조작: `externally_connectable` 에 허용된 페이지(블로그·로컬호스트)에서
 *   chrome.runtime.sendMessage("<확장ID>", { type: "bookmarks.list" }, cb)
 * 로 부른다. 확장 페이지를 직접 못 여는 자동화(예: Claude in Chrome)에서 쓰라고 뚫어 둔 통로다.
 */

chrome.runtime.onInstalled.addListener(() => {
  // 개발: chrome://extensions 에서 "서비스 워커" 로그로 확인 가능
});

function flatten(nodes, folder, out) {
  for (const n of nodes) {
    if (n.url) out.push({ id: n.id, name: n.title || "", url: n.url, folder });
    if (n.children) flatten(n.children, folder ? `${folder}/${n.title}` : n.title || "", out);
  }
  return out;
}

async function listBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  return flatten(tree, "", []);
}

async function removeBookmarks(ids) {
  const ok = [];
  const fail = [];
  for (const id of ids.map(String)) {
    try {
      await chrome.bookmarks.remove(id);
      ok.push(id);
    } catch (e) {
      fail.push({ id, error: String(e && e.message ? e.message : e) });
    }
  }
  return { ok, fail };
}

/** 웹페이지(허용 도메인) → 확장 */
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "bookmarks.list") {
        sendResponse({ ok: true, items: await listBookmarks() });
      } else if (msg?.type === "bookmarks.remove") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        if (!ids.length) throw new Error("ids 가 비었다");
        const result = await removeBookmarks(ids);
        sendResponse({ ok: true, ...result, remaining: (await listBookmarks()).length });
      } else {
        sendResponse({ ok: false, error: `모르는 type: ${msg?.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // 비동기 응답
});
