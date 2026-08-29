import {
  VaultUnlockError,
  fetchStore,
  getFile,
  listDir,
  listFiles,
  mimeFor,
  previewKind,
  unlockVault,
} from './src/vault.mjs';
import { pickVaultBase } from './src/vault-base.mjs';
import { mountGallery, worthGallery } from './src/gallery.mjs';
import { VIDEO_MAX_BYTES, mirrorable } from './src/mirror-policy.mjs';
import { KINDS, SORTS, activeSummary, arrange, arrangeFolders } from './src/browse.mjs';
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
function listHead() {
  return '<div class="head"><div></div><div>이름</div><div>크기</div><div>수정한 날짜</div><div></div></div>';
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
  // 아이콘은 카모랩 셸의 창 단추와 같은 모양이다. 같은 앱인데 결이 다르면 붙인 티가 난다.
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

/** 좁히기 줄. 정렬, 갈래 칩, 이름 찾기. 목록과 액자 둘 다 이 결과를 씀 */
function siftBar(total, shown) {
  const chips = KINDS.map(
    (k) =>
      '<button type="button" class="sf-chip' + (sift.kind === k.id ? ' on' : '') +
      '" data-kind="' + k.id + '">' + k.label + '</button>',
  ).join('');
  const sorts = SORTS.map(
    (o) =>
      '<button type="button" class="sf-chip' + (sift.sort === o.id ? ' on' : '') +
      '" data-sort="' + o.id + '">' + o.label + '</button>',
  ).join('');
  const note = activeSummary(sift, total, shown);
  return '<div class="siftbar">' +
    '<input type="search" id="sf-q" placeholder="이름으로 찾기" value="' + esc(sift.query) + '">' +
    '<span class="sf-group">' + chips + '</span>' +
    '<span class="sf-group">' + sorts +
    '<button type="button" class="sf-chip" data-desc="1" title="차례 뒤집기">' +
    (sift.desc ? '내림' : '오름') + '</button></span>' +
    (note ? '<span class="sf-note">' + esc(note) + '</span>' : '') +
    '</div>';
}

/** 보기 전환 버튼. 그림이 있는 폴더에서만 뜻이 있음 */
function viewSwitch(mode) {
  return '<div class="viewsw">' +
    '<button type="button" data-view="list"' + (mode === 'list' ? ' class="on"' : '') + '>목록</button>' +
    '<button type="button" data-view="grid"' + (mode === 'grid' ? ' class="on"' : '') + '>액자</button>' +
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
  const listed = listDir(vaultListing, dir);
  /* 거른 뒤의 차례가 화면 차례. 다음과 이전이 이걸 따르므로 여기서 한 번만 정한다 */
  const shownFiles = arrange(listed.files, { ...sift, kindOf: previewKind });
  const shownFolders = arrangeFolders(listed.folders, sift);
  siblings = shownFiles.map((f) => f.path);
  crumb.innerHTML = vaultCrumbs(listed.dir);
  const canGrid = worthGallery(shownFiles, previewKind);
  const mode = canGrid ? viewMode() : 'list';

  const folders = shownFolders.map((name) => {
    const rel = listed.dir ? listed.dir + '/' + name : name;
    return { name, href: '#vault/' + encodeURIComponent(rel) };
  });

  if (mode === 'grid') {
    /* 폴더는 액자 위에 한 줄로 남긴다. 그림만 보이면 위로 올라갈 길이 사라진다. */
    box.innerHTML =
      siftBar(listed.files.length, shownFiles.length) +
      (canGrid ? viewSwitch(mode) : '') +
      (folders.length
        ? '<div class="folderbar">' +
          folders.map((f) => '<a href="' + f.href + '">' + icon('folder') + esc(f.name) + '</a>').join('') +
          '</div>'
        : '') +
      '<div class="grid" id="vgrid"></div>';
    const host = document.getElementById('vgrid');
    if (shownFiles.length) {
      gallery = mountGallery({
        host,
        files: shownFiles,
        kindOf: previewKind,
        load: (path) => getFile(vaultSession, path),
        mimeOf: mimeFor,
        hrefOf: (path) => '#vault/' + encodeURIComponent(path),
      });
    } else {
      host.innerHTML = '<p class="none">이 폴더에는 파일이 없습니다.</p>';
    }
  } else {
    const rows = [];
    for (const f of folders) rows.push(row(icon('folder'), link(f.href, esc(f.name)), '', '', ''));
    for (const f of shownFiles) {
      const name = f.path.split('/').pop();
      const href = '#vault/' + encodeURIComponent(f.path);
      rows.push(row(iconFor(name), link(href, esc(name)), fmtSize(f.size), '', link(href, '열기')));
    }
    box.innerHTML =
      siftBar(listed.files.length, shownFiles.length) +
      (canGrid ? viewSwitch(mode) : '') +
      (rows.length
        ? listHead() + rows.join('')
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
  for (const b of box.querySelectorAll('.siftbar [data-kind], .siftbar [data-sort], .siftbar [data-desc]')) {
    b.addEventListener('click', () => {
      if (b.dataset.kind) sift.kind = sift.kind === b.dataset.kind ? '' : b.dataset.kind;
      else if (b.dataset.sort) sift.sort = b.dataset.sort;
      else sift.desc = !sift.desc;
      renderVaultDir(dir);
    });
  }

  for (const b of box.querySelectorAll('.viewsw button')) {
    b.addEventListener('click', () => {
      try {
        sessionStorage.setItem(VIEW_KEY, b.dataset.view);
      } catch {
        /* 못 적어도 이번 화면은 바꾼다 */
      }
      renderVaultDir(dir);
    });
  }
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
    (isDesktop() ? '<button type="button" class="fb-btn" data-go="external">재생기로 열기</button>' : '') +
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
  box.innerHTML = '<p class="none">여는 중...</p>';
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
  const got = await getFile(vaultSession, path);
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
    for (const b of box.querySelectorAll('.filebar [data-go]')) {
      b.addEventListener('click', () => {
        const go = b.dataset.go;
        if (go === 'close') closeFile(path);
        else if (go === 'external') openExternal(path, got.bytes, b);
        else if (go) goSibling(path, go);
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
    video.src = lastBlob;
    put(video);
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
    mountUploader();
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
