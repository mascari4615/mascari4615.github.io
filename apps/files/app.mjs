import {
  VaultUnlockError,
  fetchStore,
  getFile,
  getThumb,
  listDir,
  listFiles,
  mimeFor,
  readTrash,
  writeTrash,
  previewKind,
  unlockVault,
} from './src/vault.mjs';
import { pickVaultBase } from './src/vault-base.mjs';
import { CELL_SIZES, cellSize, mountGallery, worthGallery } from './src/gallery.mjs';
import { VIDEO_MAX_BYTES, mirrorable } from './src/mirror-policy.mjs';
import { KINDS, SORTS, activeSummary, arrange, arrangeFolders, between, timeOf } from './src/browse.mjs';
import { infoRows } from './src/fileinfo.mjs';
import { MAX_TOTAL, makeZip } from './src/zip.mjs';
import { applyTrash, normalizeTrash, putTrash, takeTrash } from './src/trash.mjs';
import {
  armScrollMemory,
  bindViewerKeys,
  neighbors,
  restoreScroll,
  watchScroll,
} from './src/viewer.mjs';

const LAPTOP = 'https://laptop.mascari4615.com';
const LAPTOP_KEY = 'files.laptop.pass';
const VAULT_KEY = 'files.vault.pass';
const box = document.getElementById('box');
const crumb = document.getElementById('crumb');
const tabLaptop = document.getElementById('tab-laptop');
const tabVault = document.getElementById('tab-vault');

let lastBlob = '';
let vaultSession = null;
let vaultListing = null;
/* 액자 보기는 폴더를 뜰 때 되돌려 줘야 한다. 칸마다 blob 을 들고 있다. */
let gallery = null;
const VIEW_KEY = 'files.vault.view';
const CELL_KEY = 'files.vault.cell';
const LOOP_KEY = 'files.vault.loop';

/* 되풀이. 한 번 켜면 다음 영상에서도 켜져 있다 */
function loopOn() {
  try {
    return sessionStorage.getItem(LOOP_KEY) === '1';
  } catch {
    return false;
  }
}
function setLoop(on) {
  try {
    sessionStorage.setItem(LOOP_KEY, on ? '1' : '0');
  } catch {
    /* 못 적어도 이번 화면은 바꾼다 */
  }
}

/* 여럿 고르기. 폴더를 옮기면 푼다. 다른 폴더의 것까지 담고 있으면
   화면에 안 보이는 것을 받게 되어 사람이 무엇을 받는지 모른다 */
let selecting = false;
const chosen = new Set();
let chosenDir = null;

/* 휴지통. 화면이 쓸 수 있는 유일한 자리 (src/trash.mjs) */
let vaultTrash = normalizeTrash(null);
let showTrash = false;
let vaultDirNow = '';
/** 마지막으로 찍은 자리. Shift 범위의 시작점 */
let lastPick = '';
/** 지금 폴더가 그린 파일 차례. 다음과 이전이 이걸 따름 */
let siblings = [];
/** 파일 화면에서만 사는 키보드. 폴더로 나갈 때 뗀다. */
let unbindKeys = null;
/** 폴더를 보는 동안 스크롤을 적는 손. 폴더를 뜰 때 뗀다. */
let unwatchScroll = null;
/** 좁히기 상태. 폴더를 옮겨도 그대로 둔다. 같은 갈래를 이어 볼 때가 많다 */
const sift = { kind: '', query: '', sort: 'name', desc: false };

const fixtureBase = new URL('v/', import.meta.url);
let vaultBase = fixtureBase;

const ICONS = {
  folder: '<path d="M4 6a2 2 0 0 1 2-2h3.2l1.8 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/>',
  file: '<path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 1.8V9h4.2L13 4.8Z"/>',
  image: '<path d="M4 5h16v14H4V5Zm2.6 11.4h10.8l-3.4-4.6-2.6 3.3-1.8-2.1-3 3.4ZM9 10.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/>',
  video: '<path d="M4 6h11v12H4V6Zm13 3.4 4-2.4v10l-4-2.4V9.4Z"/>',
};
function icon(kind) {
  const cls = kind === 'folder' ? 'icon folder' : 'icon';
  return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    (ICONS[kind] || ICONS.file) + '</svg>';
}
function iconFor(name) {
  const kind = previewKind(name);
  if (kind === 'image') return icon('image');
  if (kind === 'video') return icon('video');
  return icon('file');
}
function row(kind, nameHtml, size, when, acts) {
  return '<div class="row"><div>' + kind + '</div><div class="name">' + nameHtml +
    '</div><div class="size">' + (size || '') + '</div><div class="when">' + (when || '') +
    '</div><div class="acts">' + (acts || '') + '</div></div>';
}
/**
 * 목록 머리글을 눌러 정렬한다.
 *
 * 왜 바꿨나: 정렬 칩과 뒤집기 버튼이 표와 **떨어진 줄**에 있었다. 무엇에 걸리는 값인지
 * 안 보이고, 뒤집기가 따로 있어 두 번 눌러야 했다 (2026-08-29 사용자: 정렬 바 UX 최악).
 * 탐색기, Finder, Drive 는 전부 머리글을 눌러 정렬하고 **같은 자리를 다시 눌러** 뒤집는다.
 */
function sortHead() {
  const cell = (id, label, cls) => {
    const on = sift.sort === id;
    return '<div' + (cls ? ' class="' + cls + '"' : '') + '>' +
      '<button type="button" class="th' + (on ? ' on' : '') + '" data-sort="' + id + '">' +
      label + (on ? '<i>' + (sift.desc ? '▼' : '▲') + '</i>' : '') + '</button></div>';
  };
  return '<div class="head">' +
    cell('kind', '갈래', 'th-kind') +
    cell('name', '이름') +
    cell('size', '크기', 'size') +
    cell('date', '수정한 날짜', 'when') +
    '<div></div></div>';
}
function crumbHtml(bits) {
  return bits.join('<span class="sep">/</span>');
}
function link(href, text) {
  return '<a href="' + href + '">' + text + '</a>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
function fmtSize(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}
function fmtTime(ms) {
  const d = new Date(ms + 9 * 3600000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function abs(u) {
  if (!u) return '';
  if (u.indexOf('http') === 0) return u;
  return LAPTOP + u;
}
function extFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('vault')) return 'vault';
  return 'laptop';
}
function laptopPath() {
  const h = location.hash.replace(/^#/, '');
  if (h.indexOf('laptop/') === 0) return decodeURIComponent(h.slice(7));
  return '';
}
function vaultPath() {
  const h = location.hash.replace(/^#/, '');
  if (h.indexOf('vault/') === 0) return decodeURIComponent(h.slice(6));
  return '';
}
function setTabs() {
  const on = extFromHash();
  tabLaptop.classList.toggle('on', on === 'laptop');
  tabVault.classList.toggle('on', on === 'vault');
}
function revokeBlob() {
  if (lastBlob) URL.revokeObjectURL(lastBlob);
  lastBlob = '';
}

tabLaptop.addEventListener('click', () => {
  location.hash = '#laptop/';
});
tabVault.addEventListener('click', () => {
  location.hash = '#vault/';
});

function laptopAuth() {
  const pass = sessionStorage.getItem(LAPTOP_KEY) || '';
  if (!pass) return null;
  return 'Basic ' + btoa('x:' + pass);
}
function showLaptopGate(msg) {
  crumb.textContent = '';
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '내 PC 비밀번호를 입력하세요')}</p>` +
    '<input type="password" id="pass" autocomplete="current-password">' +
    '<div><button type="submit">열기</button></div></form>';
  document.getElementById('gate').addEventListener('submit', (ev) => {
    ev.preventDefault();
    sessionStorage.setItem(LAPTOP_KEY, document.getElementById('pass').value);
    load();
  });
}
function showVaultGate(msg) {
  crumb.textContent = '';
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '비밀번호를 입력하세요')}</p>` +
    '<input type="password" id="pass" autocomplete="current-password">' +
    '<div><button type="submit">열기</button></div></form>';
  document.getElementById('gate').addEventListener('submit', (ev) => {
    ev.preventDefault();
    sessionStorage.setItem(VAULT_KEY, document.getElementById('pass').value);
    vaultSession = null;
    unmountUploader();
    vaultListing = null;
    load();
  });
}


// ── PC 업로드 관리 (데스크톱 앱에서만) ───────────────────────────────────────
// 왜 여기 있나: 전송기를 터미널에서 띄우면 그 세션이 죽을 때 같이 죽는다.
// 데스크톱 앱이 붙들면 창을 닫아도 살아 있고, 앱을 껐다 켜도 다시 붙는다.
// 화면에는 집계 수치만 온다. 원본 경로, 파일 이름, 비밀번호는 오가지 않는다.
const UPLOAD_TARGET_KEY = 'files.upload.target';

function desktopInvoke(cmd, args) {
  const fn = globalThis.__TAURI__?.core?.invoke;
  if (typeof fn !== 'function') return Promise.reject(new Error('desktop-only'));
  return fn(cmd, args);
}
function isDesktop() {
  return typeof globalThis.__TAURI__?.core?.invoke === 'function';
}

// 데스크톱에서는 이 화면이 카모랩 창을 갈아탄 자리다. 돌아갈 길과 따로 띄울 길을 준다.
// 웹에서는 둘 다 뜻이 없으므로 아예 안 그린다.
function mountDesktopNav() {
  const el = document.getElementById('desknav');
  if (!el) return;
  if (!isDesktop()) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  // 아이콘은 카모랩 셸의 창 버튼과 같은 모양이다. 같은 앱인데 결이 다르면 붙인 티가 난다.
  const ico = (d) =>
    '<svg viewBox="0 0 12 12" aria-hidden="true">' + d + '</svg>';
  el.innerHTML =
    '<button type="button" class="go" id="nav-back">← KarmoLab</button>' +
    '<button type="button" class="go" id="nav-window">새 창</button>' +
    '<span class="nav-gap"></span>' +
    '<button type="button" class="wc" id="wc-min" aria-label="최소화">' +
    ico('<path d="M2.5 6 H9.5" stroke="currentColor" stroke-width="1.2" fill="none"/>') +
    '</button>' +
    '<button type="button" class="wc" id="wc-max" aria-label="최대화">' +
    ico('<rect x="2.5" y="2.5" width="7" height="7" stroke="currentColor" stroke-width="1.2" fill="none"/>') +
    '</button>' +
    '<button type="button" class="wc wc-close" id="wc-close" aria-label="닫기">' +
    ico('<path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke="currentColor" stroke-width="1.2" fill="none"/>') +
    '</button>';

  // 이 화면이 **어느 창**에 떠 있냐에 따라 돌아가는 길이 다르다.
  // 카모랩 창을 갈아탄 것이면 히스토리에 카모랩이 남아 뒤로가기가 먹지만,
  // 따로 띄운 Files 창은 이 페이지가 첫 장이라 뒤로 갈 곳이 없다. 그때는 창을 닫는다.
  const winApi = globalThis.__TAURI__?.window?.getCurrentWindow;
  const win = typeof winApi === 'function' ? winApi() : null;
  const standalone = win?.label === 'files';

  const back = document.getElementById('nav-back');
  if (standalone) {
    back.textContent = '닫기';
    back.title = '따로 띄운 창입니다. 닫으면 KarmoLab 이 그대로 있습니다';
  }
  back.addEventListener('click', () => {
    if (standalone) {
      win?.close?.();
      return;
    }
    // 뒤로가기가 **아니다**. 이 화면은 폴더를 해시로 넘기므로 히스토리가 폴더마다 쌓인다 . 
    // `history.back()` 이면 카모랩이 아니라 직전 폴더로 간다(2026-08-29 조수님이 봤다).
    // 앱이 갈아타기 직전 카모랩 주소를 적어 뒀다가 한 번에 되돌린다.
    desktopInvoke('karmolab_navigate').catch(() => history.back());
  });

  const openWin = document.getElementById('nav-window');
  if (standalone) {
    // 이미 따로 떠 있는 창에서 또 띄울 이유가 없다.
    openWin.remove();
  } else {
    openWin.addEventListener('click', () => {
      desktopInvoke('files_window_open').catch(() => {});
    });
  }

  // 창 테두리가 없는 앱이라(decorations:false) 최소화, 최대화, 닫기를 화면이 그려야 한다.
  // 카모랩 셸에는 이미 있지만 이 화면은 그 셸이 아니다. 없으면 창을 닫을 길이 없다.
  if (!win) return;
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', () => {
    try {
      fn()?.catch?.(() => {});
    } catch {
      /* 창 API 가 없으면 조용히 넘긴다 */
    }
  });
  on('wc-min', () => win.minimize());
  on('wc-max', () => win.toggleMaximize());
  on('wc-close', () => win.close());
}

const UPLOAD_LABEL = {
  idle: '대기',
  preparing: '준비 중',
  running: '올리는 중',
  stopped: '중지됨',
  done: '완료',
  error: '중단됨',
};

let uploadTimer = 0;

function stopUploadPolling() {
  if (uploadTimer) clearInterval(uploadTimer);
  uploadTimer = 0;
}

function renderUploadPanel(st) {
  const el = document.getElementById('uploader');
  if (!el) return;
  const pct = st.total ? Math.floor((st.done / st.total) * 100) : 0;
  const busy = st.status === 'running' || st.status === 'preparing';
  const target = sessionStorage.getItem(UPLOAD_TARGET_KEY) || st.target || '';
  el.innerHTML =
    '<div class="up-head"><span class="up-badge ' + esc(st.status) + '">' +
    esc(UPLOAD_LABEL[st.status] || st.status) + '</span>' +
    (st.total
      ? '<span class="up-num">' + st.done.toLocaleString() + ' / ' + st.total.toLocaleString() +
        ', ' + pct + '%</span>'
      : '<span class="up-num">' + esc(st.note || '') + '</span>') +
    '</div>' +
    (st.total ? '<div class="up-bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '<div class="up-meta">' +
    (st.total ? '올림 ' + st.uploaded.toLocaleString() + ', 건너뜀 ' + st.skipped.toLocaleString() : '') +
    (st.startedAt ? ', 시작 ' + esc(st.startedAt) : '') +
    '</div>' +
    '<div class="up-acts">' +
    '<button id="up-pick" type="button"' + (busy ? ' disabled' : '') + '>' +
    (target ? esc(target) : '폴더 고르기...') + '</button>' +
    (busy
      ? '<button id="up-stop" type="button">중지</button>'
      : '<button id="up-start" type="button">' + (st.status === 'stopped' ? '이어서 올리기' : '올리기') + '</button>') +
    '</div>';

  const pickBtn = document.getElementById('up-pick');
  if (pickBtn) {
    pickBtn.addEventListener('click', async () => {
      pickBtn.disabled = true;
      try {
        // 취소하면 빈 문자열이 온다. 고른 것이 없을 뿐이라 아무 것도 바꾸지 않는다.
        const picked = (await desktopInvoke('vault_upload_pick_target') || '').trim();
        if (picked) {
          sessionStorage.setItem(UPLOAD_TARGET_KEY, picked);
          pickBtn.textContent = picked;
        }
      } catch (e) {
        showUploadError(e);
        return;
      }
      pickBtn.disabled = false;
    });
  }

  const startBtn = document.getElementById('up-start');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const v = (sessionStorage.getItem(UPLOAD_TARGET_KEY) || '').trim();
      if (!v) {
        showUploadError(new Error('올릴 폴더를 먼저 고르세요.'));
        return;
      }
      startBtn.disabled = true;
      try {
        renderUploadPanel(await desktopInvoke('vault_upload_start', { target: v }));
      } catch (e) {
        showUploadError(e);
      }
    });
  }
  const stopBtn = document.getElementById('up-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      stopBtn.disabled = true;
      try {
        renderUploadPanel(await desktopInvoke('vault_upload_stop'));
      } catch (e) {
        showUploadError(e);
      }
    });
  }
}

function showUploadError(e) {
  const el = document.getElementById('uploader');
  if (!el) return;
  const msg = e && e.message ? e.message : String(e);
  el.innerHTML = '<div class="up-note err">' + esc(msg) + '</div>';
}

async function pollUpload() {
  try {
    renderUploadPanel(await desktopInvoke('vault_upload_status'));
  } catch {
    stopUploadPolling();
  }
}

function mountUploader() {
  const el = document.getElementById('uploader');
  if (!el) return;
  el.hidden = false;
  if (!isDesktop()) {
    // 웹, PWA 에서는 설명만. 전송기와 열쇠는 PC 안에서만 산다.
    el.innerHTML = '<div class="up-note">올리기는 PC 앱에서만 됩니다. 여기서는 보기만 가능합니다.</div>';
    return;
  }
  pollUpload();
  stopUploadPolling();
  uploadTimer = setInterval(pollUpload, 5000);
}

function unmountUploader() {
  stopUploadPolling();
  const el = document.getElementById('uploader');
  if (el) el.hidden = true;
}

function loadLaptop() {
  const p = laptopPath();
  const auth = laptopAuth();
  if (!auth) {
    showLaptopGate();
    return;
  }
  box.innerHTML = '<p class="none">불러오는 중...</p>';
  fetch(LAPTOP + '/files/api/list?p=' + encodeURIComponent(p), {
    headers: { Authorization: auth },
  }).then((r) => {
    if (r.status === 401 || r.status === 403) {
      sessionStorage.removeItem(LAPTOP_KEY);
      showLaptopGate('비밀번호가 틀렸거나 만료됐습니다.');
      return null;
    }
    if (!r.ok) throw new Error('list ' + r.status);
    return r.json();
  }).then((data) => {
    if (!data) return;
    if (!data.ok) {
      box.innerHTML = '<p class="err">이 항목을 열 수 없습니다.</p>';
      return;
    }
    const bits = [link('#laptop/', '내 PC')];
    if (data.path) {
      const acc = [];
      data.path.split('/').forEach((part) => {
        acc.push(part);
        bits.push(link('#laptop/' + encodeURIComponent(acc.join('/')), esc(part)));
      });
    }
    crumb.innerHTML = crumbHtml(bits);
    if (!data.entries.length) {
      box.innerHTML = '<p class="none">이 폴더는 비어 있습니다.</p>';
      return;
    }
    box.innerHTML = listHead() + data.entries.map((e) => {
      if (e.dir) {
        return row(
          icon('folder'),
          link('#laptop/' + encodeURIComponent(e.rel), esc(e.name)),
          '',
          fmtTime(e.at),
          '',
        );
      }
      let acts = '';
      if (e.view) acts += link(abs(e.view), '열기');
      if (e.get) acts += link(abs(e.get), '다운로드');
      return row(iconFor(e.name), esc(e.name), fmtSize(e.size), fmtTime(e.at), acts);
    }).join('');
  }).catch(() => {
    box.innerHTML = '<p class="err">내 PC에 연결할 수 없습니다.</p>';
  });
}

async function ensureVault() {
  if (vaultSession && vaultListing) return vaultSession;
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) return null;
  /* 로컬(개발)에선 정본 도메인 안 봄. 개발 중 실제 클라우드를 받으면 느리고 시험이 진짜 자료에 붙음 */
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  vaultBase = new URL(
    await pickVaultBase({
      origin: location.origin,
      fixture: fixtureBase.href,
      canonical: local ? '' : undefined,
    }),
  );
  const store = fetchStore(vaultBase.href);
  vaultSession = await unlockVault(store, pass);
  vaultListing = await listFiles(vaultSession);
  vaultTrash = await readTrash(vaultSession);
  /* 열렸으니 이제 업로드 패널을 붙인다 */
  mountUploader();
  return vaultSession;
}

function vaultCrumbs(dir) {
  const bits = [link('#vault/', '클라우드')];
  if (!dir) return crumbHtml(bits);
  const acc = [];
  dir.split('/').forEach((part) => {
    acc.push(part);
    bits.push(link('#vault/' + encodeURIComponent(acc.join('/')), esc(part)));
  });
  return crumbHtml(bits);
}

function closeGallery() {
  if (gallery) {
    gallery.dispose();
    gallery = null;
  }
}

function viewMode() {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

/** 휴지통에 몇 개 들었나 */
function trashCount() {
  return Object.keys(vaultTrash.items).length;
}

/**
 * 버리거나 되살리기. **청크는 안 지운다.** 표시만 바꾼다.
 * 영영 지우기는 열쇠와 rclone 이 있는 기계에서만 (`npm run empty-trash`).
 */
async function moveTrash(paths, toTrash, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '적는 중';
  const before = vaultTrash;
  try {
    vaultTrash = toTrash ? putTrash(vaultTrash, paths) : takeTrash(vaultTrash, paths);
    await writeTrash(vaultSession, vaultTrash);
    chosen.clear();
    selecting = false;
    renderVaultDir(vaultDirNow);
  } catch (e) {
    /* 못 적었으면 화면도 되돌린다. 지운 줄 알았는데 다음에 다시 뜨면 더 나쁘다 */
    vaultTrash = before;
    button.textContent = '못 적음';
    console.error('[files] 휴지통 적기 실패', e);
    setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
    }, 2500);
  }
}

/** 좁히기 줄. 정렬, 갈래 칩, 이름 찾기. 목록과 액자 둘 다 이 결과를 씀 */
function siftBar(total, shown) {
  const chips = KINDS.map(
    (k) =>
      '<button type="button" class="sf-chip' + (sift.kind === k.id ? ' on' : '') +
      '" data-kind="' + k.id + '">' + k.label + '</button>',
  ).join('');
  const note = activeSummary(sift, total, shown);
  return '<div class="siftbar">' +
    '<input type="search" id="sf-q" placeholder="이름으로 찾기" value="' + esc(sift.query) + '">' +
    '<span class="sf-group">' + chips + '</span>' +
    (note ? '<span class="sf-note">' + esc(note) + '</span>' : '') +
    '<button type="button" class="sf-chip' + (selecting ? ' on' : '') +
    '" data-sel="1">고르기</button>' +
    '<button type="button" class="sf-chip' + (showTrash ? ' on' : '') +
    '" data-trashview="1">휴지통' + (trashCount() ? ' ' + trashCount() : '') + '</button>' +
    '</div>';
}

/** 고른 것 줄. 몇 개인지, 합쳐서 몇인지, 무엇을 할 수 있는지 */
function pickBar(files) {
  const total = files.filter((f) => chosen.has(f.path)).reduce((n, f) => n + f.size, 0);
  return '<div class="pickbar">' +
    '<span class="pb-at">' + chosen.size + '개 고름, ' + fmtSize(total) + '</span>' +
    '<button type="button" class="fb-btn" data-pick="all">모두</button>' +
    '<button type="button" class="fb-btn" data-pick="none">해제</button>' +
    '<span class="fb-gap"></span>' +
    '<button type="button" class="fb-btn" data-pick="get"' + (chosen.size ? '' : ' disabled') +
    '>받기</button>' +
    '<button type="button" class="fb-btn" data-pick="' + (showTrash ? 'restore' : 'trash') + '"' +
    (chosen.size ? '' : ' disabled') + '>' + (showTrash ? '되살리기' : '휴지통으로') + '</button>' +
    '</div>';
}

/**
 * 고른 것 받기. 하나면 그대로, 여럿이면 한 덩이(zip)로.
 *
 * 여럿을 각각 내려받게 하면 브라우저가 두 번째부터 막거나 사람에게 다시 묻는다.
 * 그리고 복호는 어차피 여기서 한 번씩 해야 하므로, 묶는 값은 거의 안 든다.
 */
async function downloadChosen(files, button) {
  return downloadFiles(files.filter((f) => chosen.has(f.path)), button, chosenDir);
}

/**
 * 폴더 하나를 통째로. 그 아래 것을 다 담는다 (더 깊은 폴더까지).
 * 이름은 폴더 이름을 쓰고, 안쪽 자리는 zip 안의 경로로 남긴다.
 */
async function downloadFolder(dir, button) {
  const prefix = dir ? dir + '/' : '';
  /* 버린 것은 안 담는다. 화면에 안 보이는 파일이 묶음에 딸려 오면 안 된다.
     휴지통 보기에서 받으면 그 반대로 버린 것만 (화면과 같은 것을 준다) */
  const seen = applyTrash(vaultListing ?? [], vaultTrash, { showTrash });
  const targets = seen.filter((f) => f.path.startsWith(prefix));
  return downloadFiles(targets, button, dir, { keepPath: prefix });
}

async function downloadFiles(targets, button, dirName, opts = {}) {
  const total = targets.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) {
    button.textContent = '너무 큼';
    setTimeout(() => { button.textContent = '받기'; }, 2500);
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  const parts = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const at = (i + 1) + ' / ' + targets.length;
      button.textContent = at;
      /* 큰 파일 하나에서 오래 멈춘 것처럼 보이지 않게 조각 수도 같이 */
      const got = await getFile(vaultSession, targets[i].path, {
        onProgress: (done, all) => {
          button.textContent = all > 1 ? `${at}, ${done}/${all} 조각` : at;
        },
      });
      /* 폴더째면 안쪽 자리를 zip 안에 그대로 남긴다 */
      const name = opts.keepPath
        ? targets[i].path.slice(opts.keepPath.length)
        : targets[i].path.split('/').pop();
      if (got) parts.push({ name, bytes: got.bytes });
    }
    if (!parts.length) throw new Error('none');
    /* 폴더째 받을 때는 한 장뿐이어도 묶는다. 안쪽 자리를 지켜야 하므로 */
    const one = parts.length === 1 && !opts.keepPath;
    const blob = one
      ? new Blob([parts[0].bytes], { type: mimeFor(parts[0].name) })
      : new Blob([makeZip(parts)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = one ? parts[0].name : (dirName ? dirName.split('/').pop() : 'files') + '.zip';
    a.click();
    /* 누른 뒤 바로 거두면 큰 것은 저장이 중간에 끊긴다 */
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    button.textContent = '받음';
  } catch (e) {
    button.textContent = '못 받음';
    console.error('[files] 고른 것 받기 실패', e);
  }
  setTimeout(() => {
    button.disabled = false;
    button.textContent = label;
  }, 2500);
}

/** 액자 칸 크기. 고른 값은 한 자리에 적어 폴더를 옮겨도 유지된다 */
function cellMode() {
  try {
    return cellSize(sessionStorage.getItem(CELL_KEY));
  } catch {
    return cellSize(null);
  }
}

/** 보기 전환 버튼. 그림이 있는 폴더에서만 뜻이 있음. 액자일 때는 칸 크기도 */
function viewSwitch(mode) {
  const cell = cellMode();
  const sorts = mode === 'grid'
    ? '<span class="sortsw">' + SORTS.map(
        (o) => '<button type="button" class="th' + (sift.sort === o.id ? ' on' : '') +
          '" data-sort="' + o.id + '">' + o.label +
          (sift.sort === o.id ? '<i>' + (sift.desc ? '▼' : '▲') + '</i>' : '') + '</button>',
      ).join('') + '</span>'
    : '';
  const sizes = mode === 'grid'
    ? '<span class="cellsw">' + CELL_SIZES.map(
        (c) => '<button type="button" data-cell="' + c.id + '"' +
          (c.id === cell.id ? ' class="on"' : '') + '>' + c.label + '</button>',
      ).join('') + '</span>'
    : '';
  return '<div class="viewsw">' +
    '<button type="button" data-view="list"' + (mode === 'list' ? ' class="on"' : '') + '>목록</button>' +
    '<button type="button" data-view="grid"' + (mode === 'grid' ? ' class="on"' : '') + '>액자</button>' +
    sorts +
    sizes +
    '</div>';
}

function renderVaultDir(dir) {
  closeGallery();
  /* 파일 화면 키보드 해제. 안 떼면 폴더에서 화살표가 엉뚱한 파일로 튐 */
  if (unbindKeys) {
    unbindKeys();
    unbindKeys = null;
  }
  if (unwatchScroll) unwatchScroll();
  /* 버린 것은 목록에서 뺀다. 휴지통 보기에서는 반대로 그것만 */
  vaultDirNow = dir;
  const visible = applyTrash(vaultListing ?? [], vaultTrash, { showTrash });
  const listed = listDir(visible, dir);
  /* 폴더가 바뀌면 고른 것을 푼다. 안 보이는 것을 받게 되면 사람이 무엇을 받는지 모른다 */
  if (chosenDir !== listed.dir) {
    chosen.clear();
    selecting = false;
    lastPick = '';
    chosenDir = listed.dir;
  }
  /* 거른 뒤의 차례가 화면 차례. 다음과 이전이 이걸 따르므로 여기서 한 번만 정한다 */
  const shownFiles = arrange(listed.files, { ...sift, kindOf: previewKind });
  const shownFolders = arrangeFolders(listed.folders, sift);
  siblings = shownFiles.map((f) => f.path);
  crumb.innerHTML = vaultCrumbs(listed.dir);
  const canGrid = worthGallery(shownFiles, previewKind);
  const mode = canGrid ? viewMode() : 'list';

  const folders = shownFolders.map((name) => {
    const rel = listed.dir ? listed.dir + '/' + name : name;
    return { name, rel, href: '#vault/' + encodeURIComponent(rel) };
  });

  if (mode === 'grid') {
    /* 폴더는 액자 위에 한 줄로 남긴다. 그림만 보이면 위로 올라갈 길이 사라진다. */
    box.innerHTML =
      siftBar(listed.files.length, shownFiles.length) +
      (canGrid ? viewSwitch(mode) : '') +
      (folders.length
        ? '<div class="folderbar">' +
          folders.map((f) => '<span class="fb-item"><a href="' + f.href + '">' + icon('folder') +
            esc(f.name) + '</a><button type="button" class="fb-btn sm" data-folder="' +
            encodeURIComponent(f.rel) + '">받기</button></span>').join('') +
          '</div>'
        : '') +
      (selecting ? pickBar(shownFiles) : '') +
      '<div class="grid" id="vgrid" style="--cell:' + cellMode().px + 'px"></div>';
    const host = document.getElementById('vgrid');
    if (shownFiles.length) {
      gallery = mountGallery({
        host,
        files: shownFiles,
        kindOf: previewKind,
        load: (path) => getFile(vaultSession, path),
        loadThumb: (path) => getThumb(vaultSession, path),
        mimeOf: mimeFor,
        hrefOf: (path) => '#vault/' + encodeURIComponent(path),
      });
      /* 칸에 체크를 얹는다. 액자 모듈은 그림 받아 오는 일만 하게 둔다.
         칸 자체가 링크라, 체크를 그 **안**에 두면 누를 때 파일이 열린다.
         (막으려고 preventDefault 를 걸면 이번엔 체크가 안 켜진다.)
         그래서 칸을 한 겹 감싸고 체크를 링크 **밖**에 형제로 둔다 */
      if (selecting) {
        for (const cell of [...host.querySelectorAll('.frame')]) {
          const path = decodeURIComponent(cell.dataset.path);
          const wrap = document.createElement('span');
          wrap.className = 'framewrap';
          cell.replaceWith(wrap);
          const mark = document.createElement('input');
          mark.type = 'checkbox';
          mark.className = 'pick frame-pick';
          mark.dataset.path = cell.dataset.path;
          mark.checked = chosen.has(path);
          mark.setAttribute('aria-label', path.split('/').pop() + ' 고르기');
          wrap.append(mark, cell);
        }
      }
    } else {
      host.innerHTML = '<p class="none">이 폴더에는 파일이 없습니다.</p>';
    }
  } else {
    const rows = [];
    for (const f of folders) {
      /* 폴더째 받기. 그 아래 것을 다 담는다 */
      const get = '<button type="button" class="fb-btn sm" data-folder="' +
        encodeURIComponent(f.rel) + '">받기</button>';
      rows.push(row(icon('folder'), link(f.href, esc(f.name)), '', '', get));
    }
    for (const f of shownFiles) {
      const name = f.path.split('/').pop();
      const href = '#vault/' + encodeURIComponent(f.path);
      const mark = selecting
        ? '<input type="checkbox" class="pick" data-path="' + encodeURIComponent(f.path) + '"' +
          (chosen.has(f.path) ? ' checked' : '') + ' aria-label="' + esc(name) + ' 고르기">'
        : iconFor(name);
      /* 날짜 칸. 찍은 날이 있으면 그것, 없으면 디스크 수정 시각.
         전에는 머리글만 있고 값이 늘 비어 있었다 (2026-08-29) */
      const at = timeOf(f);
      rows.push(row(mark, link(href, esc(name)), fmtSize(f.size), at ? fmtTime(at) : '', link(href, '열기')));
    }
    box.innerHTML =
      siftBar(listed.files.length, shownFiles.length) +
      (canGrid ? viewSwitch(mode) : '') +
      (selecting ? pickBar(shownFiles) : '') +
      (rows.length
        ? sortHead() + rows.join('')
        : '<p class="none">' +
          (sift.kind || sift.query.trim() ? '조건에 맞는 것이 없습니다.' : '이 폴더는 비어 있습니다.') +
          '</p>');
  }

  restoreScroll(listed.dir);
  /* 보는 동안 계속 기록. 파일 열 때 적으면 이미 0 (주소 바뀌며 꼭대기행) */
  unwatchScroll = watchScroll(listed.dir);

  const q = box.querySelector('#sf-q');
  if (q) {
    let timer = 0;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      /* 한 글자마다 다시 그리면 큰 폴더에서 입력이 끊김. 잠깐 모아서 한 번 */
      timer = setTimeout(() => {
        sift.query = q.value;
        renderVaultDir(dir);
        const again = box.querySelector('#sf-q');
        if (again) {
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }
      }, 160);
    });
  }
  const trashBtn = box.querySelector('.siftbar [data-trashview]');
  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
      showTrash = !showTrash;
      chosen.clear();
      selecting = false;
      renderVaultDir(dir);
    });
  }
  const selBtn = box.querySelector('.siftbar [data-sel]');
  if (selBtn) {
    selBtn.addEventListener('click', () => {
      selecting = !selecting;
      lastPick = '';
      if (!selecting) chosen.clear();
      renderVaultDir(dir);
    });
  }
  for (const c of box.querySelectorAll('input.pick')) {
    c.addEventListener('click', (e) => {
      /* 액자에서는 체크가 링크 위에 있다. 안 막으면 파일이 열린다 */
      e.stopPropagation();
      const path = decodeURIComponent(c.dataset.path);
      /* Shift 는 마지막으로 찍은 자리부터 여기까지. 차례는 화면에 보이는 차례다 */
      const span = e.shiftKey && lastPick ? between(siblings, lastPick, path) : [];
      if (span.length) {
        for (const p of span) {
          if (c.checked) chosen.add(p);
          else chosen.delete(p);
        }
        for (const other of box.querySelectorAll('input.pick')) {
          other.checked = chosen.has(decodeURIComponent(other.dataset.path));
        }
      } else if (c.checked) chosen.add(path);
      else chosen.delete(path);
      lastPick = path;
      /* 줄만 다시 그린다. 액자를 다시 그리면 받아 둔 그림을 전부 버린다 */
      const bar = box.querySelector('.pickbar');
      if (bar) bar.outerHTML = pickBar(shownFiles);
      bindPickBar();
    });
  }
  function bindPickBar() {
    for (const b of box.querySelectorAll('.pickbar [data-pick]')) {
      b.addEventListener('click', () => {
        if (b.dataset.pick === 'get') return void downloadChosen(shownFiles, b);
        if (b.dataset.pick === 'trash' || b.dataset.pick === 'restore') {
          return void moveTrash([...chosen], b.dataset.pick === 'trash', b);
        }
        if (b.dataset.pick === 'all') for (const f of shownFiles) chosen.add(f.path);
        else chosen.clear();
        for (const c of box.querySelectorAll('input.pick')) {
          c.checked = chosen.has(decodeURIComponent(c.dataset.path));
        }
        const bar = box.querySelector('.pickbar');
        if (bar) bar.outerHTML = pickBar(shownFiles);
        bindPickBar();
      });
    }
  }
  bindPickBar();
  for (const b of box.querySelectorAll('.siftbar [data-kind]')) {
    b.addEventListener('click', () => {
      sift.kind = sift.kind === b.dataset.kind ? '' : b.dataset.kind;
      renderVaultDir(dir);
    });
  }
  for (const b of box.querySelectorAll('[data-folder]')) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      downloadFolder(decodeURIComponent(b.dataset.folder), b);
    });
  }
  /* 머리글과 액자의 정렬 버튼. 같은 자리를 다시 누르면 뒤집는다 */
  for (const b of box.querySelectorAll('[data-sort]')) {
    b.addEventListener('click', () => {
      if (sift.sort === b.dataset.sort) sift.desc = !sift.desc;
      else {
        sift.sort = b.dataset.sort;
        /* 새 기준으로 바꿀 때는 늘 오름부터. 앞의 뒤집기가 따라오면 놀란다 */
        sift.desc = false;
      }
      renderVaultDir(dir);
    });
  }

  for (const b of box.querySelectorAll('.viewsw button')) {
    b.addEventListener('click', () => {
      try {
        if (b.dataset.cell) sessionStorage.setItem(CELL_KEY, b.dataset.cell);
        else sessionStorage.setItem(VIEW_KEY, b.dataset.view);
      } catch {
        /* 못 적어도 이번 화면은 바꾼다 */
      }
      /* 칸 크기는 CSS 변수 한 줄이라 다시 안 그린다. 다시 그리면 받아 둔 그림을
         전부 버리고 처음부터 받는다 (2026-08-29) */
      if (b.dataset.cell) {
        const host = document.getElementById('vgrid');
        if (host) host.style.setProperty('--cell', cellSize(b.dataset.cell).px + 'px');
        for (const o of box.querySelectorAll('.cellsw button')) o.classList.toggle('on', o === b);
        return;
      }
      renderVaultDir(dir);
    });
  }
}

/* 정보 패널을 열어 뒀는지. 다음과 이전으로 넘겨도 유지되게 한 자리에 적는다 */
const INFO_KEY = 'files.info';
function infoOpen() {
  try {
    return sessionStorage.getItem(INFO_KEY) === '1';
  } catch {
    return false;
  }
}
function setInfoOpen(on) {
  try {
    sessionStorage.setItem(INFO_KEY, on ? '1' : '0');
  } catch {
    /* 못 적어도 이번 화면은 바꾼다 */
  }
}

/**
 * 정보 패널 그리기. 가로세로와 길이는 화면이 이미 그린 것에서 읽으므로
 * 미디어가 실린 뒤 한 번 더 부른다.
 */
function paintInfo(path, entry, kind, el) {
  const panel = box.querySelector('.fileinfo');
  if (!panel) return;
  const media = el
    ? {
        width: el.naturalWidth || el.videoWidth || 0,
        height: el.naturalHeight || el.videoHeight || 0,
        duration: el.duration || 0,
      }
    : {};
  const rows = infoRows(path, entry, { kind, fmtSize, fmtTime, media });
  panel.innerHTML = rows
    .map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>')
    .join('');
}

/** 파일 화면 맨 위 줄. 몇 번째인지, 앞뒤로 가기, 받기 */
function fileBar(path, blobUrl) {
  const { prev, next, at, total } = neighbors(siblings, path);
  const name = path.split('/').pop();
  const go = (to, label, on) =>
    '<button type="button" class="fb-btn"' + (to ? '' : ' disabled') +
    ' data-go="' + (on || '') + '">' + label + '</button>';
  return '<div class="filebar">' +
    go(prev, '◂ 이전', 'prev') +
    '<span class="fb-at">' + (at >= 0 ? (at + 1) + ' / ' + total : '') + '</span>' +
    go(next, '다음 ▸', 'next') +
    '<span class="fb-gap"></span>' +
    (blobUrl
      ? '<a class="fb-btn" href="' + blobUrl + '" download="' + esc(name) + '">받기</a>'
      : '') +
    /* 앱에서만. WebView 가 못 푸는 코덱을 OS 재생기가 연다 */
    (previewKind(path) === 'video'
      ? '<button type="button" class="fb-btn' + (loopOn() ? ' on' : '') + '" data-go="loop">되풀이</button>'
      : '') +
    (isDesktop() ? '<button type="button" class="fb-btn" data-go="external">재생기로 열기</button>' : '') +
    '<button type="button" class="fb-btn' + (infoOpen() ? ' on' : '') + '" data-go="info">정보</button>' +
    '<button type="button" class="fb-btn" data-go="close">닫기 (Esc)</button>' +
    '</div>';
}

/**
 * 복호본을 앱에 넘겨 OS 기본 프로그램으로 열기.
 *
 * 왜 필요한가: 저장된 mp4 대부분이 HEVC. WebView 가 비디오 트랙을 못 품.
 * 소리만 나고 화면은 검음. OS 재생기는 시스템 코덱을 쓰므로 그냥 열림
 */
async function openExternal(path, bytes, button) {
  /* IPC 는 JSON 이라 바이트가 배열로 부풀어 오름. 큰 파일은 메모리를 크게 먹으므로 차단.
     열람 저장에 오는 영상은 100MB 이하라 이 문턱 안 */
  const IPC_MAX = 200 * 1024 * 1024;
  if (bytes.length > IPC_MAX) {
    button.textContent = '너무 큼';
    setTimeout(() => {
      button.textContent = '재생기로 열기';
    }, 2000);
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '여는 중';
  try {
    await desktopInvoke('vault_open_external', {
      name: path.split('/').pop(),
      bytes: Array.from(bytes),
    });
    button.textContent = '열었음';
  } catch (e) {
    button.textContent = '못 엶';
    console.error('[files] 재생기로 열기 실패', e);
  }
  setTimeout(() => {
    button.disabled = false;
    button.textContent = label;
  }, 2000);
}

/** 같은 폴더의 앞뒤 파일로. 폴더 복귀는 그 폴더 주소로. 뒤로가기 안 씀 */
function goSibling(path, which) {
  const { prev, next } = neighbors(siblings, path);
  const to = which === 'prev' ? prev : next;
  if (to) location.hash = '#vault/' + encodeURIComponent(to);
}
function closeFile(path) {
  location.hash = '#vault/' + encodeURIComponent(path.split('/').slice(0, -1).join('/'));
}

async function renderVaultFile(path) {
  closeGallery();
  /* 파일 주소로 바로 들어온 경우 (새로고침, 남이 준 링크).
     폴더를 그린 적이 없어 형제 목록이 빔. 같은 폴더를 여기서 한 번 읽음 */
  if (!siblings.includes(path)) {
    siblings = listDir(vaultListing, path.split('/').slice(0, -1).join('/')).files.map((f) => f.path);
  }
  /* 폴더 쪽 스크롤 감시 해제. 파일 화면 스크롤을 폴더 자리로 적으면 안 됨 */
  if (unwatchScroll) {
    unwatchScroll();
    unwatchScroll = null;
  }
  if (unbindKeys) unbindKeys();
  unbindKeys = bindViewerKeys({
    onPrev: () => goSibling(path, 'prev'),
    onNext: () => goSibling(path, 'next'),
    onClose: () => closeFile(path),
  });
  crumb.innerHTML = vaultCrumbs(path.split('/').slice(0, -1).join('/')) +
    '<span class="sep">/</span><a>' + esc(path.split('/').pop()) + '</a>';
  box.innerHTML = '<p class="none" id="opening">여는 중...</p>';
  /* 열람 저장(R2)에 없으면 여기서 못 엶. 정본은 Drive.
     예전엔 그냥 열 수 없습니다. 이유를 말해야 사람이 다음 수를 앎
     (2026-08-29: 영상이 목록엔 뜨는데 눌러도 조용히 실패) */
  const entry = (vaultListing ?? []).find((f) => f.path === path);
  if (entry && !mirrorable(path, entry.size)) {
    box.innerHTML =
      '<p class="err">여기서는 못 여는 파일입니다.</p>' +
      '<p class="none">화면에서 여는 것은 그림과 글, 그리고 ' + fmtSize(VIDEO_MAX_BYTES) +
      ' 이하 영상입니다. 이 파일은 ' + fmtSize(entry.size) +
      '. 원본은 클라우드에 그대로 있고 PC 에서 받을 수 있습니다.</p>';
    return;
  }
  /* 청크마다 알린다. 100MB 면 열세 번 온다. 그 사이 아무 말이 없으면 멈춘 것처럼 보인다.
     조각이 하나뿐이면 숫자가 0 / 1 에서 1 / 1 로 튀기만 해 도움이 안 된다 */
  const note = box.querySelector('#opening');
  const got = await getFile(vaultSession, path, {
    onProgress: (done, all, bytes) => {
      if (!note || !note.isConnected || all < 2) return;
      note.textContent = `여는 중 ${done} / ${all} 조각 (${fmtSize(bytes)})`;
    },
  });
  if (!got) {
    box.innerHTML =
      '<p class="err">이 항목을 열 수 없습니다.</p>' +
      '<p class="none">열람 저장에 아직 안 올라왔을 수 있습니다. 올린 뒤 <code>mirror-backfill</code> 로 채웁니다.</p>';
    return;
  }
  const kind = previewKind(path);
  revokeBlob();
  const blob = new Blob([got.bytes], { type: mimeFor(path) });
  lastBlob = URL.createObjectURL(blob);
  /* 위 줄은 갈래와 무관하게 동일. 받기는 이미 복호한 자료 재사용 */
  const bar = fileBar(path, lastBlob);
  const put = (el) => {
    box.innerHTML = bar;
    box.appendChild(el);
    const panel = document.createElement('dl');
    panel.className = 'fileinfo';
    panel.hidden = !infoOpen();
    box.appendChild(panel);
    paintInfo(path, entry, kind, el);
    /* 가로세로와 길이는 실린 뒤에 온다. 그때 한 번 더 그린다 */
    const again = () => paintInfo(path, entry, kind, el);
    el.addEventListener('load', again, { once: true });
    el.addEventListener('loadedmetadata', again, { once: true });
    for (const b of box.querySelectorAll('.filebar [data-go]')) {
      b.addEventListener('click', () => {
        const go = b.dataset.go;
        if (go === 'close') closeFile(path);
        else if (go === 'external') openExternal(path, got.bytes, b);
        else if (go === 'info') {
          const on = panel.hidden;
          panel.hidden = !on;
          setInfoOpen(on);
          b.classList.toggle('on', on);
          if (on) paintInfo(path, entry, kind, el);
        } else if (go) goSibling(path, go);
      });
    }
  };
  if (kind === 'text') {
    const pre = document.createElement('pre');
    pre.className = 'preview-text';
    pre.textContent = new TextDecoder().decode(got.bytes);
    put(pre);
    return;
  }
  if (kind === 'image') {
    const img = document.createElement('img');
    img.className = 'preview-img';
    img.alt = path;
    img.src = lastBlob;
    put(img);
    return;
  }
  if (kind === 'video') {
    const video = document.createElement('video');
    video.className = 'preview-vid';
    video.controls = true;
    /* 되풀이. 짧은 것을 볼 때 매번 다시 누르지 않게. 고른 값은 유지한다 */
    video.loop = loopOn();
    video.src = lastBlob;
    put(video);
    const loop = box.querySelector('.filebar [data-go=loop]');
    if (loop) {
      loop.addEventListener('click', () => {
        video.loop = !video.loop;
        setLoop(video.loop);
        loop.classList.toggle('on', video.loop);
      });
    }
    /* 브라우저가 비디오 트랙을 못 푸는 경우 (실측 2026-08-29: mp4 표본 12개 중 10개가 HEVC).
       그때도 오디오는 나오고 오류도 안 난다. 화면만 검고 소리만 들려 고장처럼 보인다.
       메타데이터가 온 뒤 화소 크기가 0 이면 그 상태로 판정 */
    let warned = false;
    const warnIfNoPicture = () => {
      if (warned || video.videoWidth > 0) return;
      warned = true;
      const note = document.createElement('p');
      note.className = 'none';
      note.textContent =
        '소리는 나오는데 화면이 없습니다. 브라우저가 이 영상의 코덱(HEVC 등)을 못 풉니다. ' +
        '위의 받기로 저장한 뒤 재생기로 보세요.';
      video.after(note);
    };
    video.addEventListener('loadeddata', warnIfNoPicture, { once: true });
    /* 메타데이터가 영영 안 오는 경우 대비. 3초 뒤 한 번 더 */
    setTimeout(() => {
      if (video.isConnected && video.readyState >= 1) warnIfNoPicture();
    }, 3000);
    return;
  }
  /* 화면으로 못 보여 주는 갈래. 받기는 위 줄에 */
  const info = document.createElement('p');
  info.className = 'none';
  info.textContent = '이 갈래는 화면에서 미리 못 봅니다. 위의 받기로 저장하세요.';
  put(info);
}

async function loadVault() {
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) {
    showVaultGate();
    return;
  }
  box.innerHTML = '<p class="none">불러오는 중...</p>';
  try {
    await ensureVault();
  } catch (e) {
    sessionStorage.removeItem(VAULT_KEY);
    vaultSession = null;
    vaultListing = null;
    const msg = e instanceof VaultUnlockError ? '비밀번호가 틀렸습니다.' : '파일 목록을 읽지 못했습니다.';
    showVaultGate(msg);
    return;
  }
  const p = vaultPath();
  const file = vaultListing.find((f) => f.path === p);
  try {
    if (file) await renderVaultFile(p);
    else renderVaultDir(p);
  } catch {
    box.innerHTML = '<p class="err">미리보기를 열지 못했습니다.</p>';
  }
}

function load() {
  setTabs();
  revokeBlob();
  if (extFromHash() === 'vault') {
    /* 업로드 패널은 **연 뒤에만**. 전에는 비번을 치기도 전에 폴더 고르기와 시작이 떴다.
       전송기는 그 기계의 .env 에서 열쇠를 읽으므로, 그 화면만으로 올리기가 돌았다
       (2026-08-29 사용자 지적) */
    if (vaultSession) mountUploader();
    else unmountUploader();
    loadVault();
  } else {
    unmountUploader();
    loadLaptop();
  }
}

mountDesktopNav();
armScrollMemory();
window.addEventListener('hashchange', load);
if (!location.hash) location.hash = '#laptop/';
else load();
