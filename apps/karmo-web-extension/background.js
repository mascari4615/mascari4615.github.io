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

const ROOT_IDS = new Set(["0", "1", "2", "3"]);

/** 폴더까지 포함한 평면 목록 */
async function listAll() {
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  const walk = (nodes, folder) => {
    for (const n of nodes) {
      const path = folder ? folder + "/" + n.title : n.title || "";
      if (n.url) out.push({ id: n.id, type: "url", name: n.title || "", url: n.url, folder });
      else {
        if (!ROOT_IDS.has(n.id)) out.push({ id: n.id, type: "folder", name: n.title || "", folder });
        walk(n.children || [], path);
      }
    }
  };
  walk(tree, "");
  return out;
}

/** 폴더는 자식까지 통째로 */
async function removeTrees(ids) {
  const ok = [];
  const fail = [];
  for (const id of ids.map(String)) {
    if (ROOT_IDS.has(id)) {
      fail.push({ id, error: "루트 폴더는 못 지운다" });
      continue;
    }
    try {
      await chrome.bookmarks.removeTree(id);
      ok.push(id);
    } catch (e) {
      fail.push({ id, error: String(e && e.message ? e.message : e) });
    }
  }
  return { ok, fail };
}

/** 북마크가 하나도 없는 폴더를 안쪽부터 지운다 */
async function pruneEmptyFolders() {
  const removed = [];
  let changed = true;
  while (changed) {
    changed = false;
    const tree = await chrome.bookmarks.getTree();
    const empties = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.url) continue;
        walk(n.children || []);
        if (!ROOT_IDS.has(n.id) && (n.children || []).length === 0) empties.push({ id: n.id, name: n.title || "" });
      }
    };
    walk(tree);
    for (const f of empties) {
      try {
        await chrome.bookmarks.remove(f.id);
        removed.push(f);
        changed = true;
      } catch {
        /* 다음 회차에 다시 시도 */
      }
    }
  }
  return removed;
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
      } else if (msg?.type === "bookmarks.listAll") {
        sendResponse({ ok: true, items: await listAll() });
      } else if (msg?.type === "bookmarks.removeTree") {
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        if (!ids.length) throw new Error("ids 가 비었다");
        sendResponse({ ok: true, ...(await removeTrees(ids)), remaining: (await listAll()).length });
      } else if (msg?.type === "bookmarks.pruneEmptyFolders") {
        const removed = await pruneEmptyFolders();
        sendResponse({ ok: true, removed, remaining: (await listAll()).length });
      } else {
        sendResponse({ ok: false, error: `모르는 type: ${msg?.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // 비동기 응답
});
