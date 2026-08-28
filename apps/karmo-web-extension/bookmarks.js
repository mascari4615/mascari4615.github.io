/**
 * 즐겨찾기 정리 — chrome.bookmarks 로 읽고 지운다.
 * 파일(Bookmarks JSON) 직접 편집과 달리 동기화에도 전파된다.
 */

let items = [];
const selected = new Set();

const $ = (id) => document.getElementById(id);

function flatten(nodes, folder, out) {
  for (const n of nodes) {
    if (n.url) out.push({ id: n.id, name: n.title || "(제목 없음)", url: n.url, folder });
    if (n.children) flatten(n.children, folder ? `${folder}/${n.title}` : n.title || "", out);
  }
  return out;
}

async function load() {
  const tree = await chrome.bookmarks.getTree();
  items = flatten(tree, "", []);
  render();
}

function visible() {
  const q = $("filter").value.trim().toLowerCase();
  if (!q) return items;
  return items.filter((b) => `${b.name} ${b.url} ${b.folder}`.toLowerCase().includes(q));
}

function render() {
  const list = $("list");
  list.textContent = "";
  for (const b of visible()) {
    const row = document.createElement("div");
    row.className = "row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(b.id);
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(b.id);
      else selected.delete(b.id);
      updateCounts();
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = b.name;
    const url = document.createElement("div");
    url.className = "url";
    url.textContent = b.url;
    const folder = document.createElement("div");
    folder.className = "folder";
    folder.textContent = `${b.folder || "(루트)"} · id ${b.id}`;
    meta.append(name, url, folder);

    row.append(cb, meta);
    list.append(row);
  }
  updateCounts();
}

function updateCounts() {
  $("list-status").textContent = `전체 ${items.length}건 · 표시 ${visible().length}건 · 선택 ${selected.size}건`;
}

function asTsv(rows) {
  return rows.map((b) => [b.id, b.folder, b.name, b.url].join("\t")).join("\n");
}

function asMarkdown(rows) {
  return rows
    .map((b) => `- [${b.name.replace(/[[\]]/g, "")}](${b.url}) \`id ${b.id}\``)
    .join("\n");
}

async function copy(text, note) {
  await navigator.clipboard.writeText(text);
  $("export-status").className = "status";
  $("export-status").textContent = `${note} — ${text.split("\n").length}줄 복사됨`;
}

/** 붙여넣은 덩어리에서 id 와 URL 을 뽑아 대상 북마크를 고른다. */
function matchTargets(raw) {
  const urls = new Set((raw.match(/https?:\/\/[^\s)"'\]]+/g) || []).map((u) => u.replace(/[.,]+$/, "")));
  const ids = new Set();
  for (const line of raw.split("\n")) {
    const withoutUrls = line.replace(/https?:\/\/\S+/g, " ");
    for (const m of withoutUrls.matchAll(/\b\d{1,7}\b/g)) ids.add(m[0]);
  }
  const hit = items.filter((b) => ids.has(b.id) || urls.has(b.url));
  return { hit, urls, ids };
}

async function removeMany(targets, statusEl) {
  const ok = [];
  const fail = [];
  for (const b of targets) {
    try {
      await chrome.bookmarks.remove(b.id);
      ok.push(b);
    } catch (e) {
      fail.push(`${b.id} ${b.name} — ${e.message}`);
    }
  }
  await load();
  selected.clear();
  statusEl.className = fail.length ? "status err" : "status";
  statusEl.textContent =
    `${ok.length}건 삭제됨.\n` +
    ok.map((b) => `- ${b.id}\t${b.name}\t${b.url}`).join("\n") +
    (fail.length ? `\n실패 ${fail.length}건:\n${fail.join("\n")}` : "");
}

$("copy-tsv").addEventListener("click", () => copy(asTsv(items), "TSV"));
$("copy-md").addEventListener("click", () => copy(asMarkdown(items), "Markdown"));
$("copy-json").addEventListener("click", () => copy(JSON.stringify(items), "JSON"));

$("filter").addEventListener("input", render);
$("select-all").addEventListener("click", () => {
  visible().forEach((b) => selected.add(b.id));
  render();
});
$("select-none").addEventListener("click", () => {
  selected.clear();
  render();
});

$("bulk-preview").addEventListener("click", () => {
  const { hit, urls, ids } = matchTargets($("bulk").value);
  $("bulk-status").className = "status";
  $("bulk-status").textContent =
    `입력에서 id ${ids.size}개 · URL ${urls.size}개 인식 → 즐겨찾기 ${hit.length}건 일치.\n` +
    hit.map((b) => `- ${b.id}\t${b.name}\t${b.url}`).join("\n");
});

$("bulk-delete").addEventListener("click", async () => {
  const { hit } = matchTargets($("bulk").value);
  if (!hit.length) {
    $("bulk-status").className = "status err";
    $("bulk-status").textContent = "일치하는 즐겨찾기가 없다. 미리보기로 먼저 확인해라.";
    return;
  }
  if (!confirm(`${hit.length}건을 지운다. 되돌릴 수 없다. 진행할까?`)) return;
  await removeMany(hit, $("bulk-status"));
});

$("delete-selected").addEventListener("click", async () => {
  const targets = items.filter((b) => selected.has(b.id));
  if (!targets.length) {
    $("list-status").className = "status err";
    $("list-status").textContent = "선택된 게 없다.";
    return;
  }
  if (!confirm(`${targets.length}건을 지운다. 되돌릴 수 없다. 진행할까?`)) return;
  await removeMany(targets, $("list-status"));
});

load();
